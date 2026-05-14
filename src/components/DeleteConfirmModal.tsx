import "./DeleteConfirmModal.css";
import { ProjectCardData } from "./ProjectCard";

interface DeleteConfirmModalProps {
  project: ProjectCardData;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({ project, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>确认删除项目</h3>
        <p>将从列表中删除"{project.name}"。此操作只删除应用里的项目配置，不会删除源目录或目标目录中的文件。</p>
        <div className="modal-path">
          <small>源目录: {project.sourcePath || "未选择"}</small>
          <br />
          <small>目标目录: {project.targetPath || "未选择"}</small>
        </div>
        <div className="modal-actions">
          <button className="action-btn cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button className="action-btn danger-btn" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
