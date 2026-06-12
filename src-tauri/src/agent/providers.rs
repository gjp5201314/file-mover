//! AI 服务方（Provider）预设
//!
//! 用于在前端设置面板中提供快速选择：选一个 provider 后会自动填充对应的
//! 默认 Base URL 与模型名。当前内置：
//!
//! - DeepSeek（默认）
//! - 通义千问 / Qwen（DashScope OpenAI 兼容模式）
//! - Custom（自定义端点）

use serde::{Deserialize, Serialize};

/// 单个模型推荐
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentModelPreset {
    /// 模型 ID
    pub id: String,
    /// 模型展示名（中文）
    pub label: String,
    /// 简短描述（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// AI 服务方
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProvider {
    /// 唯一 ID：deepseek / qwen / custom
    pub id: String,
    /// 显示名
    pub name: String,
    /// 默认 OpenAI 兼容端点（不包含 /chat/completions 后缀）
    pub default_base_url: String,
    /// 默认模型
    pub default_model: String,
    /// 推荐模型列表
    pub models: Vec<AgentModelPreset>,
    /// Key 申请链接（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_url: Option<String>,
}

/// 返回所有内置 provider
pub fn list_providers() -> Vec<AgentProvider> {
    vec![
        AgentProvider {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            default_base_url: "https://api.deepseek.com/v1".into(),
            default_model: "deepseek-chat".into(),
            models: vec![
                AgentModelPreset {
                    id: "deepseek-chat".into(),
                    label: "DeepSeek-V3 (chat)".into(),
                    description: Some("通用对话模型，工具调用稳定".into()),
                },
                AgentModelPreset {
                    id: "deepseek-reasoner".into(),
                    label: "DeepSeek-R1 (reasoner)".into(),
                    description: Some("推理增强模型，速度较慢".into()),
                },
            ],
            api_key_url: Some("https://platform.deepseek.com/api_keys".into()),
        },
        AgentProvider {
            id: "qwen".into(),
            name: "通义千问 (Qwen)".into(),
            default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            default_model: "qwen-plus".into(),
            models: vec![
                AgentModelPreset {
                    id: "qwen-turbo".into(),
                    label: "Qwen Turbo".into(),
                    description: Some("速度快、价格低，适合简单任务".into()),
                },
                AgentModelPreset {
                    id: "qwen-plus".into(),
                    label: "Qwen Plus".into(),
                    description: Some("性价比均衡，工具调用表现良好".into()),
                },
                AgentModelPreset {
                    id: "qwen-max".into(),
                    label: "Qwen Max".into(),
                    description: Some("能力最强，适合复杂任务".into()),
                },
                AgentModelPreset {
                    id: "qwen-long".into(),
                    label: "Qwen Long".into(),
                    description: Some("超长上下文（适合大文档）".into()),
                },
                AgentModelPreset {
                    id: "qwen-coder-plus".into(),
                    label: "Qwen Coder Plus".into(),
                    description: Some("代码场景增强".into()),
                },
            ],
            api_key_url: Some("https://dashscope.console.aliyun.com/apiKey".into()),
        },
        AgentProvider {
            id: "custom".into(),
            name: "自定义".into(),
            default_base_url: "https://api.deepseek.com/v1".into(),
            default_model: "deepseek-chat".into(),
            models: vec![],
            api_key_url: None,
        },
    ]
}

/// 根据当前已保存的 baseUrl 推断 provider id，用于在 UI 中默认选中
pub fn match_provider_id(base_url: &str) -> String {
    let normalized = base_url.trim().to_lowercase();
    for p in list_providers() {
        if p.id == "custom" {
            continue;
        }
        if normalized.contains(&p.default_base_url.to_lowercase()) {
            return p.id;
        }
    }
    "custom".into()
}
