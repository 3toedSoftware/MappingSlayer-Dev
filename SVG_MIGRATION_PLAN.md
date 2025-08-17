# SVG Migration Plan - Slayer Suite

## Overview

This document outlines the migration from Canvas-based rendering to SVG-based rendering across the Slayer Suite, specifically for Design Slayer and Thumbnail Slayer applications.

## Goals

1. **Eliminate blur/pixelation** in thumbnail rendering
2. **Create production-ready vector paths** for fabrication
3. **Ensure perfect template-to-thumbnail fidelity**
4. **Enable direct export to CNC/laser/vinyl cutting formats**

## Migration Strategy

### Phase 1: Thumbnail Slayer SVG Implementation (Week 1-2)

**Status**: Not Started  
**Priority**: HIGH  
**Risk**: LOW

#### Week 1: Core SVG Rendering

- [ ] Add SVG.js library to Thumbnail Slayer
- [ ] Create SVG rendering function alongside existing canvas
- [ ] Implement basic shape rendering (rectangles, circles)
- [ ] Add toggle switch between Canvas and SVG rendering
- [ ] Compare visual quality and performance

#### Week 2: Text and Production Features

- [ ] Integrate OpenType.js for text-to-path conversion
- [ ] Implement accurate text positioning and sizing
- [ ] Handle all sign types and templates
- [ ] Optimize performance for batch rendering
- [ ] Validate crispness at different zoom levels

### Phase 2: Validation & Refinement (Week 3)

**Status**: Not Started  
**Priority**: HIGH  
**Risk**: LOW

- [ ] Test with all existing templates
- [ ] Verify text-to-path accuracy
- [ ] Performance testing with 100+ thumbnails
- [ ] Create fallback mechanism to canvas if needed
- [ ] Document any limitations or issues

### Phase 3: Design Slayer SVG Refactor (Week 4-5)

**Status**: Not Started  
**Priority**: MEDIUM  
**Risk**: MEDIUM

#### Week 4: Core Refactor

- [ ] Replace canvas with SVG.js drawing surface
- [ ] Convert all drawing tools to SVG.js API
- [ ] Implement layer system using SVG groups
- [ ] Maintain backward compatibility with existing templates

#### Week 5: 3D Integration

- [ ] Implement Three.js SVGLoader
- [ ] Create path extrusion for 3D preview
- [ ] Ensure 2D SVG matches 3D extrusion
- [ ] Test complete design-to-3D workflow

### Phase 4: Production Integration (Week 6)

**Status**: Not Started  
**Priority**: LOW  
**Risk**: LOW

- [ ] Create DXF export from SVG paths
- [ ] Implement AI/EPS export options
- [ ] Add cutting path optimization
- [ ] Create Production Slayer integration hooks

## Technical Stack

### Libraries to Add

- **SVG.js** (v3.2.0) - SVG manipulation and creation
- **OpenType.js** (v1.3.4) - Font parsing and text-to-path conversion
- **Three.js SVGLoader** - Already included, for 3D extrusion

### Libraries to Keep

- **Three.js** - 3D preview rendering
- **Canvas** - Fallback option, complex effects

## Success Criteria

### Thumbnail Slayer

- [ ] Thumbnails are crisp at all zoom levels
- [ ] No pixelation or blur
- [ ] Text converts accurately to paths
- [ ] Performance equal or better than canvas
- [ ] Can export clean SVG files

### Design Slayer

- [ ] All design tools work in SVG
- [ ] Templates save as SVG data
- [ ] 3D preview accurately represents 2D design
- [ ] Existing templates remain compatible
- [ ] User experience unchanged or improved

## Risk Mitigation

### Identified Risks

1. **Performance degradation** with many elements
    - Mitigation: Keep canvas as fallback, optimize SVG rendering
2. **Font rendering differences**
    - Mitigation: Use OpenType.js for consistent text-to-path
3. **Browser compatibility issues**
    - Mitigation: Test across browsers, use polyfills if needed
4. **Template compatibility**
    - Mitigation: Create migration function for old templates

## Rollback Plan

- Keep all canvas code during migration
- Add feature flags to toggle between renderers
- Maintain backward compatibility throughout
- Can revert to canvas at any point before final cleanup

## Communication with Future Developers

When continuing this work:

1. Start with Thumbnail Slayer if not complete
2. Test thoroughly before moving to Design Slayer
3. Keep canvas code until SVG is fully validated
4. Document any issues or limitations discovered
5. Update this plan with actual timelines and results

## Decision Log

- **2024-01-11**: Decided to use SVG over Canvas for crisp rendering
- **2024-01-11**: Chose SVG.js over raw SVG manipulation for better API
- **2024-01-11**: Selected OpenType.js for text-to-path conversion
- **2024-01-11**: Decided on Thumbnail-first migration approach

## Resources

- [SVG.js Documentation](https://svgjs.dev/docs/3.0/)
- [OpenType.js Documentation](https://opentype.js.org/)
- [Three.js SVGLoader](https://threejs.org/docs/#examples/en/loaders/SVGLoader)
- Industry validation: SignLab, FlexiSIGN, VinylMaster all use vector formats
