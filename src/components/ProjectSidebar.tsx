import "./ProjectSidebar.css";

interface ProjectSidebarProps {
  fileOutput: string;
  gitOutput: string;
  onClearFileOutput: () => void;
  onClearGitOutput: () => void;
}

export default function ProjectSidebar({
  fileOutput,
  gitOutput,
  onClearFileOutput,
  onClearGitOutput,
}: ProjectSidebarProps) {
  return (
    <div className="project-sidebar">
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
