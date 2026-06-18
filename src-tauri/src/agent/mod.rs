//! AI Agent 模块入口

pub mod llm;
pub mod providers;
pub mod secret;
pub mod tools;

pub use llm::{chat_completion, system_prompt, tools_to_json_value, ChatMessage};
pub use providers::{list_providers, match_provider_id, AgentProvider};
pub use secret::{
    clear_all as clear_secrets, get_api_key, get_base_url, get_model, set_api_key, set_base_url,
    set_model,
};
pub use tools::{all_tool_defs, execute_tool, ToolCall};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Agent 配置（不含 Key，仅用于回显给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigView {
    pub has_api_key: bool,
    pub base_url: String,
    pub model: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 关键回归测试：必须输出 camelCase（前端 hasApiKey / baseUrl / model）
    /// 否则前端读不到值，state 变 undefined，后续 trim() 就炸。
    #[test]
    fn agent_config_view_serializes_as_camel_case() {
        let v = AgentConfigView {
            has_api_key: true,
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            model: "qwen-plus".into(),
        };
        let s = serde_json::to_string(&v).unwrap();
        assert_eq!(
            s,
            r#"{"hasApiKey":true,"baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1","model":"qwen-plus"}"#
        );
    }

    #[test]
    fn agent_chat_output_serializes_as_camel_case() {
        let out = AgentChatOutput {
            reply: "ok".into(),
            tool_calls: vec![],
            success: true,
            error: None,
        };
        let s = serde_json::to_string(&out).unwrap();
        assert_eq!(s, r#"{"reply":"ok","toolCalls":[],"success":true}"#);
    }
}

impl AgentConfigView {
    pub fn load() -> Self {
        let has_api_key = get_api_key().unwrap_or(None).is_some();
        // 配置缺失时不再猜默认值，前端会显示"-"
        let base_url = get_base_url().unwrap_or(None).unwrap_or_default();
        let model = get_model().unwrap_or(None).unwrap_or_default();
        Self {
            has_api_key,
            base_url,
            model,
        }
    }
}

/// 工具消息构造助手
pub fn build_tool_message(tool_call_id: String, content: String) -> ChatMessage {
    ChatMessage {
        role: "tool".into(),
        content: Some(content),
        name: None,
        tool_call_id: Some(tool_call_id),
        tool_calls: None,
    }
}

/// 构造 assistant 消息（包含 tool_calls）
pub fn build_assistant_message(
    content: Option<String>,
    tool_calls: Option<Vec<Value>>,
) -> ChatMessage {
    ChatMessage {
        role: "assistant".into(),
        content,
        name: None,
        tool_call_id: None,
        tool_calls,
    }
}

/// 构造 user 消息
pub fn build_user_message(content: String) -> ChatMessage {
    ChatMessage {
        role: "user".into(),
        content: Some(content),
        name: None,
        tool_call_id: None,
        tool_calls: None,
    }
}

/// 构造 system 消息
pub fn build_system_message(content: String) -> ChatMessage {
    ChatMessage {
        role: "system".into(),
        content: Some(content),
        name: None,
        tool_call_id: None,
        tool_calls: None,
    }
}

/// 单次 agent 调用的输入
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatInput {
    /// 用户本轮消息
    pub message: String,
    /// 历史消息（不含当前 user 消息和 system 消息；可为空）
    #[serde(default)]
    pub history: Vec<AgentHistoryMessage>,
    /// 可选覆盖模型与端点
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

/// 前端传入的历史消息（role + content 简版）
#[derive(Debug, Clone, Deserialize, Default)]
pub struct AgentHistoryMessage {
    pub role: String,
    pub content: String,
}

/// 单次 agent 调用的输出
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatOutput {
    /// 助手最终回复
    pub reply: String,
    /// 这一轮发生的所有工具调用记录（用于前端展示执行步骤）
    pub tool_calls: Vec<AgentToolCallRecord>,
    /// 是否成功
    pub success: bool,
    /// 错误信息（如果有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentToolCallRecord {
    pub name: String,
    pub arguments: Value,
    pub result: String,
}

/// 执行一次 agent 调用（同步）
///
/// 流程：
/// 1. 加载 API Key / Base URL / Model
/// 2. 构造 messages: [system, ...history, user]
/// 3. 调 LLM
/// 4. 如果返回 tool_calls，循环执行直到 LLM 不再请求工具
/// 5. 返回最终 reply
pub fn run_agent(
    app: tauri::AppHandle,
    input: AgentChatInput,
) -> Result<AgentChatOutput, String> {
    let api_key = get_api_key()?.ok_or("尚未配置 API Key，请先在设置中填写")?;
    // 优先级：本次调用入参 > 设置中的 baseUrl > 报错（不再硬猜一个 DeepSeek 默认）
    let base_url = match input
        .base_url
        .clone()
        .or_else(|| get_base_url().ok().flatten())
    {
        Some(u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => {
            return Err(
                "AI 配置不完整：缺少 Base URL。请打开【设置 → AI 助手】选好服务方并保存配置"
                    .to_string(),
            );
        }
    };
    let model = match input
        .model
        .clone()
        .or_else(|| get_model().ok().flatten())
    {
        Some(m) if !m.trim().is_empty() => m.trim().to_string(),
        _ => {
            return Err(
                "AI 配置不完整：缺少模型名。请打开【设置 → AI 助手】选好模型并保存配置"
                    .to_string(),
            );
        }
    };

    let tool_defs = all_tool_defs();
    let tools_json = tools_to_json_value(&tool_defs);

    // 构造消息
    let mut messages: Vec<ChatMessage> = Vec::new();
    messages.push(build_system_message(system_prompt()));

    for h in &input.history {
        if h.role == "user" || h.role == "assistant" {
            messages.push(ChatMessage {
                role: h.role.clone(),
                content: Some(h.content.clone()),
                name: None,
                tool_call_id: None,
                tool_calls: None,
            });
        }
    }

    messages.push(build_user_message(input.message));

    let mut records: Vec<AgentToolCallRecord> = Vec::new();
    const MAX_TURNS: usize = 8; // 防止无限循环

    for _ in 0..MAX_TURNS {
        let resp = chat_completion(&api_key, &base_url, &model, &messages, &tools_json)?;

        let choice = resp
            .choices
            .first()
            .ok_or_else(|| "LLM 未返回任何 choice".to_string())?;

        let assistant = &choice.message;
        let tool_calls_value = assistant.tool_calls.clone();

        // 把 assistant 消息加回 messages
        messages.push(build_assistant_message(
            assistant.content.clone(),
            tool_calls_value.clone(),
        ));

        // 没有工具调用 -> 收尾
        let tool_calls = match tool_calls_value {
            Some(v) if !v.is_empty() => v,
            _ => {
                let reply = assistant
                    .content
                    .clone()
                    .unwrap_or_else(|| "(无回复)".to_string());
                return Ok(AgentChatOutput {
                    reply,
                    tool_calls: records,
                    success: true,
                    error: None,
                });
            }
        };

        // 执行每个工具
        for tc_val in tool_calls {
            let tool_call: ToolCall = serde_json::from_value(tc_val.clone())
                .map_err(|e| format!("工具调用格式错误: {}", e))?;
            let name = tool_call.function.name.clone();
            let args_str = tool_call.function.arguments.clone();
            let args_value: Value = serde_json::from_str(&args_str)
                .unwrap_or_else(|_| json!({ "_raw": args_str.clone() }));

            let result = execute_tool(tool_call.clone(), app.clone());
            let result_content = result.content.clone();

            records.push(AgentToolCallRecord {
                name: name.clone(),
                arguments: args_value,
                result: result_content.clone(),
            });

            messages.push(build_tool_message(result.tool_call_id, result_content));
        }
    }

    Err("工具调用超过最大轮次（8 轮）仍未收敛".to_string())
}
