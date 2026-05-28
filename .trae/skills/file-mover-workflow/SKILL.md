---
name: "file-mover-workflow"
description: "Guides on development workflows, debugging, and team collaboration for file-mover. Invoke when starting development, debugging issues, or following project processes."
---

# File Mover Workflow Guide

Complete workflow guide for developing, debugging, and collaborating on the **前端部署工具 (File Mover)** application.

## 🚀 Daily Development Workflow

### Morning Start

```powershell
# 1. Navigate to project
cd file-mover

# 2. Pull latest changes
git pull origin main

# 3. Install any new dependencies
npm install

# 4. Start development mode
npm run tauri dev
```

### Development Cycle

```
1. Create/select feature branch
   ↓
2. Make changes to code
   ↓
3. Test locally (npm run tauri dev)
   ↓
4. Run type checks (npm run build)
   ↓
5. Commit changes
   ↓
6. Push to remote
   ↓
7. Create pull request
   ↓
8. Code review
   ↓
9. Merge to main
```

### Evening Wrap-Up

```powershell
# 1. Ensure all changes committed
git status

# 2. Push any remaining commits
git push origin feature-branch-name

# 3. Update task board (if using one)
# Move completed tasks to "Done"
```

## 🌿 Git Workflow

### Branch Strategy

```
main (production)
  ↓
develop (development)
  ↓
feature/xxx (new features)
  ↓
bugfix/xxx (bug fixes)
  ↓
hotfix/xxx (urgent fixes)
```

### Creating a Feature Branch

```powershell
# 1. Ensure you're on main
git checkout main

# 2. Pull latest
git pull origin main

# 3. Create feature branch
git checkout -b feature/add-git-proxy-settings

# 4. Work on feature
# ... make changes ...

# 5. Commit with clear message
git add .
git commit -m "feat: add Git proxy settings component

- Create GitProxySettings.tsx component
- Add proxy configuration to ProjectContext
- Implement settings persistence"

# 6. Push to remote
git push origin feature/add-git-proxy-settings
```

### Commit Message Convention

Follow conventional commits:

```
type(scope): subject

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Examples**:

```bash
# Good commit messages
git commit -m "feat(project): add auto-watch functionality"
git commit -m "fix(card): handle missing source path gracefully"
git commit -m "docs(readme): update installation instructions"

# Bad commit messages
git commit -m "fixed stuff"
git commit -m "update"
git commit -m "WIP"
```

### Pull Request Process

1. **Create PR** on GitHub/Gitea
2. **Title**: Clear summary of changes
3. **Description**: What, Why, How
4. **Reviewers**: Assign reviewers
5. **Labels**: Add appropriate labels
6. **Link Issues**: Connect to task tracker

**PR Template**:

```markdown
## Summary
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Code follows project style
- [ ] TypeScript compiles without errors
- [ ] Tests pass
- [ ] Documentation updated
```

### Merging

```powershell
# 1. Ensure branch is up to date
git checkout main
git pull origin main

# 2. Merge feature branch
git merge feature/add-git-proxy-settings

# 3. Push to main
git push origin main

# 4. Delete feature branch (optional)
git branch -d feature/add-git-proxy-settings
```

## 🐛 Debugging Workflow

### Frontend Debugging

#### Browser DevTools

1. **Open DevTools**: Press `F12` or `Ctrl+Shift+I`
2. **Elements Tab**: Inspect DOM and CSS
3. **Console Tab**: View logs and errors
4. **Network Tab**: Monitor network requests
5. **Sources Tab**: Set breakpoints

#### React DevTools

1. Install React DevTools extension
2. Open in Tauri window (use devtools)
3. Inspect component tree
4. View state and props
5. Profile performance

#### Console Logging

```tsx
// Use meaningful log messages
console.log('[ProjectCard] Rendering with props:', project);
console.log('[FileOperation] Source:', source, 'Target:', target);
console.warn('[AutoWatch] Watcher not initialized');
console.error('[API] Failed to load projects:', error);
```

### Rust Backend Debugging

#### Enable Logging

In `src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            println!("[DEBUG] Application starting...");
            
            // Debug: Print configuration
            #[cfg(debug_assertions)]
            {
                println!("[DEBUG] Config path: {:?}", app.path_resolver());
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### Rust Error Handling

```rust
use std::fs;

// Good error propagation
fn load_config() -> Result<Config, Box<dyn std::error::Error>> {
    let content = fs::read_to_string("config.json")?;
    let config: Config = serde_json::from_str(&content)?;
    Ok(config)
}

// Handle in main
fn main() {
    if let Err(e) = run() {
        eprintln!("[ERROR] Application error: {}", e);
        std::process::exit(1);
    }
}
```

### Tauri Command Debugging

#### Frontend Side

```tsx
import { invoke } from '@tauri-apps/api/tauri';

async function debugCommand() {
  try {
    console.log('[DEBUG] Invoking command...');
    const result = await invoke('my_command', { arg: 'value' });
    console.log('[DEBUG] Command result:', result);
    return result;
  } catch (error) {
    console.error('[DEBUG] Command error:', error);
    throw error;
  }
}
```

#### Rust Side

```rust
#[tauri::command]
fn my_command(arg: String) -> Result<String, String> {
    println!("[DEBUG] Received arg: {}", arg);
    
    // Validate input
    if arg.is_empty() {
        return Err("Argument cannot be empty".to_string());
    }
    
    // Process
    let result = process_data(&arg)?;
    
    println!("[DEBUG] Result: {}", result);
    Ok(result)
}
```

## 🧪 Testing Workflow

### Manual Testing

#### Core Feature Testing

**Project Management**:
- [ ] Can add new project
- [ ] Can edit project details
- [ ] Can delete project
- [ ] Changes persist after restart

**File Operations**:
- [ ] Can select source directory
- [ ] Can select target directory
- [ ] File copy works correctly
- [ ] File move works correctly
- [ ] Handles permission errors
- [ ] Handles missing files

**Auto-Watch**:
- [ ] Watch starts correctly
- [ ] Detects file changes
- [ ] Triggers operations
- [ ] Can stop watch

**Git Integration**:
- [ ] Git detection works
- [ ] Commit message input
- [ ] Commit executes correctly
- [ ] Proxy settings applied

#### Edge Case Testing

- [ ] Empty directory selected
- [ ] Invalid path characters
- [ ] Network disconnection
- [ ] Very long file paths
- [ ] Special characters in filenames
- [ ] Permission denied scenarios
- [ ] Disk full scenarios

### Automated Testing (Future)

```bash
# Install test framework
npm install -D vitest @testing-library/react

# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 🔍 Issue Resolution

### Problem Investigation

#### Step 1: Gather Information

```powershell
# Environment info
node --version
npm --version
rustc --version
cargo --version

# Project info
cat package.json | Select-String version
cat src-tauri/Cargo.toml | Select-String version

# Error logs
Get-Content logs/error.log -Tail 50
```

#### Step 2: Reproduce the Issue

1. Document exact steps to reproduce
2. Note expected vs actual behavior
3. Record error messages
4. Note environment conditions

#### Step 3: Isolate the Problem

```powershell
# Test in clean state
git checkout main
npm run tauri dev

# If issue persists: problem is reproducible
# If issue disappears: problem was in recent changes
```

#### Step 4: Identify Root Cause

Use debug tools:
- Browser DevTools for frontend
- Console logs
- Tauri logs
- Rust `println!` statements

#### Step 5: Fix and Verify

```tsx
// Make fix
// Test locally
// Run type checks
npm run build
// Verify fix works
```

### Issue Template

```markdown
## Issue Description
Clear description of the problem

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., Windows 11]
- App Version: [e.g., 1.2.0]
- Node: [e.g., 20.20.2]
- Rust: [e.g., 1.78.0]

## Screenshots/Logs
[Any relevant screenshots or log files]

## Additional Context
Any other relevant information
```

## 📦 Release Workflow

### Version Bump

```powershell
# 1. Update version in package.json
# 2. Update version in tauri.conf.json
# 3. Create git commit
git add .
git commit -m "chore: bump version to 1.3.0"
```

### Build Release

```powershell
# 1. Clean build
cargo clean
npm run tauri build

# 2. Verify artifacts
Get-ChildItem src-tauri/target/release/bundle/nsis/*.exe

# 3. Test installer
.\src-tauri\target\release\bundle\nsis\*.exe
```

### Create Release

```powershell
# 1. Create git tag
git tag -a v1.3.0 -m "Release version 1.3.0

Features:
- New auto-watch feature
- Git proxy settings

Bug fixes:
- Fixed file operation timeout"

# 2. Push tag
git push origin v1.3.0

# 3. Create release on GitHub/Gitea
# Upload installer as artifact
# Write release notes
```

## 🤝 Team Collaboration

### Code Ownership

**Frontend (React/TypeScript)**:
- Components in `src/components/`
- Context in `src/context/`
- Hooks in `src/hooks/`

**Backend (Rust/Tauri)**:
- Main logic in `src-tauri/src/main.rs`
- Commands exposed to frontend
- System integration

### Communication

**Daily Standup** (if applicable):
1. What did I do yesterday?
2. What will I do today?
3. Any blockers?

**Async Updates**:
- Use project chat for quick questions
- Update task board regularly
- Tag relevant people in PRs

**Knowledge Sharing**:
- Document decisions in PRs
- Share debugging discoveries
- Update this guide if process changes

## 📊 Performance Monitoring

### Application Performance

**Startup Time**:
```powershell
# Measure startup
$start = Get-Date
.\src-tauri\target\release\file-mover.exe
$end = Get-Date
$duration = $end - $start
Write-Host "Startup time: $($duration.TotalSeconds) seconds"
```

**Memory Usage**:
```powershell
# Monitor with Task Manager
# Look for file-mover.exe
# Normal: 50-150 MB
# Warning: > 300 MB
```

**Build Performance**:
```powershell
# Measure build time
$start = Get-Date
npm run tauri build
$end = Get-Date
$duration = $end - $start
Write-Host "Build time: $($duration.TotalMinutes) minutes"
```

### Optimization Triggers

- Startup > 10 seconds
- Memory > 300 MB idle
- CPU > 50% idle
- Build time > 15 minutes

## 🛠️ Tool Usage

### Development Tools

**VS Code Extensions**:
- Tauri (official extension)
- Rust Analyzer
- ESLint
- Prettier
- TypeScript Vue Plugin (for `.tsx`)

**Recommended Settings**:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### Version Control

**Aliases** (add to Git config):

```bash
git config alias.st status
git config alias.co checkout
git config alias.br branch
git config alias.lg "log --oneline --graph --all"
git config alias.unstage "reset HEAD --"
```

### Task Management

**Labels** (for project boards):
- `priority: high`
- `priority: medium`
- `priority: low`
- `type: feature`
- `type: bug`
- `type: enhancement`
- `status: in progress`
- `status: review`
- `status: blocked`

## 📝 Documentation Workflow

### When to Update Docs

- [ ] New feature added
- [ ] Process changed
- [ ] Bug fix reveals missing info
- [ ] Configuration option added
- [ ] Dependencies updated

### What to Update

**Code Comments**:
```tsx
// ❌ Obvious comments
// Increment counter
count++;

// ✅ Meaningful comments
// Use functional update to avoid stale closure
setCount(c => c + 1);
```

**README Updates**:
```markdown
## What's New in v1.3.0

### Features
- Auto-watch for file changes
- Git proxy configuration

### Bug Fixes
- Fixed timeout in file operations

### Breaking Changes
None
```

**SKILL Updates**:
When project structure or processes change, update corresponding SKILL files in `.trae/skills/`.

## 🎯 Quick Reference

| Task | Command/Action |
|------|----------------|
| Start dev | `npm run tauri dev` |
| Type check | `npm run build` |
| Build release | `npm run tauri build` |
| Create branch | `git checkout -b feature/name` |
| Commit changes | `git add . && git commit -m "type: description"` |
| Push | `git push origin branch-name` |
| Create PR | GitHub/Gitea UI |
| Test installer | `.\src-tauri\target\release\bundle\nsis\*.exe` |
| Create release | `git tag v1.3.0 && git push origin v1.3.0` |

## 🚨 Emergency Procedures

### Hotfix Process

```powershell
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/fix-critical-issue

# 2. Make minimal fix
# ... fix code ...

# 3. Test thoroughly
npm run tauri dev

# 4. Commit and push
git add .
git commit -m "hotfix: fix critical issue"
git push origin hotfix/fix-critical-issue

# 5. Create PR and merge ASAP
# 6. Tag new release
git tag -a v1.2.1 -m "Hotfix: critical issue"
git push origin v1.2.1

# 7. Build and distribute
npm run tauri build
```

### Rollback Process

```powershell
# Revert last commit
git revert HEAD

# Or specific commit
git revert <commit-hash>

# Push revert
git push origin main
```

---

**Remember**: Good workflows prevent issues. Always test thoroughly before merging, communicate with the team, and document your discoveries.
