/**
 * ProjectSidebar 组件
 *
 * 项目侧边栏日志面板
 *
 * 功能：
 * - 显示文件操作日志（复制、清空等）
 * - 显示 Git 操作日志（pull、commit、push），按命令分组可点击折叠展开
 * - 支持清空日志内容
 *
 * 布局：
 * - 垂直排列的两个日志区域
 * - 每个区域有标题和清除按钮
 * - 文件日志：纯文本，按行展示
 * - Git 日志：每个 git 命令渲染为一个可折叠的卡片，标题为时间戳 + 命令名
 */

import { useState, useCallback } from "react";
import type { GitLogEntry } from "../context/ProjectContext";
import "./ProjectSidebar.css";

/**
 * ProjectSidebar 组件 Props
 * @interface ProjectSidebarProps
 */
interface ProjectSidebarProps {
  /** 文件操作日志内容 */
  fileOutput: string;
  /** Git 操作日志条目列表（最新在前） */
  gitEntries: GitLogEntry[];
  /** 清除文件日志回调 */
  onClearFileOutput: () => void;
  /** 清除 Git 日志回调 */
  onClearGitOutput: () => void;
}

/**
 * 从内容中提取一行作为标题摘要（如 "152 files changed"）
 * @param content - Git 命令的完整输出
 * @returns 找到的第一行有意义的信息，若无则返回 null
 */
function extractSummary(content: string): string | null {
  // 去掉开头的 "git pull:" / "git commit:" 之类的标签行
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^git\s+\w+:$/i.test(l));
  if (lines.length === 0) return null;
  // 截取第一行作为摘要（过长时省略号收尾）
  const first = lines[0];
  return first.length > 60 ? first.slice(0, 60) + "…" : first;
}

/**
 * ProjectSidebar 组件
 *
 * @param fileOutput - 文件操作日志
 * @param gitEntries - Git 操作日志条目列表
 * @param onClearFileOutput - 清除文件日志
 * @param onClearGitOutput - 清除 Git 日志
 */
export default function ProjectSidebar({
  fileOutput,
  gitEntries,
  onClearFileOutput,
  onClearGitOutput,
}: ProjectSidebarProps) {
  // 已展开的条目 ID 集合
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleEntry = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="project-sidebar">
      {/* 文件操作日志区域 */}
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>文件操作日志</span>
          <button className="sidebar-clear-btn" onClick={onClearFileOutput}>
            清除
          </button>
        </div>
        <div className="sidebar-content log-content">
          {fileOutput ? (
            <pre className="log-output file-log-output">{fileOutput}</pre>
          ) : (
            <div className="sidebar-empty">暂无文件操作记录</div>
          )}
        </div>
      </div>

      {/* Git 操作日志区域 */}
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Git 操作日志</span>
          <button className="sidebar-clear-btn" onClick={onClearGitOutput}>
            清除
          </button>
        </div>
        <div className="sidebar-content log-content">
          {gitEntries.length === 0 ? (
            <div className="sidebar-empty">暂无Git操作记录</div>
          ) : (
            <ul className="git-entry-list">
              {gitEntries.map((entry) => {
                const expanded = expandedIds.has(entry.id);
                const summary = extractSummary(entry.content);
                return (
                  <li
                    key={entry.id}
                    className={`git-entry ${expanded ? "expanded" : ""}`}
                  >
                    <button
                      type="button"
                      className="git-entry-header"
                      onClick={() => toggleEntry(entry.id)}
                      title={expanded ? "收起" : "展开"}
                    >
                      <span className="git-entry-toggle" aria-hidden="true">
                        {expanded ? "▼" : "▶"}
                      </span>
                      <span className="git-entry-time">[{entry.timestamp}]</span>
                      <span className="git-entry-command">{entry.command}</span>
                      {!expanded && summary && (
                        <span className="git-entry-summary" title={summary}>
                          {summary}
                        </span>
                      )}
                    </button>
                    {expanded && (
                      <pre className="git-entry-content">{entry.content}</pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
