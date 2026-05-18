/**
 * ProjectCard 组件
 *
 * 项目配置卡片（核心组件）
 *
 * 功能：
 * - 显示和编辑单个项目的所有配置
 * - 源目录和目标目录选择
 * - 部署选项设置（清空模式、提交模式等）
 * - 执行状态显示和操作按钮
 *
 * 布局区域：
 * 1. 卡片头部：项目名称（可编辑）+ 删除按钮
 * 2. 路径配置区：源目录 + 目标目录选择
 * 3. 选项区：autoPull、清空模式、提交模式
 * 4. 文件操作方式：复制/剪切
 * 5. 状态区：状态徽章 + 消息 + 进度条
 * 6. 操作区：执行按钮（根据状态显示不同按钮）
 */

import { useCallback } from "react";
import { useDirectoryOperations } from "../hooks";
import type { ProjectCardData } from "../types";
import "./ProjectCard.css";

/**
 * ProjectCard 组件 Props
 * @interface ProjectCardProps
 */
interface ProjectCardProps {
  /** 项目卡片数据 */
  card: ProjectCardData;
  /** 更新卡片回调 */
  onUpdateCard: (id: string, updates: Partial<ProjectCardData>) => void;
  /** 删除卡片回调 */
  onDeleteCard: (card: ProjectCardData) => void;
  /** 执行部署回调 */
  onExecute: (id: string) => void;
  /** 确认提交回调 */
  onConfirmCommit: (card: ProjectCardData) => void;
  /** 重置回调 */
  onReset: (id: string) => void;
  /** 切换自动监听回调 */
  onToggleAutoWatch: (id: string) => void;
  /** 当前是否正在监听 */
  watchActive: boolean;
}

/**
 * 获取状态显示文本
 * @param status - 项目状态
 * @returns 对应的中文显示文本
 */
function getStatusText(status: string): string {
  const map: Record<string, string> = {
    idle: "待执行",
    copying: "执行中",
    ready: "待确认",
    committing: "提交中",
    done: "已完成",
    error: "错误",
  };
  return map[status] || status;
}

/**
 * ProjectCard 组件
 *
 * @param card - 项目数据
 * @param onUpdateCard - 更新回调
 * @param onDeleteCard - 删除回调
 * @param onExecute - 执行回调
 * @param onConfirmCommit - 确认提交回调
 * @param onReset - 重置回调
 */
export default function ProjectCard({
  card,
  onUpdateCard,
  onDeleteCard,
  onExecute,
  onConfirmCommit,
  onReset,
  onToggleAutoWatch,
  watchActive,
}: ProjectCardProps) {
  // 使用目录操作 Hook
  const { selectSourceDirectory, selectTargetDirectory, refreshTargetEntries } = useDirectoryOperations();

  /**
   * 选择源目录
   * @description 选择前端构建输出目录
   */
  const handleSelectSource = useCallback(async () => {
    const path = await selectSourceDirectory();
    if (path) {
      onUpdateCard(card.id, { sourcePath: path, status: "idle" });
    }
  }, [card.id, onUpdateCard, selectSourceDirectory]);

  /**
   * 选择目标目录
   * @description 选择 Git 仓库目录，同时获取目录内容
   *
   * 业务逻辑：
   * 1. 选择目录路径
   * 2. 获取目录内容
   * 3. 如果是"指定文件"模式，自动选中新增的文件
   */
  const handleSelectTarget = useCallback(async () => {
    const result = await selectTargetDirectory();
    if (result) {
      const newTargetPath = result.path;
      const allEntries = result.entries;

      // 如果是指定模式，自动选中新增的条目
      // 策略：已选中的保持选中，新增的也选中
      let clearTargetFolders: string[] = [];
      if (card.clearTargetMode === "specific") {
        clearTargetFolders = allEntries
          .filter((e) => !card.clearTargetFolders.includes(e.name))
          .map((e) => e.name);
      }

      onUpdateCard(card.id, {
        targetPath: newTargetPath,
        status: "idle",
        clearTargetAllEntries: allEntries,
        clearTargetFolders,
      });
    }
  }, [card.id, card.clearTargetMode, card.clearTargetFolders, onUpdateCard, selectTargetDirectory]);

  /**
   * 清空模式变更
   * @description 切换清空目标目录的方式
   *
   * @param mode - 清空模式
   * - none: 不清空
   * - all: 清空全部
   * - specific: 指定文件（需要获取目录内容）
   */
  const handleClearTargetModeChange = useCallback((mode: "none" | "all" | "specific") => {
    if (mode === "specific") {
      if (card.targetPath) {
        // 获取目录内容供用户选择
        refreshTargetEntries(card.targetPath)
          .then((entries) => {
            const allEntries = entries;
            onUpdateCard(card.id, {
              clearTargetMode: "specific",
              clearTargetAllEntries: allEntries,
              clearTargetFolders: allEntries.map((e) => e.name), // 默认全选
            });
          })
          .catch(console.error);
      } else {
        onUpdateCard(card.id, {
          clearTargetMode: "specific",
          clearTargetAllEntries: [],
          clearTargetFolders: [],
        });
      }
    } else {
      onUpdateCard(card.id, { clearTargetMode: mode, clearTargetFolders: [] });
    }
  }, [card.targetPath, card.clearTargetFolders, card.id, onUpdateCard, refreshTargetEntries]);

  /**
   * 刷新文件夹列表
   * @description 重新获取目标目录内容，更新选中状态
   *
   * 逻辑：
   * 1. 获取最新目录内容
   * 2. 保留已选中且仍然存在的条目
   * 3. 添加新增的条目
   * 4. 排序（目录优先，然后按名称）
   */
  const handleRefreshFolders = useCallback(async () => {
    if (card.targetPath) {
      const entries = await refreshTargetEntries(card.targetPath);
      const selectedSet = new Set(card.clearTargetFolders);
      // 新增的条目：不在当前选中列表中
      const newEntries = entries.filter(
        (e) => selectedSet.has(e.name) || !card.clearTargetAllEntries.some((ex: { name: string }) => ex.name === e.name)
      );
      // 合并并去重
      const combinedAll = [...card.clearTargetAllEntries, ...newEntries].filter(
        (e, i, arr) => arr.findIndex((x) => x.name === e.name) === i
      );
      // 排序：目录优先，然后按名称
      combinedAll.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return b.isDirectory ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      onUpdateCard(card.id, {
        clearTargetAllEntries: combinedAll,
        clearTargetFolders: card.clearTargetFolders.filter((f: string) => combinedAll.some((e) => e.name === f)),
      });
    }
  }, [card.targetPath, card.clearTargetFolders, card.clearTargetAllEntries, card.id, onUpdateCard, refreshTargetEntries]);

  /**
   * 文件夹勾选变更
   * @description 切换指定文件的选中状态
   */
  const handleFolderToggle = useCallback((folderName: string, checked: boolean) => {
    const newFolders = checked
      ? [...card.clearTargetFolders, folderName]
      : card.clearTargetFolders.filter((f: string) => f !== folderName);
    onUpdateCard(card.id, { clearTargetFolders: newFolders });
  }, [card.clearTargetFolders, card.id, onUpdateCard]);

  /**
   * 项目名称变更
   */
  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateCard(card.id, { name: event.target.value });
  }, [card.id, onUpdateCard]);

  /**
   * AutoPull 开关变更
   */
  const handleAutoPullChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateCard(card.id, { autoPull: event.target.checked });
  }, [card.id, onUpdateCard]);

  /**
   * 提交模式变更
   */
  const handleCommitModeChange = useCallback((mode: "auto" | "manual" | "none") => {
    onUpdateCard(card.id, { commitMode: mode });
  }, [card.id, onUpdateCard]);

  /**
   * 文件操作方式变更
   */
  const handleMoveModeChange = useCallback((mode: "copy" | "cut") => {
    onUpdateCard(card.id, { moveMode: mode });
  }, [card.id, onUpdateCard]);

  /**
   * 切换自动监听
   */
  const handleToggleAutoWatch = useCallback(() => {
    onToggleAutoWatch(card.id);
  }, [card.id, onToggleAutoWatch]);

  // 是否正在执行（禁用操作按钮）
  const isExecuting = card.status === "copying" || card.status === "committing";

  return (
    <div className={`project-card ${card.status}`}>
      {/* 卡片头部 */}
      <div className="card-header">
        <input
          type="text"
          className="card-name-input"
          value={card.name}
          onChange={handleNameChange}
        />
        <button
          className="card-delete-btn"
          onClick={() => onDeleteCard(card)}
          disabled={isExecuting}
          title="删除项目"
        >
          x
        </button>
      </div>

      {/* 路径配置区 */}
      <div className="card-paths">
        {/* 源目录 */}
        <div className="path-section">
          <div className="section-header">源目录</div>
          <div className="path-row">
            <button className="path-btn full-width" onClick={handleSelectSource}>
              {card.sourcePath ? "更换目录" : "选择目录"}
            </button>
          </div>
          <div className="path-display" title={card.sourcePath}>
            {card.sourcePath || "未选择"}
          </div>
          <div className="section-hint">前端 dist 文件夹</div>

          {/* 自动监听 Switch */}
          <div className="auto-watch-switch-row">
            <span className="switch-label">自动监听</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={watchActive}
                onChange={handleToggleAutoWatch}
                disabled={isExecuting || !card.sourcePath}
              />
              <span className="slider"></span>
            </label>
          </div>
          {watchActive && (
            <div className="auto-watch-status">🟢 监听中，等待文件变化...</div>
          )}
        </div>

        {/* 目标目录 */}
        <div className="path-section">
          <div className="section-header">目标目录</div>
          <div className="path-row">
            <button className="path-btn full-width" onClick={handleSelectTarget}>
              {card.targetPath ? "更换目录" : "选择目录"}
            </button>
          </div>
          <div className="path-display" title={card.targetPath}>
            {card.targetPath || "未选择"}
          </div>
          <div className="section-hint">Git 仓库目录</div>

          {/* 选项 */}
          <div className="section-options">
            {/* AutoPull 选项 */}
            <div className="option-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={card.autoPull}
                  onChange={handleAutoPullChange}
                />
                <span>执行前先 git pull</span>
              </label>
            </div>

            {/* 清空模式 */}
            <div className="option-item">
              <span className="radio-group-label">操作前清空目标目录：</span>
              <div className="radio-group-inline">
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`clearTargetMode-${card.id}`}
                    value="none"
                    checked={card.clearTargetMode === "none"}
                    onChange={() => handleClearTargetModeChange("none")}
                  />
                  <span>不删除</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`clearTargetMode-${card.id}`}
                    value="all"
                    checked={card.clearTargetMode === "all"}
                    onChange={() => handleClearTargetModeChange("all")}
                  />
                  <span>全部目录</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`clearTargetMode-${card.id}`}
                    value="specific"
                    checked={card.clearTargetMode === "specific"}
                    onChange={() => handleClearTargetModeChange("specific")}
                  />
                  <span>指定文件</span>
                </label>
              </div>
            </div>

            {/* 指定文件列表 */}
            {card.clearTargetMode === "specific" && (
              <div className="folder-selection">
                <div className="folder-selection-header">
                  <span>选择要删除的文件/文件夹：</span>
                  <button className="refresh-folders-btn" onClick={handleRefreshFolders}>
                    刷新
                  </button>
                </div>
                <div className="folder-list">
                  {card.clearTargetAllEntries.length === 0 ? (
                    <div className="folder-list-empty">目标目录为空</div>
                  ) : (
                    card.clearTargetAllEntries.map((entry: { name: string; isDirectory: boolean }) => {
                      const isSelected = card.clearTargetFolders.includes(entry.name);
                      return (
                        <label
                          key={entry.name}
                          className={`folder-checkbox-label ${!isSelected ? "unselected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => handleFolderToggle(entry.name, event.target.checked)}
                          />
                          <span className="entry-icon">{entry.isDirectory ? "📁" : "📄"}</span>
                          <span>{entry.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 提交模式 */}
            <div className="option-item">
              <span className="radio-group-label">提交方式：</span>
              <div className="radio-group-inline">
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`commitMode-${card.id}`}
                    value="auto"
                    checked={card.commitMode === "auto"}
                    onChange={() => handleCommitModeChange("auto")}
                  />
                  <span>自动提交并推送</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`commitMode-${card.id}`}
                    value="manual"
                    checked={card.commitMode === "manual"}
                    onChange={() => handleCommitModeChange("manual")}
                  />
                  <span>手动填写 Commit</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`commitMode-${card.id}`}
                    value="none"
                    checked={card.commitMode === "none"}
                    onChange={() => handleCommitModeChange("none")}
                  />
                  <span>只处理文件，不提交</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 文件操作方式 */}
        <div className="path-section">
          <div className="section-header">文件操作方式</div>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name={`moveMode-${card.id}`}
                value="copy"
                checked={card.moveMode === "copy"}
                onChange={() => handleMoveModeChange("copy")}
              />
              <span>复制</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name={`moveMode-${card.id}`}
                value="cut"
                checked={card.moveMode === "cut"}
                onChange={() => handleMoveModeChange("cut")}
              />
              <span>剪切</span>
            </label>
          </div>
        </div>
      </div>

      {/* 状态区 */}
      <div className="card-status">
        <span className={`status-badge ${card.status}`}>{getStatusText(card.status)}</span>
        {card.message && <div className="status-message">{card.message}</div>}
        {card.status === "copying" && (
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${card.progress}%` }} />
          </div>
        )}
      </div>

      {/* 操作按钮区 */}
      <div className="card-actions">
        {/* idle 状态：显示开始执行 */}
        {card.status === "idle" && (
          <button
            className="action-btn execute-btn"
            onClick={() => onExecute(card.id)}
            disabled={!card.sourcePath || !card.targetPath}
          >
            开始执行
          </button>
        )}
        {/* ready 状态 + 需要提交：显示填写并提交 */}
        {card.status === "ready" && card.commitMode !== "none" && (
          <button className="action-btn confirm-btn" onClick={() => onConfirmCommit(card)}>
            填写并提交
          </button>
        )}
        {/* ready 状态 + 不提交：显示重置 */}
        {card.status === "ready" && card.commitMode === "none" && (
          <button className="action-btn reset-btn" onClick={() => onReset(card.id)}>
            重置
          </button>
        )}
        {/* done 或 error 状态：显示重置/重试 */}
        {(card.status === "done" || card.status === "error") && (
          <button className="action-btn reset-btn" onClick={() => onReset(card.id)}>
            {card.status === "error" ? "重试" : "重置"}
          </button>
        )}
        {/* copying 状态：显示执行中 */}
        {card.status === "copying" && (
          <button className="action-btn execute-btn" disabled>
            执行中...
          </button>
        )}
        {/* committing 状态：显示提交中 */}
        {card.status === "committing" && (
          <button className="action-btn confirm-btn" disabled>
            提交中...
          </button>
        )}
      </div>
    </div>
  );
}
