# Integration Guide - Slayer Suite

## Overview

This guide explains how the Slayer Suite applications work together, focusing on the SVG-based architecture and data flow between apps.

## Application Roles

### Mapping Slayer

**Purpose**: Define sign locations and data
**Outputs**:

- Location coordinates (x, y)
- Sign messages (message1, message2)
- Sign type/marker type
- Flags and attributes

### Design Slayer

**Purpose**: Create sign design templates
**Outputs**:

- Template definitions (layers, colors, fonts)
- SVG template markup (after migration)
- Dimension specifications
- Material definitions

### Thumbnail Slayer

**Purpose**: Generate sign previews and production tracking
**Inputs**:

- Location data from Mapping Slayer
- Templates from Design Slayer
  **Outputs**:
- SVG thumbnails with actual text
- Text converted to paths for production
- Production status tracking

### Production Slayer (Future)

**Purpose**: Generate fabrication files
**Inputs**: SVG paths from Thumbnail Slayer
**Outputs**: DXF, AI, G-code files

## Data Flow

```
┌─────────────────┐
│ Mapping Slayer  │
│   (Locations)   │
└────────┬────────┘
         │ Location Data
         ↓
┌─────────────────┐     ┌─────────────────┐
│ Design Slayer   │────>│ Thumbnail       │
│  (Templates)    │     │    Slayer       │
└─────────────────┘     └────────┬────────┘
    SVG Templates                │ SVG Paths
                                ↓
                        ┌─────────────────┐
                        │ Production      │
                        │    Slayer       │
                        └─────────────────┘
```

## Key Integration Points

### 1. Template Selection Flow

```javascript
// User flow:
// 1. In Mapping Slayer: Assign marker type to location
// 2. In Design Slayer: Create template for that marker type
// 3. In Thumbnail Slayer: Template auto-matches by marker type

// Data structure:
{
  location: {
    markerType: "room-id",
    message1: "101",
    message2: "Conference Room"
  },
  template: {
    signTypeCode: "room-id",  // Matches markerType
    svgTemplate: "<svg>...</svg>"
  }
}
```

### 2. Message Data Synchronization

#### Current Implementation

- Mapping Slayer sends location updates via App Bridge
- Thumbnail Slayer receives updates through sync adapter
- Changes in Thumbnail spreadsheet sync back to Mapping

#### With SVG

- Same data flow
- Template is now SVG instead of canvas instructions
- Text fields are replaced in SVG template

### 3. Template Rendering Process

#### Before SVG Migration

```javascript
// Canvas-based
1. Load template data
2. Draw shapes on canvas
3. Draw text on canvas
4. Result: Bitmap image
```

#### After SVG Migration

```javascript
// SVG-based
1. Load SVG template
2. Replace {{message1}} placeholders
3. Convert text to paths with OpenType.js
4. Result: Scalable vector graphic
```

## Template Structure

### Design Slayer Template

```xml
<svg viewBox="0 0 1200 600">
  <!-- Background plate -->
  <rect id="plate" width="1200" height="600" fill="#003366"/>

  <!-- Text areas with placeholders -->
  <text id="message1" x="600" y="200" text-anchor="middle">
    {{message1}}
  </text>
  <text id="message2" x="600" y="400" text-anchor="middle">
    {{message2}}
  </text>

  <!-- Graphics/logos -->
  <g id="logo">
    <circle cx="100" cy="100" r="50" fill="#f07727"/>
  </g>
</svg>
```

### Thumbnail Slayer Processing

```javascript
// 1. Load template
const template = getSVGTemplate(signType);

// 2. Replace placeholders
template.replace('{{message1}}', actualMessage1);
template.replace('{{message2}}', actualMessage2);

// 3. Convert text to paths
const paths = opentype.textToPath(actualMessage1);

// 4. Result: Production-ready SVG
```

## Synchronization Patterns

### Real-time Sync

- **Trigger**: User edits in any app
- **Method**: App Bridge broadcasts
- **Subscribers**: All apps listening for relevant changes

### Batch Sync

- **Trigger**: User clicks sync or app activation
- **Method**: Request all data from source apps
- **Use case**: Initial load, recovery from errors

### Field-level Sync

```javascript
// Thumbnail Slayer edits message
thumbnailSyncAdapter.updateLocationField(
  locationId: "loc_001",
  field: "message1",
  value: "New Text"
);

// Mapping Slayer receives update
appBridge.on('field-updated', (data) => {
  updateLocation(data.locationId, data.field, data.value);
});
```

## State Management

### Shared State (via App Bridge)

- Sign types/marker types
- Location data
- Template assignments

### Local State

- UI preferences
- View settings
- Temporary edits

### Persistent State

- Saved projects
- User templates
- Export settings

## Error Handling

### Template Not Found

```javascript
// Fallback strategy
if (!template) {
    // 1. Try to fetch from Design Slayer
    template = await fetchTemplate(signType);

    // 2. Use generic template
    if (!template) {
        template = getGenericTemplate();
    }
}
```

### Sync Failures

- Queue failed updates
- Retry with exponential backoff
- Show sync status to user
- Allow manual sync trigger

## Performance Optimization

### Lazy Loading

- Load templates on demand
- Render only visible thumbnails
- Defer text-to-path conversion

### Caching Strategy

```javascript
// Template cache
const templateCache = new Map();

// Path cache (text-to-path is expensive)
const pathCache = new Map();
const cacheKey = `${fontName}-${fontSize}-${text}`;
```

### Batch Operations

- Group multiple updates
- Debounce rapid changes
- Use requestAnimationFrame for renders

## Testing Integration

### Test Scenarios

1. **Create-Edit-Render Flow**
    - Create location in Mapping
    - Design template in Design
    - Verify thumbnail in Thumbnail

2. **Sync Testing**
    - Edit in Thumbnail spreadsheet
    - Verify update in Mapping
    - Check template still applies

3. **Performance Testing**
    - Load 1000+ signs
    - Measure render time
    - Check memory usage

## Migration Considerations

### Backward Compatibility

- Old canvas templates must still work
- Add version field to templates
- Create migration function for old → new

### Feature Flags

```javascript
const config = {
    useSVGRendering: true,
    fallbackToCanvas: true,
    convertTextToPaths: true
};
```

## Future Enhancements

### Production Slayer Integration

```javascript
// Thumbnail Slayer will provide:
{
  signId: "001",
  svgPaths: {
    outline: "M 0 0 L 1200 0...",  // For cutting
    text: "M 10 10 C 20 20...",    // For engraving
    graphics: "M 50 50..."          // For vinyl
  },
  materials: {
    plate: "aluminum-0.125",
    vinyl: "white-reflective"
  }
}
```

### Direct Machine Export

- DXF for CNC routers
- SVG for laser cutters
- AI for vinyl cutters
- G-code for 3D printers

## Developer Notes

### When Adding New Features

1. Consider impact on all apps
2. Update sync adapters if needed
3. Test integration thoroughly
4. Document data structure changes
5. Update this guide

### Common Pitfalls

- Forgetting to sync changes back
- Not handling template missing case
- Assuming data structure without checking
- Not caching expensive operations
- Breaking backward compatibility
