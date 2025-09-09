# Sidekick Guide for AI Agents

**Note**: Sidekick is a programmatic API without a human-facing UI. It's designed exclusively for AI agents to control Mapping Slayer through code execution, not for direct human interaction.

## Important: Documentation Maintenance

**AI agents should update this guide whenever they discover new functionality or learn how to perform new operations in Mapping Slayer.** This ensures future AI sessions have access to accumulated knowledge about the system.

When updating:

- Add new sections for major features
- Include working code examples with generic placeholders
- Document selectors, IDs, and class names discovered
- Note any timing requirements or sequencing needs
- Keep examples generic (avoid specific data that might not apply universally)

## Prerequisites for Sidekick

### What Sidekick Needs to Load

1. **Mapping Slayer must be loaded in STANDALONE mode**
    - ✅ Works: `http://localhost:8080/apps/mapping_slayer/mapping_slayer.html`
    - ❌ Does NOT work: `http://localhost:8080/index.html` (Suite mode)

2. **Required global variables must be available**:
    - `window.mappingApp` - The main app instance
    - `window.appState` - The global state object
    - These are only set when Mapping Slayer initializes properly

3. **A PDF should be loaded** for full functionality

### How Sidekick Initializes

Sidekick (`ai-interface.js`) automatically initializes when:

- The page is loaded in standalone mode
- `window.mappingApp` and `window.appState` become available
- If these aren't available, Sidekick retries every 100ms until they are

You'll see this in the console when ready:

```
🤖 Sidekick: Interface ready. Access via window.sidekick
🤖 Sidekick: Try sidekick.getStatus() to see available commands
```

### Why Sidekick Doesn't Work in Suite Mode

In Suite mode, apps are loaded as modules through the app bridge system, and the required globals aren't set the same way. The suite uses a different architecture for cross-app communication.

## Quick Start for AI Agents

This guide helps AI agents (Claude, ChatGPT, Gemini, etc.) interact with Mapping Slayer through the Sidekick JSON API.

## 1. First Steps - Check Connection

Always verify Sidekick is available before attempting operations:

```javascript
// Check if Sidekick is loaded
if (window.sidekick) {
    const status = window.sidekick.getStatus();
    console.log('Sidekick ready:', status.ready);
} else {
    console.log('Sidekick not available - page may still be loading');
}
```

## 2. Core Operations

### Load a PDF File (Required for Initialization)

```javascript
// Programmatically load a PDF file into Mapping Slayer
(async function () {
    // Fetch the PDF file (adjust path as needed)
    const response = await fetch('/path/to/your.pdf');
    const blob = await response.blob();
    const file = new File([blob], 'filename.pdf', { type: 'application/pdf' });

    // Find the file input element
    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
        // Create a DataTransfer object to simulate file selection
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Trigger change event to load the PDF
        const changeEvent = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(changeEvent);

        console.log('PDF loaded successfully');
    }
})();
```

### Create and Manage Marker Types via Sidekick API

**IMPORTANT**: Always create marker types BEFORE adding dots! Dots with non-existent marker types will not appear in the location list. Mapping Slayer was designed for human use and expects proper setup - just like a human would first create marker types, then use them.

```javascript
// Get current state
const state = window.sidekick.getStateJSON();

// Define your marker types with codes, names, and colors
state.appState.markerTypes = {
    BE: {
        code: 'BE',
        name: 'Building Entrance',
        color: '#FF0000', // Red
        textColor: '#FFFFFF' // White text
    },
    P: {
        code: 'P',
        name: 'Parking',
        color: '#0000FF', // Blue
        textColor: '#FFFFFF'
    },
    EE: {
        code: 'EE',
        name: 'Emergency Exit',
        color: '#00FF00', // Green
        textColor: '#000000' // Black text
    },
    AE: {
        code: 'AE',
        name: 'Accessible Entrance',
        color: '#FFFF00', // Yellow
        textColor: '#000000'
    },
    I: {
        code: 'I',
        name: 'Information',
        color: '#00FFFF', // Cyan
        textColor: '#000000'
    },
    R: {
        code: 'R',
        name: 'Restroom',
        color: '#FF00FF', // Magenta
        textColor: '#FFFFFF'
    },
    E: {
        code: 'E',
        name: 'Elevator',
        color: '#FFA500', // Orange
        textColor: '#000000'
    },
    S: {
        code: 'S',
        name: 'Stairs',
        color: '#800080', // Purple
        textColor: '#FFFFFF'
    },
    FE: {
        code: 'FE',
        name: 'Fire Extinguisher',
        color: '#FF6B6B', // Light Red
        textColor: '#FFFFFF'
    },
    UM: {
        code: 'UM',
        name: 'Unmarked',
        color: '#808080', // Gray
        textColor: '#FFFFFF'
    }
};

// Apply the updated state
const result = window.sidekick.applyStateJSON(state);
console.log('Marker types created:', result);
```

### Alternative: Update Only Marker Types

```javascript
// Use the dedicated method for updating just marker types
const markerTypes = {
    BE: { code: 'BE', name: 'Building Entrance', color: '#FF0000', textColor: '#FFFFFF' },
    P: { code: 'P', name: 'Parking', color: '#0000FF', textColor: '#FFFFFF' }
    // Add more as needed
};

const result = window.sidekick.updateMarkerTypes(markerTypes);
console.log('Marker types updated:', result);
```

### Add Dots to the Map

```javascript
// Get current state
const state = window.sidekick.getStateJSON();

// Determine current page
const currentPage = state.appState.currentPage || '1';

// Initialize page structure if needed
if (!state.appState.dotsByPage[currentPage]) {
    state.appState.dotsByPage[currentPage] = { dots: [] };
}

// Get existing dot count for proper numbering
const existingDots = state.appState.dotsByPage[currentPage].dots.length;

// Create new dots
const timestamp = Date.now();
const newDots = [
    { x: 200, y: 200, msg: 'MAIN ENTRANCE' },
    { x: 350, y: 200, msg: 'OFFICE' },
    { x: 500, y: 200, msg: 'RESTROOM' },
    { x: 275, y: 350, msg: 'ELEVATOR' },
    { x: 425, y: 350, msg: 'STAIRS' }
].map((dot, i) => ({
    internalId: `dot_${timestamp}_${i}`,
    locationNumber: String(existingDots + i + 1).padStart(4, '0'),
    x: dot.x,
    y: dot.y,
    message: dot.msg,
    markerType: 'BE', // Use an existing marker type code
    flags: {},
    installed: false
}));

// Add dots to the state
state.appState.dotsByPage[currentPage].dots.push(...newDots);

// Apply the updated state
const result = window.sidekick.applyStateJSON(state);
console.log('Dots added:', result);

// Verify dots were added
const stats = window.sidekick.getDotCount();
console.log('Total dots:', stats.total);
console.log('Dots by page:', stats.byPage);
console.log('Dots by marker type:', stats.byMarkerType);
```

### Get Current State

```javascript
const state = window.sidekick.getStateJSON();
// Returns complete application state including dots, marker types, pages
```

### Modify and Apply State

```javascript
// Get state
const state = window.sidekick.getStateJSON();

// Make changes
state.appState.dotsByPage['1'].dots.forEach(dot => {
    if (dot.message === 'OLD TEXT') {
        dot.message = 'NEW TEXT';
    }
});

// Apply changes
const result = window.sidekick.applyStateJSON(state);
console.log('Success:', result.success);
```

## 3. Common Tasks

### Change Messages in Bulk

```javascript
// Example: Change all "PAT RM" to "PATIENT ROOM"
const state = window.sidekick.getStateJSON();
let count = 0;

for (const pageNum in state.appState.dotsByPage) {
    state.appState.dotsByPage[pageNum].dots.forEach(dot => {
        if (dot.message && dot.message.includes('PAT RM')) {
            dot.message = dot.message.replace('PAT RM', 'PATIENT ROOM');
            count++;
        }
    });
}

window.sidekick.applyStateJSON(state);
console.log(`Updated ${count} dots`);
```

### Change Marker Types

```javascript
// Example: Change all IA.1 to IA.2
const state = window.sidekick.getStateJSON();

for (const pageNum in state.appState.dotsByPage) {
    state.appState.dotsByPage[pageNum].dots.forEach(dot => {
        if (dot.markerType === 'IA.1') {
            dot.markerType = 'IA.2';
        }
    });
}

window.sidekick.applyStateJSON(state);
```

### Select Dots by Criteria

```javascript
// Select dots 0001-0005
window.sidekick.selectDots({
    locationRange: { start: 1, end: 5 }
});

// Select by message content
window.sidekick.selectDots({
    message: 'RESTROOM'
});

// Select by marker type
window.sidekick.selectDots({
    markerType: 'IA.1'
});
```

### Add/Modify Marker Types

```javascript
const state = window.sidekick.getStateJSON();

// Add new marker type
state.appState.markerTypes['EX.1'] = {
    name: 'Exit Signs',
    code: 'EX.1',
    color: '#FF0000',
    textColor: '#FFFFFF'
};

// Set as active
state.appState.activeMarkerType = 'EX.1';

window.sidekick.applyStateJSON(state);
```

### Run Automap

**IMPORTANT: Automap Configuration**

The automap feature has an "Exact" checkbox that controls how text matching works:

- **Exact checkbox CHECKED (default)**: Only finds exact, full matches
- **Exact checkbox UNCHECKED**: Finds partial matches (recommended for most searches)

For example, searching for "STAIR" with:

- Exact checked: Would NOT find "STAIR-A", "STAIR-B", etc.
- Exact unchecked: WOULD find "STAIR-A", "STAIR-B", "STAIRS", etc.

```javascript
// Method 1: Using Sidekick API directly (always uses partial matching)
await window.sidekick.runAutomap('EXIT');

// Method 2: Using UI controls for more control
// First, uncheck the "Exact" checkbox for partial matching
const exactCheckbox = document.getElementById('automap-exact-phrase');
if (exactCheckbox) {
    exactCheckbox.checked = false; // Enable partial matching
}

// Then find and use the automap UI
const automapButton = Array.from(document.querySelectorAll('button')).find(btn =>
    btn.textContent?.toLowerCase().includes('automap')
);

if (automapButton) {
    // Find the search input near the button
    const searchInput =
        automapButton.parentElement?.querySelector('input[type="text"]') ||
        automapButton.parentElement?.parentElement?.querySelector('input[type="text"]');

    if (searchInput) {
        searchInput.value = 'STAIR'; // Your search term
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        automapButton.click();
    }
}

// Method 3: Complete automap workflow
async function runAutomapWithOptions(searchTerm, exactMatch = false) {
    // Set the exact match preference
    const exactCheckbox = document.getElementById('automap-exact-phrase');
    if (exactCheckbox) {
        exactCheckbox.checked = exactMatch;
    }

    // Run automap
    const result = await window.sidekick.runAutomap(searchTerm);

    // Check results
    const status = window.sidekick.getStatus();
    console.log(`Found ${status.dotCount.total} matches for "${searchTerm}"`);

    return status.dotCount;
}

// Examples:
await runAutomapWithOptions('STAIR', false); // Find all stair-related text
await runAutomapWithOptions('EXIT', false); // Find all exit-related text
await runAutomapWithOptions('ROOM 101', true); // Find exactly "ROOM 101"
```

### Fix Location Numbers

```javascript
// If location numbers are corrupted (e.g., "false")
const state = window.sidekick.getStateJSON();
let locationNum = 1;

if (state.appState.dotsByPage['1']) {
    // Sort by position (top to bottom, left to right)
    state.appState.dotsByPage['1'].dots.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 10) return a.x - b.x;
        return a.y - b.y;
    });

    // Assign proper numbers
    state.appState.dotsByPage['1'].dots.forEach(dot => {
        dot.locationNumber = String(locationNum).padStart(4, '0');
        locationNum++;
    });

    state.appState.dotsByPage['1'].nextLocationNumber = locationNum;
}

window.sidekick.applyStateJSON(state);
```

## 4. UI Control

### Toggle Message Visibility

```javascript
// Show/hide messages on dots
window.appState.messagesVisible = true; // or false
window.renderDotsForCurrentPage();
```

### Navigate Pages

```javascript
window.sidekick.navigateToPage(2); // Go to page 2
```

### Click UI Buttons

```javascript
// Find and click a button by text
const button = Array.from(document.querySelectorAll('button')).find(b =>
    b.textContent.includes('SHOW MSG1')
);
if (button) button.click();
```

## 5. Data Structure Reference

### Dot Object Structure

```javascript
{
    internalId: "0000001",
    locationNumber: "0001",
    x: 100,
    y: 200,
    markerType: "IA.1",
    message: "ROOM NAME",
    message2: "",
    notes: "",
    installed: false,
    flags: {
        topLeft: false,
        topRight: false,
        bottomLeft: false,
        bottomRight: false
    }
}
```

### Marker Type Structure

```javascript
{
    name: "Interior ADA",
    code: "IA.1",
    color: "#0066CC",
    textColor: "#FFFFFF",
    designReference: null,  // Base64 image data
    flagConfig: null
}
```

## 6. Best Practices

### Always Check Before Operating

```javascript
// Good practice
if (window.sidekick && window.sidekick.getStatus().ready) {
    // Proceed with operations
}
```

### Use Preview Mode for Testing

```javascript
window.sidekick.setPreviewMode(true);
// Make changes - they won't be applied
const result = window.sidekick.applyStateJSON(modifiedState);
console.log('Preview:', result.changes);
window.sidekick.setPreviewMode(false); // Turn off preview
```

### Handle Empty States

```javascript
const state = window.sidekick.getStateJSON();

// Initialize if needed
if (!state.appState.dotsByPage['1']) {
    state.appState.dotsByPage['1'] = {
        dots: [],
        nextLocationNumber: 1
    };
}
```

### Batch Operations

```javascript
// Process multiple changes at once
const state = window.sidekick.getStateJSON();

// Multiple operations
state.appState.dotsByPage['1'].dots.forEach(dot => {
    dot.message = dot.message.toUpperCase();
    dot.installed = true;
    if (!dot.flags) dot.flags = {};
    dot.flags.topLeft = true;
});

// Apply all at once
window.sidekick.applyStateJSON(state);
```

## 7. Troubleshooting

### Automap Not Finding Expected Matches

If automap isn't finding text you expect:

- **Check the "Exact" checkbox setting**: By default, it's checked and only finds exact matches
- Uncheck "Exact" to enable partial matching (finds "STAIR-A" when searching for "STAIR")
- The checkbox ID is `automap-exact-phrase`
- Partial matching is usually more useful for finding variations of text

```javascript
// Ensure partial matching is enabled
document.getElementById('automap-exact-phrase').checked = false;
```

### Dots Not Appearing in Location List

If dots appear on the map but not in the location list:

- **Check marker types exist**: The most common cause is using a marker type code that doesn't exist
- Dots with invalid marker types are ignored by the location list
- Always create marker types first, then add dots
- Use `Object.keys(state.appState.markerTypes)` to see available marker types

### PDF Not Visible

```javascript
// Re-render the PDF
(async () => {
    const { renderPDFPage } = await import('./map-controller.js');
    await renderPDFPage(window.appState.currentPdfPage || 1);
})();
```

### Sidekick Not Available

```javascript
// Wait for it to load
function waitForSidekick(callback) {
    if (window.sidekick) {
        callback();
    } else {
        setTimeout(() => waitForSidekick(callback), 500);
    }
}
```

### State Validation

```javascript
// Check if state is valid before applying
const validation = window.sidekick.validateState(modifiedState);
if (!validation.valid) {
    console.error('Invalid state:', validation.errors);
}
```

## 8. Natural Language Mapping

When users give natural language commands, map them to Sidekick operations:

| User Says                    | AI Should Execute                 |
| ---------------------------- | --------------------------------- |
| "Change all OFFICE to SPACE" | Modify message field in state     |
| "Change IA.1 to IA.2"        | Update markerType field           |
| "Select dots 1-5"            | Use selectDots with locationRange |
| "Add flag to dot 10"         | Modify flags object               |
| "Go to page 2"               | navigateToPage(2)                 |
| "Run automap for EXIT"       | runAutomap("EXIT")                |

## 9. Advanced Operations

### Cross-Page Operations

```javascript
// Count all dots across all pages
const state = window.sidekick.getStateJSON();
let totalDots = 0;

for (const pageNum in state.appState.dotsByPage) {
    totalDots += state.appState.dotsByPage[pageNum].dots.length;
}
```

### Export for Analysis

```javascript
// Get data in CSV-friendly format
const state = window.sidekick.getStateJSON();
const csvData = [];

for (const pageNum in state.appState.dotsByPage) {
    state.appState.dotsByPage[pageNum].dots.forEach(dot => {
        csvData.push({
            page: pageNum,
            location: dot.locationNumber,
            x: dot.x,
            y: dot.y,
            message: dot.message,
            markerType: dot.markerType
        });
    });
}

console.table(csvData);
```

### Undo Operations

```javascript
// Undo last AI operation
window.sidekick.undo();
```

## 10. Error Handling

Always wrap operations in try-catch:

```javascript
try {
    const state = window.sidekick.getStateJSON();
    // ... modifications ...
    const result = window.sidekick.applyStateJSON(state);

    if (!result.success) {
        console.error('Operation failed:', result.error);
    }
} catch (error) {
    console.error('Sidekick error:', error);
}
```

## Quick Reference Card

```javascript
// Essential Sidekick Commands
window.sidekick.getStatus(); // Check if ready
window.sidekick.getStateJSON(); // Get all data
window.sidekick.applyStateJSON(state); // Apply changes
window.sidekick.selectDots(criteria); // Select dots
window.sidekick.runAutomap(term); // Run automap
window.sidekick.navigateToPage(num); // Change page
window.sidekick.undo(); // Undo last operation
window.sidekick.setPreviewMode(bool); // Preview mode
window.sidekick.getDotCount(); // Get statistics
```

## Remember

- Sidekick is the bridge between AI and Mapping Slayer
- Always check state before modifying
- Batch operations are more efficient
- Use preview mode for testing
- The user sees changes in real-time

---

_Last Updated: 2025_
_Version: 1.0_
_For: All AI Agents interacting with Mapping Slayer_
