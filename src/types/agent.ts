/**
 * AI Agent 类型定义
 *
 * 与后端 agent 模块的输入/输出结构保持一致。
 */

/**
 * 单条对话历史消息（前端简化版）
 */
export interface AgentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 单次工具调用记录（用于在聊天面板中展示执行步骤）
 */
export interface AgentToolCallRecord {
  name: string;
  arguments: Record<string, unknown> | { _raw: string };
  result: string;
}

/**
 * Agent 调用的输出
 */
export interface AgentChatOutput {
  reply: string;
  tool_calls: AgentToolCallRecord[];
  success: boolean;
  error?: string;
}

/**
 * Agent 配置（不含 Key，仅用于回显）
 */
export interface AgentConfigView {
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
}

/**
 * 保存 Agent 配置的入参
 */
export interface AgentSaveConfigInput {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/**
 * 单个模型推荐
 */
export interface AgentModelPreset {
  id: string;
  label: string;
  description?: string;
}

/**
 * AI 服务方（Provider）预设
 */
export interface AgentProvider {
  id: string;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: AgentModelPreset[];
  apiKeyUrl?: string;
}
