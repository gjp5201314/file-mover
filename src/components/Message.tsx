/**
 * 消息提示渲染组件
 *
 * 挂载一次在 App 根节点，监听 messageStore 实时渲染所有提示。
 * 渲染到 document.body 顶层（portal），避免被父级 overflow / z-index 限制。
 */

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { messageStore, type MessageItem, type MessageTypeValue } from "./messageApi";
import "./Message.css";

// 进入/退出动画时长（与 CSS transition 保持一致）
const ENTER_MS = 200;
const EXIT_MS = 200;

const ICONS: Record<MessageTypeValue, JSX.Element> = {
  success: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  ),
  loading: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="app-message-spin" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  ),
};

function MessageItemView({ item }: { item: MessageItem }) {
  // visible 控制进入动画；leaving 控制退出动画
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // 进入：下一帧切换到 visible，触发 CSS transition
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      messageStore.remove(item.key);
    }, EXIT_MS);
  }, [item.key, leaving]);

  // 自动关闭（loading 默认 duration=0，不自动关闭）
  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = setTimeout(() => {
      close();
      // onClose 由 MessageItemView 的卸载触发，但 antd 风格是在动画结束后触发回调
      // 这里把回调延迟到退出动画后调用更合理
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.duration, close]);

  // 退出动画结束后触发 onClose
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      item.onClose?.();
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, item]);

  return (
    <div
      className={[
        "app-message",
        `app-message-${item.type}`,
        visible ? "app-message-visible" : "",
        leaving ? "app-message-leaving" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role={item.type === "error" || item.type === "warning" ? "alert" : "status"}
      onClick={close}
      style={{ animationDuration: `${ENTER_MS}ms` }}
    >
      <span className="app-message-icon">{ICONS[item.type]}</span>
      <span className="app-message-content">{item.content}</span>
    </div>
  );
}

export default function Message() {
  const [items, setItems] = useState<MessageItem[]>([]);

  useEffect(() => {
    const unsubscribe = messageStore.subscribe((next) => {
      setItems(next);
    });
    return unsubscribe;
  }, []);

  // portal 目标：在 React 18 之前可能不存在 document.body（极早期初始化阶段）
  if (typeof document === "undefined" || items.length === 0) return null;

  return createPortal(
    <div className="app-message-container" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <MessageItemView key={item.key} item={item} />
      ))}
    </div>,
    document.body
  );
}
