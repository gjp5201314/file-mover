---
name: "file-mover-reviewer"
description: "Reviews code for best practices, bugs, and improvements in file-mover app. Invoke when doing code review, refactoring, or checking code quality before commits."
---

# File Mover Code Review Guide

Comprehensive code review guidelines for the **前端部署工具 (File Mover)** application built with Tauri + React + TypeScript.

## 🎯 Review Objectives

### Primary Goals

1. **Correctness**: Does the code work as intended?
2. **Maintainability**: Can others understand and modify this code?
3. **Performance**: Are there any performance bottlenecks?
4. **Security**: Are there potential security vulnerabilities?
5. **Best Practices**: Does it follow established patterns?

## 🔍 TypeScript Code Review

### Type Safety

#### ✅ Good: Proper Type Definitions

```tsx
// Define clear interfaces
interface Project {
  id: string;
  name: string;
  sourcePath: string;
  targetPath: string;
  watchEnabled: boolean;
  lastModified: number;
}

// Use specific types, not any
function processProject(project: Project): void {
  // Implementation
}
```

#### ❌ Bad: Using `any` Type

```tsx
// Avoid any type
function processData(data: any): any {
  return data.value;
}

// Instead use proper types
function processData(data: Project): string {
  return data.name;
}
```

### Function Design

#### ✅ Good: Small, Focused Functions

```tsx
function validatePath(path: string): boolean {
  if (!path || path.length === 0) {
    return false;
  }
  return path.startsWith('/') || /^[A-Z]:\\/i.test(path);
}

function sanitizePath(path: string): string {
  const validated = validatePath(path);
  return validated ? path.trim() : '';
}
```

#### ❌ Bad: Large, Complex Functions

```tsx
// Avoid functions that do too much
function handleProjectOperations(data: any) {
  // 100+ lines doing validation, file ops, state updates, etc.
}
```

### Error Handling

#### ✅ Good: Try-Catch with Meaningful Errors

```tsx
async function loadProject(id: string): Promise<Project | null> {
  try {
    const content = await readTextFile('projects.json');
    const projects = JSON.parse(content);
    return projects.find((p: Project) => p.id === id) || null;
  } catch (error) {
    console.error(`Failed to load project ${id}:`, error);
    return null;
  }
}
```

#### ❌ Bad: Swallowing Errors

```tsx
async function loadProject(id: string) {
  try {
    // ...
  } catch (error) {
    // Silent failure - bad!
  }
}
```

### Async/Await Patterns

#### ✅ Good: Proper Async Error Handling

```tsx
async function executeOperation(id: string): Promise<void> {
  try {
    setLoading(true);
    const result = await performOperation(id);
    handleSuccess(result);
  } catch (error) {
    handleError(error);
  } finally {
    setLoading(false);
  }
}
```

## 🧩 React Component Review

### Component Structure

#### ✅ Good: Functional Components with Hooks

```tsx
import { FC, useState, useEffect } from 'react';

interface ProjectCardProps {
  project: Project;
  onUpdate: (project: Project) => void;
}

export const ProjectCard: FC<ProjectCardProps> = ({ 
  project, 
  onUpdate 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  
  useEffect(() => {
    // Side effects here
    return () => {
      // Cleanup
    };
  }, [project.id]);
  
  return (
    <div className="project-card">
      {/* JSX */}
    </div>
  );
};
```

#### ❌ Bad: Class Components

```tsx
// Avoid class components - use functional components
class ProjectCard extends Component {
  render() {
    return <div>...</div>;
  }
}
```

### Props and State

#### ✅ Good: Clear Prop Types

```tsx
interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

// Destructure props for clarity
function Modal({ isOpen, title, onClose, children }: ModalProps) {
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
```

#### ❌ Bad: Untyped Props

```tsx
function Modal(props: any) {
  // Missing type safety
}
```

### Hooks Usage

#### ✅ Good: Proper Hook Usage

```tsx
function useProjectData(projectId: string) {
  const [data, setData] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let cancelled = false;
    
    async function fetchData() {
      setLoading(true);
      const result = await loadProject(projectId);
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    }
    
    fetchData();
    
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  
  return { data, loading };
}
```

#### ❌ Bad: Missing Dependencies in useEffect

```tsx
// This can cause stale closures
useEffect(() => {
  fetchData();
  // Missing dependency array
});
```

## 🎨 CSS/Styling Review

### CSS Best Practices

#### ✅ Good: Use CSS Variables

```css
/* variables.css */
:root {
  --primary-color: #1890ff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
}

/* component.css */
.button {
  background-color: var(--primary-color);
  color: white;
}
```

#### ❌ Bad: Hardcoded Colors

```css
.button {
  background-color: #1890ff; /* Avoid magic numbers */
  color: #ffffff;
}
```

### Responsive Design

#### ✅ Good: Mobile-First Approach

```css
.project-detail {
  display: flex;
  gap: 16px;
  padding: 16px;
}

/* Mobile styles first */
@media (min-width: 768px) {
  .project-detail {
    flex-direction: row;
  }
}
```

#### ❌ Bad: Non-Responsive Fixed Widths

```css
.project-detail {
  width: 1200px; /* Not responsive */
}
```

## 🔒 Security Review

### Input Validation

#### ✅ Good: Validate All Inputs

```tsx
function handleFileSelect(path: string) {
  // Validate path
  if (!path || typeof path !== 'string') {
    showError('Invalid path');
    return;
  }
  
  // Sanitize path
  const sanitized = path.replace(/[<>:"|?*]/g, '');
  
  // Verify path exists
  if (!pathExists(sanitized)) {
    showError('Path does not exist');
    return;
  }
  
  // Proceed
  setSelectedPath(sanitized);
}
```

#### ❌ Bad: Trusting User Input

```tsx
function handleFileSelect(path: string) {
  // No validation - security risk!
  executeOperation(path);
}
```

### File Operations

#### ✅ Good: Verify Before Operations

```tsx
async function moveFile(source: string, target: string) {
  // Check if source exists
  if (!(await exists(source))) {
    throw new Error('Source file does not exist');
  }
  
  // Check if target exists
  if (await exists(target)) {
    throw new Error('Target file already exists');
  }
  
  // Perform operation
  await move(source, target);
}
```

## ⚡ Performance Review

### React Performance

#### ✅ Good: Proper State Updates

```tsx
// Batch updates
const updates = newProjects.map(p => {
  if (p.id === updatedProject.id) {
    return updatedProject;
  }
  return p;
});
setProjects(updates);
```

#### ❌ Bad: Multiple State Updates

```tsx
// Inefficient - causes multiple re-renders
setProjects(newProjects);
setSelectedId(null);
setLoading(false);
setError(null);
```

### Memoization

#### ✅ Good: Memoize Expensive Operations

```tsx
import { useMemo } from 'react';

function ProjectList({ projects, filter }) {
  const filteredProjects = useMemo(() => {
    return projects.filter(p => 
      p.name.toLowerCase().includes(filter.toLowerCase())
    );
  }, [projects, filter]);
  
  return (
    <div>
      {filteredProjects.map(p => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}
```

#### ❌ Bad: No Memoization for Expensive Computations

```tsx
function ProjectList({ projects, filter }) {
  // Recalculates on every render
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  return (
    <div>
      {filteredProjects.map(p => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}
```

## 📋 Code Review Checklist

### General

- [ ] Code compiles without errors
- [ ] TypeScript type checking passes
- [ ] No `any` types (unless absolutely necessary)
- [ ] Functions are small and focused
- [ ] Error handling is comprehensive
- [ ] No hardcoded values (use constants)

### React Components

- [ ] Functional components used
- [ ] Props properly typed
- [ ] State updates are batched
- [ ] useEffect has proper dependencies
- [ ] No memory leaks in effects
- [ ] Components are reusable

### Styling

- [ ] CSS variables used
- [ ] Responsive design implemented
- [ ] No inline styles (except dynamic values)
- [ ] CSS classes follow naming convention
- [ ] Styles are organized

### Security

- [ ] All inputs validated
- [ ] File paths sanitized
- [ ] Error messages don't expose internals
- [ ] No sensitive data in logs

### Performance

- [ ] Expensive operations memoized
- [ ] No unnecessary re-renders
- [ ] Lists have proper keys
- [ ] Images optimized
- [ ] Lazy loading where appropriate

## 🐛 Common Issues

### Issue 1: Stale Closure

```tsx
// ❌ Bad
useEffect(() => {
  const timer = setInterval(() => {
    setCount(count + 1); // count is stale
  }, 1000);
  
  return () => clearInterval(timer);
}, []); // Missing count dependency
```

```tsx
// ✅ Good
useEffect(() => {
  const timer = setInterval(() => {
    setCount(c => c + 1); // Functional update
  }, 1000);
  
  return () => clearInterval(timer);
}, []); // No dependencies needed
```

### Issue 2: Memory Leaks

```tsx
// ❌ Bad
useEffect(() => {
  const subscription = dataSource.subscribe();
  // Missing cleanup
}, []);
```

```tsx
// ✅ Good
useEffect(() => {
  const subscription = dataSource.subscribe();
  
  return () => {
    subscription.unsubscribe(); // Cleanup
  };
}, []);
```

### Issue 3: Unnecessary Re-renders

```tsx
// ❌ Bad - Creates new object on every render
<ChildComponent config={{ width: 100, height: 50 }} />
```

```tsx
// ✅ Good - Memoize or extract to constant
const CONFIG = { width: 100, height: 50 };
<ChildComponent config={CONFIG} />
```

## 🎓 Review Process

### Step 1: Automated Checks

```bash
# Type checking
npm run build

# This runs: tsc && vite build
```

### Step 2: Manual Review

1. Read the code changes
2. Understand the intent
3. Check for issues using this guide
4. Test the functionality

### Step 3: Feedback

Provide constructive feedback:

```
[Issue]: Missing error handling
[Location]: src/components/FileOperation.tsx:45
[Suggestion]: Add try-catch to handle potential errors
[Severity]: Medium
```

## 📚 Resources

### TypeScript Best Practices

- Use strict mode in `tsconfig.json`
- Enable `noImplicitAny`
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any` when type is unknown

### React Best Practices

- Functional components with hooks
- Custom hooks for reusable logic
- Context for global state, props for local
- Composition over inheritance

### Tauri Specific

- Use provided Tauri APIs, don't reimplement
- Handle permissions in `capabilities/default.json`
- Use async operations to avoid blocking UI

---

**Remember**: Code review is about improving code quality and learning. Be constructive, specific, and respectful in feedback.
