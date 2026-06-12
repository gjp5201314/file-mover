---
name: "file-mover-builder"
description: "Guides on building, packaging, and deploying the file-mover app. Invoke when building the app, managing versions, fixing build errors, or releasing new versions."
---

# File Mover Builder Guide

Complete guide for building, packaging, and deploying the **前端部署工具 (File Mover)** application.

## 🔧 Environment Setup

### Prerequisites

Before building, ensure you have:

1. **Node.js 20.x** (managed by Volta)
2. **Rust** (latest stable)
3. **Visual Studio Build Tools 2022** with C++ workload
4. **Windows 11 SDK** or Windows 10 SDK

### Installing Node.js with Volta (Recommended)

```powershell
# Install Volta
iwr https://get.volta.sh -UseBasicParsing | iex

# Restart terminal, then verify
volta --version

# Node.js 20.20.2 will be auto-installed when you cd into the project
```

### Installing Rust

```powershell
# Install Rust
irm https://win.rustup.rs | iex

# Verify installation
rustc --version
cargo --version
```

### Installing Visual Studio Build Tools

1. Download from: https://visualstudio.microsoft.com/downloads/
2. Install with:
   - **C++ 生成工具** (MSVC v143)
   - **Windows 11 SDK** or Windows 10 SDK

## 📦 Dependency Installation

### Frontend Dependencies

```powershell
# Navigate to project
cd file-mover

# Install npm dependencies
npm install

# Verify installation
npm list
```

### Rust Dependencies

Managed by Cargo in `src-tauri/Cargo.toml`. No manual intervention needed.

## 🏃 Development Mode

### Quick Start

```powershell
npm run tauri dev
```

This command:
1. Starts Vite development server
2. Compiles Rust backend
3. Opens the desktop application window
4. Enables hot module replacement (HMR)
5. Supports auto-reload for Rust changes

### Environment Variables

For MSVC toolchain and Rust:

```powershell
# Add MSVC compiler path (adjust version as needed)
$env:PATH = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:PATH"

# Add Rust cargo path
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

### Permanent PATH Configuration

1. Press `Win + R`, type `sysdm.cpl`
2. Go to **Advanced** → **Environment Variables**
3. Add to System Variables → Path:
   - `C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64`
   - `%USERPROFILE%\.cargo\bin`

## 🏗️ Production Build

### Build Commands

#### Build Frontend Only

```powershell
npm run build
```

This runs:
1. TypeScript type checking (`tsc`)
2. Vite production build
3. Output to `dist/` directory

#### Build Complete Application

```powershell
npm run tauri build
```

This performs:
1. Frontend production build
2. Rust backend compilation
3. Application bundling
4. NSIS installer creation (Windows)

### Build Output

After successful build, find files at:

| Type | Location |
|------|----------|
| Executable | `src-tauri/target/release/file-mover.exe` |
| Installer | `src-tauri/target/release/bundle/nsis/*.exe` |
| Web Assets | `src-tauri/target/release/bundle/static/` |

### Build Configuration

Edit `src-tauri/tauri.conf.json` to customize:

```json
{
  "productName": "前端部署工具",
  "version": "1.2.0",
  "identifier": "com.ybg.file-mover",
  "app": {
    "windows": [{
      "title": "前端部署工具",
      "width": 1200,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600
    }]
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/icon.ico"]
  }
}
```

## 🐛 Troubleshooting Build Issues

### Error: `cargo command not found`

**Cause**: Rust not installed or PATH not configured

**Solution**:

```powershell
# Add cargo to PATH temporarily
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

# Verify
cargo --version
```

### Error: `linker link.exe not found`

**Cause**: MSVC compiler path not configured

**Solution**:

```powershell
# Add MSVC toolchain to PATH
$env:PATH = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:PATH"
```

### Error: `npm install` fails

**Solutions**:

```powershell
# Clear npm cache
npm cache clean --force

# Remove node_modules
Remove-Item -Recurse -Force node_modules

# Reinstall
npm install
```

### Error: TypeScript compilation fails

**Check for type errors**:

```powershell
npx tsc --noEmit
```

Common issues:
- Missing type definitions
- Incorrect imports
- Type mismatches

### Error: Rust compilation fails

**Update dependencies**:

```powershell
cd src-tauri
cargo update
```

**Clean and rebuild**:

```powershell
cargo clean
npm run tauri build
```

### Error: Build hangs or takes very long

**Check network connection**: Build downloads Rust crates from crates.io

**Use offline mode** (if dependencies cached):

```powershell
# Set CARGO_OFFLINE environment variable
$env:CARGO_OFFLINE = "1"
npm run tauri build
```

## 📈 Version Management

### Updating Version Number

Edit `package.json`:

```json
{
  "name": "file-mover",
  "version": "1.3.0",
  // ...
}
```

Also update `src-tauri/tauri.conf.json`:

```json
{
  "version": "1.3.0",
  // ...
}
```

### Semantic Versioning

Follow semver:
- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes

### Release Checklist

Before each release:

- [ ] Update version in `package.json` and `tauri.conf.json`
- [ ] Test in development mode
- [ ] Build production version
- [ ] Test production executable
- [ ] Create Git tag: `git tag v1.3.0`
- [ ] Push tag: `git push origin v1.3.0`

## 📝 Build Artifacts

### Executable Testing

Test the built executable:

```powershell
# Direct run
.\src-tauri\target\release\file-mover.exe

# With devtools enabled (debugging)
.\src-tauri\target\release\file-mover.exe --enable-devtools
```

### Installer Installation

```powershell
# Run installer
.\src-tauri\target\release\bundle\nsis\*.exe
```

The installer will:
1. Display installation wizard
2. Copy files to Program Files
3. Create Start Menu shortcut
4. Create Desktop shortcut (optional)
5. Register uninstaller

## 🔍 Build Verification

### Verify Build Output

```powershell
# Check executable exists
Test-Path .\src-tauri\target\release\file-mover.exe

# Check file size (should be several MB)
Get-Item .\src-tauri\target\release\file-mover.exe | Select-Object Name, Length

# Check icon
Get-Item .\src-tauri\target\release\file-mover.exe
```

### Test Production Build

1. **Launch Application**
   - Does it open without errors?
   - Does the window display correctly?

2. **Test Core Features**
   - Can you add a project?
   - Can you execute file operations?
   - Do dialogs work?
   - Does settings persistence work?

3. **Test Edge Cases**
   - Invalid file paths
   - Network disconnection
   - Large file operations

## 🧹 Build Cleanup

### Clean Build Artifacts

```powershell
# Clean Rust build
cd src-tauri
cargo clean

# Clean frontend build
Remove-Item -Recurse -Force dist, .vite

# Clean all (except dependencies)
npm run tauri build -- --debug
```

### Reset to Clean State

```powershell
# Remove all build artifacts
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force dist
Remove-Item -Recurse -Force src-tauri/target

# Reinstall
npm install

# Rebuild
npm run tauri build
```

## 🚀 Deployment

### Local Installation

For testing on your machine:

```powershell
.\src-tauri\target\release\bundle\nsis\file-mover-1.2.0.exe
```

### Distribution

For distributing to others:

1. **Build the installer**: `npm run tauri build`
2. **Locate installer**: `src-tauri/target/release/bundle/nsis/*.exe`
3. **Share the installer** via:
   - Direct download link
   - File sharing service
   - Internal deployment tool

### Auto-Update (Future Enhancement)

Tauri supports auto-update functionality. To implement:

1. Configure update server in `tauri.conf.json`
2. Implement update check logic in Rust backend
3. Use Tauri's updater plugin

## 📊 Build Performance

### Speed Optimization

1. **Use Release Mode**
   ```powershell
   npm run tauri build
   # Not: npm run tauri build -- --debug
   ```

2. **Enable Link-Time Optimization**
   Edit `src-tauri/Cargo.toml`:
   ```toml
   [profile.release]
   lto = true
   opt-level = "s"
   ```

3. **Parallel Compilation**
   Set environment variable:
   ```powershell
   $env:CARGO_BUILD_JOBS = "8"
   ```

### Build Time Expectations

| Build Type | Time |
|------------|------|
| Frontend only | ~10-30 seconds |
| Full build (incremental) | ~1-3 minutes |
| Full build (clean) | ~5-10 minutes |

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Start dev mode | `npm run tauri dev` |
| Build frontend | `npm run build` |
| Build app (release) | `npm run tauri build` |
| Clean build | `cargo clean && npm run tauri build` |
| Type check | `npx tsc --noEmit` |
| Update Rust deps | `cd src-tauri && cargo update` |
| Create release | `git tag v1.2.0 && git push origin v1.2.0` |

---

**Important**: Always test production builds before distribution. Development mode may hide issues that appear in release builds.
