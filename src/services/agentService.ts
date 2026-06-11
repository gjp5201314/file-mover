/**
 * AI Agent 前端服务
 *
 * 负责与 Tauri 后端 agent 模块的通信：
 * - 加载/保存/清除 AI 配置（API Key 使用 Windows DPAPI 加密保存）
 * - 发送用户消息并获取 Agent 回复（支持多轮工具调用）
 * - 列出可用工具（用于调试 / 展示）
 * - 测试 LLM 连接
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AgentChatOutput,
  AgentConfigView,
  AgentHistoryMessage,
  AgentProvider,
  AgentSaveConfigInput,
} from "../types/agent";

/**
 * Agent 服务对象
 */
export const agentService = {
  /**
   * 读取 AI 配置（不含真实 Key）
   */
  async getConfig(): Promise<AgentConfigView> {
    return await invoke<AgentConfigView>("agent_get_config");
  },

  /**
   * 保存 AI 配置
   *
   * @description API Key 会通过后端 DPAPI 加密后存储到本地；
   * baseUrl / model 会以明文存到 ai-agent-settings.json。
   *
   * @param input.apiKey - DeepSeek API Key（必填）
   * @param input.baseUrl - 自定义 LLM 端点（可选，留空使用默认 https://api.deepseek.com/v1）
   * @param input.model - 自定义模型名（可选，默认 deepseek-chat）
   */
  async saveConfig(input: AgentSaveConfigInput): Promise<AgentConfigView> {
    return await invoke<AgentConfigView>("agent_save_config", { input });
  },

  /**
   * 清除所有 AI 配置（API Key + baseUrl + model）
   */
  async clearConfig(): Promise<void> {
    await invoke("agent_clear_config");
  },

  /**
   * 仅更新 baseUrl / model（不修改已保存的 API Key）
   */
  async updateSettings(params: {
    baseUrl?: string;
    model?: string;
  }): Promise<AgentConfigView> {
    return await invoke<AgentConfigView>("agent_update_settings", { input: params });
  },

  /**
   * 与 AI Agent 对话
   *
   * @description 后端会循环调用 LLM 并在需要时执行工具调用，
   * 直到 LLM 不再请求工具或达到最大轮次。
   *
   * @param message - 本轮用户消息
   * @param history - 历史消息（不含 system 消息和当前 user 消息）
   */
  async chat(
    message: string,
    history: AgentHistoryMessage[] = []
  ): Promise<AgentChatOutput> {
    return await invoke<AgentChatOutput>("agent_chat", { message, history });
  },

  /**
   * 列出所有可用工具（用于调试面板）
   */
  async listTools(): Promise<Array<Record<string, unknown>>> {
    return await invoke<Array<Record<string, unknown>>>("agent_list_tools");
  },

  /**
   * 测试 LLM 连接（发送一个简单 ping）
   *
   * @returns LLM 的简短回复
   */
  async testConnection(): Promise<string> {
    return await invoke<string>("agent_test_connection");
  },

  /**
   * 获取所有内置 AI 服务方（DeepSeek / Qwen / Custom 等）
   */
  async listProviders(): Promise<AgentProvider[]> {
    return await invoke<AgentProvider[]>("agent_list_providers");
  },

  /**
   * 根据 baseUrl 推断 provider id（用于 UI 回显当前选中）
   */
  async matchProvider(baseUrl: string): Promise<string> {
    return await invoke<string>("agent_match_provider", { baseUrl });
  },
};
