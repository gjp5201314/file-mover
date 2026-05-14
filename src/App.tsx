import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Header, ProjectTabs, ProjectCard, ProjectSidebar, DeleteConfirmModal, CommitModal } from "./components";
import type { ProjectCardData, FileEntry } from "./components";
import "./components/styles.css";

interface AppConfig {
  version?: string;
  updatedAt?: string;
  exportedAt?: string;
  projects: ProjectCardData[];
}

interface CopyProgress {
  current: number;
  total: number;
  currentFile: string;
  cardId: string;
}

interface ImportedProject {
  name?: string;
  sourcePath?: string;
  targetPath?: string;
  autoPull?: boolean;
  autoCommit?: boolean;
  moveMode?: "copy" | "cut";
  clearTarget?: boolean;
  clearTargetMode?: "none" | "all" | "specific";
  clearTargetFolders?: string[];
  clearTargetAllEntries?: FileEntry[];
  commitMode?: "auto" | "manual" | "none";
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

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

interface PendingCommit {
  card: ProjectCardData;
  commitMessage: string;
}

function App() {
  const [cards, setCards] = useState<ProjectCardData[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showManualCommitModal, setShowManualCommitModal] = useState(false);
  const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectCardData | null>(null);
  const [gitOutput, setGitOutput] = useState<string>("");
  const [fileOutput, setFileOutput] = useState<string>("");
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    loadConfig();
    return () => {
      unlistenersRef.current.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    unlistenersRef.current.forEach((fn) => fn());
    unlistenersRef.current = [];

    const unlistenProgress = listen<CopyProgress>("copy-progress", (event) => {
      const { current, total, currentFile, cardId } = event.payload;
      const progress = total > 0 ? (current / total) * 100 : 0;

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, progress, message: `正在处理文件: ${currentFile}` }
            : card
        )
      );
      setFileOutput((prev) => prev + `[${formatTimestamp()}] [${current}/${total}] ${currentFile}\n`);
    });
    unlistenProgress.then((fn) => unlistenersRef.current.push(fn));

    const unlistenGitOutput = listen<string>("git-output", (event) => {
      setGitOutput((prev) => prev + `[${formatTimestamp()}] ${event.payload}\n`);
    });
    unlistenGitOutput.then((fn) => unlistenersRef.current.push(fn));

    const unlistenError = listen<string>("error", (event) => {
      console.error("Error:", event.payload);
    });
    unlistenError.then((fn) => unlistenersRef.current.push(fn));
  }, []);

  useEffect(() => {
    if (cards.length > 0 && !activeTab) {
      setActiveTab(cards[0].id);
    } else if (cards.length > 0 && !cards.find((c) => c.id === activeTab)) {
      setActiveTab(cards[0].id);
    } else if (cards.length === 0) {
      setActiveTab(null);
    }
  }, [cards, activeTab]);

  const loadConfig = async () => {
    try {
      const config = await invoke<AppConfig | null>("load_app_config");
      if (!config?.projects || !Array.isArray(config.projects)) {
        setCards([]);
        return;
      }
      const loadedCards = config.projects.map((project: any) => ({
        ...project,
        clearTargetMode: project.clearTargetMode || (project.clearTarget ? "all" : "none"),
        clearTargetFolders: project.clearTargetFolders || [],
        clearTargetAllEntries: (project.clearTargetAllEntries || []).map((e: any) => ({
          name: e.name || e,
          isDirectory: e.isDirectory ?? true
        })),
      }));
      setCards(loadedCards);
    } catch (err) {
      console.error("加载配置失败:", err);
      setCards([]);
    }
  };

  const saveConfig = async (projects: ProjectCardData[]) => {
    try {
      const config: AppConfig = {
        version: "1.0",
        updatedAt: new Date().toISOString(),
        projects,
      };
      await invoke("save_app_config", { config });
    } catch (err) {
      console.error("保存配置失败:", err);
    }
  };

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
      status: "idle",
      message: "",
      progress: 0,
    };
    const updatedCards = [...cards, newCard];
    setCards(updatedCards);
    await saveConfig(updatedCards);
  };

  const updateCard = async (id: string, updates: Partial<ProjectCardData>) => {
    const updatedCards = cards.map((card) =>
      card.id === id ? { ...card, ...updates } : card
    );
    setCards(updatedCards);
    await saveConfig(updatedCards);
  };

  const requestDeleteCard = (card: ProjectCardData) => {
    setPendingDelete(card);
  };

  const confirmDeleteCard = async () => {
    if (!pendingDelete) return;
    const updatedCards = cards.filter((card) => card.id !== pendingDelete.id);
    setCards(updatedCards);
    await saveConfig(updatedCards);
    setPendingDelete(null);
  };

  const executeCard = async (id: string) => {
    const card = cards.find((item) => item.id === id);
    if (!card) return;

    if (!card.sourcePath || !card.targetPath) {
      await updateCard(id, { status: "error", message: "请先选择源目录和目标目录" });
      return;
    }

    await updateCard(id, { status: "copying", progress: 0, message: "准备执行部署流程..." });

    try {
      if (card.autoPull) {
        await updateCard(id, { status: "copying", progress: 0, message: "正在执行 git pull..." });
        await invoke("git_pull", {
          target: card.targetPath,
          cardId: id,
        });
      }

      await updateCard(id, {
        status: "copying",
        progress: 0,
        message: card.clearTargetMode !== "none" ? "正在清空目标目录并处理文件..." : "正在处理文件...",
      });
      await invoke("copy_and_prepare", {
        source: card.sourcePath,
        target: card.targetPath,
        autoPull: false,
        moveMode: card.moveMode,
        clearTargetMode: card.clearTargetMode,
        clearTargetFolders: card.clearTargetFolders,
        cardId: id,
      });

      if (card.commitMode === "auto") {
        await updateCard(id, { status: "committing", progress: 100, message: "正在提交并推送到远程仓库..." });
        const commitMessage = `${card.name} - ${new Date().toLocaleString()}`;
        try {
          await invoke("git_commit_push", {
            target: card.targetPath,
            message: commitMessage,
            cardId: id,
          });
          await updateCard(id, { status: "done", progress: 100, message: "部署完成，已提交并推送。" });
        } catch (err) {
          await updateCard(id, { status: "error", message: `提交失败: ${err}` });
        }
      } else if (card.commitMode === "manual") {
        const defaultMessage = `${card.name} - ${new Date().toLocaleString()}`;
        await updateCard(id, { status: "ready", message: "文件处理完成，等待填写 Commit 信息。", progress: 100 });
        setPendingCommit({ card, commitMessage: defaultMessage });
        setShowManualCommitModal(true);
      } else {
        await updateCard(id, { status: "ready", message: "文件处理完成，未执行 Git 提交。", progress: 100 });
      }
    } catch (err) {
      await updateCard(id, { status: "error", message: `失败: ${err}` });
    }
  };

  const confirmCommit = (card: ProjectCardData) => {
    setPendingCommit({ card, commitMessage: `${card.name} - ${new Date().toLocaleString()}` });
    setShowConfirmModal(true);
  };

  const executeCommit = async () => {
    if (!pendingCommit) return;

    const { card, commitMessage } = pendingCommit;
    setShowConfirmModal(false);

    await updateCard(card.id, { status: "committing", message: "正在提交并推送到远程仓库..." });

    try {
      await invoke("git_commit_push", {
        target: card.targetPath,
        message: commitMessage,
        cardId: card.id,
      });
      await updateCard(card.id, { status: "done", message: "部署完成，已提交并推送。" });
    } catch (err) {
      await updateCard(card.id, { status: "error", message: `提交失败: ${err}` });
    }
  };

  const executeManualCommit = async () => {
    if (!pendingCommit) return;

    const { card, commitMessage } = pendingCommit;
    setShowManualCommitModal(false);

    await updateCard(card.id, { status: "committing", message: "正在提交并推送到远程仓库..." });

    try {
      await invoke("git_commit_push", {
        target: card.targetPath,
        message: commitMessage,
        cardId: card.id,
      });
      await updateCard(card.id, { status: "done", message: "部署完成，已提交并推送。" });
    } catch (err) {
      await updateCard(card.id, { status: "error", message: `提交失败: ${err}` });
    }
  };

  const resetCard = async (id: string) => {
    await updateCard(id, { status: "idle", message: "", progress: 0 });
  };

  const exportConfig = async () => {
    const config = {
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
        clearTargetAllEntries: card.clearTargetAllEntries.map(e => ({ name: e.name, isDirectory: e.isDirectory })),
        commitMode: card.commitMode,
      })),
    };

    const filePath = await save({
      defaultPath: `frontend-deployer-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!filePath) return;

    try {
      await invoke("write_text_file", { path: filePath, contents: JSON.stringify(config, null, 2) });
    } catch (err) {
      console.error("导出失败:", err);
      alert(`导出失败: ${err}`);
    }
  };

  const importConfig = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = JSON.parse(text) as { projects?: ImportedProject[] };

        if (!config.projects || !Array.isArray(config.projects)) {
          alert("配置文件格式无效");
          return;
        }

        const importedCards: ProjectCardData[] = config.projects.map((project: any) => ({
          id: generateId(),
          name: project.name || `项目 ${cards.length + 1}`,
          sourcePath: project.sourcePath || "",
          targetPath: project.targetPath || "",
          autoPull: project.autoPull ?? true,
          moveMode: project.moveMode || "copy",
          clearTargetMode: project.clearTargetMode || (project.clearTarget ? "all" : "none"),
          clearTargetFolders: project.clearTargetFolders || [],
          clearTargetAllEntries: (project.clearTargetAllEntries || []).map((e: any) => ({
            name: e.name || e,
            isDirectory: e.isDirectory ?? true
          })),
          commitMode: project.commitMode || (project.autoCommit === false ? "none" : "auto"),
          status: "idle",
          message: "",
          progress: 0,
        }));

        const updatedCards = [...cards, ...importedCards];
        setCards(updatedCards);
        await saveConfig(updatedCards);
        alert(`成功导入 ${importedCards.length} 个项目`);
      } catch (err) {
        alert(`导入失败: ${err}`);
      }
    };
    input.click();
  };

  const handleManualCommitCancel = () => {
    if (pendingCommit) {
      updateCard(pendingCommit.card.id, { status: "ready", message: "文件处理完成，等待提交。", progress: 100 });
    }
    setShowManualCommitModal(false);
  };

  const activeCard = activeTab ? cards.find((c) => c.id === activeTab) : null;

  return (
    <div className="app-container">
      <Header
        onImportConfig={importConfig}
        onExportConfig={exportConfig}
        hasProjects={cards.length > 0}
      />

      <ProjectTabs
        projects={cards}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        onAddProject={addCard}
      />

      {activeCard && (
        <div className="project-detail">
          <div className="project-main">
            <ProjectCard
              card={activeCard}
              onUpdateCard={updateCard}
              onDeleteCard={requestDeleteCard}
              onExecute={executeCard}
              onConfirmCommit={confirmCommit}
              onReset={resetCard}
            />
          </div>

          <ProjectSidebar
            fileOutput={fileOutput}
            gitOutput={gitOutput}
            onClearFileOutput={() => setFileOutput("")}
            onClearGitOutput={() => setGitOutput("")}
          />
        </div>
      )}

      {cards.length === 0 && (
        <div className="empty-state">
          <p>还没有项目，点击上方"添加项目"开始</p>
        </div>
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          project={pendingDelete}
          onConfirm={confirmDeleteCard}
          onCancel={() => setPendingDelete(null)}
        />
      )}

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

export default App;
