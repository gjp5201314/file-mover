import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./SettingsDrawer.css";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
  onExport: () => void;
  hasProjects: boolean;
}

export default function SettingsDrawer({ isOpen, onClose, onImport, onExport, hasProjects }: SettingsDrawerProps) {
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadAutoStartStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const loadAutoStartStatus = async () => {
    try {
      const enabled = await invoke<boolean>("get_autostart");
      setAutoStartEnabled(enabled);
    } catch (err) {
      console.error("获取开机启动状态失败:", err);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    setMessage("");

    try {
      await invoke("set_autostart", { enabled: checked });
      setAutoStartEnabled(checked);
      setMessage(checked ? "已开启开机启动" : "已关闭开机启动");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`设置失败: ${err}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-drawer-overlay" onClick={handleOverlayClick}>
      <div className="settings-drawer">
        <div className="drawer-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          <div className="settings-section">
            <h3 className="section-title">常规设置</h3>
            <div className="settings-item">
              <div className="switch-row">
                <div className="switch-info">
                  <span className="switch-label">开机自动启动</span>
                  <span className="switch-desc">开启后，应用将在 Windows 启动时自动运行</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={autoStartEnabled}
                    onChange={(e) => handleToggle(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              {message && (
                <div className={`auto-start-message ${message.includes("失败") ? "error" : "success"}`}>
                  {message}
                </div>
              )}
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title">配置管理</h3>
            <div className="settings-buttons">
              <button className="settings-action-btn" onClick={onImport}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                导入配置
              </button>
              <button className="settings-action-btn" onClick={onExport} disabled={!hasProjects}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                导出配置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
