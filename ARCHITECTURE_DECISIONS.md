# Architecture Decisions - Slayer Suite

## Why SVG Over Canvas

### Decision Date: 2024-01-11

### Context

The Slayer Suite needs to render sign designs for:

1. Visual preview (thumbnails)
2. Design editing
3. Production file generation
4. Fabrication (CNC, laser, vinyl cutting)

### Problem

- Canvas rendering produces blurry thumbnails when scaled
- Canvas is raster/bitmap based - has fixed pixel dimensions
- Scaling canvas elements causes pixelation
- No direct path export for fabrication

### Decision: Use SVG for Rendering

### Rationale

#### SVG Advantages

1. **Vector-based**: Infinitely scalable without quality loss
2. **Crisp rendering**: Always sharp, regardless of zoom level
3. **Production-ready**: SVG paths can directly convert to:
    - DXF (CNC routing)
    - AI/EPS (printing)
    - Cut files (vinyl/laser)
4. **Industry standard**: All major sign software uses vector formats
5. **Text as paths**: Required for fabrication equipment
6. **Smaller file sizes**: SVG is text/XML, highly compressible
7. **DOM integration**: Each element is selectable/styleable

#### Canvas Disadvantages

1. **Raster/bitmap**: Fixed resolution
2. **Scaling issues**: Becomes blurry when not 1:1 pixel ratio
3. **No path data**: Can't export for fabrication
4. **Manual hit detection**: Must calculate click positions
5. **Text remains text**: Can't extract outlines

### Implementation Approach

#### Thumbnail Slayer (Viewer)

- SVG rendering for all thumbnails
- OpenType.js for text-to-path conversion
- Maintains exact design fidelity

#### Design Slayer (Editor)

- SVG.js for design surface
- Real DOM elements for each shape
- Three.js integration for 3D preview

#### Production Slayer (Future)

- Direct use of SVG paths
- Export to fabrication formats
- Path optimization for cutting

## Text-to-Path Strategy

### Decision: Use OpenType.js

### Rationale

1. **Browser-compatible**: Works entirely client-side
2. **Accurate**: Exact font metrics and path generation
3. **Production-proven**: Used in many commercial applications
4. **Kerning support**: Maintains proper letter spacing
5. **Font format support**: TTF, OTF, WOFF

### Implementation

```javascript
// Conceptual flow (not actual code)
// 1. Load font file with OpenType.js
// 2. Convert text to path data
// 3. Insert path into SVG
// 4. Path is now fab-ready
```

## 3D Preview Architecture

### Decision: Dual Rendering (SVG + Three.js)

### Rationale

1. **2D Design**: SVG for editing (true vectors)
2. **3D Preview**: Three.js extrudes SVG paths
3. **Perfect fidelity**: Same paths in 2D and 3D
4. **Best of both**: Vector editing, realistic preview

### Implementation

- SVG.js creates 2D design
- Export paths to Three.js
- SVGLoader + ExtrudeGeometry
- Real-time 3D preview

## Data Flow Architecture

### Current Flow

```
Mapping Slayer (locations)
    ↓
Design Slayer (templates)
    ↓
Thumbnail Slayer (previews)
    ↓
Production Slayer (fabrication)
```

### With SVG

```
Mapping Slayer (locations)
    ↓
Design Slayer (SVG templates)
    ↓
Thumbnail Slayer (SVG thumbnails with text-to-path)
    ↓
Production Slayer (Direct SVG → DXF/AI conversion)
```

## Template Storage Strategy

### Decision: Templates as Data + SVG

### Format

```javascript
{
  template: {
    // Existing data structure
    layers: [...],
    dimensions: {...},

    // New addition
    svgTemplate: "<svg>...</svg>", // Full SVG markup
    svgPaths: {                     // Extracted paths for production
      outline: "M 0 0 L 100 0...",
      text: "M 10 10 C 20 20..."
    }
  }
}
```

### Benefits

1. **Backward compatible**: Existing templates work
2. **Dual purpose**: Data for editing, SVG for rendering
3. **Production ready**: Paths immediately available
4. **No conversion needed**: Thumbnail uses SVG directly

## Performance Considerations

### SVG Performance Strategy

#### Concerns

- DOM manipulation slower than canvas
- Many elements = slower rendering
- Text-to-path conversion cost

#### Mitigations

1. **Virtual scrolling**: Only render visible thumbnails
2. **Path caching**: Convert text once, reuse paths
3. **Batch updates**: Group DOM changes
4. **Web Workers**: Offload text conversion
5. **Canvas fallback**: For complex scenes

### Benchmarks to Monitor

- Thumbnail render time (target: <50ms)
- Scroll performance (target: 60fps)
- Memory usage (target: <100MB for 1000 signs)
- Text conversion (target: <100ms per sign)

## Browser Compatibility

### Minimum Requirements

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Polyfills Needed

- None for SVG (native support)
- None for OpenType.js (self-contained)

## Migration Strategy

### Principle: Incremental Migration

1. **No Big Bang**: Gradual transition
2. **Feature Flags**: Toggle between renderers
3. **Parallel Development**: Old and new side-by-side
4. **Validate First**: Prove concept before commitment
5. **User Transparent**: No workflow disruption

## Future Extensibility

### SVG Enables

1. **Animation**: SVG animations for presentations
2. **Interactivity**: Clickable sign elements
3. **Accessibility**: Screen reader support
4. **Web Standards**: Future browser features
5. **Export Options**: PDF, PNG at any resolution

## Decision Review Triggers

Review these decisions if:

1. Performance degrades below targets
2. New fabrication requirements emerge
3. Browser technology changes significantly
4. User workflow changes substantially
5. Better libraries become available

## References

- Research validated with industry tools (SignLab, FlexiSIGN)
- SVG is W3C standard for vector graphics
- All modern fabrication equipment accepts vector formats
- Text-to-path is required for all production workflows
