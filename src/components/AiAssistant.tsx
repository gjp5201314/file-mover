/**
 * AI 助手悬浮气泡 + 弹出式聊天面板
 *
 * UI 行为：
 * - 右下角悬浮气泡（无干扰时可收起）
 * - 点击气泡展开右侧滑出式聊天面板
 * - 支持多轮对话，自动维护 history
 * - 显示工具调用执行步骤
 * - 支持停止正在进行的请求
 * - 首次使用会引导用户到设置面板填写 API Key
 */

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { agentService } from "../services/agentService";
import type {
  AgentChatOutput,
  AgentConfigView,
  AgentHistoryMessage,
  AgentToolCallRecord,
} from "../types/agent";
import "./AiAssistant.css";

/**
 * 聊天消息
 */
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Assistant 消息的工具调用记录 */
  toolCalls?: AgentToolCallRecord[];
  /** 加载中标记 */
  pending?: boolean;
  /** 错误标记 */
  error?: boolean;
  timestamp: number;
}

interface AiAssistantProps {
  /** 是否配置了 API Key（由父组件从 getConfig 获取后传入） */
  configured: boolean;
  /** 打开 AI 助手配置抽屉（聊天面板右上角 ⚙ 入口） */
  onOpenAiConfig?: () => void;
  /**
   * @deprecated 保留以兼容旧调用方；不再使用
   * （AI 助手配置已迁移到 AiConfigDrawer，从聊天面板内 ⚙ 入口进入）
   */
  onOpenSettings?: () => void;
}

const STORAGE_KEY = "ai-assistant:history";

/**
 * 从 localStorage 加载历史消息
 */
function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 简单校验
    return parsed.filter(
      (m: any) =>
        m && typeof m.id === "string" && typeof m.role === "string" && typeof m.content === "string"
    );
  } catch {
    return [];
  }
}

/**
 * 持久化历史消息（仅保留最近 50 条，避免 localStorage 过大）
 */
function saveHistory(messages: ChatMessage[]) {
  try {
    const trimmed = messages.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 忽略
  }
}

/**
 * 生成消息 ID
 */
function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 格式化时间戳
 */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 工具名 -> 中文标签
 */
const TOOL_LABELS: Record<string, string> = {
  list_projects: "列出项目",
  add_project: "添加项目",
  update_project: "更新项目",
  delete_project: "删除项目",
  execute_project: "执行部署",
  stop_project: "停止执行",
  git_status: "Git 状态",
  git_pull: "Git Pull",
  git_commit_push: "Git 提交+推送",
  git_log: "Git 日志",
  get_git_proxy: "查询 Git 代理",
  set_git_proxy: "设置 Git 代理",
  get_autostart: "查询开机自启",
  set_autostart: "设置开机自启",
  get_nvm_info: "查询 NVM",
  get_weather: "查询天气",
  web_search: "联网搜索",
  get_current_time: "获取时间",
  ping_host: "Ping 主机",
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

/**
 * 主组件
 */
export default function AiAssistant({ configured, onOpenAiConfig, onOpenSettings }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState<AgentConfigView | null>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const abortRef = useRef<boolean>(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 加载配置
  useEffect(() => {
    if (open) {
      agentService
        .getConfig()
        .then(setConfig)
        .catch((err) => console.error("加载 AI 配置失败:", err));
    }
  }, [open]);

  // 持久化历史
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // 滚动到底部
  useEffect(() => {
    if (open && listRef.current) {
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    }
  }, [messages, open]);

  // 打开时自动聚焦输入框
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  /**
   * 发送消息
   */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    // 未配置 API Key：提示
    if (!configured) {
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: "system",
          content: "⚠️ 尚未配置 API Key。请点击下方「去设置」填写 DeepSeek API Key。",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const pendingMsg: ChatMessage = {
      id: genId(),
      role: "assistant",
      content: "",
      pending: true,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput("");
    setSending(true);
    abortRef.current = false;

    // 构造发送给后端的 history（不含 pending 和 system 消息）
    const history: AgentHistoryMessage[] = messagesRef.current
      .filter((m) => !m.pending && m.role !== "system")
      .slice(-20) // 最多带 20 条历史
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const result: AgentChatOutput = await agentService.chat(text, history);

      if (abortRef.current) {
        // 用户已停止
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsg.id
              ? { ...m, content: "（已停止）", pending: false }
              : m
          )
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? {
                ...m,
                content: result.reply || "(无回复)",
                toolCalls: result.tool_calls,
                pending: false,
                error: !result.success,
              }
            : m
        )
      );
    } catch (err) {
      const errText = typeof err === "string" ? err : (err instanceof Error ? err.message : String(err));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, content: `❌ 调用失败：${errText}`, pending: false, error: true }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [configured, input, sending]);

  /**
   * 停止当前请求（仅做标记，invoke 仍会等后端返回）
   */
  const stopRequest = useCallback(() => {
    abortRef.current = true;
  }, []);

  /**
   * 清空历史
   */
  const clearHistory = useCallback(() => {
    if (!window.confirm("确认清空所有对话历史？此操作不可撤销。")) return;
    setMessages([]);
  }, []);

  /**
   * 插入示例提示
   */
  const insertSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  /**
   * 处理键盘事件（Enter 发送，Shift+Enter 换行）
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* 悬浮气泡 */}
      {!open && (
        <button
          className="ai-bubble"
          onClick={() => setOpen(true)}
          title="打开 AI 助手"
          aria-label="打开 AI 助手"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v.5A3 3 0 0 0 6 8v4a3 3 0 0 0 3 3h.5V17a3 3 0 1 0 4 0v-2h.5a3 3 0 0 0 3-3V8a3 3 0 0 0-3-2.5V5a3 3 0 0 0-3-3z" />
            <circle cx="9" cy="10" r="0.5" fill="currentColor" />
            <circle cx="15" cy="10" r="0.5" fill="currentColor" />
          </svg>
          {!configured && <span className="ai-bubble-dot" aria-label="未配置"></span>}
        </button>
      )}

      {/* 聊天面板 */}
      {open && (
        <div className="ai-panel" role="dialog" aria-label="AI 助手">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">🤖</span>
              <div>
                <div className="ai-panel-name">AI 助手</div>
                <div className="ai-panel-sub">
                  {config ? (
                    <>
                      <span className={`ai-status-dot ${configured ? "ok" : "warn"}`}></span>
                      {configured ? `${config.model}` : "未配置 API Key"}
                    </>
                  ) : (
                    "加载中..."
                  )}
                </div>
              </div>
            </div>
            <div className="ai-panel-actions">
              {/* ⚙ 入口：打开 AI 助手配置抽屉（子级抽屉） */}
              <button
                className="ai-action-btn"
                onClick={() => onOpenAiConfig?.()}
                title="AI 助手配置"
                aria-label="AI 助手配置"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
              {messages.length > 0 && (
                <button
                  className="ai-action-btn"
                  onClick={clearHistory}
                  title="清空对话"
                  aria-label="清空对话"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path>
                  </svg>
                </button>
              )}
              <button
                className="ai-action-btn"
                onClick={() => setOpen(false)}
                title="收起"
                aria-label="收起"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* 消息列表 */}
          <div className="ai-panel-body" ref={listRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                <div className="ai-empty-icon">💬</div>
                <div className="ai-empty-title">开始对话</div>
                <div className="ai-empty-desc">用自然语言控制项目、查询天气、执行 Git 操作等</div>
                <div className="ai-suggestions">
                  <button onClick={() => insertSuggestion("列出我所有的项目")} className="ai-suggestion">
                    📋 列出我所有的项目
                  </button>
                  <button onClick={() => insertSuggestion("北京今天天气怎么样？")} className="ai-suggestion">
                    🌤 北京今天天气怎么样？
                  </button>
                  <button onClick={() => insertSuggestion("现在几点了？")} className="ai-suggestion">
                    ⏰ 现在几点了？
                  </button>
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`ai-msg ai-msg-${m.role} ${m.error ? "ai-msg-error" : ""}`}>
                <div className="ai-msg-avatar">
                  {m.role === "user" ? "我" : m.role === "system" ? "!" : "AI"}
                </div>
                <div className="ai-msg-bubble-wrap">
                  <div className="ai-msg-bubble">
                    {m.pending ? (
                      <div className="ai-pending">
                        <span className="ai-pending-dot"></span>
                        <span className="ai-pending-dot"></span>
                        <span className="ai-pending-dot"></span>
                        <span className="ai-pending-text">思考中...</span>
                      </div>
                    ) : (
                      <div className="ai-msg-content">
                        {m.content.split("\n").map((line, i) => (
                          <div key={i}>{line || "\u00A0"}</div>
                        ))}
                      </div>
                    )}

                    {/* 工具调用展示 */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="ai-tool-calls">
                        {m.toolCalls.map((tc, i) => (
                          <details key={i} className="ai-tool-call" open={m.pending}>
                            <summary>
                              <span className="ai-tool-icon">🔧</span>
                              <span className="ai-tool-name">{getToolLabel(tc.name)}</span>
                              <span className="ai-tool-status">✓</span>
                            </summary>
                            <div className="ai-tool-body">
                              <div className="ai-tool-section">
                                <div className="ai-tool-section-title">参数</div>
                                <pre className="ai-tool-pre">
                                  {JSON.stringify(tc.arguments, null, 2)}
                                </pre>
                              </div>
                              <div className="ai-tool-section">
                                <div className="ai-tool-section-title">结果</div>
                                <pre className="ai-tool-pre">{tc.result}</pre>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ai-msg-time">{fmtTime(m.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 输入区 */}
          <div className="ai-panel-input">
            {!configured && (
              <div className="ai-not-configured">
                <span>⚠️ 尚未配置 API Key</span>
                {onOpenAiConfig ? (
                  <button className="ai-link-btn" onClick={() => onOpenAiConfig()}>
                    去配置
                  </button>
                ) : onOpenSettings ? (
                  // 兼容旧调用方
                  <button className="ai-link-btn" onClick={onOpenSettings}>
                    去设置
                  </button>
                ) : null}
              </div>
            )}
            <div className="ai-input-row">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={configured ? "输入消息，回车发送，Shift+回车换行" : "请先在右上角 ⚙ 中配置 API Key"}
                disabled={sending}
                rows={2}
                className="ai-textarea"
              />
              {sending ? (
                <button className="ai-stop-btn" onClick={stopRequest} title="停止" aria-label="停止">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  className="ai-send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || !configured}
                  title="发送 (Enter)"
                  aria-label="发送"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
