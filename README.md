# 前端部署工具

一个基于 Tauri + React 构建的桌面应用，用于简化前端文件部署流程。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **桌面框架**: Tauri 2.0
- **构建工具**: Vite
- **语言**: Rust (后端) + TypeScript (前端)

---

## 一、环境配置（从零开始）

### 步骤 1：安装 Node.js

下载地址：https://nodejs.org/

验证安装：
```bash
node -v
npm -v
```

### 步骤 2：安装 Rust

下载地址：https://www.rustup.rs/

或使用 PowerShell 安装：
```powershell
irm https://win.rustup.rs | iex
```

验证安装：
```bash
rustc -V
cargo -V
```

### 步骤 3：安装 Visual Studio Build Tools

下载地址：https://visualstudio.microsoft.com/downloads/

选择安装：
- **C++ 生成工具**
- **Windows 11 SDK**（或 Windows 10 SDK）

### 步骤 4：配置环境变量

在 PowerShell 中设置临时环境变量：

```powershell
# 添加 MSVC 工具链路径（根据实际安装版本调整）
$env:PATH = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:PATH"

# 添加 Rust cargo 路径
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

> **查找 MSVC 路径方法**：
> 打开 Visual Studio Installer → 修改 → C++ 生成工具 → 修改 → 复制工具链路径

### 步骤 5：永久配置 PATH（可选）

1. 按 `Win + R`，输入 `sysdm.cpl`
2. 高级 → 环境变量 → 系统变量 → Path
3. 添加以下路径：
   - `C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64`
   - `%USERPROFILE%\.cargo\bin`

---

## 二、项目初始化

### 步骤 1：克隆项目

```bash
git clone <项目地址>
cd file-mover
```

### 步骤 2：安装前端依赖

```bash
npm install
```

### 步骤 3：验证环境

```bash
# 检查 Rust 环境
cargo --version

# 检查 Node 环境
node --version
npm --version
```

---

## 三、开发调试

### 启动开发模式

```bash
# 确保环境变量已配置
npm run tauri dev
```

这会：
1. 启动 Vite 开发服务器
2. 编译 Rust 后端
3. 打开桌面应用窗口
4. 支持热重载

### 单独启动前端

```bash
npm run dev
```

### 单独构建前端

```bash
npm run build
```

---

## 四、打包发布

### 构建生产版本

```bash
npm run tauri build
```

这会：
1. 编译前端代码
2. 编译 Rust 代码
3. 生成可执行文件
4. 创建 Windows 安装包 (NSIS)

### 打包输出位置

| 类型 | 路径 |
|------|------|
| 可执行文件 | `src-tauri/target/release/file-mover.exe` |
| 安装包 | `src-tauri/target/release/bundle/nsis/*.exe` |

### 运行打包后的程序

```bash
# 直接运行 exe
.\src-tauri\target\release\file-mover.exe

# 或通过安装包安装后运行
.\src-tauri\target\release\bundle\nsis\*.exe
```

---

## 五、常见问题

### Q1: cargo command not found / program not found

**原因**：Rust 未安装或 PATH 未配置

**解决**：添加 Rust cargo 路径到 PATH

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

**如果提示找不到 cargo.exe**，可能是 Rust 安装在其他位置，尝试：

```powershell
# 方案1：使用完整用户路径
$env:PATH = "C:\Users\YBG\.cargo\bin;$env:PATH"

# 方案2：在当前用户目录下查找
Get-ChildItem -Path "C:\Users\$env:USERNAME" -Filter "cargo.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 -ExpandProperty FullName
```

**永久配置 PATH**：
1. 按 `Win + R`，输入 `sysdm.cpl`
2. 高级 → 环境变量 → 用户变量 → Path → 编辑
3. 添加：`C:\Users\你的用户名\.cargo\bin`
4. 重启终端

### Q2: linker link.exe not found

**原因**：MSVC 编译器路径未配置

**解决**：
```powershell
$env:PATH = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:PATH"
```

### Q3: npm install 失败

**解决**：
```bash
# 清除缓存
npm cache clean --force

# 重新安装
rm -rf node_modules
npm install
```

### Q4: 构建时卡住

**解决**：检查网络连接，确保可以访问 GitHub

---

## 六、项目结构

```
file-mover/
├── src/                    # React 前端源码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx          # React 入口文件
│   └── styles.css        # 全局样式
├── src-tauri/            # Tauri 后端源码
│   ├── src/
│   │   └── main.rs       # Rust 入口
│   ├── Cargo.toml        # Rust 依赖配置
│   ├── tauri.conf.json   # Tauri 配置
│   └── build.rs          # 构建脚本
├── index.html            # HTML 入口
├── package.json          # Node 依赖配置
├── vite.config.ts        # Vite 配置
└── tsconfig.json         # TypeScript 配置
```

---

## 七、配置说明

### Tauri 配置

文件：`src-tauri/tauri.conf.json`

```json
{
  "productName": "前端部署工具",  // 应用名称
  "version": "1.0.0",           // 版本号
  "app": {
    "windows": [{
      "title": "前端部署工具",   // 窗口标题
      "width": 1200,            // 窗口宽度
      "height": 800             // 窗口高度
    }]
  }
}
```

### 应用标识

- **identifier**: `com.ybg.file-mover`
- **窗口标题**: 前端部署工具
- **默认尺寸**: 1200 x 800

---

## 八、功能特性

- [ ] 文件选择与浏览
- [ ] 文件移动/复制操作
- [ ] 原生系统对话框集成
- [ ] 跨平台支持 (Windows)
