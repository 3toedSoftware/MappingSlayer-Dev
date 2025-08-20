# Slayer Suite - Fix List

## Priority Fixes

### 1. App Initialization Race Conditions

**Current Issue**: Apps are initialized in parallel but have inter-dependencies. Design Slayer tries to communicate with Thumbnail Slayer before it's registered.

**Current Band-aid**: Added defensive checks in `fetchAvailableFields()` to verify app registration before communication.

**Proper Fix Needed**:

- Implement dependency-aware initialization order (initialize Thumbnail Slayer before Design Slayer)
- Create a proper app initialization promise chain
- Implement event-driven initialization where apps declare their dependencies
- Add a service registry pattern where apps announce capabilities when ready

**Files Affected**:

- `index.html` (initialization sequence)
- `core/app-bridge.js` (registration mechanism)
- `apps/design_slayer/design-app.js` (dependency on Thumbnail Slayer)

---

### 2. Braille Translator Tests Running in Production

**Current Issue**: Braille translation tests run automatically on every page load, causing errors when the translator isn't ready.

**Current Band-aid**: Changed error to log message and added `waitForReady()` to defer test execution.

**Proper Fix Needed**:

- Remove automatic test execution from `design-app.js` (line ~350)
- Move tests to a dedicated test suite
- Only run tests in development mode or on-demand
- Add a development/production mode flag

**Files Affected**:

- `apps/design_slayer/design-app.js` (removes test call)
- `apps/design_slayer/braille-translator-v2.js` (test function)

---

### 3. Missing Service Discovery Pattern

**Current Issue**: Apps attempt cross-app communication without knowing if their dependencies are available.

**Current Band-aid**: Check if app is registered before sending requests.

**Proper Fix Needed**:

- Implement proper service discovery/registry pattern
- Apps should publish their available services/APIs when ready
- Other apps should subscribe to service availability events
- Add timeout and retry logic for cross-app communication
- Create a capabilities manifest for each app

**Files Affected**:

- `core/app-bridge.js` (needs service registry)
- All app files that use `sendRequest()` or `requestData()`

---

### 4. Canvas Initialization Timing Issues

**Current Issue**: Design Slayer's SVG canvas tries to render grid/rulers before container has proper dimensions, causing negative width/height errors for SVG rectangles.

**Current Band-aid**: Added dimension validation check in `renderGrid()` to skip rendering if dimensions are negative.

**Proper Fix Needed**:

- Use ResizeObserver to detect when container has actual dimensions before rendering
- Defer canvas/grid rendering until after app is activated and visible
- Separate initialization (DOM structure) from rendering (visual elements)
- Initialize with sensible default dimensions, then resize when actual dimensions available
- Remove setTimeout workarounds in initialization

**Root Cause**:

- Apps are hidden (`display: none`) during initialization in suite mode
- Hidden elements report 0 dimensions
- Canvas tries to render while hidden, causing measurement issues

**Files Affected**:

- `apps/design_slayer/design-svg.js` (renderGrid, render methods)
- `apps/design_slayer/design-app.js` (initialization sequence)
- `core/slayer-app-base.js` (app visibility lifecycle)

---

## Additional Improvements

### 4. Error Handling

- Add proper error boundaries for each app
- Implement graceful degradation when dependencies are unavailable
- Add user-friendly error messages instead of console errors

### 5. Loading States

- Show proper loading indicators during app initialization
- Indicate when cross-app communication is in progress
- Add timeout handling for long-running operations

### 6. Development vs Production Mode

- Add environment configuration
- Disable debug logging in production
- Remove test code from production builds
- Add build process to strip development-only code

---

## Notes

- These issues were discovered while fixing console errors on 2025-08-20
- Current fixes are functional but not architecturally sound
- Proper fixes would require refactoring the initialization and communication patterns
