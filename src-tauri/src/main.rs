#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;
use tauri::Manager;

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
    target: String,
    card_id: String,
) -> Result<String, String> {
    let target_path = Path::new(&target);
    
    is_path_safe(target_path)?;
    
    if !target_path.exists() {
        return Err("目标目录不存在".to_string());
    }

    let git_pull_output = Command::new("git")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-C", &target, "pull"])
        .output()
        .map_err(|e| format!("git pull 失败: {}", e))?;

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
    
    validate_source_target_paths(source_path, target_path)?;
    
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

        let git_pull_output = Command::new("git")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-C", &target, "pull"])
            .output()
            .map_err(|e| format!("git pull 失败: {}", e))?;

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
    target: String,
    message: String,
    card_id: String,
) -> Result<(), String> {
    let target_path = Path::new(&target);
    
    is_path_safe(target_path)?;
    
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
    if port < 1 || port > 65535 {
        return Err("端口号无效（范围：1-65535）".to_string());
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

const AUTOSTART_REG_KEY: &str = r"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_APP_NAME: &str = "FileMover";

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            get_autostart,
            set_autostart
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}

