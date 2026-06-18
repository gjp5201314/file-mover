import { useState, useEffect } from "react";
import { agentService } from "../services/agentService";
import type { AgentProvider } from "../types/agent";
import { message } from "./messageApi";
import "./AiConfigDrawer.css";

interface AiConfigDrawerProps {
  /** 抽屉开关 */
  isOpen: boolean;
  /** 关闭抽屉（返回上一级 — AI 聊天面板） */
  onClose: () => void;
  /** 配置变更后通知父组件（让 App 刷新 aiConfigured 状态） */
  onConfigChange?: () => void;
}

/**
 * AI 助手配置抽屉
 *
 * 层级关系（与 SettingsDrawer / AiAssistant 的关系）：
 *
 *   App
 *   ├─ SettingsDrawer      （常规设置，平行入口）
 *   └─ AiAssistant         （AI 聊天面板 — 右下角气泡打开）
 *      └─ AiConfigDrawer   （AI 配置 — 聊天面板内点 ⚙ 打开）
 *
 * - 入口：仅从 AI 聊天面板的 ⚙ 按钮进入
 * - 出口：右上角 ✕ 关闭，返回 AI 聊天面板
 */
export default function AiConfigDrawer({ isOpen, onClose, onConfigChange }: AiConfigDrawerProps) {
  // ===== 表单状态 =====
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiHasKey, setAiHasKey] = useState(false);
  const [aiShowKey, setAiShowKey] = useState(false);
  const [aiProviders, setAiProviders] = useState<AgentProvider[]>([]);
  const [aiProviderId, setAiProviderId] = useState<string>("deepseek");

  // ===== 异步状态 =====
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

  // ===== 打开抽屉时加载配置 =====
  useEffect(() => {
    if (isOpen) {
      loadAiConfig();
    }
  }, [isOpen]);

  // ===== Esc 关闭 =====
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // ===== 加载配置 =====
  const loadAiConfig = async () => {
    try {
      const [cfg, providers] = await Promise.all([
        agentService.getConfig(),
        agentService.listProviders(),
      ]);
      setAiHasKey(cfg.hasApiKey);
      setAiBaseUrl(cfg.baseUrl);
      setAiModel(cfg.model);
      setAiApiKey(""); // 不回显真实 Key
      setAiProviders(providers);
      try {
        const matched = await agentService.matchProvider(cfg.baseUrl);
        setAiProviderId(matched);
      } catch {
        setAiProviderId("custom");
      }
    } catch (err) {
      console.error("读取 AI 配置失败:", err);
    }
  };

  /**
   * 切换 provider：立即用 provider 预设的默认 baseUrl/model 覆盖本地状态
   * （保证保存时永远不依赖用户手动改 baseUrl）
   */
  const handleProviderChange = (newId: string) => {
    if (newId === aiProviderId) return;
    setAiProviderId(newId);
    const p = aiProviders.find((x) => x.id === newId);
    if (!p) return;
    setAiBaseUrl(p.defaultBaseUrl);
    setAiModel(p.defaultModel);
  };

  /**
   * 计算"当前生效的 baseUrl / model"
   * - DeepSeek / Qwen：始终取 provider 默认值
   * - Custom：取用户在文本框中输入的值
   */
  const getEffectiveConfig = (): { baseUrl: string; model: string } => {
    if (aiProviderId === "custom") {
      return {
        baseUrl: aiBaseUrl.trim(),
        model: aiModel.trim(),
      };
    }
    const p = aiProviders.find((x) => x.id === aiProviderId);
    return {
      baseUrl: p?.defaultBaseUrl ?? aiBaseUrl.trim(),
      model: aiModel.trim() || p?.defaultModel || "",
    };
  };

  const showAiMsg = (text: string, type: "success" | "error") => {
    if (type === "error") message.error(text);
    else message.success(text);
  };

  // ===== 保存 =====
  const handleSaveAiConfig = async () => {
    setAiSaving(true);
    try {
      const trimmedKey = aiApiKey.trim();
      const { baseUrl, model } = getEffectiveConfig();
      if (!baseUrl) {
        showAiMsg("无法确定 Base URL，请切换到 Custom 模式手动填写", "error");
        return;
      }
      if (!model) {
        showAiMsg("无法确定模型名，请选择模型或切换到 Custom 模式手动填写", "error");
        return;
      }

      if (trimmedKey) {
        await agentService.saveConfig({
          apiKey: trimmedKey,
          baseUrl,
          model,
        });
      } else {
        if (!aiHasKey) {
          showAiMsg("请先填写 API Key", "error");
          return;
        }
        await agentService.updateSettings({ baseUrl, model });
      }
      showAiMsg(
        `保存成功 (端点 ${new URL(baseUrl).host} · 模型 ${model})`,
        "success"
      );
      setAiApiKey("");
      setAiShowKey(false);
      await loadAiConfig();
      onConfigChange?.();
    } catch (err) {
      const errText = typeof err === "string" ? err : (err instanceof Error ? err.message : String(err));
      showAiMsg(`保存失败: ${errText}`, "error");
    } finally {
      setAiSaving(false);
    }
  };

  // ===== 测试连接 =====
  const handleTestAiConnection = async () => {
    if (!aiHasKey) {
      showAiMsg("请先保存 API Key", "error");
      return;
    }
    setAiTesting(true);
    try {
      const reply = await agentService.testConnection();
      showAiMsg(
        `连接成功！模型回复: ${reply.slice(0, 60)}${reply.length > 60 ? "..." : ""}`,
        "success"
      );
    } catch (err) {
      const errText = typeof err === "string" ? err : (err instanceof Error ? err.message : String(err));
      showAiMsg(`连接失败: ${errText}`, "error");
    } finally {
      setAiTesting(false);
    }
  };

  // ===== 清除 =====
  const handleClearAiConfig = async () => {
    if (!window.confirm("确认清除所有 AI 配置（API Key、模型、端点）？")) return;
    setAiSaving(true);
    try {
      await agentService.clearConfig();
      setAiApiKey("");
      setAiBaseUrl("");
      setAiModel("");
      setAiHasKey(false);
      showAiMsg("已清除 AI 配置", "success");
      onConfigChange?.();
    } catch (err) {
      const errText = typeof err === "string" ? err : (err instanceof Error ? err.message : String(err));
      showAiMsg(`清除失败: ${errText}`, "error");
    } finally {
      setAiSaving(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-config-overlay" onClick={handleOverlayClick}>
      <div className="ai-config-drawer" role="dialog" aria-label="AI 助手配置">
        <div className="ai-config-header">
          <div className="ai-config-title">
            <span className="ai-config-icon">⚙️</span>
            <h2>AI 助手配置</h2>
          </div>
          <button className="ai-config-back" onClick={onClose} title="返回 AI 助手">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="ai-config-content">
          <p className="ai-config-desc">
            选择 AI 服务方、填写 API Key 后即可开始对话。
            <br />
            API Key 使用 Windows DPAPI 加密后存储于本地。
          </p>

          {/* 服务方 */}
          <div className="ai-config-row">
            <label className="ai-config-label">服务方</label>
            <div className="ai-provider-list">
              {aiProviders.map((p) => (
                <label
                  key={p.id}
                  className={`ai-provider-option ${aiProviderId === p.id ? "active" : ""}`}
                >
                  <input
                    type="radio"
                    name="ai-provider"
                    value={p.id}
                    checked={aiProviderId === p.id}
                    onChange={() => handleProviderChange(p.id)}
                  />
                  <span className="ai-provider-name">{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="ai-config-row">
            <label className="ai-config-label">API Key</label>
            <div className="ai-key-input-wrap">
              <input
                type={aiShowKey ? "text" : "password"}
                className="ai-config-input"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={
                  aiHasKey
                    ? "重新输入 Key 以更新（留空则保留原 Key）"
                    : aiProviderId === "qwen"
                      ? "请输入阿里云 DashScope API Key (sk-...)"
                      : aiProviderId === "deepseek"
                        ? "请输入 DeepSeek API Key (sk-...)"
                        : "请输入 API Key"
                }
                autoComplete="off"
              />
              <button
                type="button"
                className="ai-key-toggle"
                onClick={() => setAiShowKey((s) => !s)}
                title={aiShowKey ? "隐藏" : "显示"}
              >
                {aiShowKey ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* 模型：非 Custom 用 chip，Custom 用文本框 */}
          {aiProviderId !== "custom" ? (
            <div className="ai-config-row">
              <label className="ai-config-label">
                模型
                <span className="ai-config-hint">点击切换</span>
              </label>
              {(() => {
                const p = aiProviders.find((x) => x.id === aiProviderId);
                if (!p || p.models.length === 0) return null;
                return (
                  <div className="ai-model-chips">
                    {p.models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`ai-model-chip ${aiModel === m.id ? "active" : ""}`}
                        onClick={() => setAiModel(m.id)}
                        title={m.description || m.id}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <>
              <div className="ai-config-row">
                <label className="ai-config-label">Base URL</label>
                <input
                  type="text"
                  className="ai-config-input"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div className="ai-config-row">
                <label className="ai-config-label">模型</label>
                <input
                  type="text"
                  className="ai-config-input"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="model-id"
                />
              </div>
            </>
          )}

          {/* 已保存配置摘要 */}
          <div className="ai-config-summary">
            <div className="ai-config-summary-row">
              <span className="ai-config-summary-label">当前端点</span>
              <code className="ai-config-summary-value">{aiBaseUrl || "-"}</code>
            </div>
            <div className="ai-config-summary-row">
              <span className="ai-config-summary-label">当前模型</span>
              <code className="ai-config-summary-value">{aiModel || "-"}</code>
            </div>
            <div className="ai-config-summary-row">
              <span className="ai-config-summary-label">API Key</span>
              <span className={`ai-config-status ${aiHasKey ? "ok" : "missing"}`}>
                {aiHasKey ? "已配置（DPAPI 加密）" : "未配置"}
              </span>
              {(() => {
                const p = aiProviders.find((x) => x.id === aiProviderId);
                return p?.apiKeyUrl ? (
                  <a
                    className="ai-config-link"
                    href={p.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    获取 Key ↗
                  </a>
                ) : null;
              })()}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="ai-config-actions">
            <button
              className="ai-config-btn primary"
              onClick={handleSaveAiConfig}
              disabled={aiSaving || aiTesting}
            >
              {aiSaving ? "保存中..." : "保存配置"}
            </button>
            <button
              className="ai-config-btn"
              onClick={handleTestAiConnection}
              disabled={aiSaving || aiTesting || !aiHasKey}
              title={!aiHasKey ? "请先保存 API Key" : "测试与 LLM 的连接"}
            >
              {aiTesting ? "测试中..." : "测试连接"}
            </button>
            <button
              className="ai-config-btn danger"
              onClick={handleClearAiConfig}
              disabled={aiSaving || aiTesting}
              title="清除所有 AI 配置"
            >
              清除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
