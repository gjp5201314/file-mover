/**
 * ConfirmModal 组件
 *
 * 通用的确认对话框组件
 *
 * 功能：
 * - 支持自定义标题、内容、按钮文本
 * - 支持不同类型的确认按钮（危险操作、成功操作等）
 * - 支持 ESC 键关闭弹窗
 * - 支持点击遮罩层关闭
 *
 * 使用场景：
 * - 删除确认
 * - 危险操作确认
 * - 重要操作确认
 * - 提交确认
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./ConfirmModal.css";

/**
 * 确认按钮类型
 */
export type ConfirmButtonType = "danger" | "primary" | "success" | "warning";

/**
 * ConfirmModal 组件 Props
 * @interface ConfirmModalProps
 */
export interface ConfirmModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 弹窗标题 */
  title: string;
  /** 弹窗内容（支持 React 节点） */
  children?: React.ReactNode;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 确认按钮类型 */
  confirmType?: ConfirmButtonType;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 是否在取消时执行某个操作 */
  onCancelWithStatus?: () => void;
}

/**
 * ConfirmModal 组件
 *
 * @param isOpen - 是否显示
 * @param title - 标题
 * @param children - 内容
 * @param confirmText - 确认按钮文本
 * @param cancelText - 取消按钮文本
 * @param confirmType - 确认按钮类型
 * @param onConfirm - 确认回调
 * @param onCancel - 取消回调
 */
export default function ConfirmModal({
  isOpen,
  title,
  children,
  confirmText = "确认",
  cancelText = "取消",
  confirmType = "primary",
  onConfirm,
  onCancel,
  onCancelWithStatus,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleCancel = () => {
    if (onCancelWithStatus) {
      onCancelWithStatus();
    } else {
      onCancel();
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <h3>{title}</h3>
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">
          <button className="action-btn cancel-btn" onClick={handleCancel}>
            {cancelText}
          </button>
          <button className={`action-btn ${confirmType}-btn`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
