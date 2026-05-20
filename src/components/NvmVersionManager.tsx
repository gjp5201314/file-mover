import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./NvmVersionManager.css";

interface NvmInfo {
  installed: boolean;
  currentVersion: string | null;
  installedVersions: string[];
  availableVersions: string[];
}

export default function NvmVersionManager() {
  const [nvmInfo, setNvmInfo] = useState<NvmInfo>({
    installed: false,
    currentVersion: null,
    installedVersions: [],
    availableVersions: [],
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [installingVersion, setInstallingVersion] = useState<string | null>(null);
  const [switchingVersion, setSwitchingVersion] = useState<string | null>(null);
  const [isVersionsListExpanded, setIsVersionsListExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNvmInfo();
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

  const loadNvmInfo = async () => {
    setLoading(true);
    try {
      const info = await invoke<NvmInfo>("get_nvm_info");
      setNvmInfo(info);
    } catch (err) {
      console.error("获取 NVM 信息失败:", err);
      setNvmInfo({
        installed: false,
        currentVersion: null,
        installedVersions: [],
        availableVersions: ["20.0.0", "18.0.0", "16.0.0", "14.0.0"],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchVersion = async (version: string) => {
    if (version === nvmInfo.currentVersion) return;

    setSwitchingVersion(version);
    setMessage("");

    try {
      await invoke("switch_node_version", { version });
      setMessage(`已切换到 Node.js v${version}`);
      setNvmInfo(prev => ({
        ...prev,
        currentVersion: version
      }));
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`切换失败: ${err}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setSwitchingVersion(null);
    }
  };

  const handleInstallVersion = async (version: string) => {
    if (nvmInfo.installedVersions.includes(version)) {
      handleSwitchVersion(version);
      return;
    }

    setInstallingVersion(version);
    setMessage("");

    try {
      await invoke("install_node_version", { version });
      setMessage(`已安装并切换到 Node.js v${version}`);
      setNvmInfo(prev => ({
        ...prev,
        installedVersions: prev.installedVersions.includes(version)
          ? prev.installedVersions
          : [...prev.installedVersions, version],
        currentVersion: version
      }));
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`安装失败: ${err}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setInstallingVersion(null);
    }
  };

  const getAvailableToInstall = () => {
    return nvmInfo.availableVersions.filter(v => !nvmInfo.installedVersions.includes(v));
  };

  return (
    <div className="nvm-version-manager" ref={containerRef}>
      <button
        className={`nvm-toggle-btn ${nvmInfo.installed ? "installed" : "not-installed"}`}
        onClick={() => setIsExpanded(!isExpanded)}
        title="Node 版本管理"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1.85c-.27 0-.55.07-.78.2l-7.25 4.24c-.48.28-.78.8-.78 1.34v8.74c0 .54.3 1.06.78 1.34l7.25 4.24c.23.13.51.2.78.2.27 0 .55-.07.78-.2l7.25-4.24c.48-.28.78-.8.78-1.34v-8.74c0-.54-.3-1.06-.78-1.34l-7.25-4.24c-.23-.13-.51-.2-.78-.2zm.38 2.63v6.57l4.72 2.76-.65.99-5.25-3.07v-7.25h1.18zm-1.47 9.93v1.38l-4.5 2.64v-1.35l4.5-2.67zm1.09.69l4.5-2.63v1.35l-4.5 2.63v-1.35z"/>
        </svg>
        {nvmInfo.installed && nvmInfo.currentVersion && (
          <span className="nvm-version-badge">v{nvmInfo.currentVersion}</span>
        )}
        {!nvmInfo.installed && <span className="nvm-not-installed-dot"></span>}
      </button>

      {isExpanded && (
        <div className="nvm-dropdown">
          <div className="nvm-header">
            <div className="nvm-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1.85c-.27 0-.55.07-.78.2l-7.25 4.24c-.48.28-.78.8-.78 1.34v8.74c0 .54.3 1.06.78 1.34l7.25 4.24c.23.13.51.2.78.2.27 0 .55-.07.78-.2l7.25-4.24c.48-.28.78-.8.78-1.34v-8.74c0-.54-.3-1.06-.78-1.34l-7.25-4.24c-.23-.13-.51-.2-.78-.2zm.38 2.63v6.57l4.72 2.76-.65.99-5.25-3.07v-7.25h1.18zm-1.47 9.93v1.38l-4.5 2.64v-1.35l4.5-2.67zm1.09.69l4.5-2.63v1.35l-4.5 2.63v-1.35z"/>
              </svg>
              <span>Node.js 版本管理</span>
            </div>
            <button className="nvm-close-btn" onClick={() => setIsExpanded(false)}>×</button>
          </div>

          {!nvmInfo.installed ? (
            <div className="nvm-not-installed">
              <div className="nvm-status-icon warning">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div className="nvm-not-installed-text">
                <p>NVM 未检测到</p>
                <span>请安装 NVM 以管理 Node.js 版本</span>
              </div>
              <div className="nvm-install-guide">
                <p>Windows 用户推荐使用:</p>
                <code>nvm install lts</code>
              </div>
            </div>
          ) : (
            <>
              <div className="nvm-status-bar">
                <div className="nvm-current">
                  <span className="nvm-status-label">当前版本</span>
                  <span className="nvm-current-version">v{nvmInfo.currentVersion || "未设置"}</span>
                </div>
              </div>

              {nvmInfo.installedVersions.length > 0 && (
                <div className="nvm-section">
                  <div className="nvm-section-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>已安装版本</span>
                  </div>
                  <div className="nvm-version-list">
                    {nvmInfo.installedVersions.map(version => (
                      <button
                        key={version}
                        className={`nvm-version-item installed ${version === nvmInfo.currentVersion ? "active" : ""}`}
                        onClick={() => handleSwitchVersion(version)}
                        disabled={switchingVersion !== null}
                      >
                        <span className="nvm-version-number">v{version}</span>
                        {version === nvmInfo.currentVersion && (
                          <span className="nvm-active-badge">当前</span>
                        )}
                        {switchingVersion === version && (
                          <span className="nvm-switching">切换中...</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {getAvailableToInstall().length > 0 && (
                <div className="nvm-section">
                  <div className="nvm-section-header collapsible" onClick={() => setIsVersionsListExpanded(!isVersionsListExpanded)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <span>可安装版本</span>
                    <svg className={`collapse-arrow ${isVersionsListExpanded ? "expanded" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                  {isVersionsListExpanded && (
                    <div className="nvm-version-list">
                      {getAvailableToInstall().map(version => (
                        <button
                          key={version}
                          className="nvm-version-item available"
                          onClick={() => handleInstallVersion(version)}
                          disabled={installingVersion !== null}
                        >
                          <span className="nvm-version-number">v{version}</span>
                          {installingVersion === version ? (
                            <span className="nvm-installing">安装中...</span>
                          ) : (
                            <span className="nvm-install-icon">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <polyline points="19 12 12 19 5 12"></polyline>
                              </svg>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button className="nvm-refresh-btn" onClick={loadNvmInfo} disabled={loading}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                刷新版本列表
              </button>
            </>
          )}

          {message && (
            <div className={`nvm-message ${message.includes("失败") ? "error" : "success"}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
