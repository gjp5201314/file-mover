/**
 * 项目配置服务
 *
 * 核心职责：
 * - 与 Tauri 后端通信，执行项目配置相关的 CRUD 操作
 * - 处理项目数据的加载、保存、导入和导出
 *
 * 与后端的交互：
 * - load_app_config: 从后端存储加载项目配置
 * - save_app_config: 保存项目配置到后端存储
 * - copy_and_prepare: 执行文件复制和准备工作
 * - git_pull: 执行 Git pull 操作
 * - git_commit_push: 执行 Git commit 和 push
 * - list_directories: 列出目录内容
 * - write_text_file: 写入文本文件（用于导出）
 *
 * 数据迁移说明：
 * - 支持从旧版本配置格式迁移
 * - 旧版本使用 clearTarget (boolean)，新版本使用 clearTargetMode (enum)
 * - 自动进行兼容性处理
 */

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { FileEntry, ProjectCardData } from "../types";
import type { WebsiteProject } from "../types/project";

/**
 * 原始文件条目格式
 * @description 后端返回的文件条目可能为字符串或对象
 * @example
 * - "folderName" (字符串格式，旧版本兼容)
 * - { name: "folderName", isDirectory: true } (对象格式)
 */
interface RawFileEntry {
  name?: string;
  isDirectory?: boolean;
}

/**
 * 应用配置结构（存储格式）
 * @interface AppConfig
 * @property version - 配置版本号，用于未来升级兼容
 * @property updatedAt - 最后更新时间
 * @property exportedAt - 导出时间
 * @property projects - 项目列表
 * @property websiteProjects - 网站项目列表
 */
export interface AppConfig {
  version?: string;
  updatedAt?: string;
  exportedAt?: string;
  projects: ProjectCardData[];
  websiteProjects?: WebsiteProject[];
}

/**
 * 导入的项目数据格式
 * @description JSON 配置文件中的项目数据结构
 *
 * 字段命名说明：
 * - sourcePath/targetPath: 源目录和目标目录路径
 * - autoPull: 是否自动执行 git pull
 * - autoCommit: 旧字段，已被 commitMode 替代
 * - moveMode: "copy" | "cut" - 文件操作方式
 * - clearTarget: 旧字段，已被 clearTargetMode 替代
 * - clearTargetMode: 清空目标目录的模式
 * - clearTargetFolders: 要清空的文件夹列表
 * - clearTargetAllEntries: 目标目录的所有条目
 * - commitMode: 提交模式 auto/manual/none
 */
export interface ImportedProject {
  name?: string;
  sourcePath?: string;
  targetPath?: string;
  autoPull?: boolean;
  autoCommit?: boolean;
  moveMode?: "copy" | "cut";
  clearTarget?: boolean;
  clearTargetMode?: "none" | "all" | "specific";
  clearTargetFolders?: string[];
  clearTargetAllEntries?: RawFileEntry[];
  commitMode?: "auto" | "manual" | "none";
}

/**
 * 导出配置结构（JSON 格式）
 * @description 导出到文件的项目配置格式
 */
export interface ExportConfig {
  version: string;
  exportedAt: string;
  projects: Array<{
    name: string;
    sourcePath: string;
    targetPath: string;
    autoPull: boolean;
    moveMode: "copy" | "cut";
    clearTargetMode: "none" | "all" | "specific";
    clearTargetFolders: string[];
    clearTargetAllEntries: Array<{ name: string; isDirectory: boolean }>;
    commitMode: "auto" | "manual" | "none";
  }>;
  websiteProjects?: Array<{
    id: string;
    name: string;
    websiteUrl: string;
    gitUrl: string;
    environments: Array<{
      name: string;
      websiteUrl: string;
    }>;
    credentials: Array<{
      id: string;
      label: string;
      username: string;
      password: string;
    }>;
  }>;
}

/**
 * 项目服务对象
 * @description 提供所有项目配置相关的操作
 */
export const projectService = {
  /**
   * 加载项目配置
   * @description 从后端存储加载项目列表
   *
   * 数据转换逻辑：
   * 1. 检查配置是否存在且格式正确
   * 2. 对旧版本配置进行迁移：
   *    - clearTarget (boolean) -> clearTargetMode (enum)
   *    - 处理字符串格式的 entry（兼容旧数据）
   *
   * @returns Promise<{ projects: ProjectCardData[], websiteProjects: WebsiteProject[] }> 项目配置
   *
   * 错误处理：
   * - 配置不存在或格式错误时返回空数组
   * - 捕获错误并记录，不抛出异常
   */
  async loadConfig(): Promise<{ projects: ProjectCardData[]; websiteProjects: WebsiteProject[] }> {
    try {
      const config = await invoke<AppConfig | null>("load_app_config");
      if (!config) {
        return { projects: [], websiteProjects: [] };
      }
      // 数据迁移：处理版本兼容性和类型转换
      const projects = (config.projects || []).map((project: any) => ({
        ...project,
        clearTargetMode: project.clearTargetMode || (project.clearTarget ? "all" : "none"),
        clearTargetFolders: project.clearTargetFolders || [],
        clearTargetAllEntries: (project.clearTargetAllEntries || []).map((e: RawFileEntry): FileEntry => ({
          name: typeof e === 'string' ? e : (e.name || String(e)),
          isDirectory: e.isDirectory ?? true
        })),
      }));
      const websiteProjects: WebsiteProject[] = config.websiteProjects || [];
      return { projects, websiteProjects };
    } catch (err) {
      console.error("加载配置失败:", err);
      return { projects: [], websiteProjects: [] };
    }
  },

  /**
   * 保存项目配置
   * @description 将项目列表保存到后端存储
   *
   * @param projects - 要保存的项目列表
   * @param websiteProjects - 要保存的网站项目列表（可选）
   * @returns Promise<void>
   *
   * 调用时机：
   * - 添加新项目后
   * - 更新项目配置后
   * - 删除项目后
   */
  async saveConfig(projects: ProjectCardData[], websiteProjects?: WebsiteProject[]): Promise<void> {
    const config: AppConfig = {
      version: "1.0",
      updatedAt: new Date().toISOString(),
      projects,
      websiteProjects,
    };
    await invoke("save_app_config", { config });
  },

  /**
   * 保存网站项目配置
   * @description 将网站项目列表保存到后端存储
   *
   * @param websiteProjects - 要保存的网站项目列表
   * @returns Promise<void>
   */
  async saveWebsiteProjects(websiteProjects: WebsiteProject[]): Promise<void> {
    const config: AppConfig = {
      version: "1.0",
      updatedAt: new Date().toISOString(),
      projects: [],
      websiteProjects,
    };
    await invoke("save_app_config", { config });
  },

  /**
   * 执行 Git Pull
   * @description 在目标目录执行 git pull 操作
   *
   * @param target - 目标 Git 仓库目录
   * @param cardId - 项目卡片 ID（用于事件关联）
   *
   * 使用场景：
   * - 部署前同步远程仓库最新代码
   * - 避免直接覆盖导致冲突
   */
  async gitPull(target: string, cardId: string): Promise<void> {
    await invoke("git_pull", { target, cardId });
  },

  /**
   * 执行文件复制和准备工作
   * @description 核心部署逻辑：清空目标目录并复制文件
   *
   * @param params.source - 源目录路径
   * @param params.target - 目标目录路径
   * @param params.autoPull - 是否自动执行 git pull
   * @param params.moveMode - copy(复制) 或 cut(移动)
   * @param params.clearTargetMode - 清空模式：none/all/specific
   * @param params.clearTargetFolders - 要清空的文件夹列表
   * @param params.cardId - 项目卡片 ID（用于事件关联）
   *
   * 执行流程（后端）：
   * 1. 如果 autoPull=true，先执行 git pull
   * 2. 根据 clearTargetMode 清空目标目录
   * 3. 复制源目录文件到目标目录
   * 4. 发送进度事件给前端
   */
  async copyAndPrepare(params: {
    source: string;
    target: string;
    autoPull: boolean;
    moveMode: "copy" | "cut";
    clearTargetMode: "none" | "all" | "specific";
    clearTargetFolders: string[];
    cardId: string;
  }): Promise<void> {
    await invoke("copy_and_prepare", params);
  },

  /**
   * 执行 Git Commit 和 Push
   * @description 将更改提交到本地仓库并推送到远程
   *
   * @param target - 目标 Git 仓库目录
   * @param message - Commit 消息
   * @param cardId - 项目卡片 ID（用于事件关联）
   *
   * @returns Promise<void>
   *
   * 业务场景：
   * - 自动提交：部署完成后自动生成 commit 消息
   * - 手动提交：用户自定义 commit 消息
   */
  async gitCommitPush(target: string, message: string, cardId: string): Promise<void> {
    await invoke("git_commit_push", { target, message, cardId });
  },

  /**
   * 列出目录内容
   * @description 获取指定目录下的所有文件和子目录
   *
   * @param path - 目录路径
   * @returns Promise<FileEntry[]> 目录条目列表
   *
   * 使用场景：
   * - 选择目标目录后获取其内容
   * - 用于"清空指定文件"功能的复选框列表
   * - 刷新目录内容
   */
  async listDirectories(path: string): Promise<FileEntry[]> {
    const result = await invoke<{ name: string; isDirectory: boolean }[]>("list_directories", { path });
    return result.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
  },

  /**
   * 导出配置到文件
   * @description 将项目配置导出为 JSON 文件
   *
   * @param cards - 项目卡片列表
   * @param websiteProjects - 网站项目列表（可选）
   * @returns Promise<void>
   *
   * 导出格式：
   * - 文件名格式：frontend-deployer-config-YYYY-MM-DD.json
   * - 文件类型：JSON
   * - 使用系统保存对话框让用户选择保存位置
   *
   * 导出内容：
   * - 版本信息
   * - 导出时间
   * - 所有项目的配置（不含运行时状态）
   * - 网站项目配置（如果提供）
   */
  async exportConfig(cards: ProjectCardData[], websiteProjects?: WebsiteProject[]): Promise<void> {
    const config: ExportConfig = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      projects: cards.map((card) => ({
        name: card.name,
        sourcePath: card.sourcePath,
        targetPath: card.targetPath,
        autoPull: card.autoPull,
        moveMode: card.moveMode,
        clearTargetMode: card.clearTargetMode,
        clearTargetFolders: card.clearTargetFolders,
        clearTargetAllEntries: card.clearTargetAllEntries.map((e: FileEntry) => ({ name: e.name, isDirectory: e.isDirectory })),
        commitMode: card.commitMode,
      })),
      websiteProjects: websiteProjects?.map(p => ({
        id: p.id,
        name: p.name,
        websiteUrl: p.websiteUrl,
        gitUrl: p.gitUrl,
        environments: p.environments.map(e => ({ name: e.name, websiteUrl: e.websiteUrl })),
        credentials: p.credentials.map(c => ({ id: c.id, label: c.label, username: c.username, password: c.password })),
      })),
    };

    // 打开系统保存对话框
    const filePath = await save({
      defaultPath: `frontend-deployer-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!filePath) return;

    // 写入文件
    await invoke("write_text_file", { path: filePath, contents: JSON.stringify(config, null, 2) });
  },

  /**
   * 解析导入配置
   * @description 从 JSON 文本解析项目配置
   *
   * @param text - JSON 配置文本
   * @param existingCardsLength - 现有项目数量（用于生成默认名称）
   * @returns ProjectCardData[] 解析后的项目列表
   *
   * 数据转换逻辑：
   * 1. 解析 JSON
   * 2. 验证格式
   * 3. 迁移旧版本字段
   * 4. 生成新的 ID
   * 5. 设置默认状态
   *
   * 命名规则：
   * - 如果项目有名称，使用原名称
   * - 如果没有，生成 "项目 N" 格式的名称
   * - N = 现有项目数量 + 索引 + 1
   */
  parseImportConfig(text: string, existingCardsLength: number): { projects: ProjectCardData[]; websiteProjects: WebsiteProject[] } {
    let config: { projects?: ImportedProject[]; websiteProjects?: any[] };
    try {
      config = JSON.parse(text);
    } catch (err) {
      throw new Error("配置文件格式无效：JSON 解析失败");
    }

    if (!config.projects && !config.websiteProjects) {
      throw new Error("配置文件格式无效：缺少 projects 或 websiteProjects 字段");
    }

    const projects: ProjectCardData[] = [];
    const websiteProjects: WebsiteProject[] = [];

    if (config.projects) {
      if (!Array.isArray(config.projects)) {
        throw new Error("配置文件格式无效：projects 必须是数组");
      }

      if (config.projects.length === 0 && (!config.websiteProjects || config.websiteProjects.length === 0)) {
        throw new Error("配置文件为空：没有项目可以导入");
      }

      projects.push(...config.projects.map((project: ImportedProject, index: number) => {
        if (!project.sourcePath || typeof project.sourcePath !== 'string') {
          throw new Error(`项目 ${index + 1}：源路径无效`);
        }

        if (!project.targetPath || typeof project.targetPath !== 'string') {
          throw new Error(`项目 ${index + 1}：目标路径无效`);
        }

        const name = project.name?.trim() || `项目 ${existingCardsLength + index + 1}`;
        if (name.length > 100) {
          throw new Error(`项目 ${index + 1}：名称过长（最大 100 个字符）`);
        }

        const moveMode: "copy" | "cut" = project.moveMode === "cut" ? "cut" : "copy";
        const clearTargetMode = project.clearTargetMode || (project.clearTarget ? "all" : "none");
        const commitMode = project.commitMode || (project.autoCommit === false ? "none" : "auto");

        return {
          id: generateId(),
          name,
          sourcePath: project.sourcePath,
          targetPath: project.targetPath,
          autoPull: project.autoPull ?? true,
          moveMode,
          clearTargetMode,
          clearTargetFolders: Array.isArray(project.clearTargetFolders) ? project.clearTargetFolders : [],
          clearTargetAllEntries: (project.clearTargetAllEntries || []).map((e: RawFileEntry): FileEntry => ({
            name: typeof e === 'string' ? e : (e.name || String(e)),
            isDirectory: e.isDirectory ?? true
          })),
          commitMode,
          autoWatch: false,
          status: "idle" as const,
          message: "",
          progress: 0,
        };
      }));
    }

    if (config.websiteProjects && Array.isArray(config.websiteProjects)) {
      websiteProjects.push(...config.websiteProjects.map((p: any, index: number) => {
        if (!p.name || typeof p.name !== 'string') {
          throw new Error(`网站项目 ${index + 1}：名称无效`);
        }

        return {
          id: generateId(),
          name: p.name,
          websiteUrl: p.websiteUrl || "",
          gitUrl: p.gitUrl || "",
          environments: (p.environments || []).map((e: any) => ({
            name: e.name || "net",
            websiteUrl: e.websiteUrl || "",
          })),
          credentials: (p.credentials || []).map((c: any) => ({
            id: generateId(),
            label: c.label || "",
            username: c.username || "",
            password: c.password || "",
          })),
        };
      }));
    }

    return { projects, websiteProjects };
  },

  // ========== 文件监听（Auto Watch） ==========

  /**
   * 开始监听源目录
   * @description 后台监听打包目录的文件变化，只有当源文件比目标文件更新时才触发部署
   *
   * @param projectId - 项目 ID
   * @param sourcePath - 要监听的源目录
   * @param targetPath - 目标目录，用于对比文件修改时间
   */
  async startWatch(projectId: string, sourcePath: string, targetPath: string): Promise<void> {
    await invoke("start_watch", { projectId, path: sourcePath, targetPath });
  },

  /**
   * 停止监听源目录
   * @description 停止指定项目的文件监听
   *
   * @param projectId - 项目 ID
   */
  async stopWatch(projectId: string): Promise<void> {
    await invoke("stop_watch", { projectId });
  },

  /**
   * 停止所有监听
   * @description 停止所有项目的文件监听（应用关闭前调用）
   */
  async stopAllWatches(): Promise<void> {
    await invoke("stop_all_watches");
  },

  /**
   * 获取监听状态
   * @description 获取所有正在被监听的项目 ID 列表
   *
   * @returns Promise<string[]> 正在监听的项目 ID 列表
   */
  async getWatchStatuses(): Promise<string[]> {
    return await invoke<string[]>("get_watch_statuses");
  },

  /**
   * 停止正在执行的操作
   * @description 向后端发送停止信号，终止正在执行的文件复制或 Git 操作
   *
   * @param cardId - 项目卡片 ID
   */
  async stopOperation(cardId: string): Promise<void> {
    await invoke("stop_operation", { cardId });
  },

  /**
   * 清除取消标志
   * @description 清除项目的取消标志，允许新的操作执行
   *
   * @param cardId - 项目卡片 ID
   */
  async clearCancellation(cardId: string): Promise<void> {
    await invoke("clear_cancellation", { cardId });
  },
};

/**
 * 生成唯一 ID
 * @description 使用时间戳和随机数生成唯一标识符
 *
 * 算法：
 * - Date.now().toString(36): 时间戳的 36 进制表示
 * - Math.random().toString(36).substr(2): 随机数的 36 进制表示（去掉前两位）
 * - 组合：时间戳_随机数
 *
 * @returns string 唯一 ID
 *
 * 优点：
 * - 足够长（20+ 字符）
 * - 大部分情况下唯一
 * - 不依赖外部库
 *
 * 局限：
 * - 极端情况下可能出现重复（概率极低）
 * - 不适合高并发场景
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.getRandomValues(new Uint8Array(8))
    .reduce((str, byte) => str + byte.toString(36).padStart(2, '0'), '');
  return `${timestamp}_${randomPart}`;
}
