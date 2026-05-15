import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./AutoStartSettings.css";

interface AutoStartSettingsProps {
  initialExpanded?: boolean;
}

export default function AutoStartSettings({ initialExpanded = false }: AutoStartSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAutoStartStatus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded]);

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

  return (
    <div className="auto-start-settings" ref={containerRef}>
      <button
        className="auto-start-toggle-btn"
        onClick={() => setIsExpanded(!isExpanded)}
        title="开机启动设置"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 3l14 9-14 9V3z"></path>
        </svg>
        {autoStartEnabled && <span className="auto-start-indicator"></span>}
      </button>

      {isExpanded && (
        <div className="auto-start-dropdown">
          <div className="auto-start-header">
            <span>开机启动</span>
            <button className="close-btn" onClick={() => setIsExpanded(false)}>x</button>
          </div>

          <div className="auto-start-content">
            <div className="switch-row">
              <span className="switch-label">开机自动启动</span>
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
            <div className="auto-start-desc">
              开启后，应用将在 Windows 启动时自动运行
            </div>
          </div>

          {message && (
            <div className={`auto-start-message ${message.includes("失败") ? "error" : "success"}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
