/**
 * Header 组件
 *
 * 应用顶部导航栏
 *
 * 功能：
 * - 显示应用标题
 * - 提供 Git 代理设置入口
 * - 提供配置导入/导出入口
 *
 * 布局：
 * - 左侧：应用标题
 * - 右侧：Git 代理设置 + 下拉菜单（导入/导出）
 */

import { useState, useRef, useEffect } from "react";
import GitProxySettings from "./GitProxySettings";
import "./Header.css";

/**
 * Header 组件 Props
 * @interface HeaderProps
 */
interface HeaderProps {
  /** 导入配置回调 */
  onImportConfig: () => void;
  /** 导出配置回调 */
  onExportConfig: () => void;
  /** 是否有项目（影响导出按钮状态） */
  hasProjects: boolean;
}

/**
 * Header 组件
 *
 * @param onImportConfig - 导入配置回调
 * @param onExportConfig - 导出配置回调
 * @param hasProjects - 是否有项目数据
 */
export default function Header({ onImportConfig, onExportConfig, hasProjects }: HeaderProps) {
  // 设置下拉菜单是否展开
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  // 下拉菜单容器引用，用于点击外部关闭
  const settingsRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="app-header">
      {/* 应用标题 */}
      <h1 className="app-title">前端部署工具</h1>

      <div className="header-actions">
        {/* Git 代理设置组件 */}
        <GitProxySettings />

        {/* 设置下拉菜单 */}
        <div className="settings-dropdown" ref={settingsRef}>
          {/* 设置按钮（齿轮图标） */}
          <button
            className="settings-btn"
            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
            title="设置"
          >
            {/* SVG 齿轮图标 */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          {/* 下拉菜单内容 */}
          {showSettingsDropdown && (
            <div className="dropdown-menu">
              <button
                className="dropdown-item"
                onClick={() => {
                  onImportConfig();
                  setShowSettingsDropdown(false);
                }}
              >
                导入配置
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onExportConfig();
                  setShowSettingsDropdown(false);
                }}
                disabled={!hasProjects}
              >
                导出配置
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
