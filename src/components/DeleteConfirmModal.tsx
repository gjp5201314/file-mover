/**
 * DeleteConfirmModal 组件
 *
 * 删除项目确认对话框
 *
 * 功能：
 * - 显示删除确认信息
 * - 展示项目的基本信息（名称、路径）
 * - 提供确认/取消操作
 *
 * 安全提示：
 * - 说明只删除应用配置，不删除实际文件
 */

import "./DeleteConfirmModal.css";
import type { ProjectCardData } from "../types";

/**
 * DeleteConfirmModal 组件 Props
 * @interface DeleteConfirmModalProps
 */
interface DeleteConfirmModalProps {
  /** 要删除的项目数据 */
  project: ProjectCardData;
  /** 确认删除回调 */
  onConfirm: () => void;
  /** 取消删除回调 */
  onCancel: () => void;
}

/**
 * DeleteConfirmModal 组件
 *
 * @param project - 要删除的项目
 * @param onConfirm - 确认回调
 * @param onCancel - 取消回调
 */
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
