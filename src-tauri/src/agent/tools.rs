//! AI Agent 工具定义与执行
//!
//! 每个工具都包含：
//! - JSON Schema 描述（用于 LLM Function Calling）
//! - 执行函数（接收参数，返回结果字符串）
//!
//! 工具分类：
//! - 项目管理：list/add/update/delete
//! - 文件搬运：execute/stop
//! - Git 操作：status/pull/commit+push/log
//! - 应用设置：autostart/tray/git_proxy/nvm
//! - 日常工具：weather/web_search/time/ping
//!
//! 所有路径都通过 is_path_safe 校验以避免安全风险。

use crate::is_path_safe;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use tauri::Emitter;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 工具定义（提供给 LLM）
#[derive(Debug, Clone, Serialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub kind: String,
    pub function: ToolFunction,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

/// 工具调用请求（来自 LLM）
#[derive(Debug, Clone, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

/// 工具执行结果
#[derive(Debug, Clone, Serialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub content: String,
}

impl ToolResult {
    pub fn ok(tool_call_id: String, content: impl Into<String>) -> Self {
        Self {
            tool_call_id,
            content: content.into(),
        }
    }

    pub fn err(tool_call_id: String, err: impl std::fmt::Display) -> Self {
        Self {
            tool_call_id,
            content: format!("执行失败: {}", err),
        }
    }
}

/// 返回所有可用工具定义
pub fn all_tool_defs() -> Vec<ToolDef> {
    vec![
        // ============ 项目管理 ============
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "list_projects".into(),
                description: "列出所有已配置的项目卡片，返回每个项目的 id、name、sourcePath、targetPath、autoPull、moveMode、clearTargetMode、commitMode、autoWatch、status。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "add_project".into(),
                description: "添加一个新的项目卡片。name、sourcePath、targetPath 必填。moveMode 默认 copy，commitMode 默认 auto，autoPull 默认 true。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "项目显示名称" },
                        "sourcePath": { "type": "string", "description": "源目录（构建输出目录）绝对路径" },
                        "targetPath": { "type": "string", "description": "目标目录（Git 仓库）绝对路径" },
                        "autoPull": { "type": "boolean", "description": "是否在部署前 git pull，默认 true" },
                        "moveMode": { "type": "string", "enum": ["copy", "cut"], "description": "文件操作方式，默认 copy" },
                        "clearTargetMode": { "type": "string", "enum": ["none", "all", "specific"], "description": "清空目标模式，默认 none" },
                        "commitMode": { "type": "string", "enum": ["auto", "manual", "none"], "description": "Git 提交模式，默认 auto" }
                    },
                    "required": ["name", "sourcePath", "targetPath"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "update_project".into(),
                description: "更新指定项目卡片的部分字段。id 必填，其他字段按需传。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "项目 ID" },
                        "name": { "type": "string" },
                        "sourcePath": { "type": "string" },
                        "targetPath": { "type": "string" },
                        "autoPull": { "type": "boolean" },
                        "moveMode": { "type": "string", "enum": ["copy", "cut"] },
                        "clearTargetMode": { "type": "string", "enum": ["none", "all", "specific"] },
                        "commitMode": { "type": "string", "enum": ["auto", "manual", "none"] },
                        "autoWatch": { "type": "boolean" }
                    },
                    "required": ["id"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "delete_project".into(),
                description: "根据项目 ID 删除项目卡片（仅删除应用配置，不删除磁盘文件）。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "项目 ID" }
                    },
                    "required": ["id"]
                }),
            },
        },
        // ============ 文件搬运执行 ============
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "execute_project".into(),
                description: "执行指定项目的部署流程：git pull（可选） -> 清空目标（可选） -> 复制/移动文件 -> git commit+push（可选）。该操作是异步的，函数立即返回，操作结果会推送到 UI 日志面板。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "项目 ID" }
                    },
                    "required": ["id"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "stop_project".into(),
                description: "停止正在执行的指定项目。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "项目 ID" }
                    },
                    "required": ["id"]
                }),
            },
        },
        // ============ Git 操作 ============
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "git_status".into(),
                description: "在指定路径执行 git status，返回工作区状态。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Git 仓库绝对路径" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "git_pull".into(),
                description: "在指定路径执行 git pull。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Git 仓库绝对路径" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "git_commit_push".into(),
                description: "在指定路径执行 git add . && git commit -m <message> && git push。message 必填，最大 500 字符。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Git 仓库绝对路径" },
                        "message": { "type": "string", "description": "Commit 消息" }
                    },
                    "required": ["path", "message"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "git_log".into(),
                description: "查看指定 Git 仓库的最近 n 条提交（默认 5 条）。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Git 仓库绝对路径" },
                        "count": { "type": "integer", "description": "返回条数，默认 5", "default": 5 }
                    },
                    "required": ["path"]
                }),
            },
        },
        // ============ 应用设置 ============
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "get_git_proxy".into(),
                description: "读取当前 Git 全局 HTTP 代理配置。".into(),
                parameters: json!({ "type": "object", "properties": {}, "required": [] }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "set_git_proxy".into(),
                description: "设置 Git 全局 HTTP/HTTPS 代理。port 为 0 时清空。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "port": { "type": "integer", "description": "代理端口，传 0 表示清空代理" }
                    },
                    "required": ["port"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "get_autostart".into(),
                description: "查询应用是否设置了开机自启。".into(),
                parameters: json!({ "type": "object", "properties": {}, "required": [] }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "set_autostart".into(),
                description: "设置或取消应用开机自启。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "enabled": { "type": "boolean", "description": "true=启用，false=禁用" }
                    },
                    "required": ["enabled"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "get_nvm_info".into(),
                description: "查询 NVM 与 Node.js 安装情况。".into(),
                parameters: json!({ "type": "object", "properties": {}, "required": [] }),
            },
        },
        // ============ 日常工具 ============
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "get_weather".into(),
                description: "查询指定城市的当前天气（使用 wttr.in 免费服务）。city 必填，例如 \"Beijing\"、\"Shanghai\"、\"New York\"。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "city": { "type": "string", "description": "城市名（英文）" }
                    },
                    "required": ["city"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "web_search".into(),
                description: "联网搜索指定关键词（使用 DuckDuckGo Lite），返回前若干条结果的标题和摘要。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "搜索关键词" },
                        "max_results": { "type": "integer", "description": "返回条数，默认 5", "default": 5 }
                    },
                    "required": ["query"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "get_current_time".into(),
                description: "获取当前系统时间（本地时区），返回 ISO 格式字符串和可读字符串。".into(),
                parameters: json!({ "type": "object", "properties": {}, "required": [] }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "ping_host".into(),
                description: "通过系统 ping 命令检查指定主机是否可达（仅发 1 次）。".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "host": { "type": "string", "description": "主机名或 IP，例如 baidu.com 或 8.8.8.8" }
                    },
                    "required": ["host"]
                }),
            },
        },
    ]
}

/// 执行工具调用（同步）
///
/// # 参数
/// - `call`: 来自 LLM 的工具调用请求
/// - `app`: Tauri AppHandle，用于触发文件搬运等异步操作
///
/// # 返回
/// 工具执行结果（始终返回 Ok，结果内容里会包含成功/失败信息）
pub fn execute_tool(call: ToolCall, app: tauri::AppHandle) -> ToolResult {
    let id = call.id.clone();
    let name = call.function.name.clone();
    let args: Value = match serde_json::from_str(&call.function.arguments) {
        Ok(v) => v,
        Err(e) => {
            return ToolResult::err(
                id,
                format!("参数解析失败: {}，原始: {}", e, call.function.arguments),
            )
        }
    };

    let result = match name.as_str() {
        // 项目管理
        "list_projects" => tool_list_projects(&app),
        "add_project" => tool_add_project(&app, &args),
        "update_project" => tool_update_project(&app, &args),
        "delete_project" => tool_delete_project(&app, &args),

        // 文件搬运
        "execute_project" => tool_execute_project(&app, &args),
        "stop_project" => tool_stop_project(&app, &args),

        // Git
        "git_status" => tool_git(&args, &["status"]),
        "git_pull" => tool_git(&args, &["pull"]),
        "git_commit_push" => tool_git_commit_push(&args),
        "git_log" => tool_git_log(&args),

        // 设置
        "get_git_proxy" => tool_get_git_proxy(),
        "set_git_proxy" => tool_set_git_proxy(&args),
        "get_autostart" => tool_get_autostart(),
        "set_autostart" => tool_set_autostart(&args),
        "get_nvm_info" => tool_get_nvm_info(),

        // 日常
        "get_weather" => tool_get_weather(&args),
        "web_search" => tool_web_search(&args),
        "get_current_time" => Ok(tool_get_current_time()),
        "ping_host" => tool_ping_host(&args),

        other => Err(format!("未知工具: {}", other)),
    };

    match result {
        Ok(content) => ToolResult::ok(id, content),
        Err(e) => ToolResult::err(id, e),
    }
}

// =====================================================
// 项目管理实现
// =====================================================

fn tool_list_projects(_app: &tauri::AppHandle) -> Result<String, String> {
    let config = crate::load_app_config().unwrap_or(None);
    let projects = config
        .and_then(|c| c.get("projects").cloned())
        .unwrap_or(json!([]));

    let arr = projects.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        return Ok("当前没有任何项目。请告诉我要添加一个项目，我会创建它。".to_string());
    }

    let mut lines = Vec::with_capacity(arr.len() + 1);
    lines.push(format!("共 {} 个项目：", arr.len()));
    for (i, p) in arr.iter().enumerate() {
        let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("(未命名)");
        let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("?");
        let src = p.get("sourcePath").and_then(|v| v.as_str()).unwrap_or("");
        let dst = p.get("targetPath").and_then(|v| v.as_str()).unwrap_or("");
        let status = p.get("status").and_then(|v| v.as_str()).unwrap_or("idle");
        let move_mode = p.get("moveMode").and_then(|v| v.as_str()).unwrap_or("copy");
        let commit_mode = p.get("commitMode").and_then(|v| v.as_str()).unwrap_or("auto");
        let auto_pull = p.get("autoPull").and_then(|v| v.as_bool()).unwrap_or(true);

        lines.push(format!(
            "{}. name=\"{}\" status={} moveMode={} commitMode={} autoPull={}\n   id: {}\n   source: {}\n   target: {}",
            i + 1, name, status, move_mode, commit_mode, auto_pull, id, src, dst,
        ));
    }
    Ok(lines.join("\n"))
}

fn tool_add_project(_app: &tauri::AppHandle, args: &Value) -> Result<String, String> {
    let name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 name")?;
    let source = args
        .get("sourcePath")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 sourcePath")?;
    let target = args
        .get("targetPath")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 targetPath")?;

    let source_path = Path::new(source);
    let target_path = Path::new(target);
    is_path_safe(source_path)?;
    is_path_safe(target_path)?;

    let mut new_card = serde_json::Map::new();
    new_card.insert("id".into(), json!(generate_id()));
    new_card.insert("name".into(), json!(name));
    new_card.insert("sourcePath".into(), json!(source));
    new_card.insert("targetPath".into(), json!(target));
    new_card.insert(
        "autoPull".into(),
        json!(args.get("autoPull").and_then(|v| v.as_bool()).unwrap_or(true)),
    );
    new_card.insert(
        "moveMode".into(),
        json!(args.get("moveMode").and_then(|v| v.as_str()).unwrap_or("copy")),
    );
    new_card.insert(
        "clearTargetMode".into(),
        json!(args.get("clearTargetMode").and_then(|v| v.as_str()).unwrap_or("none")),
    );
    new_card.insert("clearTargetFolders".into(), json!([]));
    new_card.insert("clearTargetAllEntries".into(), json!([]));
    new_card.insert(
        "commitMode".into(),
        json!(args.get("commitMode").and_then(|v| v.as_str()).unwrap_or("auto")),
    );
    new_card.insert("autoWatch".into(), json!(false));
    new_card.insert("status".into(), json!("idle"));
    new_card.insert("message".into(), json!(""));
    new_card.insert("progress".into(), json!(0));

    let mut config = crate::load_app_config().unwrap_or(None).unwrap_or_else(|| {
        json!({ "version": "1.0", "projects": [], "websiteProjects": [] })
    });
    if !config.is_object() {
        config = json!({ "version": "1.0", "projects": [], "websiteProjects": [] });
    }
    let obj = config.as_object_mut().unwrap();
    let projects = obj
        .entry("projects".to_string())
        .or_insert_with(|| json!([]));
    if !projects.is_array() {
        *projects = json!([]);
    }
    projects.as_array_mut().unwrap().push(Value::Object(new_card.clone()));

    crate::save_app_config(config)?;
    Ok(format!(
        "已添加项目 \"{}\" (id: {})。源: {} → 目标: {}",
        new_card.get("name").and_then(|v| v.as_str()).unwrap_or(""),
        new_card.get("id").and_then(|v| v.as_str()).unwrap_or(""),
        source,
        target
    ))
}

fn tool_update_project(_app: &tauri::AppHandle, args: &Value) -> Result<String, String> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 id")?;

    let mut config = crate::load_app_config().unwrap_or(None).unwrap_or_else(|| {
        json!({ "version": "1.0", "projects": [], "websiteProjects": [] })
    });
    if !config.is_object() {
        return Err("配置文件格式错误".to_string());
    }
    let obj = config.as_object_mut().unwrap();
    let projects = obj.get_mut("projects").and_then(|v| v.as_array_mut())
        .ok_or("项目列表格式错误")?;

    let mut found_idx: Option<usize> = None;
    for (i, p) in projects.iter().enumerate() {
        if p.get("id").and_then(|v| v.as_str()) == Some(id) {
            found_idx = Some(i);
            break;
        }
    }
    let idx = found_idx.ok_or_else(|| format!("未找到 id={} 的项目", id))?;
    let target = projects[idx].as_object_mut().unwrap();

    let mut updated_fields = Vec::new();
    for key in &["name", "sourcePath", "targetPath", "moveMode", "clearTargetMode", "commitMode"] {
        if let Some(v) = args.get(*key) {
            target.insert((*key).to_string(), v.clone());
            updated_fields.push(*key);
        }
    }
    for key in &["autoPull", "autoWatch"] {
        if let Some(v) = args.get(*key).and_then(|v| v.as_bool()) {
            target.insert((*key).to_string(), json!(v));
            updated_fields.push(*key);
        }
    }

    crate::save_app_config(Value::Object(config.as_object().unwrap().clone()))?;
    Ok(format!(
        "已更新项目 id={}，更新字段: {}",
        id,
        if updated_fields.is_empty() { "(无)".to_string() } else { updated_fields.join(", ") }
    ))
}

fn tool_delete_project(app: &tauri::AppHandle, args: &Value) -> Result<String, String> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 id")?;

    let _ = app.emit("ai-stop-project", json!({ "cardId": id }));

    let mut config = crate::load_app_config().unwrap_or(None).unwrap_or_else(|| {
        json!({ "version": "1.0", "projects": [], "websiteProjects": [] })
    });
    if !config.is_object() {
        return Err("配置文件格式错误".to_string());
    }
    let obj = config.as_object_mut().unwrap();
    let projects = obj.get_mut("projects").and_then(|v| v.as_array_mut())
        .ok_or("项目列表格式错误")?;

    let before = projects.len();
    projects.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(id));
    let removed = before - projects.len();

    if removed == 0 {
        return Err(format!("未找到 id={} 的项目", id));
    }

    crate::save_app_config(Value::Object(config.as_object().unwrap().clone()))?;
    Ok(format!("已删除项目 id={}", id))
}

// =====================================================
// 文件搬运执行
// =====================================================

fn tool_execute_project(app: &tauri::AppHandle, args: &Value) -> Result<String, String> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 id")?
        .to_string();

    let config = crate::load_app_config().unwrap_or(None).unwrap_or_else(|| {
        json!({ "version": "1.0", "projects": [], "websiteProjects": [] })
    });
    let card = config
        .get("projects")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id)))
        .cloned();

    let card = match card {
        Some(c) => c,
        None => return Err(format!("未找到 id={} 的项目", id)),
    };

    let source = card.get("sourcePath").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let target = card.get("targetPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let auto_pull = card.get("autoPull").and_then(|v| v.as_bool()).unwrap_or(true);
    let move_mode = card.get("moveMode").and_then(|v| v.as_str()).unwrap_or("copy").to_string();
    let clear_target_mode = card.get("clearTargetMode").and_then(|v| v.as_str()).unwrap_or("none").to_string();
    let clear_target_folders: Vec<String> = card
        .get("clearTargetFolders")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let commit_mode = card.get("commitMode").and_then(|v| v.as_str()).unwrap_or("auto").to_string();

    if source.is_empty() || target.is_empty() {
        return Err("该项目的源目录或目标目录未配置".to_string());
    }

    let _ = app.emit("ai-execute-project", json!({
        "cardId": id,
        "source": source,
        "target": target,
        "autoPull": auto_pull,
        "moveMode": move_mode,
        "clearTargetMode": clear_target_mode,
        "clearTargetFolders": clear_target_folders,
        "commitMode": commit_mode,
    }));

    Ok(format!(
        "已启动项目部署：源={} 目标={} 模式={} 提交={}。请在 UI 的日志面板查看实时进度。",
        source, target, move_mode, commit_mode
    ))
}

fn tool_stop_project(app: &tauri::AppHandle, args: &Value) -> Result<String, String> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 id")?
        .to_string();

    let _ = app.emit("ai-stop-project", json!({ "cardId": id }));
    Ok(format!("已发送停止信号到项目 {}", id))
}

// =====================================================
// Git 操作
// =====================================================

fn tool_git(args: &Value, git_args: &[&str]) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 path")?;
    let p = Path::new(path);
    is_path_safe(p)?;
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let mut cmd = Command::new("git");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.arg("-C").arg(path);
    for a in git_args {
        cmd.arg(a);
    }
    let output = cmd.output().map_err(|e| format!("执行 git 失败: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}{}", stdout, stderr);
    if !output.status.success() && !combined.contains("nothing to commit") {
        return Err(format!("git 执行失败: {}", combined));
    }
    Ok(if combined.is_empty() { "(无输出)".to_string() } else { combined })
}

fn tool_git_commit_push(args: &Value) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 path")?;
    let message = args
        .get("message")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 message")?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("Commit 消息不能为空".to_string());
    }
    if trimmed.len() > 500 {
        return Err("Commit 消息过长（最大 500 字符）".to_string());
    }

    let p = Path::new(path);
    is_path_safe(p)?;
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let run = |args: &[&str]| -> Result<String, String> {
        let mut cmd = Command::new("git");
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.arg("-C").arg(path);
        for a in args {
            cmd.arg(a);
        }
        let out = cmd.output().map_err(|e| format!("执行 git 失败: {}", e))?;
        let s = String::from_utf8_lossy(&out.stdout).to_string();
        let e = String::from_utf8_lossy(&out.stderr).to_string();
        Ok(format!("{}{}", s, e))
    };

    let add = run(&["add", "."])?;
    let commit = run(&["commit", "-m", trimmed])?;
    if commit.contains("nothing to commit") {
        return Ok("没有文件需要提交，已跳过 commit/push".to_string());
    }
    let push = run(&["push"])?;
    Ok(format!("=== add ===\n{}\n=== commit ===\n{}\n=== push ===\n{}", add, commit, push))
}

fn tool_git_log(args: &Value) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 path")?;
    let count = args.get("count").and_then(|v| v.as_u64()).unwrap_or(5) as usize;
    let p = Path::new(path);
    is_path_safe(p)?;
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let mut cmd = Command::new("git");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.arg("-C").arg(path);
    cmd.arg("log");
    cmd.arg("--oneline");
    cmd.arg("-n").arg(count.to_string());
    let out = cmd.output().map_err(|e| format!("执行 git log 失败: {}", e))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    let s = String::from_utf8_lossy(&out.stdout).to_string();
    Ok(if s.is_empty() { "(无提交记录)".to_string() } else { s })
}

// =====================================================
// 应用设置
// =====================================================

fn tool_get_git_proxy() -> Result<String, String> {
    crate::get_git_proxy().map(|opt| match opt {
        Some(p) => format!("当前 Git 代理: {}", p),
        None => "当前未设置 Git 代理".to_string(),
    })
}

fn tool_set_git_proxy(args: &Value) -> Result<String, String> {
    let port = args
        .get("port")
        .and_then(|v| v.as_u64())
        .ok_or("缺少必填参数 port")? as u16;
    if port == 0 {
        crate::clear_git_proxy()?;
        return Ok("已清除 Git 代理".to_string());
    }
    crate::set_git_proxy(port)?;
    Ok(format!("已设置 Git 代理: http://127.0.0.1:{}", port))
}

fn tool_get_autostart() -> Result<String, String> {
    let enabled = crate::get_autostart()?;
    Ok(if enabled { "开机自启：已启用" } else { "开机自启：未启用" }.to_string())
}

fn tool_set_autostart(args: &Value) -> Result<String, String> {
    let enabled = args
        .get("enabled")
        .and_then(|v| v.as_bool())
        .ok_or("缺少必填参数 enabled")?;
    crate::set_autostart(enabled)?;
    Ok(if enabled { "已启用开机自启" } else { "已禁用开机自启" }.to_string())
}

fn tool_get_nvm_info() -> Result<String, String> {
    let info = crate::get_nvm_info()?;
    let mut s = String::new();
    s.push_str(&format!("NVM 已安装: {}\n", info.installed));
    s.push_str(&format!(
        "当前 Node 版本: {}\n",
        info.current_version.unwrap_or_else(|| "(无)".into())
    ));
    s.push_str(&format!("已安装版本: {:?}\n", info.installed_versions));
    s.push_str(&format!("可下载版本: {:?}", info.available_versions));
    Ok(s)
}

// =====================================================
// 日常工具
// =====================================================

fn tool_get_weather(args: &Value) -> Result<String, String> {
    let city = args
        .get("city")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 city")?;
    let url = format!("https://wttr.in/{}?format=j1", urlencoding(city));
    let body = crate::agent::llm::curl_get(&url, "file-mover-ai-agent/1.0", 15)?;

    let v: Value = serde_json::from_str(&body)
        .map_err(|e| format!("解析天气数据失败: {}", e))?;
    let current = v
        .get("current_condition")
        .and_then(|x| x.get(0))
        .ok_or("未能解析天气数据")?;
    let temp_c = current.get("temp_C").and_then(|x| x.as_str()).unwrap_or("?");
    let feels_like = current.get("FeelsLikeC").and_then(|x| x.as_str()).unwrap_or("?");
    let humidity = current.get("humidity").and_then(|x| x.as_str()).unwrap_or("?");
    let desc = current
        .pointer("/weatherDesc/0/value")
        .and_then(|x| x.as_str())
        .unwrap_or("?");
    let wind_kmph = current
        .get("windspeedKmph")
        .and_then(|x| x.as_str())
        .unwrap_or("?");

    let area = v
        .pointer("/nearest_area/0/areaName/0/value")
        .and_then(|x| x.as_str())
        .unwrap_or(city);
    let country = v
        .pointer("/nearest_area/0/country/0/value")
        .and_then(|x| x.as_str())
        .unwrap_or("");

    Ok(format!(
        "📍 {} {}\n🌡 温度: {}°C (体感 {}°C)\n☁ 天气: {}\n💧 湿度: {}%\n💨 风速: {} km/h",
        area, country, temp_c, feels_like, desc, humidity, wind_kmph
    ))
}

fn tool_web_search(args: &Value) -> Result<String, String> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 query")?;
    let max = args.get("max_results").and_then(|v| v.as_u64()).unwrap_or(5) as usize;

    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding(query)
    );
    let html = crate::agent::llm::curl_get(
        &url,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) file-mover-ai-agent/1.0",
        15,
    )?;

    let mut results: Vec<(String, String)> = Vec::new();
    let mut search_pos = 0usize;
    while results.len() < max {
        let anchor_idx = match html[search_pos..].find("class=\"result__a\"") {
            Some(i) => search_pos + i,
            None => break,
        };
        let href_start = match html[..anchor_idx].rfind("href=\"") {
            Some(i) => i + 6,
            None => {
                search_pos = anchor_idx + 1;
                continue;
            }
        };
        let href_end = match html[href_start..].find('"') {
            Some(i) => href_start + i,
            None => break,
        };
        let href = &html[href_start..href_end];

        let title_start = match html[anchor_idx..].find('>') {
            Some(i) => anchor_idx + i + 1,
            None => break,
        };
        let title_end = match html[title_start..].find("</a>") {
            Some(i) => title_start + i,
            None => break,
        };
        let title = strip_html_tags(&html[title_start..title_end]);

        let snippet_idx = match html[title_end..].find("class=\"result__snippet\"") {
            Some(i) => title_end + i,
            None => {
                results.push((title, href.to_string()));
                search_pos = title_end;
                continue;
            }
        };
        let snippet_start = match html[snippet_idx..].find('>') {
            Some(i) => snippet_idx + i + 1,
            None => {
                results.push((title, href.to_string()));
                search_pos = title_end;
                continue;
            }
        };
        let snippet_end = match html[snippet_start..].find("</a>") {
            Some(i) => snippet_start + i,
            None => {
                results.push((title, href.to_string()));
                search_pos = title_end;
                continue;
            }
        };
        let snippet = strip_html_tags(&html[snippet_start..snippet_end]);

        results.push((title, format!("{}\n   {}", href, snippet)));
        search_pos = snippet_end;
    }

    if results.is_empty() {
        return Ok(format!("未找到与 \"{}\" 相关的搜索结果。", query));
    }

    let mut out = format!("🔍 搜索 \"{}\" 找到 {} 条结果：\n", query, results.len());
    for (i, (title, snippet)) in results.iter().enumerate() {
        out.push_str(&format!("\n{}. {}\n   {}\n", i + 1, title, snippet));
    }
    Ok(out)
}

fn tool_get_current_time() -> String {
    let now = chrono_local::DateTime::now();
    format!(
        "当前时间: {} | ISO: {}",
        now.format("%Y-%m-%d %H:%M:%S"),
        now.to_rfc3339()
    )
}

fn tool_ping_host(args: &Value) -> Result<String, String> {
    let host = args
        .get("host")
        .and_then(|v| v.as_str())
        .ok_or("缺少必填参数 host")?;
    let out = Command::new("ping")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-n", "1", "-w", "2000", host])
        .output()
        .map_err(|e| format!("执行 ping 失败: {}", e))?;
    let s = String::from_utf8_lossy(&out.stdout).to_string();
    let e = String::from_utf8_lossy(&out.stderr).to_string();
    if out.status.success() {
        Ok(format!("✅ {} 可达\n{}", host, s))
    } else {
        Ok(format!("❌ {} 不可达\n{}{}", host, s, e))
    }
}

// =====================================================
// 工具函数
// =====================================================

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{}_{:x}", ts, ns)
}

fn urlencoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            other => {
                out.push_str(&format!("%{:02X}", other));
            }
        }
    }
    out
}

fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.trim().to_string()
}

// 简单的本地时间（避免引入 chrono 依赖）
mod chrono_local {
    pub struct DateTime {
        pub year: i32,
        pub month: u32,
        pub day: u32,
        pub hour: u32,
        pub minute: u32,
        pub second: u32,
        pub tz_name: String,
    }

    impl DateTime {
        pub fn now() -> Self {
            #[cfg(windows)]
            {
                use std::process::Command;
                let out = Command::new("cmd")
                    .args(["/C", "echo %date% %time%"])
                    .output()
                    .ok();
                if let Some(o) = out {
                    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    return parse_windows_time(&s);
                }
            }
            Self {
                year: 1970,
                month: 1,
                day: 1,
                hour: 0,
                minute: 0,
                second: 0,
                tz_name: "UTC".into(),
            }
        }

        pub fn format(&self, fmt: &str) -> String {
            let mut out = String::new();
            let mut chars = fmt.chars().peekable();
            while let Some(c) = chars.next() {
                if c == '%' {
                    match chars.next() {
                        Some('Y') => out.push_str(&format!("{:04}", self.year)),
                        Some('m') => out.push_str(&format!("{:02}", self.month)),
                        Some('d') => out.push_str(&format!("{:02}", self.day)),
                        Some('H') => out.push_str(&format!("{:02}", self.hour)),
                        Some('M') => out.push_str(&format!("{:02}", self.minute)),
                        Some('S') => out.push_str(&format!("{:02}", self.second)),
                        Some('Z') => out.push_str(&self.tz_name),
                        Some(other) => {
                            out.push('%');
                            out.push(other);
                        }
                        None => out.push('%'),
                    }
                } else {
                    out.push(c);
                }
            }
            out
        }

        pub fn to_rfc3339(&self) -> String {
            format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}{}",
                self.year, self.month, self.day, self.hour, self.minute, self.second,
                if self.tz_name.is_empty() { "+00:00".to_string() } else { format!(" {}", self.tz_name) }
            )
        }
    }

    #[cfg(windows)]
    fn parse_windows_time(s: &str) -> DateTime {
        let mut parts = s.split_whitespace();
        let date = parts.next().unwrap_or("");
        let time = parts.next().unwrap_or("");
        let (y, m, d) = {
            let segs: Vec<&str> = date.split(['/', '-']).collect();
            (
                segs.get(0).and_then(|s| s.parse().ok()).unwrap_or(1970),
                segs.get(1).and_then(|s| s.parse().ok()).unwrap_or(1),
                segs.get(2).and_then(|s| s.parse().ok()).unwrap_or(1),
            )
        };
        let (h, mi, sec) = {
            let main = time.split('.').next().unwrap_or("");
            let segs: Vec<&str> = main.split(':').collect();
            (
                segs.get(0).and_then(|s| s.parse().ok()).unwrap_or(0),
                segs.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
                segs.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
            )
        };
        DateTime {
            year: y,
            month: m,
            day: d,
            hour: h,
            minute: mi,
            second: sec,
            tz_name: "Local".into(),
        }
    }
}

/// 公开的时间格式化辅助（供 llm::system_prompt 使用）
pub fn chrono_local_now_string() -> String {
    let now = chrono_local::DateTime::now();
    now.format("%Y-%m-%d %H:%M:%S")
}
