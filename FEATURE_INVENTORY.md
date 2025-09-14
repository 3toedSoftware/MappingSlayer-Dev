# Mapping Slayer - Complete Feature Inventory

This document provides a comprehensive catalog of all functionality in Mapping Slayer, organized by category and mapped to implementation files.

## USER-FACING FEATURES

### Header Controls

- **LOAD Button**: Load PDF or .slayer project files
    - Files: `mapping-app.js` (lines 727-901), `project-io.js`
    - Functions: `loadFile()`, `ProjectIO.load()`
    - Supports: PDF files, .slayer project files, .mslay legacy files
    - Features: File System Access API support for enhanced save functionality

- **SAVE Button**: Save project as .slayer file
    - Files: `project-io.js` (lines 14-90)
    - Functions: `ProjectIO.save()`
    - Saves: Complete project state + embedded PDF

- **SAVE AS Button**: Save with new filename
    - Files: `project-io.js`
    - Functions: `ProjectIO.saveAs()`

- **Autosave Checkbox**: Automatic saving every 5 minutes
    - Files: `index.html` (lines 62-65)
    - State: `appState.autosaveEnabled`

- **Project Name Display**: Shows current project name
    - Files: `index.html` (line 61)
    - Updates: Via app bridge communication

### Left Panel - Marker Types Section

- **Add Marker Type Button (+)**: Create new marker types
    - Files: `ui.js` (addMarkerTypeEventListener)
    - Modal: Custom marker type creation with color picker
    - Features: Color selection, name input, code generation

- **Import Marker Types Button (IMP)**: Import marker types from file
    - Files: `ui.js`
    - Functions: `importMarkerTypes()`
    - Formats: JSON marker type definitions

- **Export Marker Types Button (EXP)**: Export marker types to file
    - Files: `ui.js`
    - Functions: `exportMarkerTypes()`
    - Output: JSON file with all marker type definitions

- **Marker Type Checkboxes**: Filter dots by marker type
    - Files: `ui.js` (updateFilterCheckboxes)
    - Features: Individual type filtering, dot count display
    - State: `appState.markerTypes`, filter states

### Left Panel - List Section

- **Sort Toggle Button (BY LOC/BY NAME)**: Change sorting mode
    - Files: `ui.js`
    - Modes: Location number vs marker type name
    - State: `appState.sortMode`

- **View Toggle Button (GROUPED/UNGROUPED)**: Change list view
    - Files: `ui.js`
    - Views: Flat list vs grouped by marker type
    - State: `appState.listViewMode`

- **All Pages Checkbox**: Show dots from all pages
    - Files: `ui.js`
    - State: `appState.isAllPagesView`
    - Function: Toggles between current page vs all pages

- **Location List**: Interactive list of all dots
    - Files: `ui.js` (updateLocationList)
    - Features: Click to center on dot, edit dots, selection
    - Display: Location number, marker type, messages

- **Left Panel Collapse Button**: Hide/show left panel
    - Files: `mapping-app.js` (lines 677-684)
    - UI: Slide animation, arrow icon rotation

### Map Section - Top Controls

- **HELP Button**: Show keyboard shortcuts and controls
    - Files: `mapping-app.js` (lines 686-694)
    - Modal: Controls reference guide
    - Content: All keyboard shortcuts and mouse interactions

- **HIDE/SHOW LOC Button**: Toggle location number visibility
    - Files: `ui.js` (addViewToggleEventListeners)
    - State: `appState.locationsVisible`

- **SHOW/HIDE MSG1 Button**: Toggle message 1 visibility
    - Files: `ui.js`
    - State: `appState.messagesVisible`

- **SHOW/HIDE MSG2 Button**: Toggle message 2 visibility
    - Files: `ui.js`
    - State: `appState.messages2Visible`

- **INST ONLY Button**: Filter by installation status
    - Files: `ui.js`
    - Modes: Show all, installed only, uninstalled only
    - State: `appState.instFilterMode`

- **RENUMBER Button**: Renumber location dots
    - Files: `ui.js`
    - Modal: Renumber options (current page, all pages, by type)
    - Functions: Various renumbering algorithms

- **DOTCAM Button**: Toggle inspection mode
    - Files: `ui.js`
    - Feature: Enhanced visual mode for dot inspection

### Find & Replace Controls

- **FIND ALL Button**: Find text in all dot data
    - Files: `ui.js` (addButtonEventListeners)
    - Function: `performFindAll()`
    - Searches: Location numbers, messages, notes

- **Find Input**: Text search field
    - Files: `ui.js`
    - Features: Enter key support, search highlighting

- **Replace Input**: Replacement text field
    - Files: `ui.js`
    - Features: Enter key support

- **REPLACE Button**: Replace found text
    - Files: `ui.js`
    - Function: `performReplace()`
    - Features: Global replace across all matching dots

### Page Navigation

- **Crop Toggle Button**: Enable/disable crop mode
    - Files: `crop-tool.js` (lines 32-50)
    - Features: Visual crop overlay with resize handles
    - State: Per-page and global crop settings

- **Crop All Pages Checkbox**: Apply crop to all pages
    - Files: `crop-tool.js`
    - State: `cropTool.cropAllPages`

- **Previous Page Button (<)**: Navigate to previous page
    - Files: `ui.js` (addPageNavigationEventListeners)
    - Keyboard: Page Up key

- **Next Page Button (>)**: Navigate to next page
    - Files: `ui.js`
    - Keyboard: Page Down key

- **Page Label Input**: Set custom page labels
    - Files: `ui.js`
    - State: `appState.pageLabels`
    - Features: Enter key support, persistent labels

- **Page Info Display**: Current page / total pages
    - Files: `ui.js` (updatePageInfo)
    - Format: "PAGE X OF Y"

### Map Interaction Controls

- **PDF Upload Area**: Drag & drop or click to upload
    - Files: `mapping-app.js` (lines 725-901)
    - Supported: PDF files, .slayer projects
    - Features: Visual feedback, progress indication

- **Tolerance Controls**: Adjust text scraping sensitivity
    - Files: `mapping-app.js` (lines 1044-1075), `scrape.js`
    - H (Horizontal): Text clustering tolerance
    - V (Vertical): Line grouping tolerance
    - Range: 0.1 to 100, step 0.1

- **Dot Size Slider**: Adjust dot display size
    - Files: `mapping-app.js` (lines 904-976)
    - Range: 0.5 to 3.0, step 0.1
    - State: `appState.dotSize`
    - Real-time: Updates all dots immediately

### Legends

- **Project Legend**: Shows all marker types used in project
    - Files: `ui.js` (updateProjectLegend)
    - Features: Collapsible, color indicators, counts

- **Page Legend**: Shows marker types on current page
    - Files: `ui.js` (updateMapLegend)
    - Features: Collapsible, current page filtering

### Footer Controls - Automap Section

- **Marker Type Select**: Choose marker type for automap
    - Files: `ui.js` (updateMarkerTypeSelect)
    - Source: Available marker types

- **Automap Text Input**: Text to search for
    - Files: `ui.js`
    - Features: Recent searches dropdown, Enter key support

- **Exact Phrase Checkbox**: Exact vs fuzzy matching
    - Files: `ui.js`
    - State: `appState.automapExactPhrase`

- **AUTOMAP IT! Button**: Execute automatic mapping
    - Files: `automap.js`
    - Function: `performAutomap()`
    - Features: Progress modal, activity feed, cancellation

### Footer Controls - Export Section

- **CREATE PDF Button**: Export annotated PDF
    - Files: `export.js`
    - Options: Current page with details, current only, all maps
    - Features: Interactive navigation, detail pages

- **CREATE MESSAGE SCHEDULE Button**: Export CSV schedule
    - Files: `export.js`
    - Function: `createMessageSchedule()`
    - Output: CSV with location data

- **UPDATE FROM MESSAGE SCHEDULE Button**: Import CSV updates
    - Files: `export.js`
    - Function: `updateFromSchedule()`
    - Input: CSV with location updates

- **EXPORT REVU MARKUPS Button**: Export for Bluebeam Revu
    - Files: `export.js`
    - Function: `exportRevuMarkups()`
    - Format: FDF annotation file
    - Features: Character sanitization warnings

- **EXPORT HTML Button**: Export as HTML report
    - Files: `export.js`
    - Function: `exportHTML()`
    - Output: Complete HTML report with navigation

## MOUSE INTERACTIONS

### Primary Actions

- **Left Click on Map**: Add new dot at cursor location
    - Files: `ui.js` (setupCanvasEventListeners)
    - Creates: New dot with current active marker type
    - State: Uses `appState.activeMarkerType`

- **Right Click on Dot**: Open edit modal for specific dot
    - Files: `ui.js`
    - Modal: Edit location modal with all dot properties

- **Middle Click + Drag**: Pan the map view
    - Files: `ui.js` (setupCanvasEventListeners)
    - State: Updates `appState.mapTransform`

### Selection & Multi-edit

- **Shift + Left Drag**: Select multiple dots
    - Files: `ui.js`
    - Features: Selection box visualization, multi-dot editing
    - State: `appState.selectedDots`

- **Shift + Right Drag**: Scrape live PDF text
    - Files: `scrape.js`
    - Features: Text extraction, automatic dot creation

- **Ctrl + Shift + Right Drag**: OCR text scraping
    - Files: `scrape.js`
    - Features: OCR processing with Tesseract.js

### Advanced Interactions

- **Ctrl + Drag from Dot**: Create annotation line
    - Files: `ui.js`
    - Features: Visual line creation, endpoint editing

- **Drag Dot**: Move dot to new position
    - Files: `ui.js`
    - Features: Visual feedback, undo support

- **Scroll Wheel**: Zoom in/out
    - Files: `ui.js`
    - State: Updates `appState.mapTransform.scale`

## KEYBOARD SHORTCUTS

### Navigation

- **Page Up/Page Down**: Change PDF pages
    - Files: `ui.js` (keyboard event listeners)
    - Functions: Navigate between PDF pages

- **Escape**: Clear current selection
    - Files: `ui.js`
    - Action: Clears `appState.selectedDots`

### Editing

- **Delete**: Remove selected dots
    - Files: `ui.js`
    - Function: Uses undo system for deletion

- **Ctrl/Cmd + C**: Copy selected dot
    - Files: `ui.js`
    - State: Stores in `appState.copiedDot`

- **Ctrl/Cmd + V**: Paste dot at cursor
    - Files: `ui.js`
    - Action: Creates new dot from copied data

- **Ctrl/Cmd + Z**: Undo last action
    - Files: `command-undo.js`
    - System: Professional command pattern undo system

- **Ctrl/Cmd + Y**: Redo last undone action
    - Files: `command-undo.js`
    - System: Redo support with command history

### Input Fields

- **Enter**: Confirm input in various fields
    - Files: Multiple UI input handlers
    - Fields: Find, replace, page label, tolerance inputs

## CORE FUNCTIONALITY

### PDF Operations

- **PDF Loading**: Load and display PDF files
    - Files: `project-io.js`, `map-controller.js`
    - Support: Multi-page PDFs, various PDF versions
    - Features: Page caching, memory optimization

- **PDF Rendering**: Display PDF pages with zoom/pan
    - Files: `map-controller.js` (renderPDFPage)
    - Features: High-quality rendering, viewport virtualization
    - Performance: Cached rendering, efficient updates

- **PDF Navigation**: Multi-page document handling
    - Files: `ui.js`, `state.js`
    - Features: Page labels, current page tracking

- **PDF Replacement**: Replace PDF while keeping dots
    - Files: `mapping-app.js` (replacePDF)
    - Safety: Dimension warnings, crop reset

### Marker/Dot Operations

- **Dot Creation**: Add location markers to PDF
    - Files: `ui.js` (addDotToData), `command-undo.js`
    - Features: Auto-numbering, collision detection
    - Data: Position, type, messages, flags, notes

- **Dot Editing**: Modify dot properties
    - Files: `ui.js` (edit modal system)
    - Properties: Location number, marker type, messages, notes, flags
    - Validation: Collision detection, data integrity

- **Dot Deletion**: Remove dots with undo support
    - Files: `command-undo.js` (DeleteDotCommand)
    - Safety: Confirmation dialogs, undo capability

- **Dot Movement**: Drag & drop repositioning
    - Files: `ui.js` (drag handlers), `command-undo.js`
    - Features: Visual feedback, snap-to-grid, undo support

- **Batch Operations**: Multi-dot editing
    - Files: `ui.js` (group edit modal)
    - Features: Select multiple dots, edit properties in bulk

### Drawing Tools

- **Annotation Lines**: Connect dots with lines
    - Files: `ui.js` (annotation system), `command-undo.js`
    - Features: Endpoint dragging, visual endpoints toggle
    - State: `appState.annotationLines`

- **Crop Tool**: Mask/crop areas of PDF
    - Files: `crop-tool.js`
    - Features: Resize handles, per-page or global crops
    - Storage: Normalized coordinates for zoom independence

### Measurement Tools

- **Text Scraping**: Extract text from PDF regions
    - Files: `scrape.js`
    - Methods: Live text extraction, OCR with Tesseract.js
    - Features: Tolerance controls, automatic clustering

- **Position Tracking**: Precise dot coordinates
    - Files: `state.js`, `map-controller.js`
    - Precision: Sub-pixel positioning with zoom scaling

### Selection Tools

- **Individual Selection**: Single dot selection via right-click
    - Files: `ui.js`
    - Features: Visual highlight, edit modal access

- **Multi-Selection**: Select multiple dots with drag box
    - Files: `ui.js` (selection box system)
    - Features: Visual selection box, batch operations

- **Find/Select**: Text-based selection
    - Files: `ui.js` (find system)
    - Features: Search highlighting, navigation between results

## FILE OPERATIONS

### Save/Load Project Files

- **Native .slayer Format**: JSON + embedded PDF
    - Files: `project-io.js`
    - Structure: Header + JSON metadata + PDF binary
    - Benefits: Single file portability, complete state preservation

- **Legacy .mslay Support**: Backward compatibility
    - Files: `project-io.js`
    - Support: Import legacy format files

- **File System Access API**: Enhanced file operations
    - Files: `mapping-app.js`
    - Features: Direct file handle access, "Save" vs "Save As"
    - Browsers: Chrome/Edge with progressive fallback

### Import/Export Formats

- **CSV Import/Export**: Message schedule integration
    - Files: `export.js`
    - Features: Bidirectional CSV operations, update workflows

- **PDF Export**: Annotated PDF creation
    - Files: `export.js`
    - Options: Current page, all pages, with/without details
    - Library: jsPDF with custom annotation rendering

- **FDF Export**: Bluebeam Revu markup export
    - Files: `export.js`
    - Features: Character sanitization, compatibility warnings
    - Format: Adobe Forms Data Format

- **HTML Export**: Web-ready reports
    - Files: `export.js`
    - Features: Interactive navigation, complete project overview

- **Marker Type Import/Export**: Reusable type definitions
    - Files: `ui.js`
    - Format: JSON marker type configurations

### Auto-save Functionality

- **Periodic Auto-save**: Automatic project saving
    - Files: Save manager integration
    - Interval: 5-minute intervals (configurable)
    - State: User-controllable via checkbox

- **Dirty State Tracking**: Change detection
    - Files: `state.js` (setDirtyState)
    - Integration: App bridge communication for save prompts

## VISUAL FEATURES

### Zoom and Pan

- **Zoom Controls**: Scroll wheel zooming
    - Files: `ui.js`, `map-controller.js`
    - Range: Configurable zoom limits
    - State: `appState.mapTransform.scale`

- **Pan Controls**: Middle-click drag panning
    - Files: `ui.js`
    - Features: Smooth panning, boundary constraints
    - State: `appState.mapTransform.x/y`

- **Zoom to Fit**: Automatic optimal view
    - Files: `ui.js` (zoomToFitDots)
    - Trigger: After loading projects, centering on dots
    - Algorithm: Calculate bounds for all visible dots

### Grid Display

- **Visual Grid**: Optional grid overlay
    - Implementation: CSS-based grid system
    - Features: Configurable spacing, snap-to-grid

### Rulers

- **Measurement Rulers**: Position reference
    - Implementation: Canvas-based ruler system
    - Units: PDF coordinate system

### Layers

- **PDF Layer**: Base PDF rendering
    - Files: `map-controller.js`
    - Features: High-resolution rendering, caching

- **Dot Layer**: Location markers
    - Files: `map-controller.js` (renderDotsForCurrentPage)
    - Features: Viewport virtualization, efficient updates

- **Annotation Layer**: Lines and annotations
    - Files: `ui.js` (renderAnnotationLines)
    - Features: Dynamic line rendering, endpoint controls

- **UI Layer**: Controls and overlays
    - Files: CSS styling system
    - Features: Modal dialogs, selection boxes, crop overlays

### Visual Settings

- **Dot Size Control**: Adjustable marker size
    - Files: `mapping-app.js` (dot size slider)
    - Range: 0.5x to 3.0x scaling

- **Color Themes**: Marker type colors
    - Files: `flag-config.js`, `ui.js`
    - Features: Custom color picker, visual consistency

- **Visibility Toggles**: Show/hide various elements
    - Files: `ui.js` (view toggle system)
    - Options: Locations, messages, installation status

## DATA MANAGEMENT

### State Management

- **Application State**: Central state object
    - Files: `state.js` (appState)
    - Structure: Dots by page, marker types, UI state, transform data

- **Page-based Storage**: Efficient multi-page handling
    - Structure: `dotsByPage` Map for page organization
    - Benefits: Memory efficiency, fast page switching

- **Transform State**: View position and zoom
    - Data: `mapTransform` with x, y, scale
    - Persistence: Maintained across page changes

### Data Stored

- **Dot Data**: Complete location information
    - Properties: Position, marker type, location number, messages, notes, flags, installation status
    - Storage: Per-page organization with unique internal IDs

- **Marker Types**: Type definitions and styling
    - Properties: Code, name, color, text color, design reference
    - Scope: Project-wide availability

- **Flag Configuration**: Visual indicators
    - Structure: Global flag configuration for all marker types
    - Properties: Position, symbol, name, custom icons

- **Project Metadata**: Project-level information
    - Data: Source PDF name, creation date, version info
    - Usage: Display, compatibility checking

- **Page Labels**: Custom page naming
    - Storage: `pageLabels` Map
    - Features: User-defined page names, navigation enhancement

- **Annotation Lines**: Visual connectors
    - Structure: Per-page line storage
    - Properties: Start/end points, visual styling

### Undo/Redo System

- **Command Pattern**: Professional undo implementation
    - Files: `command-undo.js`
    - Classes: Command, CompositeCommand, specific operation commands

- **Operation Types**: Comprehensive action coverage
    - Commands: Add/Delete/Edit/Move dots, annotation operations
    - Features: Atomic operations, batch operations, unlimited undo

- **State Preservation**: Accurate state restoration
    - Mechanism: Before/after state capture
    - Coverage: All user-modifiable data

## AUTOMATION/AI FEATURES

### Sidekick AI Interface

- **AI State Access**: JSON-based state interface
    - Files: `ai-interface.js`
    - Function: `window.sidekick.getStateJSON()`
    - Purpose: Allow AI agents to read current application state

- **AI State Modification**: Apply AI-generated changes
    - Function: `window.sidekick.applyStateJSON()`
    - Safety: Validation and error handling
    - Features: Preview mode, operation history

- **AI Query System**: Structured data queries
    - Functions: Location queries, state queries, coordinate access
    - Integration: App bridge communication system

### Auto-mapping

- **Text Search Automation**: Find and mark text automatically
    - Files: `automap.js`
    - Features: Exact and fuzzy matching, progress tracking
    - Modal: Progress display with cancellation option

- **Batch Processing**: Multiple location creation
    - Algorithm: Text clustering, position optimization
    - Safety: Collision detection, undo support

### OCR/Text Detection

- **Tesseract.js Integration**: Optical Character Recognition
    - Files: `scrape.js`
    - Trigger: Ctrl+Shift+Right drag
    - Features: Multiple language support, progress indication

- **Live Text Extraction**: PDF text layer access
    - Method: Direct PDF text access via PDF.js
    - Trigger: Shift+Right drag
    - Features: Precise text positioning, tolerance controls

### Batch Operations

- **Multi-dot Operations**: Bulk editing capabilities
    - Features: Select multiple dots, edit properties together
    - Safety: Undo support, validation

- **Renumbering**: Automatic location numbering
    - Options: Current page, all pages, by marker type
    - Algorithms: Spatial sorting, type-based grouping

## SETTINGS & CONFIGURATION

### User Preferences

- **View Settings**: Customizable display options
    - Settings: Dot visibility, message display, installation filtering
    - Persistence: Session-based storage

- **Tolerance Settings**: Text scraping sensitivity
    - Controls: Horizontal and vertical tolerance
    - Range: 0.1 to 100 units
    - Persistence: Per-project settings

### Customizable Options

- **Marker Types**: User-defined location types
    - Properties: Code, name, colors, design references
    - Features: Import/export, color picker integration

- **Flag System**: Visual indicator customization
    - Options: Symbol selection, custom icon upload
    - Positions: Four corners per dot
    - Icons: Built-in symbols + custom uploads

- **Page Labels**: Custom page naming
    - Input: Text-based labeling system
    - Usage: Navigation, export, organization

### Flag Types and Configurations

- **Global Flag Configuration**: Unified flag system
    - Structure: Single configuration for all marker types
    - Migration: Automatic migration from legacy per-type flags

- **Symbol Library**: Extensive built-in symbol set
    - Files: `flag-config.js` (FLAG_SYMBOLS)
    - Types: Emojis, arrows, status indicators, geometric shapes
    - Count: 25+ built-in symbols

- **Custom Icon Support**: User-uploaded icons
    - Files: `flag-ui.js` (handleCustomIconUpload)
    - Formats: PNG, JPG, SVG, GIF, WebP
    - Storage: Base64 encoding in project file
    - Management: Icon library with reuse capabilities

## IMPLEMENTATION MAPPING

### Core Architecture Files

- **`mapping-app.js`**: Main application class, lifecycle management
- **`state.js`**: Central state management, data structures
- **`ui.js`**: User interface logic, event handling (largest file ~3000+ lines)
- **`map-controller.js`**: PDF rendering, dot visualization, viewport management

### Feature Module Files

- **`automap.js`**: Automatic text finding and dot creation
- **`export.js`**: All export functions (PDF, CSV, FDF, HTML)
- **`scrape.js`**: Text extraction (live text + OCR)
- **`crop-tool.js`**: PDF cropping/masking functionality
- **`flag-config.js`**: Flag system configuration and symbols
- **`flag-ui.js`**: Flag customization interface
- **`command-undo.js`**: Professional undo/redo system
- **`project-io.js`**: File loading and saving operations
- **`ai-interface.js`**: Sidekick AI integration

### Utility and Support Files

- **`tooltips.js`**: Interactive help system
- **`mapping-sync.js`**: Multi-app synchronization
- **`sign-template-system.js`**: Template integration
- **`undo-manager.js`**: Legacy undo system
- **`flag-icons-base64.js`**: Icon encoding and caching

## ACTIVE vs POTENTIALLY DEAD CODE

### Actively Used Features

- **All UI event handlers** in `ui.js`: Core interaction system
- **PDF rendering system** in `map-controller.js`: Essential functionality
- **State management** in `state.js`: Central to all operations
- **Command undo system** in `command-undo.js`: Modern undo implementation
- **Export functions** in `export.js`: All export options actively used
- **Automap system** in `automap.js`: AI automation features
- **File I/O system** in `project-io.js`: Essential for project persistence
- **Flag system** in `flag-config.js`, `flag-ui.js`: Visual indicator system

### Legacy/Questionable Code

- **`undo-manager.js`**: Replaced by command undo system (marked disabled)
- **Some export format options**: May have limited usage
- **Certain UI toggles**: Some visibility options may be rarely used
- **Legacy modal handlers**: Some older modal code may be superseded

### Potential Optimization Areas

- **`ui.js` file size**: At 3000+ lines, this file could benefit from modularization
- **Event listener organization**: Some handlers could be consolidated
- **Cache management**: Some caching systems could be unified
- **State synchronization**: Some sync code may be redundant

## COMPLEXITY METRICS

### File Size Analysis

- **`ui.js`**: ~3000+ lines (largest file, primary candidate for refactoring)
- **`mapping-app.js`**: ~2100+ lines (main application logic)
- **`export.js`**: ~1500+ lines (comprehensive export system)
- **`map-controller.js`**: ~1000+ lines (rendering system)
- **Other files**: Generally 200-800 lines each

### Functionality Density

- **High-density**: `ui.js` (all UI interactions), `export.js` (all export formats)
- **Focused modules**: `crop-tool.js`, `automap.js`, `scrape.js` (single-purpose)
- **Integration modules**: `ai-interface.js`, `mapping-sync.js` (external interfaces)

This inventory reveals a feature-rich application with comprehensive PDF annotation capabilities, extensive automation features, and professional-grade undo/export systems. The main optimization opportunity lies in refactoring the monolithic `ui.js` file into smaller, focused modules.
