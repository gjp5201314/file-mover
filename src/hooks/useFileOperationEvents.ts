/**
 * 文件操作事件监听 Hook
 *
 * 核心职责：
 * - 订阅 Tauri 后端发送的文件操作事件
 * - 提供进度、Git输出、文件操作日志的实时回调
 *
 * 事件流设计：
 * - copy-progress: 文件复制进度更新（实时反馈）
 * - git-output: Git 命令输出（用于日志显示）
 * - file-operation-log: 文件操作日志（清空、完成等状态）
 * - error: 错误通知（统一错误处理）
 *
 * 使用场景：
 * - 在 ProjectContext 中订阅，实现文件操作的实时 UI 反馈
 * - 通过回调函数将事件数据传递给调用方
 */

import { useEffect, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/**
 * 文件复制进度数据
 * @interface CopyProgress
 * @property current - 当前已处理文件数
 * @property total - 文件总数
 * @property currentFile - 当前处理的文件名（用于显示正在处理的文件）
 * @property cardId - 关联的项目卡片 ID（用于多项目状态隔离）
 */
export interface CopyProgress {
  current: number;
  total: number;
  currentFile: string;
  cardId: string;
}

/**
 * Git 命令输出数据
 * @interface GitOutput
 * @property cardId - 关联的项目卡片 ID
 * @property command - Git 命令名（如 "git pull" / "git add" / "git commit" / "git push"），
 *                    前端据此把同一条命令的输出折叠成一组可展开的记录
 * @property output - Git 命令的输出内容
 */
export interface GitOutput {
  cardId: string;
  command: string;
  output: string;
}

/**
 * 文件操作日志数据
 * @interface FileOperationLog
 * @property cardId - 关联的项目卡片 ID
 * @property operation - 操作类型：clear(清空)/complete(完成)/其他状态
 * @property message - 日志消息内容
 */
export interface FileOperationLog {
  cardId: string;
  operation: string;
  message: string;
}

/**
 * 监听触发事件数据
 * @interface WatchTrigger
 * @property cardId - 触发的项目卡片 ID（backend 检测到文件变化后发送）
 */
export interface WatchTrigger {
  cardId: string;
}

/**
 * Hook 配置选项
 * @interface UseFileOperationEventsOptions
 * @description 所有回调函数都是可选的，按需订阅
 */
export interface UseFileOperationEventsOptions {
  /** 文件复制进度回调 - 实时更新进度条 */
  onProgress?: (progress: CopyProgress) => void;
  /** Git 命令输出回调 - 显示 git pull/push 的输出 */
  onGitOutput?: (output: GitOutput) => void;
  /** 文件操作日志回调 - 显示清空目录、完成处理等状态 */
  onFileOperation?: (log: FileOperationLog) => void;
  /** 错误回调 - 统一处理所有错误 */
  onError?: (error: string) => void;
  /** 监听触发回调 - 后台检测到源目录文件变化时触发 */
  onWatchTrigger?: (trigger: WatchTrigger) => void;
}

/**
 * 文件操作事件监听 Hook
 *
 * 设计说明：
 * 1. 使用 useRef 缓存 options 以避免 effect 依赖问题
 * 2. 在 useEffect 中设置事件监听，支持热更新
 * 3. 组件卸载时自动清理所有监听器，防止内存泄漏
 * 4. 返回值用于订阅和取消订阅事件
 *
 * @param options - 事件回调配置
 * @returns void
 *
 * @example
 * ```tsx
 * useFileOperationEvents({
 *   onProgress: (p) => console.log(`进度: ${p.current}/${p.total}`),
 *   onError: (e) => showError(e)
 * });
 * ```
 */
export function useFileOperationEvents(options: UseFileOperationEventsOptions) {
  // 缓存最新的 options，解决回调中访问旧状态的问题
  // 这样可以确保事件处理器始终使用最新的回调函数
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // 用本地变量而不是 ref 来追踪本次 effect 的订阅，
    // 避免在 React StrictMode 下双调用 effect 时与上一份的 cleanup 互相覆盖。
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    /**
     * 注册单个 Tauri 事件监听器。
     * @description
     * - listener 内部用闭包检查 `cancelled`，StrictMode 下被作废的 effect
     *   即使在 await 之后才完成注册，也不会处理任何事件。
     * - 注册完成后再判断一次 `cancelled`：若已被 cleanup，则立即反注册；
     *   否则将 unlisten 推入待清理列表。
     */
    const subscribe = async <T>(
      event: string,
      handler: (payload: T) => void,
    ): Promise<void> => {
      const unlisten = await listen<T>(event, (e) => {
        if (cancelled) return;
        handler(e.payload);
      });
      if (cancelled) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    };

    // 并行订阅所有事件，缩短 setup 耗时
    void Promise.all([
      subscribe<CopyProgress>("copy-progress", (payload) => {
        optionsRef.current.onProgress?.(payload);
      }),
      subscribe<GitOutput>("git-output", (payload) => {
        optionsRef.current.onGitOutput?.(payload);
      }),
      subscribe<FileOperationLog>("file-operation-log", (payload) => {
        optionsRef.current.onFileOperation?.(payload);
      }),
      subscribe<string>("error", (payload) => {
        optionsRef.current.onError?.(payload);
      }),
      subscribe<WatchTrigger>("watch-trigger", (payload) => {
        optionsRef.current.onWatchTrigger?.(payload);
      }),
    ]);

    // 组件卸载或 effect 清理：作废本次订阅，移除已注册的监听器
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
      unlisteners.length = 0;
    };
  }, []);
}
