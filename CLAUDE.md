# Claude Code Instructions for Mapping Slayer

## Startup Greeting

When starting a new Claude Code session, ask the user:
"Would you like to see your toolbelt?"

If they say yes, run:
```bash
node dev-tools/show-toolbelt.js
```

This displays the complete toolbelt including:
- Available core tools (File ops, Search, Bash, Git, etc.)
- MCP server status (Playwright, Chrome DevTools)
- Running services and ports
- Permission counts
- Mapping Slayer specific features
- Quick command reference

If they say no or want to get straight to work, proceed directly without showing the toolbelt.

## Project Overview

Mapping Slayer is a professional sign mapping platform for creating detailed maps with marker placement, PDF integration, and comprehensive project management.

### Correct Path Structure

**Important**: The application is located at:

- Main entry: `http://localhost:8080/index.html` (redirects to mapping_slayer.html)
- Direct access: `http://localhost:8080/src/app/mapping_slayer.html`

### Sidekick AI Note

The Sidekick AI feature in Mapping Slayer is an API/backend system without a human-facing UI. It includes:

- `ai-interface.js` - AI integration code
- `sidekick-examples.json` - Example prompts/responses
- Documentation files (SIDEKICK_README.md, SIDEKICK_AI_GUIDE.md)

**Important**: There is no user interface for Sidekick - it's designed as a backend system for AI assistants to interact with, not for direct human use.

**When working with Mapping Slayer**: If you haven't already in this session, read `docs/SIDEKICK_AI_GUIDE.md` to familiarize yourself with the preferred direct evaluation method. DO NOT create separate script files - always use inline `node -p` with Playwright evaluation for Sidekick operations.

### Sidekick Workflow for Users

**If user has NO existing work:**

1. Ask Claude to help with Mapping Slayer
2. Claude opens a special browser window
3. User works normally in that window (load PDF, add markers, etc.)
4. User asks Claude to automate tasks
5. Claude uses Sidekick to control that same window

**If user ALREADY has work in progress:**

1. Save your work using SAVE or SAVE AS button in Mapping Slayer
2. Tell Claude you have existing work saved
3. Claude opens a special browser window
4. Use the LOAD button to load your .slayer file
5. All your work appears in Claude's window
6. Claude can now automate tasks on your existing work

**Key Points:**

- Claude needs a special debugging-enabled browser window to use Sidekick
- Your regular browser window can't be controlled by Claude
- The save/load process bridges your work to Claude's window
- Once loaded, Claude can see and control everything in that window

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
# Start dev server in background
npm run dev

# Run integration tests
npm test

# Watch mode for continuous testing
npm run test:watch
```

### Critical Files Requiring Tests

If any of these files are modified, ALWAYS run tests:

- `src/core/app-bridge.js`
- `src/core/sync-manager.js`
- `src/core/slayer-app-base.js`
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
mapping-slayer-dev/
├── index.html              # Simple redirect to mapping_slayer.html
├── src/
│   ├── app/               # Main application code
│   │   ├── mapping_slayer.html  # Main application entry point
│   │   ├── mapping-app.js       # Core application logic
│   │   ├── ui.js               # UI components and handlers
│   │   ├── state.js            # State management
│   │   ├── ai-interface.js     # Sidekick AI integration
│   │   └── ...                 # Other app modules
│   ├── core/              # Shared core functionality
│   │   ├── app-bridge.js      # Cross-app communication
│   │   ├── sync-manager.js    # Data synchronization
│   │   └── slayer-app-base.js # Base app class
│   └── styles/            # CSS styles
├── tests/                 # Test suites
├── test-runner.js        # Main test runner
└── docs/                 # Documentation
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

Mapping Slayer uses ESLint for maintaining code quality and consistency.

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

- Location: `C:\Users\iam3toed\Desktop\mapping-slayer-dev\chrome-devtools-mcp\`
- Configuration: Added to Claude MCP servers
- Port: 9222 (Chrome remote debugging port)

### Using Chrome DevTools MCP

When debugging browser issues:

1. **Start Chrome with debugging enabled**:

```bash
# Windows - Open Mapping Slayer with devtools
start chrome --remote-debugging-port=9222 --user-data-dir=temp-profile "http://localhost:8080/src/app/mapping_slayer.html"

# Or just the redirect page
start chrome --remote-debugging-port=9222 --user-data-dir=temp-profile "http://localhost:8080"
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

### Important: Playwright vs User Interaction

**Problem**: When Playwright launches and controls a browser, it can block normal user mouse clicks and interactions - not just in the web app but even in Chrome's own UI (download dialogs, etc).

**SOLVED: Collaborative Debugging with connectOverCDP**

Instead of Playwright launching its own browser (which blocks user interaction), connect to a user-launched browser:

#### When User Needs Help:

User might say things like:
- "I'm having an issue in mapping slayer"
- "Can you help me debug something?"
- "Something's not working right"
- "I need you to see what I'm seeing"

Claude should:
1. Ask if they want collaborative debugging (both can interact) or just observation
2. If yes, offer to open Chrome with debugging enabled
3. Run the setup steps below

#### Setup Steps:

1. **Create profile directory**:
   ```bash
   mkdir C:\temp\chrome-debug-profile
   ```

2. **Claude launches Chrome with debugging** (when user requests collaborative debugging):
   ```bash
   start chrome --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug-profile" "http://localhost:8080/src/app/mapping_slayer.html"
   ```

3. **Verify debug mode**: Navigate to `http://localhost:9222/json/version` - you should see JSON data with `webSocketDebuggerUrl`

4. **Claude connects using the collaborative script**:
   ```bash
   node collaborative-browser.js
   ```

#### Verified Working:
- ✅ User can click buttons and interact normally
- ✅ Playwright can also interact with the same browser
- ✅ No blocking or interference between user and automation
- ✅ Both can trigger file dialogs, click buttons, type, etc.

#### When to Use Each Approach:
- **Playwright MCP (browser_navigate)**: Quick automation tasks where user doesn't need to interact
- **Collaborative (connectOverCDP)**: Debugging sessions where both user and Claude need to interact with the same page
- **Live Server**: User-only testing without any automation

### Test Page Available

A test page with various console outputs and errors is available at:

```
test-console-errors.html
```

This can be used to verify the Chrome DevTools MCP connection is working properly.

## Collaborative Debugging (IMPORTANT - Ask First!)

### When User Reports Issues or Needs Help

**ALWAYS ASK FIRST**: When a user says they need help with Mapping Slayer or reports an issue, immediately ask:

"Do you want me to open a collaborative debugging session where we can both see and interact with Mapping Slayer together? Or would you prefer to describe the issue first?"

This is critical because:
- Users often need to show you something visually
- Collaborative debugging allows both user and Claude to interact with the same browser
- Regular Playwright blocks user interaction, collaborative mode doesn't

### Quick Setup for Collaborative Debugging

When user wants collaborative debugging:

**CRITICAL - Always start fresh:**
1. **Kill all node processes and restart server**:
   ```bash
   taskkill /F /IM node.exe 2>nul & timeout /t 2 /nobreak >nul & npm run dev
   ```
   - Wait for "Available on: http://127.0.0.1:8080" message
   - This ensures no orphaned processes interfere
2. Launch Chrome: `start chrome --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug-profile" "http://localhost:8080/src/app/mapping_slayer.html"`
3. Connect: `node dev-tools/collaborative-browser.js`
4. Both user and Claude can now interact with the same page!

**CRITICAL**:
- ❌ DO NOT use `mcp__playwright__browser_navigate` or any Playwright MCP tools - these create a NEW browser that blocks user interaction
- ✅ DO use `node dev-tools/collaborative-browser.js` to connect to the EXISTING Chrome instance
- The user should only see ONE Chrome window - the one opened in step 2
- If a second browser window opens, something went wrong - you're using Playwright MCP instead of connectOverCDP

## Collaboration Style

### Working Together

- **Be honest about limitations**: Say "I don't know" when uncertain rather than guessing
- **Collaborative problem-solving**: Use phrases like "let's figure it out together" to emphasize partnership
- **Ask clarifying questions**: Don't hesitate to ask the user for more information or guidance
- **Learn from the user**: The user often knows the best approach - lean on their expertise
- **Slow down when needed**: Don't rush ahead without the user - remember "we're doing this together"
- **Admit mistakes**: If something doesn't work as expected, acknowledge it and try a different approach
- **NEVER claim something is "Fixed!" without verification**: Don't assume fixes work - test them first or say "I think this might fix it, let's test"
- **Ask before taking action**: Especially with browser connections - explain what you want to do and why before doing it

### Example Phrases to Use:

- "I don't know exactly, but let's figure it out together"
- "You're right to question that - let me reconsider"
- "I'm not sure about this, what do you think?"
- "Hold on, let me work through this with you"
- "That's a good point - I was mistaken"
- "Can you help me understand..."
- "Should we try a different approach?"
- "I made a change that should fix it - want to test it together?"
- "Let me connect to your browser to check something - is that okay?"

## Remember:

- Always run tests after significant changes
- Use background server for continuous development
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
- **The main application is at `src/app/mapping_slayer.html`, not in an `apps` folder**

# Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
