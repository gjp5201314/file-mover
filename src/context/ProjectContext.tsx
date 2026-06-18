/**
 * 项目状态管理 Context
 *
 * 核心职责：
 * - 管理所有项目卡片的状态（CRUD 操作）
 * - 处理文件部署流程的协调
 * - 管理 Git 提交流程
 * - 处理配置导入/导出
 *
 * 设计模式：
 * - React Context：提供全局状态访问
 * - Provider Pattern：包裹应用，提供状态和方法
 * - Hook Pattern：useProject() 获取上下文
 *
 * 状态管理：
 * - cards: 项目卡片列表
 * - activeTab: 当前选中的项目标签
 * - projectLogs: 各项目的操作日志
 * - pendingDelete/pendingCommit: 待确认操作
 *
 * 事件监听：
 * - 订阅 useFileOperationEvents 获取后端事件
 * - 实时更新进度和日志
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ProjectCardData } from "../types";
import { projectService } from "../services/projectService";
import { message } from "../components/messageApi";
import { useFileOperationEvents, CopyProgress, GitOutput, FileOperationLog, WatchTrigger } from "../hooks/useFileOperationEvents";

/**
 * 单条 Git 日志条目
 * @interface GitLogEntry
 * @description 每条对应一次后端发来的 git-output 事件。
 * 是否展开是 UI 关注点，由 ProjectSidebar 在本地维护，Context 只保存原始数据。
 */
export interface GitLogEntry {
  /** 唯一 ID，用于 React key 与折叠状态匹配 */
  id: string;
  /** 事件发生时间，格式 YYYY-MM-DD HH:mm:ss */
  timestamp: string;
  /** Git 命令名，例如 "git pull" */
  command: string;
  /** 命令的完整输出 */
  content: string;
}

/**
 * 项目日志数据
 * @interface ProjectLogs
 * @property fileOutput - 文件操作日志（复制、清空等）
 * @property gitEntries - Git 操作日志条目列表（按时间倒序，最新在前）
 */
interface ProjectLogs {
  fileOutput: string;
  gitEntries: GitLogEntry[];
}

/**
 * 待提交的提交信息
 * @interface PendingCommit
 * @description 用于手动提交模式，存储待提交的项目和消息
 */
interface PendingCommit {
  card: ProjectCardData;
  commitMessage: string;
}

/**
 * Context 值类型定义
 * @interface ProjectContextValue
 *
 * 提供给子组件的所有状态和方法
 */
interface ProjectContextValue {
  // ========== 状态 ==========
  /** 项目卡片列表 */
  cards: ProjectCardData[];
  /** 当前选中的项目卡片 */
  activeCard: ProjectCardData | null;
  /** 当前激活的标签页 ID */
  activeTab: string | null;
  /** 标签页切换回调 */
  setActiveTab: (id: string | null) => void;
  /** 各项目的操作日志 */
  projectLogs: Record<string, ProjectLogs>;

  // ========== 项目 CRUD ==========
  /** 添加新项目 */
  addCard: () => Promise<void>;
  /** 更新项目配置 */
  updateCard: (id: string, updates: Partial<ProjectCardData>) => Promise<void>;
  /** 请求删除项目（显示确认对话框） */
  deleteCard: (card: ProjectCardData) => void;
  /** 确认删除项目 */
  confirmDeleteCard: () => Promise<void>;

  // ========== 执行流程 ==========
  /** 执行项目部署 */
  executeCard: (id: string) => Promise<void>;
  /** 停止正在执行的项目 */
  stopCard: (id: string) => Promise<void>;
  /** 请求提交（显示确认对话框） */
  confirmCommit: (card: ProjectCardData) => void;
  /** 重置项目状态 */
  resetCard: (id: string) => Promise<void>;
  /** 清除项目日志 */
  clearProjectLogs: (cardId: string, logType?: 'file' | 'git' | 'all') => void;

  // ========== 删除确认模态框 ==========
  /** 待删除的项目 */
  pendingDelete: ProjectCardData | null;
  /** 设置待删除项目 */
  setPendingDelete: (card: ProjectCardData | null) => void;

  // ========== 提交相关 ==========
  /** 待提交的数据 */
  pendingCommit: PendingCommit | null;
  /** 是否显示手动提交模态框 */
  showManualCommitModal: boolean;
  /** 是否显示提交确认模态框 */
  showConfirmModal: boolean;
  /** 设置待提交数据 */
  setPendingCommit: (commit: PendingCommit | null) => void;
  /** 显示手动提交模态框 */
  setShowManualCommitModal: (show: boolean) => void;
  /** 显示确认模态框 */
  setShowConfirmModal: (show: boolean) => void;
  /** 执行确认提交 */
  executeCommit: () => Promise<void>;
  /** 执行手动提交 */
  executeManualCommit: () => Promise<void>;
  /** 取消手动提交 */
  handleManualCommitCancel: () => void;

  // ========== 配置导入/导出 ==========
  /** 导入配置（同时导入项目和网站项目） */
  importConfig: () => Promise<void>;
  /** 导出配置（同时导出项目和网站项目） */
  exportConfig: () => Promise<void>;

  // ========== 自动监听 ==========
  /** 各项目的监听状态（true=正在监听） */
  watchStates: Record<string, boolean>;
  /** 切换自动监听 */
  toggleAutoWatch: (id: string) => Promise<void>;
}

/**
 * 创建 Context（初始值为 null）
 * @description 实际值由 Provider 提供
 */
const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * 格式化时间戳
 * @description 生成日志中使用的格式化时间字符串
 * @returns 格式：YYYY-MM-DD HH:mm:ss
 *
 * 示例输出：2024-01-15 14:30:45
 */
function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 生成唯一 ID
 * @description 与 projectService.generateId 保持一致
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.getRandomValues(new Uint8Array(8))
    .reduce((str, byte) => str + byte.toString(36).padStart(2, '0'), '');
  return `${timestamp}_${randomPart}`;
}

/**
 * 项目状态 Provider
 *
 * 核心组件，提供全局状态和操作方法
 *
 * @param children - 子组件
 *
 * @example
 * ```tsx
 * <ProjectProvider>
 *   <App />
 * </ProjectProvider>
 * ```
 */
export function ProjectProvider({ children }: { children: React.ReactNode }) {
  // ========== 状态定义 ==========
  const [cards, setCards] = useState<ProjectCardData[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [projectLogs, setProjectLogs] = useState<Record<string, ProjectLogs>>({});
  const [pendingDelete, setPendingDelete] = useState<ProjectCardData | null>(null);
  const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);
  const [showManualCommitModal, setShowManualCommitModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [watchStates, setWatchStates] = useState<Record<string, boolean>>({});
  const [lastExecutionTime, setLastExecutionTime] = useState<Record<string, number>>({});

  // 使用 ref 保持对最新 cards 的引用
  // 解决异步回调中访问旧状态的问题
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  // 使用 ref 保持对最新 lastExecutionTime 的引用
  const lastExecutionTimeRef = useRef(lastExecutionTime);
  lastExecutionTimeRef.current = lastExecutionTime;

  // ========== 初始化 ==========
  useEffect(() => {
    loadInitialData();
  }, []);

  // ========== 标签页自动切换 ==========
  // 逻辑：
  // - 有卡片且未选择标签 -> 选择第一个
  // - 有卡片但当前标签不存在 -> 选择第一个
  // - 没有卡片 -> 清空标签
  useEffect(() => {
    if (cards.length > 0 && !activeTab) {
      setActiveTab(cards[0].id);
    } else if (cards.length > 0 && !cards.find((c) => c.id === activeTab)) {
      setActiveTab(cards[0].id);
    } else if (cards.length === 0) {
      setActiveTab(null);
    }
  }, [cards, activeTab]);

  // 组件卸载时停止所有监听
  useEffect(() => {
    return () => {
      projectService.stopAllWatches();
    };
  }, []);

  // ========== 事件监听 ==========
  // 订阅后端事件，实时更新 UI
  useFileOperationEvents({
    // 进度更新：计算百分比并更新卡片状态
    onProgress: useCallback((progress: CopyProgress) => {
      const { current, total, currentFile, cardId } = progress;
      const progressValue = total > 0 ? (current / total) * 100 : 0;

      // 更新卡片进度和消息
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, progress: progressValue, message: `正在处理文件: ${currentFile}` }
            : card
        )
      );

      // 追加文件操作日志（最新日志显示在最上方）
      // 格式：[时间戳] [当前/总数] 文件名
      setProjectLogs((prev) => ({
        ...prev,
        [cardId]: {
          ...prev[cardId],
          fileOutput: `[${formatTimestamp()}] [${current}/${total}] ${currentFile}\n` + (prev[cardId]?.fileOutput || ""),
        },
      }));
    }, []),

    // Git 输出：作为一条记录插入到列表顶部
    // 是否展开是 UI 关注点，由 ProjectSidebar 在本地维护
    onGitOutput: useCallback((output: GitOutput) => {
      const { cardId, command, output: outputText } = output;
      setProjectLogs((prev) => {
        const existing = prev[cardId]?.gitEntries || [];
        const newEntry: GitLogEntry = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: formatTimestamp(),
          command,
          content: outputText,
        };
        return {
          ...prev,
          [cardId]: {
            ...prev[cardId],
            gitEntries: [newEntry, ...existing],
          },
        };
      });
    }, []),

    // 文件操作日志：清空、完成等状态
    onFileOperation: useCallback((log: FileOperationLog) => {
      const { cardId, operation, message } = log;
      // 根据操作类型选择图标
      // clear: 垃圾桶（清空操作）
      // complete: 对勾（完成）
      // 其他: 信息图标
      const operationIcon = operation === "clear" ? "🗑️" : operation === "complete" ? "✅" : "ℹ️";
      setProjectLogs((prev) => ({
        ...prev,
        [cardId]: {
          ...prev[cardId],
          fileOutput: `[${formatTimestamp()}] ${operationIcon} ${message}\n\n` + (prev[cardId]?.fileOutput || ""),
        },
      }));
    }, []),

    // 错误处理
    onError: useCallback((error: string) => {
      console.error("Error:", error);
    }, []),

    // 监听触发：后端检测到源目录文件变化后自动执行部署
    onWatchTrigger: useCallback((trigger: WatchTrigger) => {
      const cardId = trigger.cardId;
      
      const card = cardsRef.current.find((c) => c.id === cardId);
      
      if (card && card.autoWatch) {
        const currentCard = cardsRef.current.find((c) => c.id === cardId);
        
        if (currentCard && (currentCard.status === "copying" || currentCard.status === "committing")) {
          return;
        }
        
        const now = Date.now();
        const lastTime = lastExecutionTimeRef.current[cardId] || 0;
        const cooldown = 10000; // 10秒冷却时间
        
        if (now - lastTime < cooldown) {
          return;
        }
        
        executeCardRef.current(cardId);
      }
    }, []),
  });

  // ========== 数据加载 ==========
  /**
   * 加载初始数据
   * @description 从后端加载保存的项目配置
   */
  const loadInitialData = async () => {
    const { projects } = await projectService.loadConfig();
    setCards(projects);
  };

  // ========== 项目 CRUD ==========
  /**
   * 添加新项目
   * @description 创建空白项目卡片并保存
   *
   * 默认配置：
   * - autoPull: true（安全考虑）
   * - moveMode: copy（避免误操作）
   * - commitMode: auto（自动化部署）
   */
  const addCard = async () => {
    const newCard: ProjectCardData = {
      id: generateId(),
      name: `项目 ${cards.length + 1}`,
      sourcePath: "",
      targetPath: "",
      autoPull: true,
      moveMode: "copy",
      clearTargetMode: "none",
      clearTargetFolders: [],
      clearTargetAllEntries: [],
      commitMode: "auto",
      autoWatch: false,
      status: "idle",
      message: "",
      progress: 0,
    };
    const updatedCards = [...cards, newCard];
    setCards(updatedCards);
    await projectService.saveConfig(updatedCards);
  };

  /**
   * 更新项目配置
   * @description 局部更新项目数据并保存
   *
   * @param id - 项目 ID
   * @param updates - 要更新的字段
   */
  const updateCard = async (id: string, updates: Partial<ProjectCardData>) => {
    const updatedCards = cards.map((card) =>
      card.id === id ? { ...card, ...updates } : card
    );
    setCards(updatedCards);
    await projectService.saveConfig(updatedCards);
  };

  /**
   * 请求删除项目
   * @description 设置待删除项目，显示确认对话框
   */
  const deleteCard = (card: ProjectCardData) => {
    setPendingDelete(card);
  };

  /**
   * 确认删除项目
   * @description 从列表中移除并保存
   */
  const confirmDeleteCard = async () => {
    if (!pendingDelete) return;

    // 如果该项目正在被监听，先停止监听
    if (watchStates[pendingDelete.id]) {
      try {
        await projectService.stopWatch(pendingDelete.id);
      } catch (err) {
        console.error("停止监听失败:", err);
      }
    }

    const updatedCards = cards.filter((card) => card.id !== pendingDelete.id);
    setCards(updatedCards);
    await projectService.saveConfig(updatedCards);
    setPendingDelete(null);
  };

  // ========== 部署执行 ==========
  /**
   * 执行项目部署
   * @description 完整的部署流程协调
   *
   * 执行步骤：
   * 1. 验证目录选择
   * 2. 可选：git pull
   * 3. 清空目标目录
   * 4. 复制源文件到目标
   * 5. 可选：git commit & push
   *
   * @param id - 项目 ID
   */
  const executeCard = async (id: string) => {
    const card = cards.find((item) => item.id === id);
    if (!card) return;

    // 验证目录配置
    if (!card.sourcePath || !card.targetPath) {
      await updateCard(id, { status: "error", message: "请先选择源目录和目标目录" });
      return;
    }

    // 清除取消标志，确保可以重新执行
    await projectService.clearCancellation(id);

    // 记录执行开始时间，用于冷却机制
    setLastExecutionTime((prev) => ({ ...prev, [id]: Date.now() }));

    await updateCard(id, { status: "copying", progress: 0, message: "准备执行部署流程..." });

    try {
      // 步骤 1：Git Pull（如果启用）
      if (card.autoPull) {
        await updateCard(id, { status: "copying", progress: 0, message: "正在执行 git pull..." });
        await projectService.gitPull(card.targetPath, id);
      }

      // 步骤 2：清空目标并复制文件
      await updateCard(id, {
        status: "copying",
        progress: 0,
        message: card.clearTargetMode !== "none" ? "正在清空目标目录并处理文件..." : "正在处理文件...",
      });
      await projectService.copyAndPrepare({
        source: card.sourcePath,
        target: card.targetPath,
        autoPull: false, // 已在上面处理过
        moveMode: card.moveMode,
        clearTargetMode: card.clearTargetMode,
        clearTargetFolders: card.clearTargetFolders,
        cardId: id,
      });

      // 步骤 3：Git Commit & Push
      if (card.commitMode === "auto") {
        // 自动提交模式
        await updateCard(id, { status: "committing", progress: 100, message: "正在提交并推送到远程仓库..." });
        const commitMessage = `${card.name} - ${new Date().toLocaleString()}`;
        try {
          await projectService.gitCommitPush(card.targetPath, commitMessage, id);
          await updateCard(id, { status: "done", progress: 100, message: "部署完成，已提交并推送。" });
        } catch (err) {
          await updateCard(id, { status: "error", message: `提交失败: ${err}` });
        }
      } else if (card.commitMode === "manual") {
        // 手动提交模式：显示提交对话框
        const defaultMessage = `${card.name} - ${new Date().toLocaleString()}`;
        await updateCard(id, { status: "ready", message: "文件处理完成，等待填写 Commit 信息。", progress: 100 });
        setPendingCommit({ card, commitMessage: defaultMessage });
        setShowManualCommitModal(true);
      } else {
        // 不提交模式
        await updateCard(id, { status: "ready", message: "文件处理完成，未执行 Git 提交。", progress: 100 });
      }
    } catch (err) {
      await updateCard(id, { status: "error", message: `失败: ${err}` });
    }
  };

  /**
   * 停止正在执行的项目
   * @description 向后端发送停止信号，终止正在执行的操作
   *
   * @param id - 项目 ID
   */
  const stopCard = async (id: string) => {
    try {
      await projectService.stopOperation(id);
      await projectService.clearCancellation(id);
      await updateCard(id, { status: "idle", message: "操作已停止", progress: 0 });
    } catch (err) {
      await updateCard(id, { status: "idle", message: "停止失败", progress: 0 });
    }
  };

  // 使用 ref 保持对最新 executeCard 的引用
  // 解决 onWatchTrigger 回调中访问旧函数的问题
  const executeCardRef = useRef(executeCard);
  executeCardRef.current = executeCard;

  /**
   * 请求提交（确认模式）
   * @description 用于 ready 状态后的提交确认
   */
  const confirmCommit = (card: ProjectCardData) => {
    setPendingCommit({ card, commitMessage: `${card.name} - ${new Date().toLocaleString()}` });
    setShowConfirmModal(true);
  };

  /**
   * 执行提交（确认模式）
   * @description 从确认对话框触发的提交
   */
  const executeCommit = async () => {
    if (!pendingCommit) return;

    const { card, commitMessage } = pendingCommit;
    setShowConfirmModal(false);

    await updateCard(card.id, { status: "committing", message: "正在提交并推送到远程仓库..." });

    try {
      await projectService.gitCommitPush(card.targetPath, commitMessage, card.id);
      await updateCard(card.id, { status: "done", message: "部署完成，已提交并推送。" });
    } catch (err) {
      await updateCard(card.id, { status: "error", message: `提交失败: ${err}` });
    }
  };

  /**
   * 执行手动提交
   * @description 从手动提交模态框触发的提交
   */
  const executeManualCommit = async () => {
    if (!pendingCommit) return;

    const { card, commitMessage } = pendingCommit;
    setShowManualCommitModal(false);

    await updateCard(card.id, { status: "committing", message: "正在提交并推送到远程仓库..." });

    try {
      await projectService.gitCommitPush(card.targetPath, commitMessage, card.id);
      await updateCard(card.id, { status: "done", message: "部署完成，已提交并推送。" });
    } catch (err) {
      await updateCard(card.id, { status: "error", message: `提交失败: ${err}` });
    }
  };

  /**
   * 重置项目状态
   * @description 恢复到初始状态，清除取消标志以便重新执行
   */
  const resetCard = async (id: string) => {
    await projectService.clearCancellation(id);
    await updateCard(id, { status: "idle", message: "", progress: 0 });
  };

  /**
   * 清除项目日志
   * @description 清空指定项目的日志输出
   * @param cardId - 项目 ID
   * @param logType - 日志类型：'file' | 'git' | 'all'（默认 'all'）
   */
  const clearProjectLogs = (cardId: string, logType: 'file' | 'git' | 'all' = 'all') => {
    setProjectLogs((prev) => ({
      ...prev,
      [cardId]: {
        fileOutput: logType === 'git' ? (prev[cardId]?.fileOutput || "") : "",
        gitEntries: logType === 'file' ? (prev[cardId]?.gitEntries || []) : [],
      },
    }));
  };

  /**
   * 取消手动提交
   * @description 关闭模态框并更新状态为 ready
   */
  const handleManualCommitCancel = () => {
    if (pendingCommit) {
      updateCard(pendingCommit.card.id, { status: "ready", message: "文件处理完成，等待提交。", progress: 100 });
    }
    setShowManualCommitModal(false);
  };

  // ========== 自动监听 ==========
  /**
   * 切换自动监听
   * @description 开启/关闭对打包目录的文件变化监听
   *
   * 开启流程：
   * 1. 检查源目录是否已配置
   * 2. 调用后端 start_watch 启动文件监听
   * 3. 更新 watchStates 状态
   *
   * 关闭流程：
   * 1. 调用后端 stop_watch 停止监听
   * 2. 更新 watchStates 状态
   */
  const toggleAutoWatch = async (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;

    if (watchStates[id]) {
      try {
        await projectService.stopWatch(id);
        setWatchStates((prev) => ({ ...prev, [id]: false }));
        await updateCard(id, { autoWatch: false, message: "" });
      } catch (err) {
        console.error("停止监听失败:", err);
      }
    } else {
      if (!card.sourcePath) {
        await updateCard(id, { status: "error", message: "请先选择源目录" });
        return;
      }
      if (!card.targetPath) {
        await updateCard(id, { status: "error", message: "请先选择目标目录" });
        return;
      }
      try {
        await projectService.startWatch(id, card.sourcePath, card.targetPath);
        setWatchStates((prev) => ({ ...prev, [id]: true }));
        await updateCard(id, { autoWatch: true, status: "idle", message: "自动监听已开启，等待文件更新..." });
      } catch (err) {
        await updateCard(id, { status: "error", message: `开启监听失败: ${err}` });
      }
    }
  };

  // ========== 配置导入/导出 ==========
  /**
   * 导入配置
   * @description 通过文件选择器导入 JSON 配置（同时导入项目和网站项目）
   *
   * 流程：
   * 1. 创建隐藏的文件输入框
   * 2. 用户选择 JSON 文件
   * 3. 解析文件内容
   * 4. 合并到现有项目列表
   * 5. 保存到后端
   */
  const importConfig = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const { projects: importedProjects, websiteProjects: importedWebsiteProjects } = projectService.parseImportConfig(text, cards.length);
        const updatedCards = [...cards, ...importedProjects];
        setCards(updatedCards);
        await projectService.saveConfig(updatedCards, importedWebsiteProjects);
        let msg = `成功导入 ${importedProjects.length} 个部署项目`;
        if (importedWebsiteProjects.length > 0) {
          msg += ` 和 ${importedWebsiteProjects.length} 个网站项目`;
        }
        message.success(msg);
      } catch (err) {
        message.error(`导入失败: ${err}`);
      }
    };
    input.click();
  };

  /**
   * 导出配置
   * @description 导出当前配置到 JSON 文件（同时导出项目和网站项目）
   */
  const exportConfig = async () => {
    try {
      const { websiteProjects } = await projectService.loadConfig();
      await projectService.exportConfig(cards, websiteProjects);
    } catch (err) {
      console.error("导出失败:", err);
      message.error(`导出失败: ${err}`);
    }
  };

  // 计算当前活动的项目卡片
  const activeCard = activeTab ? cards.find((c) => c.id === activeTab) ?? null : null;

  // 构建 Context 值
  const value: ProjectContextValue = {
    cards,
    activeCard,
    activeTab,
    setActiveTab,
    projectLogs,
    addCard,
    updateCard,
    deleteCard,
    confirmDeleteCard,
    executeCard,
    stopCard,
    confirmCommit,
    resetCard,
    clearProjectLogs,
    pendingDelete,
    setPendingDelete,
    pendingCommit,
    showManualCommitModal,
    showConfirmModal,
    setPendingCommit,
    setShowManualCommitModal,
    setShowConfirmModal,
    executeCommit,
    executeManualCommit,
    handleManualCommitCancel,
    toggleAutoWatch,
    watchStates,
    importConfig,
    exportConfig,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

/**
 * 使用项目 Context
 * @description 获取项目状态管理的上下文
 *
 * @throws Error - 如果不在 ProjectProvider 内使用
 *
 * @example
 * ```tsx
 * const { cards, executeCard } = useProject();
 * ```
 */
export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
