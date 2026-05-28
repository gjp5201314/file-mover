---
name: "file-mover-developer"
description: "Assists with developing features for the file-mover Tauri app. Invoke when creating components, using Tauri APIs, managing state, or implementing new functionality."
---

# File Mover Developer Guide

A comprehensive guide for developing features in the **前端部署工具 (File Mover)** application built with Tauri + React + TypeScript.

## 🚀 Project Architecture

### Technology Stack

- **Desktop Framework**: Tauri 2.0
- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite 5.x
- **Backend**: Rust (Tauri)
- **Node Version Manager**: Volta (Node 20.20.2)

### Directory Structure

```
file-mover/
├── src/                          # React frontend source
│   ├── components/               # React components
│   │   ├── Header.tsx           # Top navigation bar
│   │   ├── ProjectTabs.tsx      # Project tabs management
│   │   ├── ProjectCard.tsx      # Individual project card
│   │   ├── ProjectSidebar.tsx   # Log panel
│   │   ├── SettingsDrawer.tsx   # Settings panel
│   │   ├── ConfirmModal.tsx      # Confirmation dialog
│   │   ├── CommitModal.tsx       # Git commit dialog
│   │   ├── GitProxySettings.tsx  # Git proxy configuration
│   │   ├── NvmVersionManager.tsx # Node version management
│   │   ├── AutoStartSettings.tsx # Auto-start configuration
│   │   └── *.css                # Component styles
│   ├── context/
│   │   └── ProjectContext.tsx   # Global state management
│   ├── hooks/                   # Custom React hooks
│   │   ├── useDirectoryOperations.ts
│   │   └── useFileOperationEvents.ts
│   ├── services/
│   │   └── projectService.ts    # Project data service
│   ├── types/
│   │   ├── project.ts           # Project type definitions
│   │   └── index.ts             # Type exports
│   ├── App.tsx                  # Main application component
│   └── main.tsx                 # React entry point
├── src-tauri/                   # Tauri backend source
│   ├── src/
│   │   └── main.rs              # Rust entry point
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Tauri configuration
│   └── capabilities/             # Tauri permissions
└── package.json                 # Node dependencies
```

## 🛠️ Component Development

### Creating a New Component

**Step 1**: Create the component file in `src/components/`

```tsx
// src/components/MyNewComponent.tsx
import { FC } from 'react';
import './MyNewComponent.css';

interface MyNewComponentProps {
  title: string;
  onAction?: () => void;
}

export const MyNewComponent: FC<MyNewComponentProps> = ({ 
  title, 
  onAction 
}) => {
  return (
    <div className="my-new-component">
      <h3>{title}</h3>
      <button onClick={onAction}>Action</button>
    </div>
  );
};
```

**Step 2**: Create associated styles in `src/components/MyNewComponent.css`

```css
.my-new-component {
  padding: 16px;
  border-radius: 8px;
  background-color: var(--bg-secondary);
}

.my-new-component h3 {
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

.my-new-component button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: var(--primary-color);
  color: white;
  cursor: pointer;
  transition: opacity 0.2s;
}

.my-new-component button:hover {
  opacity: 0.9;
}
```

**Step 3**: Export from index.ts

```tsx
// src/components/index.ts
export { MyNewComponent } from './MyNewComponent';
```

### Component Naming Conventions

- **Files**: PascalCase (e.g., `ProjectCard.tsx`)
- **CSS Classes**: kebab-case (e.g., `project-card`, `settings-drawer`)
- **TypeScript Types**: PascalCase with descriptive names
- **Props Interfaces**: `{ComponentName}Props` pattern

### State Management with ProjectContext

The app uses React Context for global state management. Access state via the `useProject` hook.

**Using the Context**:

```tsx
import { useProject } from '../context/ProjectContext';

function MyComponent() {
  const {
    cards,              // Array of project cards
    activeCard,         // Currently selected card
    activeTab,          // Active tab index
    addCard,            // Add new project card
    updateCard,         // Update card properties
    deleteCard,         // Remove card
    executeCard,        // Execute file operations
    projectLogs,        // Log entries per project
  } = useProject();
  
  // Component logic here
}
```

**Modifying the Context**:

To add new state or methods to the context, update `src/context/ProjectContext.tsx`:

```tsx
// In ProjectContext.tsx
interface ProjectContextType {
  // ... existing properties ...
  
  // Add new state
  newFeature: string;
  setNewFeature: (value: string) => void;
}
```

## 📦 Using Tauri APIs

### File System Operations

The app uses `@tauri-apps/plugin-fs` for file operations.

**Reading a File**:

```tsx
import { readTextFile } from '@tauri-apps/plugin-fs';

async function readConfig() {
  try {
    const content = await readTextFile('config.json');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to read file:', error);
  }
}
```

**Writing a File**:

```tsx
import { writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';

async function saveProject(project: Project) {
  const configPath = 'projects.json';
  
  // Ensure directory exists
  if (!(await exists('data'))) {
    await mkdir('data', { recursive: true });
  }
  
  // Read existing projects
  let projects = [];
  if (await exists(configPath)) {
    const content = await readTextFile(configPath);
    projects = JSON.parse(content);
  }
  
  // Add new project and save
  projects.push(project);
  await writeTextFile(configPath, JSON.stringify(projects, null, 2));
}
```

### Dialog Operations

Using `@tauri-apps/plugin-dialog` for native dialogs.

**Opening a Folder Picker**:

```tsx
import { open } from '@tauri-apps/plugin-dialog';

async function selectFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择目标文件夹'
  });
  
  return selected;
}
```

### Executing Shell Commands

For Git operations and other shell commands, use Tauri's command execution capabilities.

## 🎨 Styling Guidelines

### CSS Variables

The project uses CSS variables defined in `variables.css`:

```css
/* Available variables */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --text-secondary: #666666;
  --primary-color: #1890ff;
  --border-color: #d9d9d9;
  --success-color: #52c41a;
  --warning-color: #faad14;
  --error-color: #ff4d4f;
}
```

### Responsive Design

All components should be responsive. Use flexbox and CSS Grid for layouts.

```css
.project-detail {
  display: flex;
  gap: 16px;
  padding: 16px;
}

@media (max-width: 768px) {
  .project-detail {
    flex-direction: column;
  }
}
```

## 🧪 Testing Considerations

### Manual Testing Checklist

When developing new features:

1. **Functionality**: Does it work as expected?
2. **Responsive Design**: Is it responsive on different window sizes?
3. **Error Handling**: Does it handle errors gracefully?
4. **State Management**: Does it properly interact with ProjectContext?
5. **File Operations**: Do file operations work correctly?
6. **UI/UX**: Does it match existing component styles?

### Development Mode

Run the app in development mode:

```bash
npm run tauri dev
```

This provides:
- Hot module replacement (HMR) for frontend
- Auto-reload for Rust backend changes
- Developer tools and debugging

## 📝 TypeScript Best Practices

### Type Definitions

Always define proper TypeScript types for component props and data structures.

```tsx
interface ProjectCardProps {
  card: Project;
  onUpdateCard: (card: Project) => void;
  onDeleteCard: (id: string) => void;
  onExecute: (id: string) => void;
  watchActive?: boolean;
  onToggleAutoWatch?: (id: string) => void;
}
```

### Avoiding `any`

Use proper types instead of `any`:

```tsx
// ❌ Bad
function processData(data: any) {
  return data.value;
}

// ✅ Good
interface DataType {
  value: string;
}

function processData(data: DataType) {
  return data.value;
}
```

## 🔄 Import Patterns

Use absolute imports when possible for better maintainability:

```tsx
// ✅ Good
import { ProjectCard } from 'components';
import { useProject } from 'context';
import type { Project } from 'types';

// ⚠️ Also acceptable
import { ProjectCard } from './components/ProjectCard';
```

## 🚨 Common Issues & Solutions

### Hot Reload Not Working

If frontend changes don't reflect:

1. Check if Vite server is running
2. Restart with `npm run tauri dev`
3. Check browser console for errors

### Tauri API Not Available

Ensure the plugin is installed and imported correctly:

```bash
npm install @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
```

### TypeScript Errors

Run type checking:

```bash
npm run build
```

This runs `tsc && vite build` to catch type errors before runtime.

## 🎯 Quick Reference

| Task | Command/Pattern |
|------|----------------|
| Start dev mode | `npm run tauri dev` |
| Build frontend | `npm run build` |
| Build desktop app | `npm run tauri build` |
| Type check | `npx tsc --noEmit` |
| Add component | Create in `src/components/`, export from `index.ts` |
| Modify state | Update `ProjectContext.tsx` |
| Add Tauri command | Modify `src-tauri/src/main.rs` |

---

**Remember**: Always follow existing code patterns, use TypeScript properly, handle errors gracefully, and test thoroughly before committing.
