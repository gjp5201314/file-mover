/**
 * CommitModal 组件
 *
 * Git 提交对话框
 *
 * 功能：
 * - 显示提交信息输入框
 * - 支持两种模式：手动输入和确认模式
 * - 提供提交/取消操作
 *
 * 模式说明：
 * - 手动模式 (isManual=true): 用户需要填写 commit 消息
 * - 确认模式 (isManual=false): 使用默认消息直接确认
 */

import { useState } from "react";
import "./CommitModal.css";
import type { ProjectCardData } from "../types";

/**
 * 待提交数据
 * @interface PendingCommit
 */
interface PendingCommit {
  /** 待提交的项目 */
  card: ProjectCardData;
  /** 默认 commit 消息 */
  commitMessage: string;
}

/**
 * CommitModal 组件 Props
 * @interface CommitModalProps
 */
interface CommitModalProps {
  /** 待提交的数据 */
  pendingCommit: PendingCommit;
  /** 提交回调 */
  onCommit: (card: ProjectCardData, commitMessage: string) => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 是否为手动输入模式（默认 false） */
  isManual?: boolean;
  /** 手动模式取消回调（会更新状态） */
  onCancelWithStatus?: () => void;
}

/**
 * CommitModal 组件
 *
 * @param pendingCommit - 待提交数据
 * @param onCommit - 提交回调
 * @param onCancel - 取消回调
 * @param isManual - 是否为手动输入模式
 * @param onCancelWithStatus - 手动模式取消回调
 */
export default function CommitModal({
  pendingCommit,
  onCommit,
  onCancel,
  isManual = false,
  onCancelWithStatus,
}: CommitModalProps) {
  // Commit 消息状态
  const [commitMessage, setCommitMessage] = useState(pendingCommit.commitMessage);

  /**
   * 处理提交
   */
  const handleCommit = () => {
    onCommit(pendingCommit.card, commitMessage);
  };

  /**
   * 处理取消
   * @description 根据模式调用不同的取消回调
   */
  const handleCancel = () => {
    if (isManual && onCancelWithStatus) {
      // 手动模式取消：需要更新状态为 ready
      onCancelWithStatus();
    } else {
      // 确认模式取消：只关闭对话框
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
