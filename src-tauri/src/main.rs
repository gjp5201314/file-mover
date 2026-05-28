#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;

const CONFIG_FILE_NAME: &str = "frontend-deployer-config.json";

const FORBIDDEN_PATHS: &[&str] = &[
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\System32",
    "C:\\Boot",
    "C:\\Recovery",
];

#[derive(Debug, Clone)]
struct SecurityAuditEvent {
    timestamp: String,
    event_type: String,
    details: String,
    success: bool,
}

impl SecurityAuditEvent {
    fn new(event_type: &str, details: &str, success: bool) -> Self {
        Self {
            timestamp: chrono_lite_timestamp(),
            event_type: event_type.to_string(),
            details: details.to_string(),
            success,
        }
    }
    
    fn log(&self) {
        let status = if self.success { "成功" } else { "失败" };
        eprintln!(
            "[SECURITY] [{}] {} - {}: {}",
            self.timestamp, status, self.event_type, self.details
        );
    }
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let hours = (secs / 3600) % 24;
    let minutes = (secs / 60) % 60;
    let seconds = secs % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

fn is_path_safe(path: &Path) -> Result<(), String> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| format!("无法解析路径: {}", e))?;
    
    let canonical_str = canonical.to_string_lossy().to_lowercase();
    
    for forbidden in FORBIDDEN_PATHS {
        let forbidden_lower = forbidden.to_lowercase();
        if canonical_str.starts_with(&forbidden_lower) {
            SecurityAuditEvent::new(
                "PATH_BLOCKED",
                &format!("尝试访问禁止的系统目录: {}", forbidden),
                false
            ).log();
            return Err(format!("禁止访问系统目录: {}", forbidden));
        }
    }
    
    if path.is_symlink() {
        SecurityAuditEvent::new(
            "SYMLINK_BLOCKED",
            &format!("尝试操作符号链接: {:?}", path),
            false
        ).log();
        return Err("禁止操作符号链接".to_string());
    }
    
    Ok(())
}

fn validate_source_target_paths(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        SecurityAuditEvent::new(
            "SOURCE_NOT_FOUND",
            &format!("源目录不存在: {:?}", source),
            false
        ).log();
        return Err("源目录不存在".to_string());
    }
    
    if !source.is_dir() {
        SecurityAuditEvent::new(
            "SOURCE_NOT_DIR",
            &format!("源路径不是目录: {:?}", source),
            false
        ).log();
        return Err("源路径不是目录".to_string());
    }
    
    is_path_safe(source)?;
    is_path_safe(target)?;
    
    let source_canonical = std::fs::canonicalize(source)
        .map_err(|e| format!("无法解析源路径: {}", e))?;
    let target_canonical = std::fs::canonicalize(target)
        .map_err(|e| format!("无法解析目标路径: {}", e))?;
    
    if source_canonical == target_canonical {
        SecurityAuditEvent::new(
            "SAME_PATH",
            "源目录和目标目录相同",
            false
        ).log();
        return Err("源目录和目标目录不能相同".to_string());
    }
    
    if target_canonical.starts_with(&source_canonical) {
        SecurityAuditEvent::new(
            "INVALID_NESTING",
            "目标目录是源目录的子目录",
            false
        ).log();
        return Err("目标目录不能是源目录的子目录".to_string());
    }
    
    if source_canonical.starts_with(&target_canonical) {
        SecurityAuditEvent::new(
            "INVALID_NESTING",
            "源目录是目标目录的子目录",
            false
        ).log();
        return Err("源目录不能是目标目录的子目录（当移动模式时可能导致数据丢失）".to_string());
    }
    
    SecurityAuditEvent::new(
        "PATH_VALIDATION",
        &format!("路径验证通过: {:?} -> {:?}", source, target),
        true
    ).log();
    
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CopyProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub card_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationLog {
    pub card_id: String,
    pub operation: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitOutput {
    pub card_id: String,
    pub output: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchTrigger {
    pub card_id: String,
}

struct NotifyHandler(mpsc::Sender<Result<Event, notify::Error>>);

impl notify::EventHandler for NotifyHandler {
    fn handle_event(&mut self, event: Result<Event, notify::Error>) {
        let _ = self.0.send(event);
    }
}

struct WatcherState {
    watchers: HashMap<String, RecommendedWatcher>,
}

struct CancellationState {
    cancelled: HashMap<String, bool>,
}

fn check_cancelled(card_id: &str, state: &CancellationState) -> Result<(), String> {
    if state.cancelled.get(card_id).copied().unwrap_or(false) {
        return Err("操作已被用户停止".to_string());
    }
    Ok(())
}

fn remove_dir_all_recursive(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                remove_dir_all_recursive(&entry_path)?;
                fs::remove_dir(&entry_path).map_err(|e| e.to_string())?;
            } else {
                fs::remove_file(&entry_path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path, is_cut: bool) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    }

    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path, is_cut)?;
            if is_cut {
                remove_dir_all_recursive(&src_path)?;
                fs::remove_dir(&src_path).map_err(|e| e.to_string())?;
            }
        } else if is_cut {
            match fs::rename(&src_path, &dst_path) {
                Ok(_) => {}
                Err(_) => {
                    fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {}", e))?;
                    fs::remove_file(&src_path).map_err(|e| format!("删除源文件失败: {}", e))?;
                }
            }
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn git_pull(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<CancellationState>>>,
    target: String,
    card_id: String,
) -> Result<String, String> {
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    let target_path = Path::new(&target);
    
    is_path_safe(target_path)?;
    
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    if !target_path.exists() {
        return Err("目标目录不存在".to_string());
    }

    let git_pull_output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &target, "pull"])
        .output()
        .map_err(|e| format!("git pull 失败: {}", e))?;

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }

    let pull_str = String::from_utf8_lossy(&git_pull_output.stdout).to_string();
    let pull_err = String::from_utf8_lossy(&git_pull_output.stderr).to_string();
    let _ = app.emit("git-output", GitOutput {
        card_id: card_id.clone(),
        output: format!("git pull:\n{}{}", pull_str, pull_err),
    });

    if !git_pull_output.status.success() {
        return Err(format!("git pull 失败: {}", pull_err));
    }

    Ok(pull_str)
}

#[tauri::command]
async fn copy_and_prepare(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<CancellationState>>>,
    source: String,
    target: String,
    auto_pull: bool,
    move_mode: String,
    clear_target_mode: String,
    clear_target_folders: Vec<String>,
    card_id: String,
) -> Result<String, String> {
    let source_path = Path::new(&source);
    let target_path = Path::new(&target);
    
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    validate_source_target_paths(source_path, target_path)?;
    
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    SecurityAuditEvent::new(
        "FILE_OPERATION_START",
        &format!(
            "开始文件操作: 模式={}, 清空={}, 提交={}, 源={}, 目标={}",
            move_mode, clear_target_mode,
            if auto_pull { "pull+push" } else { "none" },
            source, target
        ),
        true
    ).log();
    
    if !target_path.exists() {
        fs::create_dir_all(target_path).map_err(|e| e.to_string())?;
    }
    
    let _ = app.emit("file-operation-log", FileOperationLog {
        card_id: card_id.clone(),
        operation: "info".to_string(),
        message: format!("📋 开始文件部署任务\n源目录: {}\n目标目录: {}", source, target),
    });

    if auto_pull {
        let _ = app.emit("file-operation-log", FileOperationLog {
            card_id: card_id.clone(),
            operation: "info".to_string(),
            message: "🔄 开始执行 git pull...".to_string(),
        });

        {
            let state = state.lock().map_err(|e| e.to_string())?;
            check_cancelled(&card_id, &state)?;
        }

        let git_pull_output = Command::new("git")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-C", &target, "pull"])
            .output()
            .map_err(|e| format!("git pull 失败: {}", e))?;

        {
            let state = state.lock().map_err(|e| e.to_string())?;
            check_cancelled(&card_id, &state)?;
        }

        let pull_str = String::from_utf8_lossy(&git_pull_output.stdout).to_string();
        let pull_err = String::from_utf8_lossy(&git_pull_output.stderr).to_string();
        let _ = app.emit("git-output", GitOutput {
            card_id: card_id.clone(),
            output: format!("git pull:\n{}{}", pull_str, pull_err),
        });

        if !git_pull_output.status.success() {
            return Err(format!("git pull 失败: {}", pull_err));
        }
    }

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }

    let clear_mode_desc: String = match clear_target_mode.as_str() {
        "all" => {
            let _ = app.emit("file-operation-log", FileOperationLog {
                card_id: card_id.clone(),
                operation: "clear".to_string(),
                message: "🗑️ 清空模式: 清空整个目标目录".to_string(),
            });
            remove_dir_all_recursive(target_path)?;
            String::from("清空整个目录")
        }
        "specific" => {
            if clear_target_folders.is_empty() {
                let _ = app.emit("file-operation-log", FileOperationLog {
                    card_id: card_id.clone(),
                    operation: "clear".to_string(),
                    message: "🗑️ 清空模式: 不清空".to_string(),
                });
                String::from("不清空")
            } else {
                let folders_str = clear_target_folders.join(", ");
                let _ = app.emit("file-operation-log", FileOperationLog {
                    card_id: card_id.clone(),
                    operation: "clear".to_string(),
                    message: format!("🗑️ 清空模式: 清空指定文件夹 [{}]", folders_str),
                });
                for folder in &clear_target_folders {
                    {
                        let state = state.lock().map_err(|e| e.to_string())?;
                        check_cancelled(&card_id, &state)?;
                    }
                    let folder_path = target_path.join(folder);
                    if folder_path.exists() && folder_path.is_dir() {
                        remove_dir_all_recursive(&folder_path)?;
                        fs::remove_dir(&folder_path).map_err(|e| e.to_string())?;
                    }
                }
                format!("清空指定文件夹 [{}]", folders_str)
            }
        }
        _ => {
            let _ = app.emit("file-operation-log", FileOperationLog {
                card_id: card_id.clone(),
                operation: "clear".to_string(),
                message: "🗑️ 清空模式: 不清空".to_string(),
            });
            String::from("不清空")
        }
    };

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }

    let is_cut = move_mode == "cut";
    let operation_desc = if is_cut { String::from("移动") } else { String::from("复制") };

    let _ = app.emit("file-operation-log", FileOperationLog {
        card_id: card_id.clone(),
        operation: "info".to_string(),
        message: format!("📦 操作模式: {}\n🎯 清空方式: {}\n📂 开始处理文件...", operation_desc, clear_mode_desc),
    });

    copy_dir_recursive(source_path, target_path, is_cut)?;
    
    SecurityAuditEvent::new(
        "FILE_OPERATION_COMPLETE",
        &format!(
            "文件操作完成: {} {} -> {}, 清空={}",
            operation_desc, source, target, clear_mode_desc
        ),
        true
    ).log();

    let _ = app.emit("file-operation-log", FileOperationLog {
        card_id: card_id.clone(),
        operation: "complete".to_string(),
        message: format!("✅ {} 操作完成!\n📁 源目录: {}\n📁 目标目录: {}\n🎯 清空方式: {}\n🔄 操作模式: {}", 
            operation_desc, source, target, clear_mode_desc, operation_desc),
    });

    let _ = app.emit("copy-progress", CopyProgress {
        current: 1,
        total: 1,
        current_file: "完成".to_string(),
        card_id,
    });

    Ok("ready".to_string())
}

#[tauri::command]
async fn git_commit_push(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<CancellationState>>>,
    target: String,
    message: String,
    card_id: String,
) -> Result<(), String> {
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    let target_path = Path::new(&target);
    
    is_path_safe(target_path)?;
    
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    if !target_path.exists() {
        SecurityAuditEvent::new(
            "GIT_OPERATION",
            "Git 操作失败：目标目录不存在",
            false
        ).log();
        return Err("目标目录不存在".to_string());
    }
    
    let trimmed_message = message.trim();
    if trimmed_message.is_empty() {
        SecurityAuditEvent::new(
            "GIT_OPERATION",
            "Git 操作失败：Commit 消息为空",
            false
        ).log();
        return Err("Commit 消息不能为空".to_string());
    }
    if trimmed_message.len() > 500 {
        SecurityAuditEvent::new(
            "GIT_OPERATION",
            "Git 操作失败：Commit 消息过长",
            false
        ).log();
        return Err("Commit 消息过长（最大 500 个字符）".to_string());
    }
    if trimmed_message.contains('\0') {
        SecurityAuditEvent::new(
            "GIT_OPERATION",
            "Git 操作失败：Commit 消息包含非法字符",
            false
        ).log();
        return Err("Commit 消息包含非法字符".to_string());
    }
    
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }
    
    SecurityAuditEvent::new(
        "GIT_COMMIT_PUSH",
        &format!("开始 Git 提交: 消息={}", trimmed_message),
        true
    ).log();

    let git_add_output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &target, "add", "."])
        .output()
        .map_err(|e| format!("git add 失败: {}", e))?;

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }

    let add_str = String::from_utf8_lossy(&git_add_output.stdout).to_string();
    let add_err = String::from_utf8_lossy(&git_add_output.stderr).to_string();
    let _ = app.emit("git-output", GitOutput {
        card_id: card_id.clone(),
        output: format!("git add:\n{}{}", add_str, add_err),
    });

    if !git_add_output.status.success() {
        return Err(format!("git add 失败: {}", add_err));
    }

    let git_commit_output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &target, "commit", "-m", &trimmed_message])
        .output()
        .map_err(|e| format!("git commit 失败: {}", e))?;

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }

    let commit_str = String::from_utf8_lossy(&git_commit_output.stdout).to_string();
    let commit_err = String::from_utf8_lossy(&git_commit_output.stderr).to_string();
    let _ = app.emit("git-output", GitOutput {
        card_id: card_id.clone(),
        output: format!("git commit:\n{}{}", commit_str, commit_err),
    });

    if !git_commit_output.status.success() {
        if commit_err.contains("nothing to commit") {
            return Err("没有文件需要提交".to_string());
        }
        return Err(format!("git commit 失败: {}", commit_err));
    }

    let git_push_output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &target, "push"])
        .output()
        .map_err(|e| format!("git push 失败: {}", e))?;

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        check_cancelled(&card_id, &state)?;
    }

    let push_str = String::from_utf8_lossy(&git_push_output.stdout).to_string();
    let push_err = String::from_utf8_lossy(&git_push_output.stderr).to_string();
    let _ = app.emit("git-output", GitOutput {
        card_id: card_id.clone(),
        output: format!("git push:\n{}{}", push_str, push_err),
    });

    if !git_push_output.status.success() {
        SecurityAuditEvent::new(
            "GIT_PUSH",
            &format!("Git push 失败: {}", push_err),
            false
        ).log();
        return Err(format!("git push 失败: {}", push_err));
    }

    SecurityAuditEvent::new(
        "GIT_COMMIT_PUSH_COMPLETE",
        &format!("Git 提交和推送成功: {}", trimmed_message),
        true
    ).log();

    Ok(())
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|e| format!("获取执行目录失败: {}", e))
        .and_then(|path| {
            path.parent()
                .map(|p| p.to_string_lossy().to_string())
                .ok_or_else(|| "获取父目录失败".to_string())
        })
}

#[derive(Debug, Serialize, Deserialize)]
struct DirEntry {
    name: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
}

#[tauri::command]
fn list_directories(path: String) -> Result<Vec<DirEntry>, String> {
    let target_path = Path::new(&path);
    
    is_path_safe(target_path)?;
    
    if !target_path.exists() {
        return Err("目录不存在".to_string());
    }
    if !target_path.is_dir() {
        return Err("路径不是目录".to_string());
    }

    let mut entries: Vec<DirEntry> = Vec::new();
    for entry in fs::read_dir(target_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();
        let is_dir = entry_path.is_dir();
        let file_name = entry.file_name().to_string_lossy().to_string();
        entries.push(DirEntry {
            name: file_name,
            is_directory: is_dir,
        });
    }
    entries.sort_by(|a, b| {
        if a.is_directory != b.is_directory {
            b.is_directory.cmp(&a.is_directory)
        } else {
            a.name.cmp(&b.name)
        }
    });
    Ok(entries)
}

#[tauri::command]
fn get_config_path() -> Result<String, String> {
    exe_config_path().map(|path| path.to_string_lossy().to_string())
}

fn exe_config_path() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("获取执行目录失败: {}", e))
        .and_then(|path| {
            path.parent()
                .map(|p| p.join(CONFIG_FILE_NAME))
                .ok_or_else(|| "获取配置路径失败".to_string())
        })
}

fn app_data_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(CONFIG_FILE_NAME))
        .map_err(|e| format!("获取应用数据目录失败: {}", e))
}

#[tauri::command]
fn load_app_config(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let config_path = exe_config_path()?;

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置失败: {}", e))?;
        let config = serde_json::from_str(&content)
            .map_err(|e| format!("解析配置失败: {}", e))?;
        return Ok(Some(config));
    }

    let app_data_path = app_data_config_path(&app)?;
    if app_data_path.exists() {
        let content = fs::read_to_string(&app_data_path)
            .map_err(|e| format!("读取旧配置失败: {}", e))?;
        let config = serde_json::from_str(&content)
            .map_err(|e| format!("解析旧配置失败: {}", e))?;

        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        fs::write(&config_path, &content).map_err(|e| format!("迁移配置失败: {}", e))?;

        return Ok(Some(config));
    }

    Ok(None)
}

#[tauri::command]
fn save_app_config(_app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let config_path = exe_config_path()?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    is_path_safe(file_path)?;
    fs::write(&path, contents).map_err(|e| format!("写入文件失败: {}", e))
}

#[tauri::command]
fn set_git_proxy(port: u16) -> Result<(), String> {
    if port == 0 {
        return Err("端口号无效（端口不能为 0）".to_string());
    }
    
    let proxy_url = format!("http://127.0.0.1:{}", port);
    
    Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["config", "--global", "http.proxy", &proxy_url])
        .output()
        .map_err(|e| format!("设置 HTTP 代理失败: {}", e))?;
    
    Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["config", "--global", "https.proxy", &proxy_url])
        .output()
        .map_err(|e| format!("设置 HTTPS 代理失败: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn get_git_proxy() -> Result<Option<String>, String> {
    let http_output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["config", "--global", "--get", "http.proxy"])
        .output()
        .map_err(|e| format!("获取 Git 代理配置失败: {}", e))?;
    
    if http_output.status.success() && !http_output.stdout.is_empty() {
        let proxy = String::from_utf8_lossy(&http_output.stdout).trim().to_string();
        if !proxy.is_empty() {
            return Ok(Some(proxy));
        }
    }
    
    Ok(None)
}

#[tauri::command]
fn clear_git_proxy() -> Result<(), String> {
    Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["config", "--global", "--unset", "http.proxy"])
        .output()
        .map_err(|e| format!("清除 HTTP 代理失败: {}", e))?;
    
    Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["config", "--global", "--unset", "https.proxy"])
        .output()
        .map_err(|e| format!("清除 HTTPS 代理失败: {}", e))?;
    
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NvmInfo {
    pub installed: bool,
    pub current_version: Option<String>,
    pub installed_versions: Vec<String>,
    pub available_versions: Vec<String>,
}

fn check_nvm_installed() -> bool {
    let nvm_home = std::env::var("NVM_HOME").ok();
    let nvm_symlink = std::env::var("NVM_SYMLINK").ok();
    let nvm_dir = std::env::var("NVM_DIR").ok();

    nvm_home.is_some() || nvm_dir.is_some() || nvm_symlink.is_some()
}

fn get_installed_node_versions() -> Vec<String> {
    let mut versions = Vec::new();

    let nvm_home = std::env::var("NVM_HOME")
        .or_else(|_| std::env::var("NVM_DIR"))
        .unwrap_or_else(|_| {
            let home = std::env::var("USERPROFILE").unwrap_or_default();
            format!("{}\\AppData\\Roaming\\nvm", home)
        });

    let nvm_path = PathBuf::from(&nvm_home);

    if !nvm_path.exists() {
        return versions;
    }

    if let Ok(entries) = fs::read_dir(&nvm_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                if name.starts_with('v') {
                    let node_exe = path.join("node.exe");
                    if node_exe.exists() {
                        let version_without_v = name.trim_start_matches('v').to_string();
                        versions.push(version_without_v);
                    }
                }
            }
        }
    }

    versions.sort_by(|a, b| {
        let parse_version = |s: &str| {
            s.split('.')
                .filter_map(|p| p.parse::<u32>().ok())
                .collect::<Vec<u32>>()
        };
        let va = parse_version(a);
        let vb = parse_version(b);
        vb.cmp(&va)
    });

    versions
}

fn get_current_node_version() -> Option<String> {
    let output = Command::new("node")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["--version"])
        .output()
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if version.starts_with('v') {
            return Some(version.trim_start_matches('v').to_string());
        }
    }

    None
}

#[tauri::command]
fn get_nvm_info() -> Result<NvmInfo, String> {
    let installed = check_nvm_installed();
    let installed_versions = if installed {
        get_installed_node_versions()
    } else {
        Vec::new()
    };

    let current_version = if installed {
        get_current_node_version()
    } else {
        None
    };

    let available_versions = vec![
        "22.0.0".to_string(),
        "21.0.0".to_string(),
        "20.0.0".to_string(),
        "18.0.0".to_string(),
        "16.0.0".to_string(),
    ];

    Ok(NvmInfo {
        installed,
        current_version,
        installed_versions,
        available_versions,
    })
}

#[tauri::command]
fn switch_node_version(version: String) -> Result<(), String> {
    let nvm_home = std::env::var("NVM_HOME")
        .or_else(|_| std::env::var("NVM_DIR"))
        .unwrap_or_else(|_| {
            let home = std::env::var("USERPROFILE").unwrap_or_default();
            format!("{}\\AppData\\Roaming\\nvm", home)
        });

    let version_with_v = if version.starts_with('v') {
        version.clone()
    } else {
        format!("v{}", version)
    };

    let version_path = PathBuf::from(&nvm_home).join(&version_with_v).join("node.exe");

    if !version_path.exists() {
        return Err(format!("Node.js v{} 未安装，请先安装该版本", version));
    }

    let output = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", "nvm", "use", &version])
        .output()
        .map_err(|e| format!("执行 nvm use 命令失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let error_msg = if !stderr.is_empty() {
            stderr.to_string()
        } else if !stdout.is_empty() {
            stdout.to_string()
        } else {
            format!("切换失败，退出码: {}", output.status)
        };
        return Err(format!("切换 Node.js v{} 失败: {}", version, error_msg));
    }

    Ok(())
}

#[tauri::command]
fn install_node_version(version: String) -> Result<(), String> {
    let nvm_home = std::env::var("NVM_HOME")
        .or_else(|_| std::env::var("NVM_DIR"))
        .unwrap_or_else(|_| {
            let home = std::env::var("USERPROFILE").unwrap_or_default();
            format!("{}\\AppData\\Roaming\\nvm", home)
        });

    let version_with_v = if version.starts_with('v') {
        version.clone()
    } else {
        format!("v{}", version)
    };

    let version_path = PathBuf::from(&nvm_home).join(&version_with_v).join("node.exe");

    if version_path.exists() {
        let output = Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "nvm", "use", &version])
            .output()
            .map_err(|e| format!("执行 nvm use 命令失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let error_msg = if !stderr.is_empty() {
                stderr.to_string()
            } else if !stdout.is_empty() {
                stdout.to_string()
            } else {
                format!("切换失败，退出码: {}", output.status)
            };
            return Err(format!("切换 Node.js v{} 失败: {}", version, error_msg));
        }
        return Ok(());
    }

    let install_output = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", "nvm", "install", &version])
        .output()
        .map_err(|e| format!("执行 nvm install 命令失败: {}", e))?;

    if !install_output.status.success() {
        let stderr = String::from_utf8_lossy(&install_output.stderr);
        let stdout = String::from_utf8_lossy(&install_output.stdout);
        let error_msg = if !stderr.is_empty() {
            stderr.to_string()
        } else if !stdout.is_empty() {
            stdout.to_string()
        } else {
            format!("安装失败，退出码: {}", install_output.status)
        };
        return Err(format!("安装 Node.js v{} 失败: {}", version, error_msg));
    }

    let use_output = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", "nvm", "use", &version])
        .output()
        .map_err(|e| format!("执行 nvm use 命令失败: {}", e))?;

    if !use_output.status.success() {
        let stderr = String::from_utf8_lossy(&use_output.stderr);
        let stdout = String::from_utf8_lossy(&use_output.stdout);
        let error_msg = if !stderr.is_empty() {
            stderr.to_string()
        } else if !stdout.is_empty() {
            stdout.to_string()
        } else {
            format!("切换失败，退出码: {}", use_output.status)
        };
        return Err(format!("安装完成但切换 Node.js v{} 失败: {}", version, error_msg));
    }

    Ok(())
}

const AUTOSTART_REG_KEY: &str = r"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_APP_NAME: &str = "FileMover";

const TRAY_ENABLED_KEY: &str = r"HKEY_CURRENT_USER\Software\FileMover";

fn get_tray_enabled_from_registry() -> Result<bool, String> {
    let output = Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["query", TRAY_ENABLED_KEY, "/v", "TrayEnabled"])
        .output()
        .map_err(|e| format!("查询托盘状态失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("0x0") {
            Ok(false)
        } else {
            Ok(true)
        }
    } else {
        Ok(false)
    }
}

fn set_tray_enabled_to_registry(enabled: bool) -> Result<(), String> {
    let value = if enabled { "1" } else { "0" };

    Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "add",
            TRAY_ENABLED_KEY,
            "/v", "TrayEnabled",
            "/t", "REG_SZ",
            "/d", value,
            "/f"
        ])
        .output()
        .map_err(|e| format!("保存托盘状态失败: {}", e))?;

    Ok(())
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    let output = Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["query", AUTOSTART_REG_KEY, "/v", AUTOSTART_APP_NAME])
        .output()
        .map_err(|e| format!("查询开机启动状态失败: {}", e))?;
    
    Ok(output.status.success())
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("获取程序路径失败: {}", e))?;
        
        let exe_path_str = exe_path.to_string_lossy().to_string();
        
        Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "add",
                AUTOSTART_REG_KEY,
                "/v", AUTOSTART_APP_NAME,
                "/t", "REG_SZ",
                "/d", &exe_path_str,
                "/f"
            ])
            .output()
            .map_err(|e| format!("添加开机启动失败: {}", e))?;
    } else {
        Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "delete",
                AUTOSTART_REG_KEY,
                "/v", AUTOSTART_APP_NAME,
                "/f"
            ])
            .output()
            .map_err(|e| format!("移除开机启动失败: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
fn get_tray_setting(_app: AppHandle) -> Result<bool, String> {
    get_tray_enabled_from_registry()
}

#[tauri::command]
fn set_tray_setting(_app: AppHandle, enabled: bool) -> Result<(), String> {
    set_tray_enabled_to_registry(enabled)
}

#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| format!("隐藏窗口失败: {}", e))?;
    }
    Ok(())
}

// ========== 文件监听（Auto Watch） ==========

fn get_all_files_recursive(path: &Path) -> Result<Vec<(PathBuf, std::time::SystemTime)>, String> {
    let mut files = Vec::new();
    
    if !path.is_dir() {
        return Ok(files);
    }
    
    fn collect_files(dir: &Path, files: &mut Vec<(PathBuf, std::time::SystemTime)>) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            
            if path.is_dir() {
                collect_files(&path, files)?;
            } else if path.is_file() {
                let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                if let Ok(modified) = metadata.modified() {
                    files.push((path, modified));
                }
            }
        }
        Ok(())
    }
    
    collect_files(path, &mut files)?;
    Ok(files)
}

fn has_newer_files(source_dir: &Path, target_dir: &Path) -> Result<bool, String> {
    let source_files = get_all_files_recursive(source_dir)?;
    let target_files = get_all_files_recursive(target_dir)?;
    
    let target_file_map: std::collections::HashMap<String, std::time::SystemTime> = target_files
        .into_iter()
        .map(|(p, t)| {
            let relative = p.strip_prefix(target_dir)
                .map(|r| r.to_string_lossy().to_string())
                .unwrap_or_else(|_| p.to_string_lossy().to_string());
            (relative, t)
        })
        .collect();
    
    for (source_path, source_time) in source_files {
        let relative = source_path.strip_prefix(source_dir)
            .map(|r| r.to_string_lossy().to_string())
            .unwrap_or_else(|_| source_path.to_string_lossy().to_string());
        
        if let Some(&target_time) = target_file_map.get(&relative) {
            if source_time > target_time {
                return Ok(true);
            }
        }
    }
    
    Ok(false)
}

#[tauri::command]
async fn start_watch(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
    project_id: String,
    path: String,
    target_path: String,
) -> Result<(), String> {
    let source_path_buf = PathBuf::from(&path);
    let target_path_buf = PathBuf::from(&target_path);

    if !source_path_buf.exists() || !source_path_buf.is_dir() {
        return Err("源目录不存在或不是有效的目录".to_string());
    }

    if !target_path_buf.exists() || !target_path_buf.is_dir() {
        return Err("目标目录不存在或不是有效的目录".to_string());
    }

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        if state.watchers.contains_key(&project_id) {
            return Err("该项目已在监听中".to_string());
        }
    }

    let (tx, rx) = mpsc::channel();
    let handler = NotifyHandler(tx);
    let mut watcher = RecommendedWatcher::new(handler, Config::default())
        .map_err(|e| format!("创建文件监听器失败: {}", e))?;
    watcher
        .watch(&source_path_buf, RecursiveMode::Recursive)
        .map_err(|e| format!("无法监听目录: {}", e))?;

    {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.watchers.insert(project_id.clone(), watcher);
    }

    let app_clone = app.clone();
    let pid = project_id.clone();
    let source_clone = source_path_buf.clone();
    let target_clone = target_path_buf.clone();
    
    thread::spawn(move || {
        let mut last_event_time: Option<Instant> = None;
        let debounce = Duration::from_secs(5);
        let mut directory_deleted = false;
        
        loop {
            // 检查源目录是否存在
            if !source_clone.exists() && !directory_deleted {
                directory_deleted = true;
                last_event_time = None;
            } else if source_clone.exists() && directory_deleted {
                directory_deleted = false;
                last_event_time = Some(Instant::now());
            }
            
            if directory_deleted {
                // 等待目录恢复
                thread::sleep(Duration::from_secs(1));
                continue;
            }
            
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(event)) => {
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            last_event_time = Some(Instant::now());
                        }
                        EventKind::Remove(_) => {
                            last_event_time = Some(Instant::now());
                        }
                        _ => {}
                    }
                }
                Ok(Err(_)) => {
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let Some(last) = last_event_time {
                        if last.elapsed() >= debounce {
                            if source_clone.exists() {
                                match has_newer_files(&source_clone, &target_clone) {
                                    Ok(true) => {
                                        let _ = app_clone.emit(
                                            "watch-trigger",
                                            WatchTrigger {
                                                card_id: pid.clone(),
                                            },
                                        );
                                    }
                                    Ok(false) => {
                                    }
                                    Err(_) => {
                                    }
                                }
                            }
                            
                            last_event_time = Some(Instant::now());
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_watch(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
    project_id: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.watchers.remove(&project_id);
    Ok(())
}

#[tauri::command]
async fn stop_all_watches(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.watchers.clear();
    Ok(())
}

#[tauri::command]
async fn get_watch_statuses(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.watchers.keys().cloned().collect())
}

#[tauri::command]
async fn stop_operation(
    state: tauri::State<'_, Arc<Mutex<CancellationState>>>,
    card_id: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.cancelled.insert(card_id, true);
    Ok(())
}

#[tauri::command]
async fn clear_cancellation(
    state: tauri::State<'_, Arc<Mutex<CancellationState>>>,
    card_id: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.cancelled.remove(&card_id);
    Ok(())
}

#[tauri::command]
fn open_hosts_file() -> Result<(), String> {
    let hosts_path = r"C:\Windows\System32\drivers\etc\hosts";
    
    Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", "start", "", hosts_path])
        .output()
        .map_err(|e| format!("打开 hosts 文件失败: {}", e))?;
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(Mutex::new(WatcherState {
            watchers: HashMap::new(),
        })))
        .manage(Arc::new(Mutex::new(CancellationState {
            cancelled: HashMap::new(),
        })))
        .invoke_handler(tauri::generate_handler![
            copy_and_prepare,
            git_commit_push,
            git_pull,
            get_exe_dir,
            get_config_path,
            load_app_config,
            save_app_config,
            write_text_file,
            list_directories,
            set_git_proxy,
            get_git_proxy,
            clear_git_proxy,
            get_nvm_info,
            switch_node_version,
            install_node_version,
            get_autostart,
            set_autostart,
            get_tray_setting,
            set_tray_setting,
            show_window,
            hide_window,
            start_watch,
            stop_watch,
            stop_all_watches,
            get_watch_statuses,
            stop_operation,
            clear_cancellation,
            open_hosts_file
        ])
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("前端部署工具")
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let app_handle_for_close = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                let app_handle_for_close_clone = app_handle_for_close.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let tray_enabled = get_tray_enabled_from_registry().unwrap_or(false);
                        if tray_enabled {
                            api.prevent_close();
                            if let Some(window) = app_handle_for_close_clone.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}

