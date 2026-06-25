/**
 * 应用主组件
 *
 * 应用入口组件，负责整体布局和组件协调
 *
 * 组件结构：
 * 1. Header - 顶部导航栏
 * 2. ProjectTabs - 项目标签页
 * 3. ProjectCard - 当前选中的项目卡片
 * 4. ProjectSidebar - 日志面板
 * 5. DeleteConfirmModal - 删除确认（条件渲染）
 * 6. CommitModal - 提交对话框（条件渲染）
 *
 * 状态管理：
 * - 使用 ProjectProvider 提供全局状态
 * - 通过 useProject 获取状态和操作方法
 *
 * 条件渲染：
 * - 无项目时显示空状态提示
 * - 根据状态显示不同的模态框
 */

import { Header, ProjectCard, ProjectSidebar, ConfirmModal, CommitModal, SettingsDrawer, AiAssistant, AiConfigDrawer } from "./components";
import { ProjectProvider, useProject } from "./context/ProjectContext";
import Message from "./components/Message";
import "./components/variables.css";
import "./components/styles.css";
import { useEffect, useState, useCallback } from "react";
import { agentService } from "./services/agentService";

/**
 * 应用内容组件
 * @description 内部组件，使用 useProject 获取状态
 */
function AppContent() {
  const {
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
    setShowConfirmModal,
    executeCommit,
    executeManualCommit,
    handleManualCommitCancel,
    importConfig,
    exportConfig,
    toggleAutoWatch,
    watchStates,
  } = useProject();
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  // AI 配置抽屉（AiAssistant 的子级抽屉，从聊天面板 ⚙ 进入）
  const [showAiConfigDrawer, setShowAiConfigDrawer] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  /**
   * 加载 AI 配置状态（仅需 hasApiKey）
   */
  const refreshAiConfig = useCallback(async () => {
    try {
      const cfg = await agentService.getConfig();
      setAiConfigured(cfg.hasApiKey);
    } catch (err) {
      console.error("读取 AI 配置失败:", err);
      setAiConfigured(false);
    }
  }, []);

  useEffect(() => {
    refreshAiConfig();
  }, [refreshAiConfig]);

  return (
    <div className="app-container">
      {/* 顶部导航栏 */}
      <Header
        onOpenSettings={() => setShowSettingsDrawer(true)}
        projects={cards}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        onAddProject={addCard}
      />

      {/* 项目详情区 */}
      {activeCard && (
        <div className="project-detail">
          <div className="project-main">
            {/* 项目卡片 */}
            <ProjectCard
              card={activeCard}
              onUpdateCard={updateCard}
              onDeleteCard={deleteCard}
              onExecute={executeCard}
              onStop={stopCard}
              onConfirmCommit={confirmCommit}
              onReset={resetCard}
              onToggleAutoWatch={toggleAutoWatch}
              watchActive={watchStates[activeCard.id] || false}
            />
          </div>

          {/* 日志面板 */}
          <ProjectSidebar
            fileEntries={projectLogs[activeCard.id]?.fileEntries || []}
            gitEntries={projectLogs[activeCard.id]?.gitEntries || []}
            onClearFileOutput={() => clearProjectLogs(activeCard.id, 'file')}
            onClearGitOutput={() => clearProjectLogs(activeCard.id, 'git')}
          />
        </div>
      )}

      {/* 空状态提示 */}
      {cards.length === 0 && (
        <div className="empty-state">
          <p>还没有项目，点击上方"添加项目"开始</p>
        </div>
      )}

      {/* 删除确认对话框 */}
      {pendingDelete && (
        <ConfirmModal
          isOpen={true}
          title="确认删除项目"
          confirmText="确认删除"
          cancelText="取消"
          confirmType="danger"
          onConfirm={confirmDeleteCard}
          onCancel={() => setPendingDelete(null)}
        >
          <p>将从列表中删除"{pendingDelete.name}"。</p>
          <p>此操作只删除应用里的项目配置，不会删除源目录或目标目录中的文件。</p>
          <div className="modal-info">
            <div><small>源目录: {pendingDelete.sourcePath || "未选择"}</small></div>
            <div><small>目标目录: {pendingDelete.targetPath || "未选择"}</small></div>
          </div>
        </ConfirmModal>
      )}

      {/* 手动提交对话框 */}
      {showManualCommitModal && pendingCommit && (
        <CommitModal
          pendingCommit={pendingCommit}
          onCommit={(card, message) => {
            setPendingCommit({ card, commitMessage: message });
            executeManualCommit();
          }}
          onCancel={handleManualCommitCancel}
          isManual={true}
          onCancelWithStatus={handleManualCommitCancel}
        />
      )}

      {/* 提交确认对话框 */}
      {showConfirmModal && pendingCommit && (
        <CommitModal
          pendingCommit={pendingCommit}
          onCommit={() => executeCommit()}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}

      {/* 设置抽屉 */}
      <SettingsDrawer
        isOpen={showSettingsDrawer}
        onClose={() => setShowSettingsDrawer(false)}
        onImport={importConfig}
        onExport={exportConfig}
        hasProjects={cards.length > 0}
        onOpenAiConfig={() => setShowAiConfigDrawer(true)}
      />

      {/* AI 助手悬浮气泡 + 聊天面板 */}
      <AiAssistant
        configured={aiConfigured}
        onOpenAiConfig={() => setShowAiConfigDrawer(true)}
      />

      {/* AI 助手配置抽屉（聊天面板的子级，入口在聊天面板右上角 ⚙） */}
      <AiConfigDrawer
        isOpen={showAiConfigDrawer}
        onClose={() => setShowAiConfigDrawer(false)}
        onConfigChange={refreshAiConfig}
      />

      {/* 全局消息提示（Toast，挂一次即可，portal 到 body） */}
      <Message />
    </div>
  );
}

/**
 * App 根组件
 * @description 提供 Context 并渲染应用内容
 */
function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}

export default App;
