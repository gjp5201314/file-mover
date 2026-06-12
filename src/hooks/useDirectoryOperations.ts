/**
 * 目录操作 Hook
 *
 * 核心职责：
 * - 提供目录选择功能（使用系统原生对话框）
 * - 获取目录内容（列出子目录和文件）
 *
 * 技术实现：
 * - 使用 @tauri-apps/plugin-dialog 打开系统原生目录选择器
 * - 通过 projectService.listDirectories 获取目录内容
 *
 * 设计考虑：
 * - 将目录操作逻辑抽取为独立 Hook，实现 UI 与业务逻辑分离
 * - 使用 useCallback 缓存函数引用，避免不必要的重渲染
 */

import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { projectService } from "../services/projectService";
import type { FileEntry } from "../types";

/**
 * 目录选择结果
 * @interface DirectorySelection
 * @property path - 选择的目录路径
 * @property entries - 目录内容（子目录和文件列表）
 */
export interface DirectorySelection {
  path: string;
  entries: FileEntry[];
}

/**
 * 目录操作 Hook
 *
 * 提供三个核心功能：
 * 1. selectSourceDirectory - 选择源目录（前端 dist 目录）
 * 2. selectTargetDirectory - 选择目标目录（Git 仓库目录）
 * 3. refreshTargetEntries - 刷新目标目录内容
 *
 * @returns 包含目录操作函数的钩子对象
 *
 * @example
 * ```tsx
 * const { selectSourceDirectory } = useDirectoryOperations();
 * const path = await selectSourceDirectory();
 * ```
 */
export function useDirectoryOperations() {
  /**
   * 基础目录选择函数
   * @description 使用系统原生对话框选择目录
   * @returns 选择的目录路径，或 null（用户取消）
   *
   * 技术细节：
   * - directory: true 表示只允许选择目录
   * - multiple: false 表示只允许选择一个目录
   */
  const selectDirectory = useCallback(async (): Promise<string | null> => {
    try {
      const selected = await open({ directory: true, multiple: false });
      return selected as string | null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, []);

  /**
   * 选择源目录
   * @description 用于选择前端 dist 文件夹
   * @returns 源目录路径，或 null
   *
   * 业务场景：
   * - 开发者本地的 build/dist 输出目录
   * - 需要部署到 Git 仓库的文件
   */
  const selectSourceDirectory = useCallback(async (): Promise<string | null> => {
    return selectDirectory();
  }, [selectDirectory]);

  /**
   * 选择目标目录
   * @description 用于选择 Git 仓库目录，同时获取目录内容
   *
   * @returns DirectorySelection 或 null
   *
   * 业务逻辑：
   * 1. 先选择目录路径
   * 2. 选择成功后，自动获取该目录的内容
   * 3. 返回目录路径和内容，供后续清空目标文件使用
   *
   * 异常处理：
   * - 获取目录内容失败时，仍返回路径但内容为空数组
   * - 这样可以避免因权限问题导致整个选择失败
   */
  const selectTargetDirectory = useCallback(async (): Promise<DirectorySelection | null> => {
    const path = await selectDirectory();
    if (!path) return null;

    try {
      const entries = await projectService.listDirectories(path);
      return { path, entries };
    } catch {
      // 即使获取内容失败，也返回路径以便用户继续操作
      return { path, entries: [] };
    }
  }, [selectDirectory]);

  /**
   * 刷新目标目录内容
   * @description 当目标目录内容发生变化时，重新获取目录列表
   *
   * @param targetPath - 目标目录路径
   * @returns FileEntry[] 目录内容，或空数组（失败时）
   *
   * 使用场景：
   * - 用户在外部修改了目标目录
   * - 需要更新"清空指定文件"选项的内容
   * - 刷新按钮触发
   */
  const refreshTargetEntries = useCallback(async (targetPath: string): Promise<FileEntry[]> => {
    try {
      return await projectService.listDirectories(targetPath);
    } catch (err) {
      console.error("获取目录失败:", err);
      return [];
    }
  }, []);

  return {
    selectSourceDirectory,
    selectTargetDirectory,
    refreshTargetEntries,
  };
}
