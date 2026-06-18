import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { message } from "./messageApi";
import "./AutoStartSettings.css";

interface AutoStartSettingsProps {
  initialExpanded?: boolean;
}

export default function AutoStartSettings({ initialExpanded = false }: AutoStartSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
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

    try {
      await invoke("set_autostart", { enabled: checked });
      setAutoStartEnabled(checked);
      message.success(checked ? "已开启开机启动" : "已关闭开机启动");
    } catch (err) {
      message.error(`设置失败: ${err}`);
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
            <button className="close-btn" onClick={() => setIsExpanded(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
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
        </div>
      )}
    </div>
  );
}
