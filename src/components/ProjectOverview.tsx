/**
 * ProjectOverview 组件
 *
 * 前端网站项目概览组件
 *
 * 功能：
 * - 显示所有前端网站项目
 * - 展示每个项目的 net 和 com 环境配置
 * - 支持新增、编辑、删除项目
 * - 支持管理账号密码
 * - 支持展开/收起抽屉
 * - 支持配置导出/导入（通过主项目的导入导出功能）
 */

import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import type { WebsiteProject, Environment, AccountCredential } from "../types/project";
import { projectService } from "../services/projectService";
import ConfirmModal from "./ConfirmModal";
import "./ProjectOverview.css";

interface ProjectOverviewProps {
  initialExpanded?: boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const createEmptyProject = (): WebsiteProject => ({
  id: generateId(),
  name: "",
  websiteUrl: "",
  gitUrl: "",
  environments: [
    { name: "net", websiteUrl: "" },
    { name: "com", websiteUrl: "" }
  ],
  credentials: []
});

const createEmptyCredential = (): AccountCredential => ({
  id: generateId(),
  label: "",
  username: "",
  password: ""
});

export default function ProjectOverview({ initialExpanded = false }: ProjectOverviewProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [editingProject, setEditingProject] = useState<WebsiteProject | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());
  const [credentialsExpanded, setCredentialsExpanded] = useState<{ [projectId: string]: boolean }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; projectId: string | null; projectName: string }>({
    isOpen: false,
    projectId: null,
    projectName: ""
  });
  const [copyFeedback, setCopyFeedback] = useState<{ [key: string]: boolean }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isExpanded]);

  const loadProjects = async () => {
    try {
      const { websiteProjects } = await projectService.loadConfig();
      if (websiteProjects.length === 0) {
        const demoProjects: WebsiteProject[] = [
          {
            id: "1",
            name: "企业官网",
            websiteUrl: "https://www.example.com",
            gitUrl: "https://github.com/company/corp-web.git",
            environments: [
              { name: "net", websiteUrl: "https://www.example.net" },
              { name: "com", websiteUrl: "https://www.example.com" }
            ],
            credentials: [
              { id: "c1", label: "管理后台", username: "admin", password: "admin123" },
              { id: "c2", label: "FTP", username: "ftp_user", password: "ftp_pass" }
            ]
          },
          {
            id: "2",
            name: "电商平台",
            websiteUrl: "https://shop.example.com",
            gitUrl: "https://github.com/company/ecommerce.git",
            environments: [
              { name: "net", websiteUrl: "https://shop.example.net" },
              { name: "com", websiteUrl: "https://shop.example.com" }
            ],
            credentials: []
          }
        ];
        setProjects(demoProjects);
        await projectService.saveWebsiteProjects(demoProjects);
      } else {
        setProjects(websiteProjects);
      }
    } catch (err) {
      console.error("加载网站项目失败:", err);
      setProjects([]);
    }
  };

  const handleAddNew = () => {
    setEditingProject(createEmptyProject());
    setIsAddingNew(true);
  };

  const handleEdit = (project: WebsiteProject) => {
    setEditingProject({ ...project, environments: [...project.environments], credentials: [...project.credentials] });
    setIsAddingNew(false);
  };

  const handleSave = async () => {
    if (!editingProject) return;

    let updatedProjects: WebsiteProject[];

    if (isAddingNew) {
      updatedProjects = [...projects, editingProject];
    } else {
      updatedProjects = projects.map(p => p.id === editingProject.id ? editingProject : p);
    }

    setProjects(updatedProjects);
    setEditingProject(null);
    setIsAddingNew(false);

    try {
      await projectService.saveWebsiteProjects(updatedProjects);
    } catch (err) {
      console.error("保存网站项目失败:", err);
    }
  };

  const handleCancel = () => {
    setEditingProject(null);
    setIsAddingNew(false);
  };

  const handleDelete = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
      setDeleteConfirm({
        isOpen: true,
        projectId: id,
        projectName: project.name
      });
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirm.projectId) {
      const updatedProjects = projects.filter(p => p.id !== deleteConfirm.projectId);
      setProjects(updatedProjects);
      if (editingProject?.id === deleteConfirm.projectId) {
        setEditingProject(null);
        setIsAddingNew(false);
      }

      try {
        await projectService.saveWebsiteProjects(updatedProjects);
      } catch (err) {
        console.error("保存删除后的网站项目失败:", err);
      }
    }
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: "" });
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: "" });
  };

  const handleUpdateField = <K extends keyof WebsiteProject>(field: K, value: WebsiteProject[K]) => {
    if (!editingProject) return;
    setEditingProject(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleUpdateEnvironment = (index: number, field: keyof Environment, value: string) => {
    if (!editingProject) return;
    const newEnvironments = [...editingProject.environments];
    newEnvironments[index] = { ...newEnvironments[index], [field]: value };
    setEditingProject(prev => prev ? { ...prev, environments: newEnvironments } : null);
  };

  const handleAddCredential = () => {
    if (!editingProject) return;
    setEditingProject(prev => prev ? { ...prev, credentials: [...prev.credentials, createEmptyCredential()] } : null);
  };

  const handleUpdateCredential = (index: number, field: keyof AccountCredential, value: string) => {
    if (!editingProject) return;
    const newCredentials = [...editingProject.credentials];
    newCredentials[index] = { ...newCredentials[index], [field]: value };
    setEditingProject(prev => prev ? { ...prev, credentials: newCredentials } : null);
  };

  const handleRemoveCredential = (index: number) => {
    if (!editingProject) return;
    const newCredentials = editingProject.credentials.filter((_, i) => i !== index);
    setEditingProject(prev => prev ? { ...prev, credentials: newCredentials } : null);
  };

  const toggleShowPassword = (id: string) => {
    setShowPasswords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopyFeedback(prev => ({ ...prev, [key]: false }));
      }, 1500);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  const handleOpenUrl = async (url: string) => {
    if (url) {
      try {
        await open(url);
      } catch (err) {
        console.error("打开链接失败:", err);
      }
    }
  };

  return (
    <div className="project-overview-wrapper" ref={containerRef}>
      <button
        className="nvm-toggle-btn project-overview-btn"
        onClick={() => setIsExpanded(!isExpanded)}
        title="项目概览"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      </button>

      {isExpanded && (
        <div className="project-overview-drawer">
          <div className="project-overview-header">
            <h2>项目概览</h2>
            <button className="nvm-close-btn" onClick={() => setIsExpanded(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {editingProject ? (
            <div className="project-edit-form">
              <div className="form-section">
                <label className="form-label required">项目名称</label>
                <div className="input-with-clear">
                  <input
                    type="text"
                    className="form-input"
                    value={editingProject.name}
                    onChange={(e) => handleUpdateField("name", e.target.value)}
                    placeholder="输入项目名称"
                  />
                  {editingProject.name && (
                    <button className="clear-input-btn" onClick={() => handleUpdateField("name", "")} type="button">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="form-section">
                <label className="form-label required">网站地址</label>
                <div className="input-with-clear">
                  <input
                    type="url"
                    className="form-input"
                    value={editingProject.websiteUrl}
                    onChange={(e) => handleUpdateField("websiteUrl", e.target.value)}
                    placeholder="https://www.example.com"
                  />
                  {editingProject.websiteUrl && (
                    <button className="clear-input-btn" onClick={() => handleUpdateField("websiteUrl", "")} type="button">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="form-section">
                <label className="form-label optional">Git 仓库地址</label>
                <div className="input-with-clear">
                  <input
                    type="text"
                    className="form-input"
                    value={editingProject.gitUrl}
                    onChange={(e) => handleUpdateField("gitUrl", e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                  />
                  {editingProject.gitUrl && (
                    <button className="clear-input-btn" onClick={() => handleUpdateField("gitUrl", "")} type="button">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="form-section">
                <label className="form-label optional">部署环境</label>
                <div className="environments-edit">
                  {editingProject.environments.map((env, index) => (
                    <div key={env.name} className={`environment-edit-item ${env.name}`}>
                      <div className="env-name-badge">{env.name.toUpperCase()}</div>
                      <div className="input-with-clear">
                        <input
                          type="text"
                          className="form-input small"
                          value={env.websiteUrl}
                          onChange={(e) => handleUpdateEnvironment(index, "websiteUrl", e.target.value)}
                          placeholder="https://www.example.com"
                        />
                        {env.websiteUrl && (
                          <button className="clear-input-btn" onClick={() => handleUpdateEnvironment(index, "websiteUrl", "")} type="button">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <label className="form-label">账号密码</label>
                  <button className="add-btn" onClick={handleAddCredential}>+ 添加账号</button>
                </div>
                <div className="credentials-list">
                  {editingProject.credentials.map((cred, index) => (
                    <div key={cred.id} className="credential-item">
                      <div className="input-with-clear">
                        <input
                          type="text"
                          className="form-input small"
                          value={cred.username}
                          onChange={(e) => handleUpdateCredential(index, "username", e.target.value)}
                          placeholder="账号"
                        />
                        {cred.username && (
                          <button className="clear-input-btn" onClick={() => handleUpdateCredential(index, "username", "")} type="button">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="password-field">
                        <input
                          type={showPasswords.has(cred.id) ? "text" : "password"}
                          className="form-input small"
                          value={cred.password}
                          onChange={(e) => handleUpdateCredential(index, "password", e.target.value)}
                          placeholder="密码"
                        />
                        <button
                          className="toggle-password-btn"
                          onClick={() => toggleShowPassword(cred.id)}
                          type="button"
                          title={showPasswords.has(cred.id) ? "隐藏密码" : "显示密码"}
                        >
                          {showPasswords.has(cred.id) ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                              <line x1="1" y1="1" x2="23" y2="23"></line>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          )}
                        </button>
                      </div>
                      <button className="remove-btn" onClick={() => handleRemoveCredential(index)} type="button" title="删除账号">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button className="cancel-btn" onClick={handleCancel}>取消</button>
                <button className="save-btn" onClick={handleSave} disabled={!editingProject.name.trim() || !editingProject.websiteUrl.trim()}>
                  保存
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="project-overview-toolbar">
                <button className="add-project-btn" onClick={handleAddNew}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  新增项目
                </button>
              </div>

              <div className="project-overview-content">
                {projects.length === 0 ? (
                  <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    <p>暂无项目配置</p>
                    <span>点击上方按钮添加新项目</span>
                  </div>
                ) : (
                  <div className="project-list">
                    {projects.map((project) => (
                      <div key={project.id} className="project-item">
                        <div className="project-header">
                          <div className="project-name">{project.name}</div>
                          <div className="project-actions">
                            <button className="edit-btn" onClick={() => handleEdit(project)} title="编辑">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button className="delete-btn" onClick={() => handleDelete(project.id)} title="删除">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="project-urls">
                          {project.websiteUrl && (
                            <div className="url-item">
                              <span className="url-label">网站</span>
                              <span className="url-value">{project.websiteUrl}</span>
                              <div className="url-actions">
                                <button 
                                  className={`action-icon-btn ${copyFeedback[`website-${project.id}`] ? 'copied' : ''}`}
                                  onClick={() => handleCopy(project.websiteUrl, `website-${project.id}`)}
                                  title="复制网站地址"
                                >
                                  {copyFeedback[`website-${project.id}`] ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                  )}
                                </button>
                                <button 
                                  className="action-icon-btn"
                                  onClick={() => handleOpenUrl(project.websiteUrl)}
                                  title="打开网站"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                          {project.gitUrl && (
                            <div className="url-item">
                              <span className="url-label">Git</span>
                              <span className="url-value">{project.gitUrl}</span>
                              <div className="url-actions">
                                <button 
                                  className={`action-icon-btn ${copyFeedback[`git-${project.id}`] ? 'copied' : ''}`}
                                  onClick={() => handleCopy(project.gitUrl, `git-${project.id}`)}
                                  title="复制Git地址"
                                >
                                  {copyFeedback[`git-${project.id}`] ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="environment-list">
                          {project.environments.map((env) => (
                            <div key={env.name} className={`environment-item ${env.name}`}>
                              <div className="env-header">
                                <div className="env-header-row">
                                  <span className="env-name">{env.name.toUpperCase()}</span>
                                  {env.websiteUrl && (
                                    <div className="url-actions">
                                      <button 
                                        className={`action-icon-btn ${copyFeedback[`env-website-${env.name}-${project.id}`] ? 'copied' : ''}`}
                                        onClick={() => handleCopy(env.websiteUrl, `env-website-${env.name}-${project.id}`)}
                                        title="复制网站地址"
                                      >
                                        {copyFeedback[`env-website-${env.name}-${project.id}`] ? (
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                          </svg>
                                        ) : (
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                      <button 
                                        className="action-icon-btn"
                                        onClick={() => handleOpenUrl(env.websiteUrl)}
                                        title="打开网站"
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                            <polyline points="15 3 21 3 21 9"></polyline>
                                            <line x1="10" y1="14" x2="21" y2="3"></line>
                                          </svg>
                                        </button>
                                    </div>
                                  )}
                                </div>
                                {env.websiteUrl && (
                                  <span className="env-website-url">{env.websiteUrl}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {project.credentials.length > 0 && (
                          <div className="credentials-section">
                            <div className="credentials-header" onClick={() => setCredentialsExpanded(prev => ({ ...prev, [project.id]: !prev[project.id] }))}>
                              <span>账号密码</span>
                              <span className={`credentials-toggle ${credentialsExpanded[project.id] ? 'expanded' : ''}`}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </span>
                            </div>
                            {credentialsExpanded[project.id] && (
                              <div className="credentials-grid">
                                {project.credentials.map((cred) => (
                                  <div key={cred.id} className="credential-display">
                                    <div className="cred-content">
                                      <span className="cred-user">{cred.username}</span>
                                      <button 
                                        className={`action-icon-btn ${copyFeedback[`user-${cred.id}`] ? 'copied' : ''}`}
                                        onClick={() => handleCopy(cred.username, `user-${cred.id}`)}
                                        title="复制账号"
                                      >
                                        {copyFeedback[`user-${cred.id}`] ? (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                          </svg>
                                        ) : (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                    <div className="cred-content">
                                      <span className="cred-password">
                                        {showPasswords.has(cred.id) ? cred.password : "••••••"}
                                      </span>
                                      <button
                                        className="action-icon-btn"
                                        onClick={() => toggleShowPassword(cred.id)}
                                        title={showPasswords.has(cred.id) ? "隐藏密码" : "显示密码"}
                                      >
                                        {showPasswords.has(cred.id) ? (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                            <line x1="1" y1="1" x2="23" y2="23"></line>
                                          </svg>
                                        ) : (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                          </svg>
                                        )}
                                      </button>
                                      <button 
                                        className={`action-icon-btn ${copyFeedback[`pwd-${cred.id}`] ? 'copied' : ''}`}
                                        onClick={() => handleCopy(cred.password, `pwd-${cred.id}`)}
                                        title="复制密码"
                                      >
                                        {copyFeedback[`pwd-${cred.id}`] ? (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                          </svg>
                                        ) : (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="确认删除"
        confirmText="删除"
        cancelText="取消"
        confirmType="danger"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      >
        <p style={{ margin: 0, textAlign: "center" }}>
          确定要删除项目 "<strong>{deleteConfirm.projectName}</strong>" 吗？<br />
          此操作无法撤销。
        </p>
      </ConfirmModal>
    </div>
  );
}
