import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GitProxySettingsProps {
  initialExpanded?: boolean;
}

export default function GitProxySettings({ initialExpanded = false }: GitProxySettingsProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [port, setPort] = useState("");
  const [currentProxy, setCurrentProxy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCurrentProxy();
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

  const loadCurrentProxy = async () => {
    try {
      const proxy = await invoke<string | null>("get_git_proxy");
      setCurrentProxy(proxy);
    } catch (err) {
      console.error("获取代理配置失败:", err);
    }
  };

  const handleSetProxy = async () => {
    if (!port.trim()) {
      setMessage("请输入端口号");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setMessage("端口号无效 (1-65535)");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await invoke("set_git_proxy", { port: portNum });
      setMessage(`代理已设置到端口 ${port}`);
      setCurrentProxy(`http://127.0.0.1:${port}`);
      setPort("");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`设置失败: ${err}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleClearProxy = async () => {
    setLoading(true);
    setMessage("");

    try {
      await invoke("clear_git_proxy");
      setMessage("代理已清除");
      setCurrentProxy(null);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`清除失败: ${err}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="git-proxy-settings" ref={containerRef}>
      <button
        className="git-proxy-toggle-btn"
        onClick={() => setIsExpanded(!isExpanded)}
        title="Git 代理设置"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        {currentProxy && <span className="proxy-indicator"></span>}
      </button>

      {isExpanded && (
        <div className="git-proxy-dropdown">
          <div className="git-proxy-header">
            <span>Git 代理设置</span>
            <button className="close-btn" onClick={() => setIsExpanded(false)}>x</button>
          </div>
          
          {currentProxy && (
            <div className="current-proxy">
              <div className="current-proxy-label">当前代理:</div>
              <div className="current-proxy-value">{currentProxy}</div>
            </div>
          )}
          
          <div className="proxy-input-group">
            <label>设置代理端口:</label>
            <div className="input-row">
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="例如: 7890"
                disabled={loading}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSetProxy();
                  }
                }}
              />
              <button
                className="set-proxy-btn"
                onClick={handleSetProxy}
                disabled={loading}
              >
                {loading ? "..." : "设置"}
              </button>
            </div>
          </div>

          {currentProxy && (
            <button
              className="clear-proxy-btn"
              onClick={handleClearProxy}
              disabled={loading}
            >
              清除代理
            </button>
          )}

          {message && (
            <div className={`proxy-message ${message.includes("失败") ? "error" : "success"}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
