//! AI Agent 密钥管理
//!
//! 使用 Windows DPAPI（通过 PowerShell 调用）将 API Key 加密后存储在
//! 应用可执行文件目录下的 ai-agent.bin 文件中。
//!
//! DPAPI（Data Protection API）使用当前用户的登录凭据作为加密密钥，
//! 因此只有同一 Windows 账户登录后才能解密，安全等级与系统钥匙串相当。

use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::exe_config_path;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 密钥文件名前缀（最终路径：ai-agent.bin）
const SECRET_FILE_NAME: &str = "ai-agent.bin";

/// 获取密钥文件路径
fn secret_path() -> Result<PathBuf, String> {
    let cfg = exe_config_path()?;
    let parent = cfg
        .parent()
        .ok_or_else(|| "无法获取配置父目录".to_string())?;
    Ok(parent.join(SECRET_FILE_NAME))
}

/// 构造一个唯一的临时 .ps1 脚本路径
fn temp_script_path(tag: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    let pid = std::process::id();
    p.push(format!("file-mover-dpapi-{}-{}.ps1", pid, tag));
    p
}

/// 用 PowerShell 的 DPAPI 加密/解密
///
/// 设计要点：
/// 1. 脚本写入临时 `.ps1` 文件，用 `-File` 传参，**避免** `-Command "<长脚本> <arg1> <arg2>"`
///    模式下 PowerShell 把脚本和后续参数当做一个大脚本来解析的坑（会出现
///    "194 + ... sk-xxx Ei\fast..." 这种 ParserError）。
/// 2. 错误消息在回显前会把 API Key 值替换成 `***`（防御性脱敏）。
fn run_dpapi(dp_cmd: &str, input: Option<&str>, output_file: Option<&PathBuf>) -> Result<String, String> {
    let (script, key_arg, path_arg) = build_dpapi_script(dp_cmd, input, output_file)?;

    // 写临时脚本
    let tmp = temp_script_path(dp_cmd);
    {
        let mut f = fs::File::create(&tmp)
            .map_err(|e| format!("创建临时脚本失败: {}", e))?;
        f.write_all(script.as_bytes())
            .map_err(|e| format!("写入临时脚本失败: {}", e))?;
    }

    // 调 PowerShell -File
    let mut cmd = Command::new("powershell");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-STA")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&tmp);

    if let Some(k) = key_arg.as_ref() {
        cmd.arg(k);
    }
    if let Some(p) = path_arg.as_ref() {
        cmd.arg(p);
    }

    let out = cmd
        .output()
        .map_err(|e| format!("调用 PowerShell 失败: {}", e))?;

    // 清理临时脚本
    let _ = fs::remove_file(&tmp);

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

    if !out.status.success() {
        // 优先 stderr（PowerShell 的错误流通常包含真正的诊断信息）
        let raw = if !stderr.trim().is_empty() {
            stderr
        } else {
            stdout
        };
        // 脱敏：把 key 替换成 ***
        let redacted = redact_sensitive(&raw, key_arg.as_deref());
        return Err(format!(
            "DPAPI {} 失败: {}",
            dp_cmd,
            truncate(&redacted, 600)
        ));
    }

    let trimmed = stdout.trim().to_string();
    if dp_cmd == "Unprotect" && trimmed.is_empty() {
        return Err("DPAPI 解密结果为空".to_string());
    }
    Ok(trimmed)
}

/// 构造 PS 脚本与对应参数
///
/// 返回 `(script, key_arg, path_arg)`：
/// - `key_arg` 仅 Protect 时为 `Some(key)`，会作为 `$args[0]` 传给脚本
/// - `path_arg` 始终为 `Some(path)`，作为 `$args[1]`（Protect）或 `$args[0]`（Unprotect）
///
/// 关键点：用 `[System.IO.File]::WriteAllText(..., New-Object UTF8Encoding $False)`
/// 替代 `Set-Content -Encoding UTF8`，绕开 PS 5.1 默认写 BOM 的坑；
/// 否则 Unprotect 阶段 `ConvertTo-SecureString` 会因 BOM 前缀报"格式不正确"。
fn build_dpapi_script(
    dp_cmd: &str,
    input: Option<&str>,
    output_file: Option<&PathBuf>,
) -> Result<(String, Option<String>, Option<String>), String> {
    match dp_cmd {
        "Protect" => {
            let path = output_file.ok_or("Protect 需要 output_file")?;
            let path_str = path.to_string_lossy().to_string();
            let key = input.ok_or("Protect 需要 input (key)")?.to_string();
            let script = "$ErrorActionPreference = 'Stop'\n\
                          $s = ConvertTo-SecureString -String $args[0] -AsPlainText -Force\n\
                          $enc = ConvertFrom-SecureString $s\n\
                          $utf8 = New-Object System.Text.UTF8Encoding($False)\n\
                          [System.IO.File]::WriteAllText($args[1], $enc, $utf8)\n\
                          [Console]::Out.Write('OK')\n"
                .to_string();
            Ok((script, Some(key), Some(path_str)))
        }
        "Unprotect" => {
            let path = input.ok_or("Unprotect 需要 input (path)")?;
            let path_str = path.to_string();
            let script = "$ErrorActionPreference = 'Stop'\n\
                          $utf8 = New-Object System.Text.UTF8Encoding($False)\n\
                          $enc = [System.IO.File]::ReadAllText($args[0], $utf8)\n\
                          $s = ConvertTo-SecureString $enc\n\
                          $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)\n\
                          $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)\n\
                          [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)\n\
                          [Console]::Out.Write($plain)\n"
                .to_string();
            Ok((script, None, Some(path_str)))
        }
        _ => Err(format!("未知 dpapi 命令: {}", dp_cmd)),
    }
}

/// 在错误消息中把敏感字段（API Key）替换为 `***REDACTED***`
fn redact_sensitive(text: &str, key: Option<&str>) -> String {
    let mut out = text.to_string();
    if let Some(k) = key {
        if !k.is_empty() {
            // 1) 完整 Key 直接替换
            out = out.replace(k, "***REDACTED***");
            // 2) 保险：再替换前 8 + 末 4 的指纹（防止 Key 被日志系统分块）
            if k.len() >= 16 {
                let head: String = k.chars().take(8).collect();
                let tail: String = k
                    .chars()
                    .rev()
                    .take(4)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect();
                if !head.is_empty() && !tail.is_empty() {
                    out = out.replace(&format!("{}{}", head, tail), "***REDACTED***");
                }
            }
        }
    }
    out
}

/// 截断到指定字节数（按 char 边界）
fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

/// 保存 API Key（加密后写入文件）
pub fn set_api_key(api_key: &str) -> Result<(), String> {
    let p = secret_path()?;
    let _ = run_dpapi("Protect", Some(api_key), Some(&p))?;
    Ok(())
}

/// 读取 API Key
pub fn get_api_key() -> Result<Option<String>, String> {
    let p = secret_path()?;
    if !p.exists() {
        return Ok(None);
    }
    let path_str = p.to_string_lossy().to_string();
    match run_dpapi("Unprotect", Some(&path_str), None) {
        Ok(v) => Ok(Some(v)),
        Err(e) => {
            // 解密失败时把文件当作空（首次使用或被损坏）
            eprintln!("[ai-agent] 读取 API Key 失败: {}", e);
            Ok(None)
        }
    }
}

/// 清除 API Key
pub fn clear_api_key() -> Result<(), String> {
    let p = secret_path()?;
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("删除密钥文件失败: {}", e))?;
    }
    Ok(())
}

/// 保存 Base URL（明文存到配置文件里，无敏感信息）
pub fn set_base_url(url: &str) -> Result<(), String> {
    set_agent_setting("baseUrl", url)
}

/// 读取 Base URL
pub fn get_base_url() -> Result<Option<String>, String> {
    get_agent_setting("baseUrl")
}

/// 保存模型名称（明文存到配置文件里）
pub fn set_model(model: &str) -> Result<(), String> {
    set_agent_setting("model", model)
}

/// 读取模型名称
pub fn get_model() -> Result<Option<String>, String> {
    get_agent_setting("model")
}

fn agent_setting_path() -> Result<PathBuf, String> {
    let cfg = exe_config_path()?;
    let parent = cfg.parent().ok_or("无法获取配置父目录")?;
    Ok(parent.join("ai-agent-settings.json"))
}

fn set_agent_setting(key: &str, value: &str) -> Result<(), String> {
    let p = agent_setting_path()?;
    let mut current: serde_json::Value = if p.exists() {
        let content = fs::read_to_string(&p).map_err(|e| format!("读取 AI 设置失败: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if !current.is_object() {
        current = serde_json::json!({});
    }
    current
        .as_object_mut()
        .unwrap()
        .insert(key.to_string(), serde_json::Value::String(value.to_string()));
    let s = serde_json::to_string_pretty(&current)
        .map_err(|e| format!("序列化 AI 设置失败: {}", e))?;
    fs::write(&p, s).map_err(|e| format!("写入 AI 设置失败: {}", e))?;
    Ok(())
}

fn get_agent_setting(key: &str) -> Result<Option<String>, String> {
    let p = agent_setting_path()?;
    if !p.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&p).map_err(|e| format!("读取 AI 设置失败: {}", e))?;
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
    Ok(v
        .get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string()))
}

/// 清除所有 AI 相关配置
pub fn clear_all() -> Result<(), String> {
    let _ = clear_api_key();
    let p = agent_setting_path()?;
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("删除 AI 设置文件失败: {}", e))?;
    }
    Ok(())
}
