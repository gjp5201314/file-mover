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

import { Header, ProjectTabs, ProjectCard, ProjectSidebar, DeleteConfirmModal, CommitModal } from "./components";
import { ProjectProvider, useProject } from "./context/ProjectContext";
import "./components/styles.css";

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
  } = useProject();

  return (
    <div className="app-container">
      {/* 顶部导航栏 */}
      <Header
        onImportConfig={importConfig}
        onExportConfig={exportConfig}
        hasProjects={cards.length > 0}
      />

      {/* 项目标签页 */}
      <ProjectTabs
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
              onConfirmCommit={confirmCommit}
              onReset={resetCard}
            />
          </div>

          {/* 日志面板 */}
          <ProjectSidebar
            fileOutput={projectLogs[activeCard.id]?.fileOutput || ""}
            gitOutput={projectLogs[activeCard.id]?.gitOutput || ""}
            onClearFileOutput={() => clearProjectLogs(activeCard.id)}
            onClearGitOutput={() => clearProjectLogs(activeCard.id)}
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
        <DeleteConfirmModal
          project={pendingDelete}
          onConfirm={confirmDeleteCard}
          onCancel={() => setPendingDelete(null)}
        />
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
