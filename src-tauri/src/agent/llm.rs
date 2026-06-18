//! DeepSeek LLM 客户端
//!
//! DeepSeek API 与 OpenAI Chat Completions 协议兼容（Function Calling 也一致）。
//! 默认端点：https://api.deepseek.com/v1/chat/completions
//! 默认模型：deepseek-chat（DeepSeek-V3）
//!
//! 使用系统自带的 `curl.exe`（Win10 1803+ 内置）发起 HTTP 请求，
//! 通过临时文件传递请求体，避免命令行长度限制。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x08000000;

const REQUEST_TIMEOUT_SECS: u64 = 120;

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "tool_call_id")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "tool_calls")]
    pub tool_calls: Option<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatResponse {
    pub id: Option<String>,
    pub model: Option<String>,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatChoice {
    pub index: u32,
    pub message: AssistantMessage,
    #[serde(rename = "finish_reason")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AssistantMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(rename = "tool_calls")]
    pub tool_calls: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatRequest<'a> {
    pub model: &'a str,
    pub messages: &'a [ChatMessage],
    pub tools: &'a [Value],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    pub stream: bool,
}

/// 调用 DeepSeek Chat Completions 接口（同步；在 agent 中用 spawn_blocking 包装）
pub fn chat_completion(
    api_key: &str,
    base_url: &str,
    model: &str,
    messages: &[ChatMessage],
    tools: &[Value],
) -> Result<ChatResponse, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let req = ChatRequest {
        model,
        messages,
        tools,
        temperature: Some(0.6),
        stream: false,
    };
    let body = serde_json::to_string(&req).map_err(|e| format!("序列化请求失败: {}", e))?;

    // 写请求体到临时文件
    let tmp_path = write_temp_file("ai_agent_req", &body)?;
    let result = curl_post(&url, api_key, &tmp_path, REQUEST_TIMEOUT_SECS);
    let _ = fs::remove_file(&tmp_path);
    result
}

/// 简易连通性测试
pub fn ping(api_key: &str, base_url: &str, model: &str) -> Result<String, String> {
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: Some("ping".into()),
        name: None,
        tool_call_id: None,
        tool_calls: None,
    }];
    let resp = chat_completion(api_key, base_url, model, &messages, &[])?;
    let text = resp
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .unwrap_or_else(|| "(空响应)".to_string());
    Ok(text)
}

/// 系统提示词
pub fn system_prompt() -> String {
    let now = crate::agent::tools::chrono_local_now_string();
    format!(
        "你是「前端部署工具」的 AI 助手，运行在用户的 Windows 桌面端。你可以使用工具来：\n\
         1. 管理项目卡片（增删改查、列出）\n\
         2. 触发文件搬运/部署任务（异步执行）\n\
         3. 执行 Git 操作（status/pull/commit+push/log）\n\
         4. 管理应用设置（Git 代理、开机自启、NVM 等）\n\
         5. 联网工具（天气查询、网页搜索、当前时间、Ping 主机）\n\
         \n\
         行为准则：\n\
         - 用简体中文回复，保持简洁\n\
         - 涉及文件路径操作时使用绝对路径，并优先使用项目现有的 sourcePath/targetPath\n\
         - 执行破坏性操作（删除项目、移动文件、清空目录、强制 push）时先简要说明\n\
         - 用户问题模糊时主动用 list_projects 了解上下文\n\
         - 工具返回失败时把原始错误信息告诉用户\n\
         - 天气/搜索/网络工具可能偶尔失败，失败时建议重试或换关键词\n\
         \n\
         当前时间: {}\n\
         ",
        now
    )
}

/// 把 tools::ToolDef 转成 OpenAI 协议所需的 Value
pub fn tools_to_json_value(defs: &[crate::agent::tools::ToolDef]) -> Vec<Value> {
    defs.iter()
        .map(|t| {
            json!({
                "type": t.kind,
                "function": {
                    "name": t.function.name,
                    "description": t.function.description,
                    "parameters": t.function.parameters,
                }
            })
        })
        .collect()
}

// =====================================================
// HTTP 工具（基于系统 curl.exe）
// =====================================================

pub(crate) fn write_temp_file(prefix: &str, content: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir();
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let path = dir.join(format!("{}_{}_{}.tmp", prefix, pid, nanos));
    let mut f = fs::File::create(&path).map_err(|e| format!("创建临时文件失败: {}", e))?;
    f.write_all(content.as_bytes())
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    f.flush().map_err(|e| format!("flush 失败: {}", e))?;
    Ok(path)
}

pub(crate) fn curl_post(
    url: &str,
    api_key: &str,
    body_file: &PathBuf,
    timeout_secs: u64,
) -> Result<ChatResponse, String> {
    // curl -s -X POST <url>
    //      -H "Content-Type: application/json"
    //      -H "Authorization: Bearer <key>"
    //      --data-binary @<file>
    //      --max-time <sec>
    //      -w "\n%{http_code}"
    let out = Command::new("curl")
        .creation_flags(CREATE_NO_WINDOW)
        .arg("-s") // silent
        .arg("-X").arg("POST")
        .arg(url)
        .arg("-H").arg("Content-Type: application/json")
        .arg("-H").arg(format!("Authorization: Bearer {}", api_key))
        .arg("--data-binary").arg(format!("@{}", body_file.to_string_lossy()))
        .arg("--max-time").arg(timeout_secs.to_string())
        .arg("-w").arg("\n__HTTP_STATUS__:%{http_code}")
        .output()
        .map_err(|e| format!("调用 curl 失败: {}（请确认系统已安装 curl，Win10 1803+ 自带）", e))?;

    let combined = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() && combined.is_empty() {
        return Err(format!("curl 退出失败: {}", if stderr.is_empty() { "无输出".to_string() } else { stderr }));
    }

    // 拆分 HTTP 状态码
    let (body, status_str) = match combined.rsplit_once("\n__HTTP_STATUS__:") {
        Some((b, s)) => (b.to_string(), s.trim().to_string()),
        None => (combined.clone(), String::new()),
    };
    let status: u16 = status_str.parse().unwrap_or(0);
    if status >= 400 {
        return Err(format!("LLM 接口返回 HTTP {}: {}", status, truncate(&body, 500)));
    }
    if status == 0 {
        return Err(format!("未获取到 HTTP 状态码；body: {}", truncate(&body, 200)));
    }

    let parsed: ChatResponse = serde_json::from_str(&body)
        .map_err(|e| format!("解析 LLM 响应失败: {}；原始: {}", e, truncate(&body, 800)))?;

    Ok(parsed)
}

pub(crate) fn curl_get(url: &str, user_agent: &str, timeout_secs: u64) -> Result<String, String> {
    let out = Command::new("curl")
        .creation_flags(CREATE_NO_WINDOW)
        .arg("-sL") // silent + follow redirects
        .arg("-A").arg(user_agent)
        .arg("--max-time").arg(timeout_secs.to_string())
        .arg("-w").arg("\n__HTTP_STATUS__:%{http_code}")
        .arg(url)
        .output()
        .map_err(|e| format!("调用 curl 失败: {}", e))?;
    if !out.status.success() {
        let e = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("curl 退出失败: {}", if e.is_empty() { "无输出".to_string() } else { e }));
    }
    let combined = String::from_utf8_lossy(&out.stdout).to_string();
    let (body, status_str) = match combined.rsplit_once("\n__HTTP_STATUS__:") {
        Some((b, s)) => (b.to_string(), s.trim().to_string()),
        None => (combined.clone(), String::new()),
    };
    let status: u16 = status_str.parse().unwrap_or(0);
    if status >= 400 {
        return Err(format!("HTTP {}: {}", status, truncate(&body, 300)));
    }
    Ok(body)
}

fn truncate(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        let mut t = String::with_capacity(n + 1);
        for (i, c) in s.chars().enumerate() {
            if i >= n {
                t.push('…');
                break;
            }
            t.push(c);
        }
        t
    }
}

// 给 agent::run_agent 用的超时常量
#[allow(dead_code)]
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);
