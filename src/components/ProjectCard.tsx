import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./ProjectCard.css";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
}

export interface ProjectCardData {
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

interface ProjectCardProps {
  card: ProjectCardData;
  onUpdateCard: (id: string, updates: Partial<ProjectCardData>) => void;
  onDeleteCard: (card: ProjectCardData) => void;
  onExecute: (id: string) => void;
  onConfirmCommit: (card: ProjectCardData) => void;
  onReset: (id: string) => void;
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

export default function ProjectCard({
  card,
  onUpdateCard,
  onDeleteCard,
  onExecute,
  onConfirmCommit,
  onReset,
}: ProjectCardProps) {
  const selectSource = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        onUpdateCard(card.id, { sourcePath: selected as string, status: "idle" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectTarget = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        const newTargetPath = selected as string;
        let allEntries: FileEntry[] = [];
        try {
          const result = await invoke<{ name: string; isDirectory: boolean }[]>("list_directories", {
            path: newTargetPath,
          });
          allEntries = result.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
        } catch {}
        onUpdateCard(card.id, {
          targetPath: newTargetPath,
          status: "idle",
          clearTargetAllEntries: allEntries,
          clearTargetFolders:
            card.clearTargetMode === "specific"
              ? allEntries.filter((e) => !card.clearTargetFolders.includes(e.name)).map((e) => e.name)
              : [],
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearTargetModeChange = (mode: "none" | "all" | "specific") => {
    if (mode === "specific") {
      if (card.targetPath) {
        invoke<{ name: string; isDirectory: boolean }[]>("list_directories", { path: card.targetPath })
          .then((entries) => {
            const allEntries = entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
            onUpdateCard(card.id, {
              clearTargetMode: "specific",
              clearTargetAllEntries: allEntries,
              clearTargetFolders: allEntries.map((e) => e.name),
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
  };

  const refreshFolders = async () => {
    if (card.targetPath) {
      try {
        const entries = await invoke<{ name: string; isDirectory: boolean }[]>("list_directories", {
          path: card.targetPath,
        });
        const allEntries = entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
        const selectedSet = new Set(card.clearTargetFolders);
        const newEntries = allEntries.filter(
          (e) => selectedSet.has(e.name) || !card.clearTargetAllEntries.some((ex) => ex.name === e.name)
        );
        const combinedAll = [...card.clearTargetAllEntries, ...newEntries].filter(
          (e, i, arr) => arr.findIndex((x) => x.name === e.name) === i
        );
        combinedAll.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return b.isDirectory ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
        onUpdateCard(card.id, {
          clearTargetAllEntries: combinedAll,
          clearTargetFolders: card.clearTargetFolders.filter((f) => combinedAll.some((e) => e.name === f)),
        });
      } catch (err) {
        console.error("获取目录失败:", err);
      }
    }
  };

  return (
    <div className={`project-card ${card.status}`}>
      <div className="card-header">
        <input
          type="text"
          className="card-name-input"
          value={card.name}
          onChange={(event) => onUpdateCard(card.id, { name: event.target.value })}
        />
        <button
          className="card-delete-btn"
          onClick={() => onDeleteCard(card)}
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
            <button className="path-btn full-width" onClick={selectSource}>
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
            <button className="path-btn full-width" onClick={selectTarget}>
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
                  onChange={(event) => onUpdateCard(card.id, { autoPull: event.target.checked })}
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

            {card.clearTargetMode === "specific" && (
              <div className="folder-selection">
                <div className="folder-selection-header">
                  <span>选择要删除的文件/文件夹：</span>
                  <button className="refresh-folders-btn" onClick={refreshFolders}>
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
                        <label
                          key={entry.name}
                          className={`folder-checkbox-label ${!isSelected ? "unselected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => {
                              const newFolders = event.target.checked
                                ? [...card.clearTargetFolders, entry.name]
                                : card.clearTargetFolders.filter((f) => f !== entry.name);
                              onUpdateCard(card.id, { clearTargetFolders: newFolders });
                            }}
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

            <div className="option-item">
              <span className="radio-group-label">提交方式：</span>
              <div className="radio-group-inline">
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`commitMode-${card.id}`}
                    value="auto"
                    checked={card.commitMode === "auto"}
                    onChange={() => onUpdateCard(card.id, { commitMode: "auto" })}
                  />
                  <span>自动提交并推送</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`commitMode-${card.id}`}
                    value="manual"
                    checked={card.commitMode === "manual"}
                    onChange={() => onUpdateCard(card.id, { commitMode: "manual" })}
                  />
                  <span>手动填写 Commit</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={`commitMode-${card.id}`}
                    value="none"
                    checked={card.commitMode === "none"}
                    onChange={() => onUpdateCard(card.id, { commitMode: "none" })}
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
                onChange={() => onUpdateCard(card.id, { moveMode: "copy" })}
              />
              <span>复制</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name={`moveMode-${card.id}`}
                value="cut"
                checked={card.moveMode === "cut"}
                onChange={() => onUpdateCard(card.id, { moveMode: "cut" })}
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
            onClick={() => onExecute(card.id)}
            disabled={!card.sourcePath || !card.targetPath}
          >
            开始执行
          </button>
        )}
        {card.status === "ready" && card.commitMode !== "none" && (
          <button className="action-btn confirm-btn" onClick={() => onConfirmCommit(card)}>
            填写并提交
          </button>
        )}
        {card.status === "ready" && card.commitMode === "none" && (
          <button className="action-btn reset-btn" onClick={() => onReset(card.id)}>
            重置
          </button>
        )}
        {(card.status === "done" || card.status === "error") && (
          <button className="action-btn reset-btn" onClick={() => onReset(card.id)}>
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
  );
}
