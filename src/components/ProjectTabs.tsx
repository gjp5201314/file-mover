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
  return (
    <div className="tabs-container">
      <div className="tabs-list">
        {/* 项目标签列表 */}
        {projects.map((project) => (
          <button
            key={project.id}
            className={`tab-item ${activeTab === project.id ? "active" : ""} ${project.status}`}
            onClick={() => onTabSelect(project.id)}
          >
            {/* 项目名称 */}
            <span className="tab-name">{project.name}</span>
            {/* 状态指示点 */}
            <span className={`tab-status-dot ${project.status}`}></span>
          </button>
        ))}

        {/* 添加项目按钮 */}
        <button className="tab-item add-tab" onClick={onAddProject}>
          <span className="add-icon">+</span>
          <span>添加项目</span>
        </button>
      </div>
    </div>
  );
}
