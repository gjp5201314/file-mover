import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface FileEntry {
  name: string;
  isDirectory: boolean;
}

interface ProjectCard {
  id: string;
  name: string;
  sourcePath: string;
  targetPath: string;
  autoPull: boolean;
  moveMode: "copy" | "cut";
  clearTargetMode: "none" | "all" | "specific";
  clearTargetFolders: string[];
  clearTargetAllEntries: FileEntry[];
  commitMode: "auto" | "manual" | "none";
  status: "idle" | "copying" | "ready" | "committing" | "done" | "error";
  message: string;
  progress: number;
}

interface AppConfig {
  version?: string;
  updatedAt?: string;
  exportedAt?: string;
  projects: ProjectCard[];
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

function App() {
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showManualCommitModal, setShowManualCommitModal] = useState(false);
  const [pendingCommit, setPendingCommit] = useState<{ card: ProjectCard; commitMessage: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectCard | null>(null);
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

  const saveConfig = async (projects: ProjectCard[]) => {
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
    const newCard: ProjectCard = {
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

  const updateCard = async (id: string, updates: Partial<ProjectCard>) => {
    const updatedCards = cards.map((card) =>
      card.id === id ? { ...card, ...updates } : card
    );
    setCards(updatedCards);
    await saveConfig(updatedCards);
  };

  const requestDeleteCard = (card: ProjectCard) => {
    setPendingDelete(card);
  };

  const confirmDeleteCard = async () => {
    if (!pendingDelete) return;
    await deleteCard(pendingDelete.id);
    setPendingDelete(null);
  };

  const deleteCard = async (id: string) => {
    const updatedCards = cards.filter((card) => card.id !== id);
    setCards(updatedCards);
    await saveConfig(updatedCards);
  };

  const selectSource = async (id: string) => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        await updateCard(id, { sourcePath: selected as string, status: "idle" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectTarget = async (id: string) => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        const newTargetPath = selected as string;
        let allEntries: FileEntry[] = [];
        try {
          const result = await invoke<{name: string; isDirectory: boolean}[]>("list_directories", { path: newTargetPath });
          console.log("list_directories result:", result);
          allEntries = result.map(e => ({ name: e.name, isDirectory: e.isDirectory }));
        } catch {
        }
        const currentCard = cards.find(c => c.id === id);
        await updateCard(id, {
          targetPath: newTargetPath,
          status: "idle",
          clearTargetAllEntries: allEntries,
          clearTargetFolders: currentCard?.clearTargetMode === "specific" ? allEntries.filter(e => !currentCard.clearTargetFolders.includes(e.name)).map(e => e.name) : []
        });
      }
    } catch (err) {
      console.error(err);
    }
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

  const confirmCommit = (card: ProjectCard) => {
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

        const importedCards: ProjectCard[] = config.projects.map((project: any) => ({
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

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">前端部署工具</h1>
        <div className="header-actions">
          <button className="header-btn" onClick={importConfig} title="导入配置">
            导入
          </button>
          <button className="header-btn" onClick={exportConfig} disabled={cards.length === 0} title="导出配置">
            导出
          </button>
        </div>
      </div>

      <div className="tabs-container">
        <div className="tabs-list">
          {cards.map((card) => (
            <button
              key={card.id}
              className={`tab-item ${activeTab === card.id ? "active" : ""} ${card.status}`}
              onClick={() => setActiveTab(card.id)}
            >
              <span className="tab-name">{card.name}</span>
              <span className={`tab-status-dot ${card.status}`}></span>
            </button>
          ))}
          <button className="tab-item add-tab" onClick={addCard}>
            <span className="add-icon">+</span>
            <span>添加项目</span>
          </button>
        </div>
      </div>

      {activeTab && cards.find((c) => c.id === activeTab) && (() => {
        const card = cards.find((c) => c.id === activeTab)!;
        return (
          <div className="project-detail">
            <div className="project-main">
              <div className={`project-card ${card.status}`}>
                <div className="card-header">
                  <input
                    type="text"
                    className="card-name-input"
                    value={card.name}
                    onChange={(event) => updateCard(card.id, { name: event.target.value })}
                  />
                  <button
                    className="card-delete-btn"
                    onClick={() => requestDeleteCard(card)}
                    disabled={card.status === "copying" || card.status === "committing"}
                    title="删除项目"
                  >
                    x
                  </button>
                </div>

                <div className="card-paths">
                  <div className="path-section">
                    <div className="section-header">源目录</div>
                    <div className="path-row">
                      <button className="path-btn full-width" onClick={() => selectSource(card.id)}>
                        {card.sourcePath ? "更换目录" : "选择目录"}
                      </button>
                    </div>
                    <div className="path-display" title={card.sourcePath}>
                      {card.sourcePath || "未选择"}
                    </div>
                    <div className="section-hint">前端 dist 文件夹</div>
                  </div>

                  <div className="path-section">
                    <div className="section-header">目标目录</div>
                    <div className="path-row">
                      <button className="path-btn full-width" onClick={() => selectTarget(card.id)}>
                        {card.targetPath ? "更换目录" : "选择目录"}
                      </button>
                    </div>
                    <div className="path-display" title={card.targetPath}>
                      {card.targetPath || "未选择"}
                    </div>
                    <div className="section-hint">Git 仓库目录</div>

                    <div className="section-options">
                      <div className="option-item">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={card.autoPull}
                            onChange={(event) => updateCard(card.id, { autoPull: event.target.checked })}
                          />
                          <span>执行前先 git pull</span>
                        </label>
                      </div>

                      <div className="option-item">
                        <span className="radio-group-label">操作前清空目标目录：</span>
                        <div className="radio-group-inline">
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`clearTargetMode-${card.id}`}
                              value="none"
                              checked={card.clearTargetMode === "none"}
                              onChange={() => updateCard(card.id, { clearTargetMode: "none", clearTargetFolders: [] })}
                            />
                            <span>不删除</span>
                          </label>
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`clearTargetMode-${card.id}`}
                              value="all"
                              checked={card.clearTargetMode === "all"}
                              onChange={() => updateCard(card.id, { clearTargetMode: "all", clearTargetFolders: [] })}
                            />
                            <span>全部目录</span>
                          </label>
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`clearTargetMode-${card.id}`}
                              value="specific"
                              checked={card.clearTargetMode === "specific"}
                              onChange={() => {
                                if (card.targetPath) {
                                  invoke<{name: string; isDirectory: boolean}[]>("list_directories", { path: card.targetPath }).then((entries) => {
                                    const allEntries = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory }));
                                    updateCard(card.id, {
                                      clearTargetMode: "specific",
                                      clearTargetAllEntries: allEntries,
                                      clearTargetFolders: allEntries.map(e => e.name)
                                    });
                                  }).catch(console.error);
                                } else {
                                  updateCard(card.id, {
                                    clearTargetMode: "specific",
                                    clearTargetAllEntries: [],
                                    clearTargetFolders: []
                                  });
                                }
                              }}
                            />
                            <span>指定文件</span>
                          </label>
                        </div>
                      </div>

                      {card.clearTargetMode === "specific" && (
                        <div className="folder-selection">
                          <div className="folder-selection-header">
                            <span>选择要删除的文件/文件夹：</span>
                            <button
                              className="refresh-folders-btn"
                              onClick={async () => {
                                if (card.targetPath) {
                                  try {
                                    const entries = await invoke<{name: string; isDirectory: boolean}[]>("list_directories", { path: card.targetPath });
                                    const allEntries = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory }));
                                    const selectedSet = new Set(card.clearTargetFolders);
                                    const newEntries = allEntries.filter(e => selectedSet.has(e.name) || !card.clearTargetAllEntries.some(ex => ex.name === e.name));
                                    const combinedAll = [...card.clearTargetAllEntries, ...newEntries].filter((e, i, arr) => arr.findIndex(x => x.name === e.name) === i);
                                    combinedAll.sort((a, b) => {
                                      if (a.isDirectory !== b.isDirectory) return b.isDirectory ? 1 : -1;
                                      return a.name.localeCompare(b.name);
                                    });
                                    updateCard(card.id, {
                                      clearTargetAllEntries: combinedAll,
                                      clearTargetFolders: card.clearTargetFolders.filter(f => combinedAll.some(e => e.name === f))
                                    });
                                  } catch (err) {
                                    console.error("获取目录失败:", err);
                                  }
                                }
                              }}
                            >
                              刷新
                            </button>
                          </div>
                          <div className="folder-list">
                            {card.clearTargetAllEntries.length === 0 ? (
                              <div className="folder-list-empty">目标目录为空</div>
                            ) : (
                              card.clearTargetAllEntries.map((entry) => {
                                const isSelected = card.clearTargetFolders.includes(entry.name);
                                return (
                                  <label key={entry.name} className={`folder-checkbox-label ${!isSelected ? 'unselected' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(event) => {
                                        const newFolders = event.target.checked
                                          ? [...card.clearTargetFolders, entry.name]
                                          : card.clearTargetFolders.filter(f => f !== entry.name);
                                        updateCard(card.id, { clearTargetFolders: newFolders });
                                      }}
                                    />
                                    <span className="entry-icon">{entry.isDirectory ? '📁' : '📄'}</span>
                                    <span>{entry.name}</span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      <div className="option-item">
                        <span className="radio-group-label">提交方式：</span>
                        <div className="radio-group-inline">
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`commitMode-${card.id}`}
                              value="auto"
                              checked={card.commitMode === "auto"}
                              onChange={() => updateCard(card.id, { commitMode: "auto" })}
                            />
                            <span>自动提交并推送</span>
                          </label>
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`commitMode-${card.id}`}
                              value="manual"
                              checked={card.commitMode === "manual"}
                              onChange={() => updateCard(card.id, { commitMode: "manual" })}
                            />
                            <span>手动填写 Commit</span>
                          </label>
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`commitMode-${card.id}`}
                              value="none"
                              checked={card.commitMode === "none"}
                              onChange={() => updateCard(card.id, { commitMode: "none" })}
                            />
                            <span>只处理文件，不提交</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="path-section">
                    <div className="section-header">文件操作方式</div>
                    <div className="radio-group">
                      <label className="radio-label">
                        <input
                          type="radio"
                          name={`moveMode-${card.id}`}
                          value="copy"
                          checked={card.moveMode === "copy"}
                          onChange={() => updateCard(card.id, { moveMode: "copy" })}
                        />
                        <span>复制</span>
                      </label>
                      <label className="radio-label">
                        <input
                          type="radio"
                          name={`moveMode-${card.id}`}
                          value="cut"
                          checked={card.moveMode === "cut"}
                          onChange={() => updateCard(card.id, { moveMode: "cut" })}
                        />
                        <span>剪切</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="card-status">
                  <span className={`status-badge ${card.status}`}>{getStatusText(card.status)}</span>
                  {card.message && <div className="status-message">{card.message}</div>}
                  {card.status === "copying" && (
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${card.progress}%` }} />
                    </div>
                  )}
                </div>

                <div className="card-actions">
                  {card.status === "idle" && (
                    <button
                      className="action-btn execute-btn"
                      onClick={() => executeCard(card.id)}
                      disabled={!card.sourcePath || !card.targetPath}
                    >
                      开始执行
                    </button>
                  )}
                  {card.status === "ready" && card.commitMode !== "none" && (
                    <button className="action-btn confirm-btn" onClick={() => confirmCommit(card)}>
                      填写并提交
                    </button>
                  )}
                  {card.status === "ready" && card.commitMode === "none" && (
                    <button className="action-btn reset-btn" onClick={() => resetCard(card.id)}>
                      重置
                    </button>
                  )}
                  {(card.status === "done" || card.status === "error") && (
                    <button className="action-btn reset-btn" onClick={() => resetCard(card.id)}>
                      {card.status === "error" ? "重试" : "重置"}
                    </button>
                  )}
                  {card.status === "copying" && (
                    <button className="action-btn execute-btn" disabled>
                      执行中...
                    </button>
                  )}
                  {card.status === "committing" && (
                    <button className="action-btn confirm-btn" disabled>
                      提交中...
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="project-sidebar">
              <div className="sidebar-section">
                <div className="sidebar-header">
                  <span>文件操作日志</span>
                  <button className="sidebar-clear-btn" onClick={() => setFileOutput("")}>清除</button>
                </div>
                <div className="sidebar-content log-content">
                  {fileOutput ? (
                    <pre className="log-output file-log-output">{fileOutput}</pre>
                  ) : (
                    <div className="sidebar-empty">暂无文件操作记录</div>
                  )}
                </div>
              </div>

              <div className="sidebar-section">
                <div className="sidebar-header">
                  <span>Git 操作日志</span>
                  <button className="sidebar-clear-btn" onClick={() => setGitOutput("")}>清除</button>
                </div>
                <div className="sidebar-content log-content">
                  {gitOutput ? (
                    <pre className="log-output">{gitOutput}</pre>
                  ) : (
                    <div className="sidebar-empty">暂无Git操作记录</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {cards.length === 0 && (
        <div className="empty-state">
          <p>还没有项目，点击上方"添加项目"开始</p>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>确认删除项目</h3>
            <p>将从列表中删除“{pendingDelete.name}”。此操作只删除应用里的项目配置，不会删除源目录或目标目录中的文件。</p>
            <div className="modal-path">
              <small>源目录: {pendingDelete.sourcePath || "未选择"}</small>
              <br />
              <small>目标目录: {pendingDelete.targetPath || "未选择"}</small>
            </div>
            <div className="modal-actions">
              <button className="action-btn cancel-btn" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button className="action-btn danger-btn" onClick={confirmDeleteCard}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualCommitModal && pendingCommit && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>输入 Commit 信息</h3>
            <p>项目: {pendingCommit.card.name}</p>
            <div className="modal-path">
              <small>目标: {pendingCommit.card.targetPath}</small>
            </div>
            <div className="modal-commit-section">
              <label>Commit 消息:</label>
              <input
                type="text"
                className="commit-input"
                value={pendingCommit.commitMessage}
                onChange={(event) =>
                  setPendingCommit({ ...pendingCommit, commitMessage: event.target.value })
                }
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="action-btn cancel-btn" onClick={() => {
                setShowManualCommitModal(false);
                updateCard(pendingCommit.card.id, { status: "ready", message: "文件处理完成，等待提交。", progress: 100 });
              }}>
                取消
              </button>
              <button className="action-btn confirm-btn" onClick={executeManualCommit}>
                确认并提交
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && pendingCommit && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>确认 Git 提交</h3>
            <p>项目: {pendingCommit.card.name}</p>
            <div className="modal-path">
              <small>目标: {pendingCommit.card.targetPath}</small>
            </div>
            <div className="modal-commit-section">
              <label>Commit 消息:</label>
              <input
                type="text"
                className="commit-input"
                value={pendingCommit.commitMessage}
                onChange={(event) =>
                  setPendingCommit({ ...pendingCommit, commitMessage: event.target.value })
                }
              />
            </div>
            <div className="modal-actions">
              <button className="action-btn cancel-btn" onClick={() => setShowConfirmModal(false)}>
                取消
              </button>
              <button className="action-btn confirm-btn" onClick={executeCommit}>
                确认并推送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

export default App;
