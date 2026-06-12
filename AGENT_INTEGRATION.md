# AI Agent 集成变更说明（v1.5.0 / v1.5.1）

**日期**: 2026-06-11
**作用域**: 为「前端部署工具」引入 AI 助手能力（Agent），并打通前端 UI。

---

## 一、本次改动总览

```
变更文件 6 个（+486 / -16 行）
新增文件 9 个
```

### 1.1 新增文件

| 路径 | 说明 |
|---|---|
| `src-tauri/src/agent/mod.rs` | Agent 模块入口，导出 `run_agent`、`AgentConfigView`、消息构造助手 |
| `src-tauri/src/agent/llm.rs` | DeepSeek 兼容 Chat Completions 客户端（基于 `curl.exe`） |
| `src-tauri/src/agent/providers.rs` | AI 服务方预设（DeepSeek / Qwen / Custom） |
| `src-tauri/src/agent/secret.rs` | API Key / Base URL / Model 本地存取（DPAPI） |
| `src-tauri/src/agent/tools.rs` | 19 个工具的 JSON Schema + 执行实现 |
| `src/components/AiAssistant.tsx` | 右下角悬浮气泡 + 侧边聊天面板 |
| `src/components/AiAssistant.css` | AI 助手样式 |
| `src/components/AiConfigDrawer.tsx` | AI 配置抽屉（API Key、Provider、模型、连通性测试） |
| `src/components/AiConfigDrawer.css` | AI 配置抽屉样式 |
| `src/services/agentService.ts` | 前端调用 agent 命令的统一封装 |
| `src/types/agent.ts` | Agent 相关 TS 类型 |

### 1.2 修改文件

| 路径 | 关键改动 |
|---|---|
| `src-tauri/src/main.rs` | 注册 `mod agent`；新增 10 个 `#[tauri::command]`；`is_path_safe` 改 `pub` |
| `src/App.tsx` | 挂载 `<AiAssistant />` 与 `<AiConfigDrawer />`；加载 AI 配置状态 |
| `src/components/SettingsDrawer.tsx` | 新增 AI 设置入口；更新 v1.5.0 / v1.5.1 更新日志 |
| `src/components/SettingsDrawer.css` | AI 设置区样式 |
| `src/components/index.ts` | 导出 `AiAssistant` / `AiConfigDrawer` |
| `src/types/index.ts` | 透出 `agent` 类型 |

### 1.3 后端日志（未跟踪）

`cargo_check.log` / `cargo_err.log` / `cargo_out.log` 已加入工作区（未提交）。

---

## 二、架构

```
┌────────────────────────────────────────────────────┐
│ React 前端                                         │
│  ┌────────────────┐    ┌────────────────────┐      │
│  │  AiAssistant   │ -> │  AiConfigDrawer    │      │
│  └───────┬────────┘    └─────────┬──────────┘      │
│          │ chat / config         │                 │
│          └──────────┬────────────┘                 │
│                     ▼                              │
│            agentService.ts (invoke 包装)            │
└─────────────────────┬──────────────────────────────┘
                      │ Tauri IPC
┌─────────────────────▼──────────────────────────────┐
│ Rust 后端 (main.rs)                                │
│  agent_get_config / save / clear / update_settings│
│  agent_chat / list_tools / list_providers / ...    │
│                     │                              │
│                     ▼                              │
│  ┌──────────────────────────────────────┐          │
│  │ agent::mod                           │          │
│  │  ├─ run_agent  (ReAct 串行循环)      │          │
│  │  ├─ llm        (DeepSeek / Qwen)    │          │
│  │  ├─ providers  (3 个内置服务方)     │          │
│  │  ├─ tools      (19 个工具)          │          │
│  │  └─ secret     (DPAPI 加密存储)      │          │
│  └──────────────────────────────────────┘          │
└────────────────────────────────────────────────────┘
```

---

## 三、功能要点

### 3.1 推理循环（`run_agent`）

[mod.rs](file:///e:/fastload/file-mover/src-tauri/src/agent/mod.rs) 的执行流程：
1. 加载 API Key / Base URL / Model（缺一即报错）
2. 拼装 messages：`[system, ...history, user]`
3. 调 [`chat_completion`](file:///e:/fastload/file-mover/src-tauri/src/agent/llm.rs#L73-L96)（同步）
4. 解析 `tool_calls` → 循环执行 → 把结果回灌
5. 最多 8 轮（`MAX_TURNS`），超过即报错

### 3.2 工具集（19 个）

[tools.rs](file:///e:/fastload/file-mover/src-tauri/src/agent/tools.rs) 分为 5 类：

| 分类 | 工具 |
|---|---|
| 项目管理 | `list_projects` / `add_project` / `update_project` / `delete_project` |
| 文件搬运 | `execute_project` / `stop_project` |
| Git | `git_status` / `git_pull` / `git_commit_push` / `git_log` |
| 应用设置 | `get_git_proxy` / `set_git_proxy` / `get_autostart` / `set_autostart` / `get_nvm_info` |
| 日常 | `get_weather` / `web_search` / `get_current_time` / `ping_host` |

所有路径都经 [`is_path_safe`](file:///e:/fastload/file-mover/src-tauri/src/main.rs) 校验。

### 3.3 LLM 客户端

[llm.rs](file:///e:/fastload/file-mover/src-tauri/src/agent/llm.rs)：
- 走系统 `curl.exe`（Win10 1803+ 自带），不引入额外 HTTP 依赖
- 请求体写临时文件，避免命令行长度限制
- 默认端点 `https://api.deepseek.com/v1` + `deepseek-chat`
- 系统提示词（`system_prompt`）注入「前端部署工具」身份 + 当前时间

### 3.4 服务方切换（v1.5.1 新增）

[providers.rs](file:///e:/fastload/file-mover/src-tauri/src/agent/providers.rs) 内置 3 个 provider：

| ID | 默认端点 | 内置模型 |
|---|---|---|
| `deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` / `deepseek-reasoner` |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` / `qwen-plus` / `qwen-max` / `qwen-long` / `qwen-coder-plus` |
| `custom` | 用户自定义 | 自由输入 |

`AiConfigDrawer` 选中 provider 后会自动填充端点与默认模型；保存时也支持「只换模型 / 端点、不动 Key」。

### 3.5 前端体验

[AiAssistant.tsx](file:///e:/fastload/file-mover/src/components/AiAssistant.tsx)：
- 右下角悬浮气泡，无干扰时可收起
- 侧滑聊天面板，多轮对话、工具调用步骤折叠展示、可停止
- 历史记录持久化到 `localStorage`（最近 50 条）
- 首次使用引导到 `AiConfigDrawer` 填 Key
- 通过 `agentService` 统一调用 Rust 命令，错误兜底

### 3.6 安全

- API Key 用 Windows **DPAPI** 加密本地存储（见 `secret.rs`）
- 前端只看到 `hasApiKey: bool`，不读明文
- 所有工具路径经过 `is_path_safe` 规范化 + 白名单校验
- `delete_project` / `git_commit_push` 等高风险操作在系统提示词中要求"先简要说明"

---

## 四、Tauri 命令清单（后端 IPC）

| 命令 | 入参 | 出参 | 用途 |
|---|---|---|---|
| `agent_get_config` | — | `AgentConfigView` | 读配置（不含明文 Key） |
| `agent_save_config` | `{ apiKey, baseUrl?, model? }` | `AgentConfigView` | 首次配置 |
| `agent_update_settings` | `{ baseUrl?, model? }` | `AgentConfigView` | 切换 provider / 模型 |
| `agent_clear_config` | — | — | 清空所有密钥 |
| `agent_chat` | `{ message, history? }` | `AgentChatOutput` | 发起对话（内部跑 ReAct 循环） |
| `agent_list_tools` | — | `Vec<Value>` | 列出所有工具定义 |
| `agent_list_providers` | — | `Vec<AgentProvider>` | 列出 provider 预设 |
| `agent_match_provider` | `{ baseUrl }` | `String` | 推断当前端点属于哪个 provider |
| `agent_test_connection` | — | `String` | 用当前配置跑一次 `ping` |

---

## 五、回归测试

[`mod.rs` 内置 2 个测试](file:///e:/fastload/file-mover/src-tauri/src/agent/mod.rs#L31-L63)：
- `agent_config_view_serializes_as_camel_case`：保证 Rust → JS 字段名映射正确
- `agent_chat_output_serializes_as_camel_case`：同上

这是早期踩过坑（`state` 变 `undefined` → `.trim()` 崩溃）后加的兜底。

---

## 六、已知限制

1. **同步阻塞**：`chat_completion` 走 `curl.exe`，最长 120s 会卡住 Tauri 主线程；当前通过 `Promise` 包装让前端体感是异步。
2. **无流式**：LLM 回复一次性返回，无法打字机效果。
3. **无 ReAct 反思**：循环到 8 轮就硬停，没有"是否达成目标"的判断。
4. **无长期记忆**：仅前端 localStorage 50 条；不跨设备、不索引。
5. **无审批弹窗**：`delete_project` / `git_commit_push` 等直接执行，没接 `ConfirmModal`。
6. **单 provider 协议**：只支持 OpenAI Chat Completions 兼容协议；不支持 Anthropic / Gemini 原生协议。

---

## 七、演进方向

短期（建议下一迭代）：
- 流式输出（SSE 解析 + Tauri event 推送）
- 真正的 ReAct 反思 + Plan 工具
- 通用工具补齐：`read_file` / `write_file`（带审批） / `list_dir` / `run_shell`（带审批） / `fetch_url`
- Skill 目录机制：把 19 个工具按 deploy / diagnose / query 打包

中期：MCP 协议接入、SQLite 长期记忆 + embedding、子 Agent、后台定时任务。
远期：多 Agent 协作、Agent 自蒸馏新 Skill、云端化。

详细路线图见对话存档（未单独成文）。

---

## 八、变更检查清单

- [x] Rust agent 模块编译通过（`cargo_check.log`）
- [x] 前端 TS 编译通过（`npm run build`）
- [x] 关键回归测试（camelCase）通过
- [x] AI 助手可正常打开、配置 Key、聊天
- [x] 服务方切换：DeepSeek ↔ Qwen 验证
- [x] 工具调用：`list_projects` / `execute_project` / `git_log` 等实跑通过
- [ ] 流式输出
- [ ] 审批弹窗接入
- [ ] 长期记忆层
