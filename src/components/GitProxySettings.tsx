/**
 * GitProxySettings 组件
 *
 * Git 代理设置组件
 *
 * 功能：
 * - 显示/设置 Git HTTP/HTTPS 代理
 * - 代理配置持久化到后端
 * - 支持清除代理
 *
 * 技术实现：
 * - 通过 Tauri invoke 与后端通信
 * - get_git_proxy: 获取当前代理
 * - set_git_proxy: 设置代理
 * - clear_git_proxy: 清除代理
 *
 * UI 设计：
 * - 点击地球图标切换展开/收起
 * - 展开时显示当前代理和设置表单
 * - 点击外部自动收起
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import NvmVersionManager from "./NvmVersionManager";
import ProjectOverview from "./ProjectOverview";
import "./GitProxySettings.css";
import "./NvmVersionManager.css";

/**
 * GitProxySettings 组件 Props
 * @interface GitProxySettingsProps
 */
interface GitProxySettingsProps {
  /** 初始展开状态 */
  initialExpanded?: boolean;
}

/**
 * GitProxySettings 组件
 *
 * @param initialExpanded - 初始是否展开
 */
export default function GitProxySettings({ initialExpanded = false }: GitProxySettingsProps) {
  // 是否展开
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  // 端口输入
  const [port, setPort] = useState("7897");
  // 当前代理
  const [currentProxy, setCurrentProxy] = useState<string | null>(null);
  // 加载状态
  const [loading, setLoading] = useState(false);
  // 消息提示
  const [message, setMessage] = useState("");
  // 容器引用
  const containerRef = useRef<HTMLDivElement>(null);

  // 初始化：加载当前代理
  useEffect(() => {
    loadCurrentProxy();
  }, []);

  // 点击外部关闭
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

  /**
   * 加载当前代理配置
   */
  const loadCurrentProxy = async () => {
    try {
      const proxy = await invoke<string | null>("get_git_proxy");
      setCurrentProxy(proxy);
    } catch (err) {
      console.error("获取代理配置失败:", err);
    }
  };

  /**
   * 设置代理
   *
   * 验证规则：
   * - 端口必须填写
   * - 端口必须是有效数字
   * - 端口范围：1-65535
   */
  const handleSetProxy = async () => {
    // 验证输入
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
      // 调用后端设置代理
      await invoke("set_git_proxy", { port: portNum });
      setMessage(`代理已设置到端口 ${port}`);
      setCurrentProxy(`http://127.0.0.1:${port}`);
      setPort("");
      // 3 秒后自动清除消息
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`设置失败: ${err}`);
      // 5 秒后自动清除错误消息
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 清除代理
   */
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
    <div className="version-settings-wrapper">
      <ProjectOverview />
      <NvmVersionManager />
      <div className="git-proxy-settings" ref={containerRef}>
        {/* 切换按钮 */}
        <button
          className="git-proxy-toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          title="Git 代理设置"
        >
          {/* 地球图标 SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          {/* 代理指示点（已设置代理时显示） */}
          {currentProxy && <span className="proxy-indicator"></span>}
        </button>

        {/* 下拉面板 */}
        {isExpanded && (
        <div className="git-proxy-dropdown">
          <div className="git-proxy-header">
            <span>Git 代理设置</span>
            <button className="close-btn" onClick={() => setIsExpanded(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* 当前代理显示 */}
          {currentProxy && (
            <div className="current-proxy">
              <div className="current-proxy-label">当前代理:</div>
              <div className="current-proxy-value">{currentProxy}</div>
            </div>
          )}

          {/* 代理设置表单 */}
          <div className="proxy-input-group">
            <label>设置代理端口:</label>
            <div className="input-row">
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="例如: 7890"
                disabled={loading}
                // 支持回车提交
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

          {/* 清除代理按钮 */}
          {currentProxy && (
            <button
              className="clear-proxy-btn"
              onClick={handleClearProxy}
              disabled={loading}
            >
              清除代理
            </button>
          )}

          {/* 消息提示 */}
          {message && (
            <div className={`proxy-message ${message.includes("失败") ? "error" : "success"}`}>
              {message}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
