/**
 * ProjectTabs 组件
 *
 * 项目标签页导航
 *
 * 功能：
 * - 显示所有项目标签
 * - 支持标签切换
 * - 支持添加新项目
 * - 显示项目状态指示器
 *
 * 布局：
 * - 水平滚动的标签列表
 * - 每个标签显示项目名称和状态点
 * - 最后一个标签为"添加项目"按钮
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from "react";
import ConfirmModal from "./ConfirmModal";
import "./ProjectTabs.css";

/**
 * 项目标签数据结构
 * @interface ProjectTab
 */
export interface ProjectTab {
  /** 项目 ID */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目状态 */
  status: "idle" | "copying" | "ready" | "committing" | "done" | "error";
}

/**
 * ProjectTabs 组件 Props
 * @interface ProjectTabsProps
 */
interface ProjectTabsProps {
  /** 项目列表 */
  projects: ProjectTab[];
  /** 当前激活的标签 ID */
  activeTab: string | null;
  /** 标签切换回调 */
  onTabSelect: (id: string) => void;
  /** 添加项目回调 */
  onAddProject: () => void;
}

/**
 * ProjectTabs 组件
 *
 * @param projects - 项目列表
 * @param activeTab - 当前激活的标签 ID
 * @param onTabSelect - 标签切换回调
 * @param onAddProject - 添加项目回调
 */
export default function ProjectTabs({ projects, activeTab, onTabSelect, onAddProject }: ProjectTabsProps) {
  const [visibleCount, setVisibleCount] = useState(projects.length);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const tabsListRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const visibleProjects = projects.slice(0, visibleCount);
  const hiddenProjects = projects.slice(visibleCount);
  const hasHiddenTabs = hiddenProjects.length > 0;

  // 下拉中是否包含当前激活的 tab（用于在更多按钮上显示激活态）
  const activeInHidden = useMemo(
    () => hiddenProjects.some((p) => p.id === activeTab),
    [hiddenProjects, activeTab]
  );

  // 过滤后的下拉项目列表
  const filteredHiddenProjects = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return hiddenProjects;
    return hiddenProjects.filter((p) => p.name.toLowerCase().includes(kw));
  }, [hiddenProjects, searchKeyword]);

  /**
   * 基于隐藏的 mirror 容器测量每个 tab 的真实宽度，
   * 计算 tabs-list 在当前容器宽度下能容纳的最大 tab 数量。
   * 必须基于完整列表测量，避免裁剪后无法再恢复。
   */
  const calculateVisibleCount = useCallback(() => {
    if (!tabsListRef.current || !measureRef.current) return;
    if (projects.length === 0) {
      setVisibleCount(0);
      return;
    }

    const containerWidth = tabsListRef.current.clientWidth;
    const children = Array.from(measureRef.current.children) as HTMLElement[];
    if (children.length === 0) return;

    const gap = 4;
    const moreButtonWidth = 44; // 更多按钮宽度（含与上一个 tab 的间距）

    // 先判断是否能完全放下，无需更多按钮
    let totalAll = 0;
    for (let i = 0; i < children.length; i++) {
      totalAll += children[i].offsetWidth + (i > 0 ? gap : 0);
    }
    if (totalAll <= containerWidth) {
      setVisibleCount(children.length);
      return;
    }

    // 否则需要为更多按钮预留空间
    let totalWidth = 0;
    let count = 0;
    for (let i = 0; i < children.length; i++) {
      const childWidth = children[i].offsetWidth + (i > 0 ? gap : 0);
      if (totalWidth + childWidth + moreButtonWidth <= containerWidth) {
        totalWidth += childWidth;
        count++;
      } else {
        break;
      }
    }
    // 至少展示一个 tab（避免空间过窄时全部塞入下拉）
    setVisibleCount(Math.max(count, 1));
  }, [projects.length]);

  useLayoutEffect(() => {
    calculateVisibleCount();
  }, [projects, calculateVisibleCount]);

  useEffect(() => {
    if (!tabsListRef.current) return;
    const observer = new ResizeObserver(() => {
      calculateVisibleCount();
    });
    observer.observe(tabsListRef.current);
    return () => observer.disconnect();
  }, [calculateVisibleCount]);

  useEffect(() => {
    if (!showDropdown) {
      setSearchKeyword("");
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest(".tabs-dropdown")
      ) {
        setShowDropdown(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDropdown(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    // 自动聚焦搜索框（项目较多时方便快速过滤）
    if (hiddenProjects.length > 6) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [showDropdown, hiddenProjects.length]);

  // 拦截 dropdown 内所有不可滚动区域的 wheel 事件，
  // 避免在这些区域滚动时穿透到主页面。
  useEffect(() => {
    const dropdown = dropdownRef.current;
    if (!showDropdown || !dropdown) return;

    const list = dropdown.querySelector(".tabs-dropdown-list") as HTMLElement | null;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Node;
      const canScroll = list && list.scrollHeight > list.clientHeight;
      const inList = list && list.contains(target);

      if (!inList) {
        // header / search / padding 区域不可滚动，直接阻止
        e.preventDefault();
        return;
      }
      if (!canScroll) {
        // 在 list 内但内容未溢出，也不允许穿透
        e.preventDefault();
      }
      // 其他：list 可滚动 + 鼠标在 list 内，让 list 正常滚动（边界由 CSS contain 处理）
    };

    // passive: false 才能调用 preventDefault
    dropdown.addEventListener("wheel", handleWheel, { passive: false });
    return () => dropdown.removeEventListener("wheel", handleWheel);
  }, [showDropdown]);

  const handleMoreClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDropdown((prev) => !prev);
  };

  const handleHiddenTabSelect = (id: string) => {
    onTabSelect(id);
    setShowDropdown(false);
  };

  const handleAddClick = () => {
    setShowAddConfirm(true);
  };

  const handleAddConfirm = () => {
    setShowAddConfirm(false);
    onAddProject();
  };

  const handleAddCancel = () => {
    setShowAddConfirm(false);
  };

  return (
    <div className="tabs-container">
      <div className="tabs-list" ref={tabsListRef}>
        {visibleProjects.map((project) => (
          <button
            key={project.id}
            className={`tab-item ${activeTab === project.id ? "active" : ""} ${project.status}`}
            onClick={() => onTabSelect(project.id)}
            title={project.name}
          >
            <span className="tab-name">{project.name}</span>
            <span className={`tab-status-dot ${project.status}`}></span>
          </button>
        ))}
      </div>

      {/* 隐藏 mirror，用于测量所有 tab 的真实宽度 */}
      <div className="tabs-measure" ref={measureRef} aria-hidden="true">
        {projects.map((project) => (
          <button key={project.id} className="tab-item" tabIndex={-1}>
            <span className="tab-name">{project.name}</span>
            <span className="tab-status-dot"></span>
          </button>
        ))}
      </div>

      {hasHiddenTabs && (
        <div className="more-wrapper">
          <button
            ref={moreButtonRef}
            className={`tab-item more-tab ${showDropdown ? "open" : ""} ${activeInHidden ? "has-active" : ""}`}
            onClick={handleMoreClick}
            type="button"
            title={`还有 ${hiddenProjects.length} 个项目`}
          >
            <span className="more-icon">•••</span>
            <span className="more-badge">{hiddenProjects.length}</span>
          </button>
          {showDropdown && (
            <div className="tabs-dropdown" role="menu" ref={dropdownRef}>
              <div className="tabs-dropdown-header">
                <span className="tabs-dropdown-title">
                  其余项目 <span className="tabs-dropdown-count">{hiddenProjects.length}</span>
                </span>
              </div>
              {hiddenProjects.length > 6 && (
                <div className="tabs-dropdown-search">
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="tabs-dropdown-search-input"
                    placeholder="搜索项目..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                  />
                </div>
              )}
              <div className="tabs-dropdown-list">
                {filteredHiddenProjects.length === 0 ? (
                  <div className="tabs-dropdown-empty">无匹配项目</div>
                ) : (
                  filteredHiddenProjects.map((project) => (
                    <button
                      key={project.id}
                      className={`dropdown-tab-item ${activeTab === project.id ? "active" : ""}`}
                      onClick={() => handleHiddenTabSelect(project.id)}
                      title={project.name}
                      role="menuitem"
                    >
                      <span className="tab-name">{project.name}</span>
                      <span className={`tab-status-dot ${project.status}`}></span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <button className="tab-item add-tab" onClick={handleAddClick} title="添加项目">
        <span className="add-icon">+</span>
        <span className="add-text">添加项目</span>
      </button>

      <ConfirmModal
        isOpen={showAddConfirm}
        title="添加新项目"
        confirmText="确认添加"
        cancelText="取消"
        confirmType="primary"
        onConfirm={handleAddConfirm}
        onCancel={handleAddCancel}
      >
        <p>确定要添加一个新项目吗？</p>
        <p className="confirm-tip">当前已有 {projects.length} 个项目，添加后共 {projects.length + 1} 个。</p>
      </ConfirmModal>
    </div>
  );
}
