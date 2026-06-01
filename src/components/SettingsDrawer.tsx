import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./SettingsDrawer.css";

interface ChangelogEntry {
  version: string;
  date: string;
  type: "新增" | "优化" | "修复" | "重构";
  content: string;
}

const changelog: ChangelogEntry[] = [
  { version: "1.4.0", date: "2026-06-01", type: "新增", content: "项目拖拽排序：支持拖拽调整项目列表顺序" },
  { version: "1.4.0", date: "2026-06-01", type: "新增", content: "顶部吸顶栏：可配置的顶部吸顶导航栏，支持滚动毛玻璃效果" },
  { version: "1.4.0", date: "2026-06-01", type: "优化", content: "项目标签页：支持自动溢出折叠与搜索下拉菜单" },
  { version: "1.4.0", date: "2026-06-01", type: "优化", content: "页面体验：新增页面内边距调整、模态框Portal修复与滚动穿透阻断" },
  { version: "1.4.0", date: "2026-06-01", type: "优化", content: "密码框：新增清除按钮，提升使用体验" },
  { version: "1.3.0", date: "2026-05-29", type: "修复", content: "修复保存网站项目时丢失原有配置项目的问题" },
  { version: "1.3.0", date: "2026-05-28", type: "新增", content: "网站项目管理：支持管理前端网站项目，快速访问 net/com 环境配置" },
  { version: "1.3.0", date: "2026-05-28", type: "优化", content: "配置导入导出：支持同时导入导出网站项目配置" },
  { version: "1.3.0", date: "2026-05-28", type: "重构", content: "页面布局：将标签页移入头部组件，统一布局结构" },
  { version: "1.2.0", date: "2026-05-20", type: "新增", content: "Node.js 版本管理：支持查看、切换和安装 Node.js 版本" },
  { version: "1.2.0", date: "2026-05-20", type: "新增", content: "Hosts 文件管理：支持快速打开本地计算机 hosts 文件进行编辑" },
  { version: "1.2.0", date: "2026-05-18", type: "新增", content: "自动化监听功能：开启后监听打包目录文件变化，自动执行部署" },
  { version: "1.2.0", date: "2026-05-18", type: "新增", content: "停止操作支持：支持手动停止正在进行的部署操作" },
  { version: "1.2.0", date: "2026-05-18", type: "新增", content: "系统托盘功能：支持最小化到托盘后台运行，可通过托盘图标恢复窗口" },
  { version: "1.2.0", date: "2026-05-18", type: "重构", content: "通用弹窗组件：创建万能弹窗组件，支持多种确认场景复用" },
  { version: "1.2.0", date: "2026-05-18", type: "优化", content: "日志清除功能：区分文件和Git日志，各自独立清除，互不影响" },
  { version: "1.0.3", date: "2026-05-15", type: "修复", content: "全链路安全加固：路径验证、符号链接检测、Git 操作审计" },
  { version: "1.0.2", date: "2026-05-15", type: "新增", content: "开机自启：支持 Windows 注册表开机启动" },
  { version: "1.0.2", date: "2026-05-15", type: "重构", content: "项目结构：重构项目结构并完善代码规范" },
  { version: "1.0.1", date: "2026-05-14", type: "新增", content: "Git 代理设置：支持配置 HTTP/HTTPS 代理" },
  { version: "1.0.1", date: "2026-05-13", type: "优化", content: "UI 样式：调整窗口尺寸与UI样式，新增日志时间戳" },
  { version: "1.0.0", date: "2026-05-12", type: "新增", content: "项目配置管理：支持多项目配置、导入导出" },
  { version: "1.0.0", date: "2026-05-12", type: "新增", content: "文件部署：支持复制/移动文件到目标目录" },
  { version: "1.0.0", date: "2026-05-12", type: "新增", content: "Git 集成：支持自动/手动提交、自动推送" },
  { version: "1.0.0", date: "2026-05-12", type: "新增", content: "目标目录清空：支持不清空/全部清空/指定文件清空" },
];

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
  onExport: () => void;
  hasProjects: boolean;
}

export default function SettingsDrawer({ isOpen, onClose, onImport, onExport, hasProjects }: SettingsDrawerProps) {
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(false);
  const [stickyHeaderEnabled, setStickyHeaderEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showChangelog, setShowChangelog] = useState(false);
  const [hostsLoading, setHostsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAutoStartStatus();
      loadTrayStatus();
      loadStickyHeaderStatus();
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

  const loadTrayStatus = async () => {
    try {
      const enabled = await invoke<boolean>("get_tray_setting");
      setTrayEnabled(enabled);
    } catch (err) {
      console.error("获取托盘状态失败:", err);
    }
  };

  /** 读取顶部吸顶设置（未设置过时默认开启） */
  const loadStickyHeaderStatus = () => {
    const v = localStorage.getItem("app.sticky-header.enabled");
    setStickyHeaderEnabled(v === null ? true : v === "true");
  };

  const handleStickyHeaderToggle = (checked: boolean) => {
    localStorage.setItem("app.sticky-header.enabled", String(checked));
    setStickyHeaderEnabled(checked);
    // 通知 Header 组件实时更新
    window.dispatchEvent(
      new CustomEvent("sticky-header-change", { detail: checked })
    );
    setMessage(checked ? "已开启顶部吸顶效果" : "已关闭顶部吸顶效果");
    setTimeout(() => setMessage(""), 3000);
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

  const handleTrayToggle = async (checked: boolean) => {
    setLoading(true);
    setMessage("");

    try {
      await invoke("set_tray_setting", { enabled: checked });
      setTrayEnabled(checked);
      setMessage(checked ? "已开启最小化到托盘" : "已关闭最小化到托盘");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`设置失败: ${err}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHostsFile = async () => {
    if (hostsLoading) return;
    
    setHostsLoading(true);

    try {
      await invoke("open_hosts_file");
    } catch (err) {
      console.error("打开 hosts 文件失败:", err);
    } finally {
      setTimeout(() => setHostsLoading(false), 500);
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
            </div>

            <div className="settings-item">
              <div className="switch-row">
                <div className="switch-info">
                  <span className="switch-label">最小化到托盘</span>
                  <span className="switch-desc">开启后，关闭窗口时应用将最小化到系统托盘</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={trayEnabled}
                    onChange={(e) => handleTrayToggle(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <div className="settings-item">
              <div className="switch-row">
                <div className="switch-info">
                  <span className="switch-label">顶部吸顶效果</span>
                  <span className="switch-desc">开启后，项目标签栏将始终固定在页面顶部</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={stickyHeaderEnabled}
                    onChange={(e) => handleStickyHeaderToggle(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {message && (
              <div className={`auto-start-message ${message.includes("失败") ? "error" : "success"}`}>
                {message}
              </div>
            )}
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

          <div className="settings-section">
            <h3 className="section-title">系统工具</h3>
            <div className="settings-buttons">
              <button className="settings-action-btn" onClick={handleOpenHostsFile} disabled={hostsLoading}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                {hostsLoading ? "正在打开..." : "打开 hosts 文件"}
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title">关于</h3>
            <button className="settings-action-btn" onClick={() => setShowChangelog(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              开发日志
            </button>
          </div>
        </div>
      </div>

      {showChangelog && (
        <div className="changelog-overlay" onClick={() => setShowChangelog(false)}>
          <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-header">
              <h2>开发日志</h2>
              <button className="close-btn" onClick={() => setShowChangelog(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="changelog-content">
              {changelog.map((entry, index) => (
                <div key={index} className="changelog-entry">
                  <div className="entry-header">
                    <span className={`entry-badge ${entry.type}`}>{entry.type}</span>
                    <span className="entry-version">v{entry.version}</span>
                    <span className="entry-date">{entry.date}</span>
                  </div>
                  <div className="entry-content">{entry.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
