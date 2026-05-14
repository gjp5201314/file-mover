import { useState } from "react";
import "./CommitModal.css";
import { ProjectCardData } from "./ProjectCard";

interface PendingCommit {
  card: ProjectCardData;
  commitMessage: string;
}

interface CommitModalProps {
  pendingCommit: PendingCommit;
  onCommit: (card: ProjectCardData, commitMessage: string) => void;
  onCancel: () => void;
  isManual?: boolean;
  onCancelWithStatus?: () => void;
}

export default function CommitModal({
  pendingCommit,
  onCommit,
  onCancel,
  isManual = false,
  onCancelWithStatus,
}: CommitModalProps) {
  const [commitMessage, setCommitMessage] = useState(pendingCommit.commitMessage);

  const handleCommit = () => {
    onCommit(pendingCommit.card, commitMessage);
  };

  const handleCancel = () => {
    if (isManual && onCancelWithStatus) {
      onCancelWithStatus();
    } else {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{isManual ? "输入 Commit 信息" : "确认 Git 提交"}</h3>
        <p>项目: {pendingCommit.card.name}</p>
        <div className="modal-path">
          <small>目标: {pendingCommit.card.targetPath}</small>
        </div>
        <div className="modal-commit-section">
          <label>Commit 消息:</label>
          <input
            type="text"
            className="commit-input"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button className="action-btn cancel-btn" onClick={handleCancel}>
            取消
          </button>
          <button className="action-btn confirm-btn" onClick={handleCommit}>
            {isManual ? "确认并提交" : "确认并推送"}
          </button>
        </div>
      </div>
    </div>
  );
}
