# Sidekick Guide for AI Agents

## Quick Start for AI Agents

This guide helps AI agents (Claude, ChatGPT, Gemini, etc.) interact with Mapping Slayer through the Sidekick interface.

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

```javascript
// Run automap for a search term
await window.sidekick.runAutomap('EXIT');
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
