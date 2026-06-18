/**
 * Header 组件
 *
 * 应用顶部导航栏
 *
 * 功能：
 * - 显示应用标题
 * - 提供 Git 代理设置入口
 * - 提供设置抽屉入口
 *
 * 布局：
 * - 左侧：应用标题
 * - 右侧：Git 代理设置 + 设置按钮
 */

import { useEffect, useRef, useState } from "react";
import GitProxySettings from "./GitProxySettings";
import ProjectTabs from "./ProjectTabs";
import type { ProjectCardData } from "../types";
import "./Header.css";

interface HeaderProps {
  onOpenSettings: () => void;
  projects: ProjectCardData[];
  activeTab: string | null;
  onTabSelect: (id: string) => void;
  onAddProject: () => void;
}

export default function Header({ onOpenSettings, projects, activeTab, onTabSelect, onAddProject }: HeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [stickyEnabled, setStickyEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("app.sticky-header.enabled");
    return v === null ? true : v === "true";
  });

  // 同步设置抽屉中的吸顶开关变化
  useEffect(() => {
    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setStickyEnabled(!!detail);
    };
    // 跨标签页同步（多窗口场景）
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "app.sticky-header.enabled") {
        setStickyEnabled(e.newValue === null ? true : e.newValue === "true");
      }
    };
    window.addEventListener("sticky-header-change", handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("sticky-header-change", handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // 使用 IntersectionObserver 监听哨兵元素是否离开视口，
  // 哨兵不在视口内 = 页面已滚动 = 开启 kpi 吸顶样式。
  // 比监听 scroll 事件性能更优，且不依赖滚动容器。
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setScrolled(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // 同时监听主内容区（.project-main）的滚动，
  // 以在内容区滚动时也能呈现吸顶视觉反馈。
  // 仅处理 .project-main 内部的滚动事件，避免抽屉、弹窗等
  // 其他独立滚动容器影响 header 状态。
  useEffect(() => {
    const handleInnerScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      if (!(target instanceof HTMLElement)) return;
      // 非 .project-main 区域的滚动（抽屉、弹窗、其它可滚动容器）一律忽略
      if (!target.closest(".project-main")) return;
      if (target.scrollTop > 4) setScrolled(true);
      else if (window.scrollY <= 0) setScrolled(false);
    };

    document.addEventListener("scroll", handleInnerScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", handleInnerScroll, true);
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="header-sentinel" aria-hidden="true" />
      <header
        className={`app-header ${scrolled ? "scrolled" : ""} ${
          stickyEnabled ? "" : "no-sticky"
        }`}
      >
        <ProjectTabs
          projects={projects}
          activeTab={activeTab}
          onTabSelect={onTabSelect}
          onAddProject={onAddProject}
        />

        <div className="header-actions">
          <GitProxySettings />

          <button
            className="settings-btn"
            onClick={onOpenSettings}
            title="设置"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
