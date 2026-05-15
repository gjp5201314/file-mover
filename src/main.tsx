/**
 * 应用入口文件
 *
 * React 应用的启动入口
 *
 * 功能：
 * 1. 创建 React 根节点
 * 2. 渲染 App 组件
 * 3. 启用开发模式检查
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

/**
 * 渲染应用
 *
 * 步骤：
 * 1. 获取 DOM 根节点（#root）
 * 2. 创建 React 18 Root
 * 3. 渲染 App 组件
 *
 * StrictMode 说明：
 * - 帮助发现组件中的潜在问题
 * - 双重渲染以检测副作用
 * - 仅在开发模式下生效
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
