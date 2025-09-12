# 🚀 Slayer Suite Cheat Sheet

## 🔥 Most Used Commands

```bash
# Start dev server (background with Ctrl+B)
npm run dev

# Run tests after changes
npm test

# Check code quality
npm run lint        # Check for linting issues
npm run lint:fix    # Auto-fix formatting issues
```

## 📝 Daily Workflow

### Morning Start

```bash
npm run dev           # Start server (Ctrl+B for background)
npm test             # Check everything works
```

### After Coding Session

```bash
npm run lint:fix    # Fix formatting issues
npm test            # Verify still works
```

### Before Commit

```bash
npm run lint:fix    # Clean code formatting
npm test            # Verify
git add .
git commit -m "..."
```

## 🧪 Testing Commands

```bash
npm test              # Run all tests
npm run test:watch    # Auto-test on changes

# Test specific app
node test-runner.js --app=mapping
node test-runner.js --app=design
node test-runner.js --app=thumbnail
```

## 🧹 Code Quality Commands

```bash
npm run lint         # Check for linting issues
npm run lint:fix     # Auto-fix formatting issues
```

## 🔧 Debug Commands

```bash
npm run debug           # Run automated debugger
npm run debug-headless  # Debug without browser UI
```

## 🌐 Server & Ports

```bash
# Dev server
http://localhost:8080

# Apps
http://localhost:8080/index.html                              # Main
http://localhost:8080/apps/mapping_slayer/mapping_slayer.html # Mapping
http://localhost:8080/apps/design_slayer/design_slayer.html   # Design
http://localhost:8080/apps/thumbnail_slayer/thumbnail_slayer.html # Thumbnail
```

## 🆘 Quick Fixes

### Server won't start

```bash
taskkill /F /IM node.exe  # Windows
killall node              # Mac/Linux
npm run dev              # Try again
```

### Tests hanging

```bash
Ctrl+C                   # Stop
npm test                # Retry
```

### Code has linting errors

```bash
npm run lint:fix     # Auto-fix most issues
```

### Need to see what changed

```bash
git status              # Changed files
git diff               # See changes
```

## 🎯 Pro Tips

### Run server in background (Claude Code)

```bash
Ctrl+B → npm run dev    # Starts in background
npm test               # Can run tests while server runs
```

### Check code quality

```bash
npm run lint         # See issues
npm run lint:fix     # Apply fixes
```

### Test after every major change

```bash
# Made big changes?
npm test

# Tests fail?
npm run lint:fix      # Fix formatting issues
npm test              # Try again
```

## 📊 What Each Tool Does

| Command            | Purpose            | When to Use        |
| ------------------ | ------------------ | ------------------ |
| `npm run dev`      | Start dev server   | Beginning of work  |
| `npm test`         | Run all tests      | After changes      |
| `npm run lint`     | Check code quality | After long session |
| `npm run lint:fix` | Fix formatting     | Before commits     |

## ⚡ One-Liners

```bash
# Full format and test
npm run lint:fix && npm test

# Check everything
npm run lint && npm test

# Development mode
npm run dev & npm run test:watch

# Check linting issues
npm run lint
```

## 🔄 Git Workflow

```bash
# Before committing
npm run lint:fix      # Clean code formatting
npm test              # Verify works
git add .
git commit -m "feat: ..."

# If commit fails
npm run lint:fix      # Fix formatting
git add .
git commit -m "..." --no-verify  # Skip hooks if needed
```

## 📁 Project Structure Quick Ref

```
slayer-suite/
├── apps/
│   ├── mapping_slayer/    # Map app
│   ├── design_slayer/     # Design app
│   └── thumbnail_slayer/  # Thumbnail app
├── core/                  # Shared code
├── tests/                 # Test files
├── CHEATSHEET.md         # This file!
├── CLAUDE.md             # Instructions for Claude
└── TESTING_WORKFLOW.md   # Testing details
```

## 🚨 Emergency Commands

```bash
# Kill everything and restart
taskkill /F /IM node.exe && npm run dev

# Full format and test
npm run lint:fix && npm test

# Check what's running
netstat -ano | findstr :8080
```

## 💡 Remember

- **Run tests after changes** to catch issues early
- **Use lint:fix before commits** to maintain quality
- **Server runs on 8080** - check if port is free
- **Backups kept for 5 cleanups** - older auto-deleted

---

_Keep this file open in a tab for quick reference!_
