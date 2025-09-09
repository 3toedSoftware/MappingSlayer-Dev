# Claude Code Instructions for Slayer Suite

## Project Overview

Slayer Suite is a multi-app web application for sign design and mapping. It consists of three main apps (Mapping Slayer, Design Slayer, Thumbnail Slayer) that communicate via an App Bridge.

### Sidekick AI Note

The Sidekick AI feature in Mapping Slayer is an API/backend system without a human-facing UI. It includes:

- `ai-interface.js` - AI integration code
- `sidekick-examples.json` - Example prompts/responses
- Documentation files (SIDEKICK_README.md, SIDEKICK_AI_GUIDE.md)

**Important**: There is no user interface for Sidekick - it's designed as a backend system for AI assistants to interact with, not for direct human use.

## Testing Protocol

### Automatic Test Execution

Run tests automatically when:

1. User reports any error or issue
2. After completing any code modifications to core systems
3. When multiple files (>3) have been changed
4. Before confirming task completion
5. When user asks to "check", "verify", or "test" anything

### Test Commands

```bash
# Start dev server in background (Ctrl+B)
npm run dev

# Run integration tests
npm test

# Watch mode for continuous testing
npm run test:watch
```

### Critical Files Requiring Tests

If any of these files are modified, ALWAYS run tests:

- `core/app-bridge.js`
- `core/sync-manager.js`
- `core/slayer-app-base.js`
- Any `state.js` file
- Any `*-app.js` file
- Canvas-related files
- Event handling code

## Error Handling Protocol

### When User Reports an Issue:

1. Start dev server in background: `npm run dev`
2. Run test suite: `npm test`
3. Analyze all errors found
4. Apply auto-fixes for known patterns
5. Re-run tests to verify fixes
6. Report any remaining issues that need manual attention

### Auto-Fixable Patterns:

- Null/undefined reference errors → Add null checks
- Missing functions → Add type validation
- Memory leaks → Add cleanup code
- Network failures → Add retry logic
- Missing awaits → Add async/await

## Development Workflow

### For New Features:

1. Implement the feature
2. Run tests to ensure no breakage
3. Add specific tests for new functionality
4. Verify all tests pass

### For Bug Fixes:

1. Run tests to reproduce the issue
2. Implement the fix
3. Run tests to verify resolution
4. Ensure no regression

### For Refactoring:

1. Run tests to establish baseline
2. Make refactoring changes
3. Run tests to ensure functionality preserved
4. Check performance metrics

## Performance Monitoring

### Key Metrics to Watch:

- App initialization time: < 2 seconds
- Canvas render time: < 100ms for 1000 elements
- Memory growth: < 5MB per operation
- No memory leaks after repeated operations

## File Structure Reference

```
slayer-suite/
├── apps/
│   ├── mapping_slayer/     # Map creation app
│   ├── design_slayer/      # Sign design app
│   └── thumbnail_slayer/   # Thumbnail generation app
├── core/                   # Shared core functionality
│   ├── app-bridge.js      # Cross-app communication
│   ├── sync-manager.js    # Data synchronization
│   └── slayer-app-base.js # Base app class
├── tests/                  # Test suites
├── test-runner.js         # Main test runner
└── TESTING_WORKFLOW.md    # Detailed testing guide
```

## Quick Commands

```bash
# Check if server is running
curl http://localhost:8080

# Quick test run
npm test

# Full test with visible browser
npm test -- --headed

# Test specific app
node test-runner.js --app=mapping

# Kill all node processes (if needed)
taskkill /F /IM node.exe
```

## Code Quality Workflow

### Using ESLint for Code Quality

The Slayer Suite uses ESLint for maintaining code quality and consistency.

### Linting Commands

```bash
# Check for linting issues
npm run lint

# Automatically fix fixable issues
npm run lint:fix
```

### When to Run Linting

1. **Before commits**: Run `npm run lint` to check for issues
2. **After writing code**: Use `npm run lint:fix` to auto-format
3. **During code review**: Ensure no linting errors exist
4. **Regular maintenance**: Keep code style consistent

### ESLint Configuration

The project uses a modern ESLint flat config (`eslint.config.js`) that:

- Enforces consistent code style
- Catches common errors
- Identifies unused variables
- Maintains code quality standards

## Git Management

### When User Requests Git Saves:

The user prefers not to use git directly. When they say:

- "git this"
- "save checkpoint"
- "commit this"
- "save before I change things"

Automatically:

1. Check what changed: `git status` and `git diff`
2. Create helpful commit message based on actual changes
3. Run: `git add .` and `git commit -m "descriptive message"`
4. Confirm checkpoint was saved

### Commit Message Format:

- `feat:` - New features
- `fix:` - Bug fixes
- `style:` - CSS/visual changes only
- `refactor:` - Code restructuring
- `test:` - Test additions/changes
- `docs:` - Documentation updates

### Example Messages:

- "style: updated header colors and button alignment"
- "fix: resolved canvas rendering issue in Mapping Slayer"
- "feat: added grid snapping to Design Slayer"

## Chrome DevTools Integration

### MCP Server for Browser Console Access

The Chrome DevTools MCP server is installed to allow direct access to browser console errors and debugging information.

### Setup (Already Completed)

The Chrome DevTools MCP server has been installed and configured:

- Location: `C:\Users\iam3toed\Desktop\slayer-suite\chrome-devtools-mcp\`
- Configuration: Added to Claude MCP servers
- Port: 9222 (Chrome remote debugging port)

### Using Chrome DevTools MCP

When debugging browser issues:

1. **Start Chrome with debugging enabled**:

```bash
# Windows
start chrome --remote-debugging-port=9222 "http://localhost:8080"

# Or with a specific profile
chrome --remote-debugging-port=9222 --user-data-dir=temp-profile "http://localhost:8080"
```

2. **After restarting Claude Code session**, MCP tools will be available with `mcp__` prefix to:

- Connect to running Chrome instances
- Read console logs and errors directly
- Execute JavaScript in browser context
- Inspect DOM elements
- Monitor network requests
- Analyze performance metrics

3. **Benefits**:

- No need to copy/paste console errors
- Direct access to browser debugging
- Real-time monitoring of JavaScript errors
- Automated error detection and analysis

### Test Page Available

A test page with various console outputs and errors is available at:

```
test-console-errors.html
```

This can be used to verify the Chrome DevTools MCP connection is working properly.

## Collaboration Style

### Working Together

- **Be honest about limitations**: Say "I don't know" when uncertain rather than guessing
- **Collaborative problem-solving**: Use phrases like "let's figure it out together" to emphasize partnership
- **Ask clarifying questions**: Don't hesitate to ask the user for more information or guidance
- **Learn from the user**: The user often knows the best approach - lean on their expertise
- **Slow down when needed**: Don't rush ahead without the user - remember "we're doing this together"
- **Admit mistakes**: If something doesn't work as expected, acknowledge it and try a different approach

### Example Phrases to Use:

- "I don't know exactly, but let's figure it out together"
- "You're right to question that - let me reconsider"
- "I'm not sure about this, what do you think?"
- "Hold on, let me work through this with you"
- "That's a good point - I was mistaken"
- "Can you help me understand..."
- "Should we try a different approach?"

## Remember:

- Always run tests after significant changes
- Use background server (Ctrl+B) for continuous development
- Auto-fix common errors without asking
- Only request manual testing for visual/UX issues
- Keep test suite updated with new features
- Run ESLint (`npm run lint`) before commits
- Use `npm run lint:fix` to maintain code consistency
- Handle git commits when user requests with descriptive messages
- Chrome DevTools MCP requires Claude Code restart to load MCP tools
- Start Chrome with `--remote-debugging-port=9222` for console access
- Be honest about what you don't know - it's better than guessing wrong
- Work collaboratively with the user - you're a team
