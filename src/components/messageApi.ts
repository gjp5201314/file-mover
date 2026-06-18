/**
 * 消息提示（Toast）API
 *
 * 参考 antd 的 message 组件：
 *   message.success(content, [duration], onClose)
 *   message.error(content, [duration], onClose)
 *   message.warning(content, [duration], onClose)
 *   message.info(content, [duration], onClose)
 *   message.loading(content, [duration], onClose)
 *   message.open({ type, content, duration, onClose })
 *
 * 默认 duration：
 *   - success / info : 3s
 *   - warning        : 4s
 *   - error          : 5s
 *   - loading        : 不自动关闭（0），需调用返回值的 close() 手动关闭
 *
 * 返回 MessageType，调用 .close() 可手动关闭。
 *
 * 用法：
 *   import { message } from "./messageApi";
 *   message.success("已保存");
 *   message.error("保存失败: " + err);
 *   const hide = message.loading("处理中...");
 *   // ...完成后
 *   hide.close();
 */

export type MessageTypeValue = "success" | "error" | "info" | "warning" | "loading";

export interface MessageItem {
  /** 唯一 key（自增） */
  key: number;
  /** 类型 */
  type: MessageTypeValue;
  /** 文案 */
  content: string;
  /** 自动关闭时长（毫秒）；0 表示不自动关闭 */
  duration: number;
  /** 关闭回调（自动 / 手动均触发） */
  onClose?: () => void;
}

/**
 * 简易发布订阅 store：Message 组件订阅后即可响应式渲染。
 * 单例，全局共用一份。
 */
class MessageStore {
  private items: MessageItem[] = [];
  private listeners = new Set<(items: MessageItem[]) => void>();
  private nextKey = 1;

  /** 订阅，返回取消订阅函数 */
  subscribe(listener: (items: MessageItem[]) => void): () => void {
    this.listeners.add(listener);
    // 立即同步当前快照，避免挂载顺序导致首条消息丢失
    listener(this.items);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    // 复制一份新数组，避免 React useState 浅比较失效
    this.listeners.forEach((l) => l([...this.items]));
  }

  push(
    type: MessageTypeValue,
    content: string,
    duration: number,
    onClose?: () => void
  ): number {
    const key = this.nextKey++;
    this.items.push({ key, type, content, duration, onClose });
    this.emit();
    return key;
  }

  remove(key: number) {
    const idx = this.items.findIndex((i) => i.key === key);
    if (idx < 0) return;
    this.items.splice(idx, 1);
    this.emit();
  }

  clear() {
    if (this.items.length === 0) return;
    this.items = [];
    this.emit();
  }
}

export const messageStore = new MessageStore();

export interface MessageReturn {
  close: () => void;
}

const DEFAULT_DURATIONS: Record<MessageTypeValue, number> = {
  success: 3000,
  error: 5000,
  info: 3000,
  warning: 4000,
  loading: 0,
};

function build(
  type: MessageTypeValue,
  content: string,
  duration?: number,
  onClose?: () => void
): MessageReturn {
  const finalDuration = duration ?? DEFAULT_DURATIONS[type];
  const key = messageStore.push(type, content, finalDuration, onClose);
  return {
    close: () => messageStore.remove(key),
  };
}

export const message = {
  success: (content: string, duration?: number, onClose?: () => void) =>
    build("success", content, duration, onClose),
  error: (content: string, duration?: number, onClose?: () => void) =>
    build("error", content, duration, onClose),
  info: (content: string, duration?: number, onClose?: () => void) =>
    build("info", content, duration, onClose),
  warning: (content: string, duration?: number, onClose?: () => void) =>
    build("warning", content, duration, onClose),
  loading: (content: string, duration?: number, onClose?: () => void) =>
    build("loading", content, duration ?? 0, onClose),
  open: (opts: {
    type: MessageTypeValue;
    content: string;
    duration?: number;
    onClose?: () => void;
  }) => build(opts.type, opts.content, opts.duration, opts.onClose),
};
