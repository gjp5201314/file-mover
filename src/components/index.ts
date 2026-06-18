/**
 * 组件导出入口
 *
 * 统一导出所有 UI 组件，方便外部导入
 *
 * 抽屉层级（从外到内）：
 * - SettingsDrawer: 常规设置（顶层）
 * - AiAssistant:    AI 聊天面板（顶层，通过悬浮气泡打开）
 * - AiConfigDrawer: AI 助手配置（AiAssistant 的子级，从 ⚙ 进入）
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
export { default as AiAssistant } from "./AiAssistant";
export { default as AiConfigDrawer } from "./AiConfigDrawer";
export { default as Message } from "./Message";
export { message } from "./messageApi";
export type { MessageTypeValue, MessageItem, MessageReturn } from "./messageApi";
