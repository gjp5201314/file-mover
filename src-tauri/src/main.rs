use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;
use tauri::Manager;

const CONFIG_FILE_NAME: &str = "frontend-deployer-config.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CopyProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub card_id: String,
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
    _card_id: String,
) -> Result<String, String> {
    let target_path = Path::new(&target);

    if !target_path.exists() {
        return Err("目标目录不存在".to_string());
    }

    let git_pull_output = Command::new("git")
        .args(["-C", &target, "pull"])
        .output()
        .map_err(|e| format!("git pull 失败: {}", e))?;

    let pull_str = String::from_utf8_lossy(&git_pull_output.stdout).to_string();
    let pull_err = String::from_utf8_lossy(&git_pull_output.stderr).to_string();
    let _ = app.emit("git-output", format!("git pull:\n{}{}", pull_str, pull_err));

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
    clear_target: bool,
    card_id: String,
) -> Result<String, String> {
    let source_path = Path::new(&source);
    let target_path = Path::new(&target);

    if !source_path.exists() {
        return Err("源目录不存在".to_string());
    }

    if !target_path.exists() {
        fs::create_dir_all(target_path).map_err(|e| e.to_string())?;
    }

    if auto_pull {
        let git_pull_output = Command::new("git")
            .args(["-C", &target, "pull"])
            .output()
            .map_err(|e| format!("git pull 失败: {}", e))?;

        let pull_str = String::from_utf8_lossy(&git_pull_output.stdout).to_string();
        let pull_err = String::from_utf8_lossy(&git_pull_output.stderr).to_string();
        let _ = app.emit("git-output", format!("git pull:\n{}{}", pull_str, pull_err));

        if !git_pull_output.status.success() {
            return Err(format!("git pull 失败: {}", pull_err));
        }
    }

    if clear_target {
        remove_dir_all_recursive(target_path)?;
    }

    let is_cut = move_mode == "cut";
    copy_dir_recursive(source_path, target_path, is_cut)?;

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
    _card_id: String,
) -> Result<(), String> {
    let target_path = Path::new(&target);

    if !target_path.exists() {
        return Err("目标目录不存在".to_string());
    }

    let git_add_output = Command::new("git")
        .args(["-C", &target, "add", "."])
        .output()
        .map_err(|e| format!("git add 失败: {}", e))?;

    let add_str = String::from_utf8_lossy(&git_add_output.stdout).to_string();
    let add_err = String::from_utf8_lossy(&git_add_output.stderr).to_string();
    let _ = app.emit("git-output", format!("git add:\n{}{}", add_str, add_err));

    if !git_add_output.status.success() {
        return Err(format!("git add 失败: {}", add_err));
    }

    let git_commit_output = Command::new("git")
        .args(["-C", &target, "commit", "-m", &message])
        .output()
        .map_err(|e| format!("git commit 失败: {}", e))?;

    let commit_str = String::from_utf8_lossy(&git_commit_output.stdout).to_string();
    let commit_err = String::from_utf8_lossy(&git_commit_output.stderr).to_string();
    let _ = app.emit("git-output", format!("git commit:\n{}{}", commit_str, commit_err));

    if !git_commit_output.status.success() {
        if commit_err.contains("nothing to commit") {
            return Err("没有文件需要提交".to_string());
        }
        return Err(format!("git commit 失败: {}", commit_err));
    }

    let git_push_output = Command::new("git")
        .args(["-C", &target, "push"])
        .output()
        .map_err(|e| format!("git push 失败: {}", e))?;

    let push_str = String::from_utf8_lossy(&git_push_output.stdout).to_string();
    let push_err = String::from_utf8_lossy(&git_push_output.stderr).to_string();
    let _ = app.emit("git-output", format!("git push:\n{}{}", push_str, push_err));

    if !git_push_output.status.success() {
        return Err(format!("git push 失败: {}", push_err));
    }

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
            save_app_config
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
