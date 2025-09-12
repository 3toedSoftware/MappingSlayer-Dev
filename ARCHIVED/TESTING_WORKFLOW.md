# Slayer Suite Testing Workflow

## Overview

This document defines the automated testing infrastructure for Slayer Suite and when tests should be run automatically.

## Test Infrastructure

### Dev Server

- **Command**: `npm run dev`
- **Port**: 8080
- **Features**: No caching (-c-1), instant file updates
- **Background mode**: Can be run with Ctrl+B in Claude Code

### Test Runner

- **Command**: `npm test`
- **Watch mode**: `npm run test:watch`
- **Location**: `test-runner.js`

### Test Suite

- **Location**: `tests/slayer-suite.test.js`
- **Framework**: Playwright
- **Coverage**: All three apps + main index

## When to Run Tests Automatically

### ALWAYS run tests after:

1. **Major refactoring** - Any structural changes to app architecture
2. **Cross-app communication changes** - Modifications to App Bridge or sync manager
3. **Canvas/rendering updates** - Changes to drawing, rendering, or display logic
4. **State management changes** - Updates to state.js or data persistence
5. **Event handler modifications** - Adding/removing event listeners
6. **Build/bundle changes** - Updates to package.json or dependencies
7. **Memory-sensitive operations** - File processing, large data handling
8. **Error handling updates** - Try/catch blocks, error boundaries

### Run tests when user mentions:

- "Test this"
- "Make sure it works"
- "Check for errors"
- "Verify the changes"
- "Is this stable?"
- Any performance concerns
- Any memory issues

### Auto-run test patterns:

```javascript
// If any of these files are modified, run tests:
const criticalFiles = [
    'core/app-bridge.js',
    'core/sync-manager.js',
    'core/slayer-app-base.js',
    '*/state.js',
    '*/main.js',
    '*/*-app.js'
];

// If multiple files changed (>3), run tests:
const multiFileThreshold = 3;
```

## Test Coverage

### Integration Tests Check:

1. **App Initialization**
    - Canvas elements present
    - UI components loaded
    - No console errors
    - App objects defined

2. **Cross-App Communication**
    - App Bridge initialized
    - Message passing works
    - Data sync functional

3. **Performance**
    - Render time < 100ms for 1000 elements
    - Memory growth < 10MB after operations
    - No memory leaks from event listeners

4. **Error Handling**
    - Undefined property access handled
    - Network failures retry
    - Invalid input gracefully handled

5. **State Persistence**
    - LocalStorage operations work
    - State survives reload
    - File handles preserved

## Errors Auto-Fixed

### Pattern-Based Fixes:

```javascript
// Automatically fixed:
- "Cannot read property X of undefined" → Add null checks
- "X is not a function" → Add type checking
- "Failed to fetch" → Add retry logic
- Memory leaks → Add cleanup in destructors
- Missing await → Add async/await
- Syntax errors → Fix typos/brackets
```

### Cannot Auto-Fix:

- Visual/CSS issues
- Business logic errors
- UX flow problems
- Performance "feel"
- Browser-specific quirks

## Testing Commands Reference

```bash
# Start dev server (background)
npm run dev

# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx playwright test tests/slayer-suite.test.js

# Run with visible browser
npm test -- --headed

# Run with devtools open
npm test -- --devtools
```

## CI/CD Integration Points

### Pre-commit checks:

1. Syntax validation
2. Critical path tests
3. Memory leak detection

### Post-merge:

1. Full integration suite
2. Performance benchmarks
3. Cross-browser tests

## Error Reporting Format

When tests fail, the system reports:

```
App: [Mapping/Design/Thumbnail]
Error: [Error message]
Location: [File:Line]
Suggested Fix: [Auto-fix attempted or manual intervention needed]
```

## Watch Mode Workflow

Watch mode monitors:

- `apps/` directory
- `core/` directory
- `shared/` directory

Triggers on:

- `.js` file changes
- `.html` file changes
- Debounced to 1 second

## Performance Benchmarks

### Acceptable Thresholds:

- App initialization: < 2 seconds
- Canvas render (1000 items): < 100ms
- Memory growth per operation: < 5MB
- Event response time: < 50ms
- File save/load: < 1 second for 10MB

## Test Maintenance

### Weekly:

- Review and update test cases
- Check for flaky tests
- Update performance thresholds

### Per Feature:

- Add specific test cases
- Update auto-fix patterns
- Document edge cases

## Integration with Claude Code

When working with Claude Code:

1. Claude should proactively run tests after major changes
2. Tests run automatically when errors are suspected
3. Background server (Ctrl+B) + test runner provides continuous validation
4. Auto-fixes are applied without user intervention
5. Manual testing only requested for visual/UX verification

## Quick Debug Checklist

If user reports an issue:

1. Start dev server: `npm run dev` (background)
2. Run tests: `npm test`
3. Review error patterns
4. Apply auto-fixes
5. Re-run tests
6. Report remaining manual issues

This workflow ensures consistent quality while minimizing manual testing overhead.
