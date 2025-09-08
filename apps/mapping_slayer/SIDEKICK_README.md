# Sidekick - AI Interface for Mapping Slayer

Sidekick makes Mapping Slayer accessible to AI agents, allowing natural language control of your mapping data through any AI assistant (Claude, ChatGPT, Gemini, or local models).

## How It Works

Sidekick provides a JSON-based interface that AI agents can use to:

1. Request current mapping data
2. Modify the data using familiar JSON structures
3. Apply changes back to the application

## Setup

Sidekick loads automatically when you open Mapping Slayer. No configuration needed!

To verify it's working, open browser console and type:

```javascript
window.sidekick.getStatus();
```

## Basic Usage

### For AI Agents

When an AI agent is connected to your browser (via extension or automation tool), it can:

```javascript
// Get current state
const state = window.sidekick.getStateJSON();

// Modify the state (example: change all OFFICE to SPACE)
state.appState.dotsByPage['1'].dots.forEach(dot => {
    if (dot.message === 'OFFICE') {
        dot.message = 'SPACE';
    }
});

// Apply changes
window.sidekick.applyStateJSON(state);
```

### Natural Language Examples

Tell your AI assistant things like:

- "Change dots 0001-0005 message from OFFICE to SPACE"
- "Change all IA.1 markers to IA.2"
- "Select all dots with RESTROOM in the message"
- "Run automap for EXIT signs"
- "Add a flag to dots 0010-0015"

## Core Functions

### State Management

- `getStateJSON()` - Get complete application state
- `applyStateJSON(state)` - Apply modified state
- `getStateJSON({currentPageOnly: true})` - Get current page only

### Direct Actions

- `runAutomap(searchTerm)` - Run automap with search
- `selectDots(criteria)` - Select dots by various criteria
- `navigateToPage(pageNum)` - Navigate to page
- `undo()` - Undo last AI operation

### Utilities

- `getDotCount()` - Get statistics
- `setPreviewMode(true)` - Preview changes without applying
- `getStatus()` - Check interface status

## Selection Criteria

When selecting dots, you can use:

```javascript
{
    ids: ["dot_1", "dot_2"],           // Specific IDs
    markerType: "IA.1",                // By marker type
    message: "OFFICE",                  // By message content
    locationRange: {start: 1, end: 5}  // By location number
}
```

## Data Structure

The JSON structure matches Mapping Slayer's save format:

```javascript
{
    appState: {
        dotsByPage: {
            "1": {
                dots: [
                    {
                        internalId: "dot_1",
                        locationNumber: "0001",
                        x: 100,
                        y: 200,
                        message: "OFFICE",
                        markerType: "IA.1",
                        flags: {...}
                    }
                ]
            }
        },
        markerTypes: {
            "IA.1": {
                name: "Interior ADA",
                color: "#0000FF"
            }
        }
    }
}
```

## Safety Features

- **Preview Mode**: Test changes before applying
- **Validation**: Ensures valid state structure
- **Undo**: Revert last AI operation
- **Atomic Updates**: All changes apply or none

## Compatible AI Tools

Works with any AI that can execute JavaScript:

- Browser automation tools (Browser Use, Playwright)
- Chrome extensions (Claude for Chrome, ChatGPT extensions)
- Local AI agents (with browser control)
- Chrome's built-in AI (window.ai)

## Examples File

See `sidekick-examples.json` for detailed code examples that AI agents can learn from.

## Troubleshooting

If Sidekick isn't available:

1. Check console for errors
2. Ensure Mapping Slayer is fully loaded
3. Try refreshing the page
4. Verify with `window.sidekick.getStatus()`

## Future Enhancements

- Cross-app communication (Design Slayer, Thumbnail Slayer)
- Batch operations across multiple pages
- Natural language parser built-in
- Voice command support

---

**Version**: 1.0.0  
**Created**: 2025  
**Part of**: Slayer Suite
