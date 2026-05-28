/**
 * 组件导出入口
 *
 * 统一导出所有 UI 组件，方便外部导入
 *
 * 导出内容：
 * - Header: 顶部导航栏
 * - ProjectTabs: 项目标签页
 * - ProjectCard: 项目卡片
 * - ProjectSidebar: 侧边栏日志
 * - ConfirmModal: 通用确认对话框
 * - CommitModal: Git 提交对话框
 * - GitProxySettings: Git 代理设置
 *
 * 使用方式：
 * ```typescript
 * import { Header, ProjectCard } from "./components";
 * ```
 */

export { default as Header } from "./Header";
export { default as ProjectTabs } from "./ProjectTabs";
export type { ProjectTab } from "./ProjectTabs";
export { default as ProjectCard } from "./ProjectCard";
export { default as ProjectSidebar } from "./ProjectSidebar";
export { default as ConfirmModal } from "./ConfirmModal";
export type { ConfirmModalProps, ConfirmButtonType } from "./ConfirmModal";
export { default as CommitModal } from "./CommitModal";
export { default as GitProxySettings } from "./GitProxySettings";
export { default as ProjectOverview } from "./ProjectOverview";
export { default as AutoStartSettings } from "./AutoStartSettings";
export { default as SettingsDrawer } from "./SettingsDrawer";
