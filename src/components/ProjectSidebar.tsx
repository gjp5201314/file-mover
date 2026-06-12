/**
 * ProjectSidebar 组件
 *
 * 项目侧边栏日志面板
 *
 * 功能：
 * - 显示文件操作日志（复制、清空等）
 * - 显示 Git 操作日志（pull、commit、push）
 * - 支持清空日志内容
 *
 * 布局：
 * - 垂直排列的两个日志区域
 * - 每个区域有标题和清除按钮
 * - 日志内容使用等宽字体显示
 */

import "./ProjectSidebar.css";

/**
 * ProjectSidebar 组件 Props
 * @interface ProjectSidebarProps
 */
interface ProjectSidebarProps {
  /** 文件操作日志内容 */
  fileOutput: string;
  /** Git 操作日志内容 */
  gitOutput: string;
  /** 清除文件日志回调 */
  onClearFileOutput: () => void;
  /** 清除 Git 日志回调 */
  onClearGitOutput: () => void;
}

/**
 * ProjectSidebar 组件
 *
 * @param fileOutput - 文件操作日志
 * @param gitOutput - Git 操作日志
 * @param onClearFileOutput - 清除文件日志
 * @param onClearGitOutput - 清除 Git 日志
 */
export default function ProjectSidebar({
  fileOutput,
  gitOutput,
  onClearFileOutput,
  onClearGitOutput,
}: ProjectSidebarProps) {
  return (
    <div className="project-sidebar">
      {/* 文件操作日志区域 */}
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>文件操作日志</span>
          <button className="sidebar-clear-btn" onClick={onClearFileOutput}>
            清除
          </button>
        </div>
        <div className="sidebar-content log-content">
          {fileOutput ? (
            <pre className="log-output file-log-output">{fileOutput}</pre>
          ) : (
            <div className="sidebar-empty">暂无文件操作记录</div>
          )}
        </div>
      </div>

      {/* Git 操作日志区域 */}
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Git 操作日志</span>
          <button className="sidebar-clear-btn" onClick={onClearGitOutput}>
            清除
          </button>
        </div>
        <div className="sidebar-content log-content">
          {gitOutput ? (
            <pre className="log-output">{gitOutput}</pre>
          ) : (
            <div className="sidebar-empty">暂无Git操作记录</div>
          )}
        </div>
      </div>
    </div>
  );
}
