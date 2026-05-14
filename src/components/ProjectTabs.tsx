import "./ProjectTabs.css";

export interface ProjectTab {
  id: string;
  name: string;
  status: "idle" | "copying" | "ready" | "committing" | "done" | "error";
}

interface ProjectTabsProps {
  projects: ProjectTab[];
  activeTab: string | null;
  onTabSelect: (id: string) => void;
  onAddProject: () => void;
}

export default function ProjectTabs({ projects, activeTab, onTabSelect, onAddProject }: ProjectTabsProps) {
  return (
    <div className="tabs-container">
      <div className="tabs-list">
        {projects.map((project) => (
          <button
            key={project.id}
            className={`tab-item ${activeTab === project.id ? "active" : ""} ${project.status}`}
            onClick={() => onTabSelect(project.id)}
          >
            <span className="tab-name">{project.name}</span>
            <span className={`tab-status-dot ${project.status}`}></span>
          </button>
        ))}
        <button className="tab-item add-tab" onClick={onAddProject}>
          <span className="add-icon">+</span>
          <span>添加项目</span>
        </button>
      </div>
    </div>
  );
}
