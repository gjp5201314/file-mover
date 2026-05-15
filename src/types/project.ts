/**
 * 项目类型定义
 *
 * 本文件定义了前端部署工具的核心数据类型
 *
 * 模块说明：
 * - FileEntry: 文件/目录条目
 * - ProjectCardData: 项目卡片完整数据
 *
 * 设计原则：
 * - 使用 TypeScript 严格类型定义
 * - 提供完整的属性说明供 AI 理解业务逻辑
 */

/**
 * 文件或目录条目
 * @interface FileEntry
 *
 * 用于表示文件系统中的单个条目
 * 既可以是文件，也可以是目录
 *
 * @example
 * ```typescript
 * // 表示一个目录
 * { name: "src", isDirectory: true }
 *
 * // 表示一个文件
 * { name: "index.html", isDirectory: false }
 * ```
 */
export interface FileEntry {
  /** 条目名称（不含路径） */
  name: string;
  /** 是否为目录 */
  isDirectory: boolean;
}

/**
 * 项目卡片完整数据
 * @interface ProjectCardData
 *
 * 包含单个部署项目的所有配置和运行时状态
 *
 * 数据分类：
 * - 配置数据：用户设置的参数（sourcePath, targetPath 等）
 * - 运行时状态：执行过程中的状态（status, message, progress）
 *
 * 状态流转：
 * idle -> copying -> [ready | done | error]
 *                 -> committing -> done | error
 */
export interface ProjectCardData {
  /** 唯一标识符（自动生成） */
  id: string;
  /** 项目显示名称 */
  name: string;

  /** 源目录路径 - 前端构建输出目录（如 dist、build） */
  sourcePath: string;
  /** 目标目录路径 - Git 仓库目录 */
  targetPath: string;

  /** 是否在部署前执行 git pull */
  autoPull: boolean;

  /** 文件操作方式
   * - copy: 复制（源文件保留）
   * - cut: 移动（源文件删除）
   *
   * 注意：cut 操作有风险，建议使用 copy
   */
  moveMode: "copy" | "cut";

  /** 清空目标目录的模式
   * - none: 不删除任何文件
   * - all: 删除目标目录所有内容
   * - specific: 只删除用户指定的文件/文件夹
   *
   * 业务场景：
   * - none: 增量部署（保留旧文件）
   * - all: 完全替换（清除旧文件）
   * - specific: 选择性清理（只删除特定文件）
   */
  clearTargetMode: "none" | "all" | "specific";

  /** 要清空的文件夹/文件列表
   * 仅在 clearTargetMode === "specific" 时生效
   * 存储用户选择的具体条目名称
   */
  clearTargetFolders: string[];

  /** 目标目录的所有条目列表
   * 用于显示复选框供用户选择要清空的内容
   * 动态从目标目录读取
   */
  clearTargetAllEntries: FileEntry[];

  /** Git 提交模式
   * - auto: 部署完成后自动提交并推送
   * - manual: 文件处理完成后，等待用户填写 commit 消息
   * - none: 只处理文件，不执行 git 操作
   *
   * 业务场景：
   * - auto: 追求自动化，减少人工干预
   * - manual: 需要审核 commit 内容
   * - none: 只需要文件同步，不涉及版本控制
   */
  commitMode: "auto" | "manual" | "none";

  /** 运行时状态
   * - idle: 初始状态，等待执行
   * - copying: 正在复制文件
   * - ready: 文件处理完成，等待确认（manual commit 模式）
   * - committing: 正在提交 Git
   * - done: 全部完成
   * - error: 执行出错
   */
  status: "idle" | "copying" | "ready" | "committing" | "done" | "error";

  /** 状态消息
   * 用于显示详细的执行状态描述
   * 例如："正在处理文件: src/index.js"
   */
  message: string;

  /** 进度百分比（0-100）
   * 用于进度条显示
   * 仅在 copying 状态时有效
   */
  progress: number;
}
