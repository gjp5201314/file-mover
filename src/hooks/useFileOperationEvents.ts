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
 * @property output - Git 命令的输出内容
 */
export interface GitOutput {
  cardId: string;
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
  // 存储所有取消订阅函数，用于组件卸载时清理
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  // 缓存最新的 options，解决回调中访问旧状态的问题
  // 这样可以确保事件处理器始终使用最新的回调函数
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const setupListeners = async () => {
      // 清理旧的监听器，防止重复订阅
      unlistenersRef.current.forEach((fn) => fn());
      unlistenersRef.current = [];

      // 订阅文件复制进度事件
      // 触发频率：每秒多次，取决于后端实现
      const unlistenProgress = listen<CopyProgress>("copy-progress", (event) => {
        optionsRef.current.onProgress?.(event.payload);
      });
      unlistenProgress.then((fn) => unlistenersRef.current.push(fn));

      // 订阅 Git 命令输出事件
      // 用于实时显示 git pull/push 的执行结果
      const unlistenGitOutput = listen<GitOutput>("git-output", (event) => {
        optionsRef.current.onGitOutput?.(event.payload);
      });
      unlistenGitOutput.then((fn) => unlistenersRef.current.push(fn));

      // 订阅文件操作日志事件
      // 用于显示清空目录、完成处理等关键状态
      const unlistenFileOperationLog = listen<FileOperationLog>("file-operation-log", (event) => {
        optionsRef.current.onFileOperation?.(event.payload);
      });
      unlistenFileOperationLog.then((fn) => unlistenersRef.current.push(fn));

      // 订阅错误事件
      // 统一处理来自后端的错误信息
      const unlistenError = listen<string>("error", (event) => {
        optionsRef.current.onError?.(event.payload);
      });
      unlistenError.then((fn) => unlistenersRef.current.push(fn));
    };

    setupListeners();

    // 组件卸载时清理：取消所有事件订阅
    return () => {
      unlistenersRef.current.forEach((fn) => fn());
      unlistenersRef.current = [];
    };
  }, []);
}
