// apps/mapping_slayer/mapping-app.js
import SlayerAppBase from '../core/slayer-app-base.js';
import { ProjectIO } from './project-io.js';
import {
    renderPDFPage,
    applyMapTransform,
    renderDotsForCurrentPage,
    updateSingleDot,
    setupMapInteraction,
    clearPDFCache
} from './map-controller.js';
import {
    setupCanvasEventListeners,
    addMarkerTypeEventListener,
    addPageNavigationEventListeners,
    addViewToggleEventListeners,
    addButtonEventListeners,
    setupModalEventListeners,
    updateAllSectionsForCurrentPage,
    zoomToFitDots,
    updateFilterCheckboxes,
    updateLocationList,
    updateMarkerTypeSelect,
    updatePageInfo,
    renderAnnotationLines,
    updateEditModalOptions,
    resetKeyboardShortcutsFlag
} from './ui.js';
import { getCurrentPageDots, setDirtyState } from './state.js';
import { thumbnailGenerator } from './thumbnail-generator.js';

class MappingSlayerApp extends SlayerAppBase {
    constructor() {
        super('mapping_slayer', 'MAPPING SLAYER', '5.0.0');
        this.stateModule = null;
        this.appState = null;
        this.cssLoaded = false;
    }

    async activate() {
        // CSS is now loaded in the main HTML file
        // No need to dynamically load it anymore
        this.cssLoaded = true;

        // Call parent activate
        await super.activate();

        // Add modals to body when activating (they get removed on deactivate)
        this.addModalsToBody();

        // Reattach event listeners to the newly created modals
        setupModalEventListeners();

        // Update the location list to reflect current dot state
        updateLocationList();
    }

    async deactivate() {
        // Remove CSS when deactivating
        if (this.cssLoaded && this.isSuiteMode) {
            const link = document.getElementById('mapping-slayer-css');
            if (link) {
                link.remove();
                this.cssLoaded = false;
            }
        }

        // Clean up modals when deactivating
        const modalIds = [
            'mapping-slayer-edit-modal',
            'mapping-slayer-group-edit-modal',
            'mapping-slayer-renumber-modal',
            'mapping-slayer-automap-progress-modal',
            'mapping-slayer-pdf-export-modal',
            'mapping-slayer-character-warning-modal',
            'mapping-slayer-controls-modal'
        ];

        modalIds.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.remove();
            }
        });

        // Reset keyboard shortcuts flag to prevent duplicate listeners
        resetKeyboardShortcutsFlag();

        // Call parent deactivate
        await super.deactivate();
    }

    createAppContent() {
        const contentArea = this.getContentArea();

        contentArea.innerHTML = `
            <div class="ms-app-container">
                <!-- Left Panel -->
                <div class="ms-left-panel">
                    <div class="ms-panel-section ms-filter-section">
                        <div class="ms-panel-header">
                            <span>MARKER TYPES</span>
                            <div class="ms-header-buttons">
                                <button class="ms-btn ms-btn-small ms-btn-primary" id="add-marker-type-btn">+</button>
                                <button class="ms-btn ms-btn-small ms-btn-secondary" id="import-marker-types-btn" title="Import Marker Types">IMP</button>
                                <button class="ms-btn ms-btn-small ms-btn-secondary" id="export-marker-types-btn" title="Export Marker Types">EXP</button>
                            </div>
                        </div>
                        <div class="ms-panel-content">
                            <div class="ms-marker-type-container" id="filter-checkboxes"></div>
                        </div>
                    </div>

                    <div class="ms-panel-section ms-list-section">
                        <div class="ms-panel-header">
                            <span>LIST</span>
                            <div id="list-header-controls">
                                <button class="ms-btn ms-btn-secondary ms-btn-compact" id="sort-toggle-btn">BY LOC</button>
                                <button class="ms-btn ms-btn-secondary ms-btn-compact" id="toggle-view-btn">UNGROUPED</button>
                                <div class="ms-all-pages-container">
                                    <input type="checkbox" id="all-pages-checkbox">
                                    <label for="all-pages-checkbox">All Pages</label>
                                </div>
                            </div>
                        </div>
                        <div class="ms-panel-content" id="list-content">
                            <div class="ms-empty-state" id="empty-state">
                                Click on the map to add your first location dot.
                            </div>
                            <div id="list-with-renumber" style="display: none; height: 100%;">
                                <div id="location-list"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Collapse Button attached to right edge of left panel -->
                    <button class="ms-panel-collapse-btn" id="left-panel-collapse-btn" title="Toggle left panel">
                        <span class="collapse-arrow">◀</span>
                    </button>
                </div>

                <!-- Map Section -->
                <div class="ms-map-section">
                    <div class="ms-map-overlay-controls-top-left">
                        <div class="ms-find-replace-container">
                            <div class="ms-find-replace-inputs">
                                <button class="ms-btn ms-find-all-btn" id="find-all-btn">FIND ALL</button>
                                <input type="text" class="ms-find-input" placeholder="FIND" id="find-input">
                                <input type="text" class="ms-replace-input" placeholder="REPLACE" id="replace-input">
                                <button class="ms-btn ms-replace-btn" id="replace-btn">REPLACE</button>
                            </div>
                            <div class="ms-replace-status" id="replace-status"></div>
                        </div>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="help-btn">HELP</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="toggle-locations-btn">HIDE LOC</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="toggle-messages-btn">HIDE MSG1</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="toggle-messages2-btn">SHOW MSG2</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="toggle-inst-display-btn">INST ONLY</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="renumber-btn">RENUMBER</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact ms-btn-uniform-width" id="dotcam-btn">DOTCAM</button>
                    </div>
                    
                    <div class="ms-legends-container">
                        <div class="ms-legend-box" id="project-legend">
                            <div class="ms-map-legend-header">
                                <span>PROJECT LEGEND</span>
                                <span class="ms-legend-collapse-arrow">▼</span>
                            </div>
                            <div class="ms-map-legend-content" id="project-legend-content"></div>
                        </div>
                        <div class="ms-legend-box" id="map-legend">
                            <div class="ms-map-legend-header">
                                <span>PAGE LEGEND</span>
                                <span class="ms-legend-collapse-arrow">▼</span>
                            </div>
                            <div class="ms-map-legend-content" id="map-legend-content"></div>
                        </div>
                    </div>

                    <div class="ms-map-overlay-controls">
                        <div class="ms-page-nav">
                            <button class="ms-crop-btn" id="crop-toggle-btn" title="Toggle Crop Mode">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <!-- Top left corner -->
                                    <path d="M4 4 L4 8 M4 4 L8 4" />
                                    <!-- Top right corner -->
                                    <path d="M20 4 L16 4 M20 4 L20 8" />
                                    <!-- Bottom left corner -->
                                    <path d="M4 20 L4 16 M4 20 L8 20" />
                                    <!-- Bottom right corner -->
                                    <path d="M20 20 L20 16 M20 20 L16 20" />
                                </svg>
                            </button>
                            <div class="ms-crop-all-pages-container" id="crop-all-pages-container" style="display: none;">
                                <input type="checkbox" id="crop-all-pages-checkbox">
                                <label for="crop-all-pages-checkbox">All Pages</label>
                            </div>
                            <button class="ms-nav-btn" id="prev-page">&lt;</button>
                            <input type="text" id="page-label-input" placeholder="Enter Page Label" class="ms-page-label-input">
                            <span id="page-info">PAGE 1 OF 1</span>
                            <button class="ms-nav-btn" id="next-page">&gt;</button>
                        </div>
                    </div>
                    
                    <div class="ms-map-container" id="map-container">
                         <div class="ms-upload-area" id="upload-area">
                            <div>📄 Upload PDF or .slayer file</div>
                            <div style="margin-top: 10px; font-size: 14px;">Click to browse or drag and drop</div>
                            <div class="ms-upload-area-note">Use live text PDFs for enhanced functionality.</div>
                            <input type="file" id="file-input" accept=".pdf,.slayer" style="display: none;">
                        </div>

                        <div id="scrape-controls" class="ms-scrape-controls">
                            <div class="ms-tolerance-controls">
                                <div class="ms-tolerance-input-group">
                                    <label for="h-tolerance-input">H:</label>
                                    <input type="number" id="h-tolerance-input" class="ms-tolerance-input" min="0.1" max="100" step="0.1" value="10.0">
                                </div>
                                <div class="ms-tolerance-input-group">
                                    <label for="v-tolerance-input">V:</label>
                                    <input type="number" id="v-tolerance-input" class="ms-tolerance-input" min="0.1" max="100" step="0.1" value="25.0">
                                </div>
                                <div class="ms-tolerance-input-group">
                                    <label for="dot-size-slider">DOT SIZE:</label>
                                    <input type="range" class="ms-size-slider" id="dot-size-slider" min="0.5" max="3" step="0.1" value="1">
                                </div>
                            </div>
                        </div>
                        
                        <div id="map-content">
                            <canvas id="pdf-canvas"></canvas>
                            <div id="crop-overlay" class="ms-crop-overlay" style="display: none;">
                                <div class="ms-crop-handle ms-crop-handle-nw" data-handle="nw"></div>
                                <div class="ms-crop-handle ms-crop-handle-n" data-handle="n"></div>
                                <div class="ms-crop-handle ms-crop-handle-ne" data-handle="ne"></div>
                                <div class="ms-crop-handle ms-crop-handle-w" data-handle="w"></div>
                                <div class="ms-crop-handle ms-crop-handle-e" data-handle="e"></div>
                                <div class="ms-crop-handle ms-crop-handle-sw" data-handle="sw"></div>
                                <div class="ms-crop-handle ms-crop-handle-s" data-handle="s"></div>
                                <div class="ms-crop-handle ms-crop-handle-se" data-handle="se"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- CSV Status -->
                <div id="csv-status" class="ms-csv-status">
                    <div id="csv-status-content"></div>
                </div>

                <!-- Footer Controls -->
                <div class="ms-footer-controls">
                    <div class="ms-automap-container" id="single-automap-container">
                        <input type="text" class="ms-form-input ms-automap-input" id="automap-text-input" placeholder="Enter text to find..." list="recent-searches-datalist" disabled="">
                        <datalist id="recent-searches-datalist"></datalist>
                        <div class="ms-automap-checkbox-group">
                            <input type="checkbox" id="automap-exact-phrase" checked="">
                            <label for="automap-exact-phrase">Exact</label>
                        </div>
                        <button class="ms-btn ms-btn-success" id="single-automap-btn" disabled="">AUTOMAP IT!</button>
                        <span class="ms-automap-status" id="automap-status"></span>
                    </div>
                    
                    <div class="ms-control-group">
                        <button class="ms-btn ms-btn-primary ms-btn-compact" id="create-thumbnails-btn" disabled="">CREATE THUMBNAILS</button>
                        <button class="ms-btn ms-btn-primary ms-btn-compact" id="create-pdf-btn" disabled="">CREATE PDF</button>
                        <button class="ms-btn ms-btn-primary ms-btn-compact" id="create-schedule-btn" disabled="">CREATE MESSAGE SCHEDULE</button>
                        <button class="ms-btn ms-btn-primary ms-btn-compact" id="update-from-schedule-btn" disabled="">UPDATE FROM MESSAGE SCHEDULE</button>
                        <button class="ms-btn ms-btn-primary ms-btn-compact" id="export-html-btn" disabled="">EXPORT HTML</button>
                    </div>
                </div>
            </div>
        `;

        // Add modals to body level (not inside app container)
        this.addModalsToBody();

        // Initialize mapping functionality after DOM is ready
        setTimeout(() => this.initializeMappingFunctionality(), 0);
    }

    addModalsToBody() {
        // Check if modals already exist to avoid duplicates
        if (document.getElementById('mapping-slayer-edit-modal')) return;

        const modalsHTML = `
            <!-- Sign Preview Modal (shows to the left of Edit Location modal) -->
            <div class="ms-sign-preview-modal" id="mapping-slayer-sign-preview-modal">
                <div class="ms-sign-preview-content">
                    <div class="ms-sign-preview-header">
                        <span class="ms-sign-preview-title">Sign Preview</span>
                    </div>
                    <div class="ms-sign-preview-body">
                        <div class="ms-sign-preview-display" id="sign-preview-display">
                            <span class="ms-sign-preview-placeholder">No template assigned</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Edit Modal -->
            <div class="ms-modal" id="mapping-slayer-edit-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header-grid">
                        <div class="ms-modal-header-main">
                            <h3 class="ms-modal-title">Edit Location</h3>
                            <div class="ms-form-group-inline" style="margin-top: 10px;">
                                <label for="edit-installed">Installed</label>
                                <input type="checkbox" id="edit-installed" title="Mark as installed">
                            </div>
                            <!-- Toggle buttons will be added here dynamically -->
                        </div>
                        <div class="ms-modal-header-flags" id="edit-modal-flags">
                            <!-- Flag selectors will be dynamically inserted here -->
                        </div>
                    </div>
                    <div class="ms-modal-body">
                        <div class="ms-form-group">
                            <label class="ms-form-label">Marker Type</label>
                            <select class="ms-form-input" id="edit-marker-type" title="Select marker type"></select>
                        </div>
                        <div class="ms-form-group" id="edit-location-group">
                            <label class="ms-form-label">Location Number</label>
                            <input type="text" class="ms-form-input" id="edit-location-number" placeholder="Enter location number" title="Enter location number">
                        </div>
                        <!-- Dynamic text fields will be inserted here -->
                        <div id="edit-dynamic-fields" class="ms-dynamic-fields-container"></div>
                        <div class="ms-form-group">
                            <label class="ms-form-label">Notes</label>
                            <textarea class="ms-form-input ms-form-textarea" id="edit-notes" placeholder="Enter notes..." title="Enter additional notes"></textarea>
                        </div>
                    </div>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-danger" id="delete-dot-btn" title="Delete this location">DELETE</button>
                        <button class="ms-btn ms-btn-secondary" id="cancel-modal-btn" title="Cancel changes and close">CANCEL</button>
                        <button class="ms-btn ms-btn-primary" id="update-dot-btn" title="Save changes">UPDATE</button>
                    </div>
                </div>
            </div>

            <!-- Gallery Modal (shows alongside Edit Location modal) -->
            <div class="ms-gallery-modal" id="mapping-slayer-gallery-modal">
                <div class="ms-gallery-content">
                    <div class="ms-gallery-header">
                        <span class="ms-gallery-title">Gallery</span>
                        <div class="ms-gallery-controls">
                            <button class="ms-gallery-btn ms-gallery-label-toggle-btn" id="gallery-label-toggle-btn" title="Toggle location number labels">#</button>
                            <button class="ms-gallery-btn ms-gallery-add-btn" id="gallery-add-btn" title="Add photo to gallery">+</button>
                            <button class="ms-gallery-btn ms-gallery-close-btn" id="gallery-close-btn" title="Delete selected photo">−</button>
                        </div>
                    </div>
                    <div class="ms-gallery-body">
                        <div class="ms-gallery-main-view">
                            <div class="ms-gallery-main-image" id="gallery-main-image">
                                <span class="ms-gallery-placeholder">NO PHOTO</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Template Modal (for setting sign templates) -->
            <div class="ms-template-modal" id="mapping-slayer-template-modal" style="display: none;">
                <div class="ms-template-content">
                    <div class="ms-template-header">
                        <span class="ms-template-title">Sign Template: <span id="template-marker-type"></span></span>
                        <div class="ms-template-controls">
                            <button class="ms-template-btn ms-template-add-btn" id="template-add-btn" title="Load template JSON">+</button>
                            <button class="ms-template-btn ms-template-remove-btn" id="template-remove-btn" title="Remove current template">−</button>
                            <button class="ms-template-btn ms-template-close-btn" id="template-close-btn" title="Close">✕</button>
                        </div>
                    </div>
                    <div class="ms-template-body">
                        <div class="ms-template-preview">
                            <div class="ms-template-display" id="template-display">
                                <span class="ms-template-placeholder">NO TEMPLATE LOADED</span>
                            </div>
                        </div>
                        <div class="ms-template-info" id="template-info" style="display: none;">
                            <div class="ms-template-filename"></div>
                            <div class="ms-template-details"></div>
                        </div>
                        <div class="ms-template-actions">
                            <button class="ms-template-create-btn" id="template-create-btn">CREATE</button>
                        </div>
                    </div>
                    <!-- Hidden file input for template selection -->
                    <input type="file" id="template-file-input" accept=".json" style="display: none;">
                </div>
            </div>

            <!-- Group Edit Modal -->
            <div class="ms-modal" id="mapping-slayer-group-edit-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header-grid">
                        <div class="ms-modal-header-main">
                            <h3 class="ms-modal-title">Edit Multiple</h3>
                            <div class="ms-modal-subheader">(<span id="mapping-slayer-group-edit-count">0</span> selected)</div>
                            <div class="ms-form-group-inline" style="margin-top: 10px;">
                                <label for="group-edit-installed">Installed</label>
                                <input type="checkbox" id="group-edit-installed" title="Mark all as installed">
                            </div>
                        </div>
                        <div class="ms-modal-header-flags" id="group-edit-modal-flags">
                            <!-- Flag selectors will be dynamically inserted here -->
                        </div>
                    </div>
                    <div class="ms-modal-body">
                        <div class="ms-form-group">
                            <label class="ms-form-label">Marker Type</label>
                            <select class="ms-form-input" id="group-edit-marker-type" title="Change marker type for all selected">
                                <option value="">-- Keep Individual Types --</option>
                            </select>
                        </div>
                        <!-- Dynamic text fields will be inserted here -->
                        <div id="group-edit-dynamic-fields" class="ms-dynamic-fields-container"></div>
                        <div class="ms-form-group">
                            <label class="ms-form-label">Notes</label>
                            <textarea class="ms-form-input ms-form-textarea" id="group-edit-notes" placeholder="Enter notes to overwrite all selected locations..." title="Notes will replace existing notes for all selected"></textarea>
                        </div>
                    </div>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-danger" id="group-delete-btn" title="Delete all selected locations">DELETE ALL</button>
                        <button class="ms-btn ms-btn-secondary" id="group-cancel-btn" title="Cancel changes and close">CANCEL</button>
                        <button class="ms-btn ms-btn-primary" id="group-update-btn" title="Apply changes to all selected">UPDATE ALL</button>
                    </div>
                </div>
            </div>
            
            <!-- Flag Customization Modal -->
            <div class="ms-modal" id="flag-customization-modal">
                <div class="ms-modal-content ms-flag-modal-content">
                    <div class="ms-modal-header">
                        <span>Flag Customization</span>
                        <button class="ms-modal-close" onclick="closeFlagModal()" title="Close flag customization">&times;</button>
                    </div>
                    <div class="ms-modal-body ms-flag-modal-body">
                        <div class="ms-flag-visual-container">
                            <div class="ms-flag-corner ms-flag-top-left">
                                <input type="text" class="ms-flag-name-input" placeholder="Flag 1" data-position="topLeft" title="Enter flag name">
                                <div class="ms-flag-symbol-selector" data-position="topLeft">
                                    <button class="ms-flag-prev-btn" data-position="topLeft" title="Previous symbol">&lt;</button>
                                    <div class="ms-flag-symbol-display" data-position="topLeft"></div>
                                    <button class="ms-flag-next-btn" data-position="topLeft" title="Next symbol">&gt;</button>
                                </div>
                                <input type="file" class="ms-flag-upload-input" data-position="topLeft" accept=".png,.jpg,.jpeg,.svg,.gif,.webp" style="display:none">
                                <button class="ms-flag-upload-btn" data-position="topLeft" title="Upload custom icon">📁</button>
                            </div>
                            <div class="ms-flag-corner ms-flag-top-right">
                                <input type="text" class="ms-flag-name-input" placeholder="Flag 2" data-position="topRight" title="Enter flag name">
                                <div class="ms-flag-symbol-selector" data-position="topRight">
                                    <button class="ms-flag-prev-btn" data-position="topRight" title="Previous symbol">&lt;</button>
                                    <div class="ms-flag-symbol-display" data-position="topRight"></div>
                                    <button class="ms-flag-next-btn" data-position="topRight" title="Next symbol">&gt;</button>
                                </div>
                                <input type="file" class="ms-flag-upload-input" data-position="topRight" accept=".png,.jpg,.jpeg,.svg,.gif,.webp" style="display:none">
                                <button class="ms-flag-upload-btn" data-position="topRight" title="Upload custom icon">📁</button>
                            </div>
                            <div class="ms-flag-corner ms-flag-bottom-left">
                                <input type="text" class="ms-flag-name-input" placeholder="Flag 3" data-position="bottomLeft" title="Enter flag name">
                                <div class="ms-flag-symbol-selector" data-position="bottomLeft">
                                    <button class="ms-flag-prev-btn" data-position="bottomLeft" title="Previous symbol">&lt;</button>
                                    <div class="ms-flag-symbol-display" data-position="bottomLeft"></div>
                                    <button class="ms-flag-next-btn" data-position="bottomLeft" title="Next symbol">&gt;</button>
                                </div>
                                <input type="file" class="ms-flag-upload-input" data-position="bottomLeft" accept=".png,.jpg,.jpeg,.svg,.gif,.webp" style="display:none">
                                <button class="ms-flag-upload-btn" data-position="bottomLeft" title="Upload custom icon">📁</button>
                            </div>
                            <div class="ms-flag-corner ms-flag-bottom-right">
                                <input type="text" class="ms-flag-name-input" placeholder="Flag 4" data-position="bottomRight" title="Enter flag name">
                                <div class="ms-flag-symbol-selector" data-position="bottomRight">
                                    <button class="ms-flag-prev-btn" data-position="bottomRight" title="Previous symbol">&lt;</button>
                                    <div class="ms-flag-symbol-display" data-position="bottomRight"></div>
                                    <button class="ms-flag-next-btn" data-position="bottomRight" title="Next symbol">&gt;</button>
                                </div>
                                <input type="file" class="ms-flag-upload-input" data-position="bottomRight" accept=".png,.jpg,.jpeg,.svg,.gif,.webp" style="display:none">
                                <button class="ms-flag-upload-btn" data-position="bottomRight" title="Upload custom icon">📁</button>
                            </div>
                        </div>
                    </div>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-secondary" id="flag-save-btn" title="Save flag configuration">SAVE</button>
                        <!-- Apply to All button no longer needed with global flags -->
                        <!-- <button class="ms-btn ms-btn-primary" id="flag-apply-all-btn">APPLY TO ALL</button> -->
                    </div>
                </div>
            </div>
            
            <!-- Renumber Modal -->
            <div class="ms-modal" id="mapping-slayer-renumber-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header">
                        <span>Renumber Options</span>
                    </div>
                    <div class="ms-modal-body">
                        <p class="ms-modal-text">Choose how you want to renumber the locations:</p>
                        <div class="ms-renumber-options">
                            <button class="ms-btn ms-btn-primary ms-renumber-option-btn" onclick="performRenumber('page')" title="Renumber locations on current page only">
                                <strong>Current Page Only</strong><br>
                                <small>Renumber dots on this page by position (top to bottom, left to right)</small>
                            </button>
                            <button class="ms-btn ms-btn-primary ms-renumber-option-btn" onclick="performRenumber('page-by-type')" title="Renumber by marker type on current page">
                                <strong>Current Page by Marker Type</strong><br>
                                <small>Renumber each marker type separately on this page</small>
                            </button>
                            <button class="ms-btn ms-btn-primary ms-renumber-option-btn" onclick="performRenumber('all')" title="Renumber all locations across all pages">
                                <strong>All Pages</strong><br>
                                <small>Renumber all dots across all pages continuously</small>
                            </button>
                            <button class="ms-btn ms-btn-primary ms-renumber-option-btn" onclick="performRenumber('all-by-type')" title="Renumber by marker type across all pages">
                                <strong>All Pages by Marker Type</strong><br>
                                <small>Renumber each marker type separately across all pages</small>
                            </button>
                        </div>
                    </div>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-secondary" id="cancel-renumber-btn" title="Close without renumbering">CANCEL</button>
                    </div>
                </div>
            </div>
            
            <!-- Automap Progress Modal -->
            <div class="ms-automap-progress-modal" id="mapping-slayer-automap-progress-modal">
                <div class="ms-automap-progress-content">
                    <div class="ms-automap-progress-header">Auto-Mapping in Progress</div>
                    <div id="mapping-slayer-automap-main-status">Initializing...</div>
                    <div class="ms-automap-progress-bar">
                        <div class="ms-automap-progress-fill" id="mapping-slayer-automap-progress-fill"></div>
                    </div>
                    <div class="ms-automap-activity-feed" id="mapping-slayer-automap-activity-feed"></div>
                    <div class="ms-automap-results" id="mapping-slayer-automap-results"></div>
                    <div class="ms-automap-buttons">
                        <button class="ms-btn ms-btn-secondary" id="cancel-automap-btn" title="Cancel automap operation">CANCEL</button>
                        <button class="ms-btn ms-btn-primary" id="close-automap-btn" style="display: none;" title="Close results">CLOSE</button>
                    </div>
                </div>
            </div>
            
            <!-- PDF Export Modal -->
            <div id="mapping-slayer-pdf-export-modal" class="ms-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header">
                        <span>PDF Export Options</span>
                    </div>
                    <div class="ms-modal-body">
                        <p class="ms-modal-text">Choose your PDF export format:</p>
                        <div class="ms-pdf-export-options">
                            <button class="ms-btn ms-btn-primary ms-pdf-export-option-btn" onclick="performPDFExport('current-with-details')" title="Export current map with detail pages">
                                <strong>Current Map - With Detail Pages</strong><br>
                                <small>This map + clickable detail pages for each location</small>
                            </button>
                            <button class="ms-btn ms-btn-primary ms-pdf-export-option-btn" onclick="performPDFExport('current-only')" title="Export current map only">
                                <strong>Current Map Only</strong><br>
                                <small>Just this map page with location dots</small>
                            </button>
                            <button class="ms-btn ms-btn-primary ms-pdf-export-option-btn" onclick="performPDFExport('all-maps-only')" title="Export all maps without details">
                                <strong>All Maps Only</strong><br>
                                <small>All map pages with dots (no detail pages)</small>
                            </button>
                        </div>
                    </div>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-secondary" id="cancel-pdf-export-btn" title="Close without exporting">CANCEL</button>
                    </div>
                </div>
            </div>
            
            <!-- Hidden file inputs -->
            <input type="file" id="update-csv-input" accept=".csv" style="display: none;">
            
            <!-- Controls Modal -->
            <div id="mapping-slayer-controls-modal" class="ms-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header">
                        <span>Controls</span>
                    </div>
                    <ul class="ms-controls-list-modal">
                        <li><strong>Pan:</strong> Middle-click + drag</li>
                        <li><strong>Zoom:</strong> Scroll wheel</li>
                        <li><strong>Add Dot:</strong> Click on map</li>
                        <li><strong>Edit Dot:</strong> Right-click on dot</li>
                        <li><strong>Select Multiple:</strong> Shift + Left-drag</li>
                        <li><strong>Scrape Live Text:</strong> Shift + Right-drag</li>
                        <li><strong>OCR Scrape:</strong> Ctrl + Shift + Right-drag</li>
                        <li><strong>Delete Selected:</strong> Delete key</li>
                        <li><strong>Copy Dot:</strong> Ctrl/Cmd + C</li>
                        <li><strong>Paste at Cursor:</strong> Ctrl/Cmd + V</li>
                        <li><strong>Undo/Redo:</strong> Ctrl/Cmd + Z / Ctrl/Cmd + Y</li>
                        <li><strong>Change Page:</strong> Page Up / Page Down</li>
                        <li><strong>Annotation Line:</strong> Ctrl + drag from dot</li>
                        <li><strong>Clear Selection:</strong> Escape</li>
                    </ul>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-secondary ms-btn-compact" id="guide-btn" title="Open user guide">FULL GUIDE</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-compact" id="tooltips-btn" title="Toggle tooltips on/off">TOOL TIPS</button>
                        <button class="ms-btn ms-btn-primary" id="close-controls-modal-btn" title="Close controls">CLOSE</button>
                    </div>
                </div>
            </div>

            <!-- Thumbnail Generator Modal -->
            <div class="ms-modal" id="mapping-slayer-thumbnails-modal" style="display: none;">
                <div class="ms-modal-content" style="width: 500px;">
                    <div class="ms-modal-header">
                        <span>Create Thumbnails</span>
                    </div>
                    <div class="ms-modal-body">
                        <div class="ms-form-group">
                            <label>Select Marker Types to Include:</label>
                            <div id="thumbnail-marker-types" class="ms-checkbox-group" style="max-height: 150px; overflow-y: auto; border: 1px solid #444; padding: 8px; border-radius: 4px;">
                                <!-- Marker type checkboxes will be populated here -->
                            </div>
                        </div>

                        <div class="ms-form-group">
                            <label>Thumbnail Size (inches):</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="number" id="thumbnail-width" min="0.5" max="5" step="0.1" value="2" style="width: 80px;">
                                <span style="align-self: center;">×</span>
                                <input type="number" id="thumbnail-height" min="0.5" max="5" step="0.1" value="2" style="width: 80px;">
                            </div>
                        </div>

                        <div class="ms-form-group">
                            <label>Page Size:</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <select id="thumbnail-page-size" style="flex: 1;">
                                    <option value="letter">Letter (8.5" × 11")</option>
                                    <option value="legal">Legal (8.5" × 14")</option>
                                    <option value="tabloid">Tabloid (11" × 17")</option>
                                    <option value="a4">A4 (210mm × 297mm)</option>
                                    <option value="custom">Custom Size</option>
                                </select>
                                <select id="thumbnail-orientation" style="width: 100px;">
                                    <option value="portrait">Portrait</option>
                                    <option value="landscape">Landscape</option>
                                </select>
                            </div>
                            <div id="custom-page-size" style="display: none; margin-top: 10px;">
                                <div style="display: flex; gap: 10px;">
                                    <input type="number" id="custom-page-width" min="1" max="50" step="0.1" placeholder="Width" style="width: 80px;">
                                    <span style="align-self: center;">×</span>
                                    <input type="number" id="custom-page-height" min="1" max="50" step="0.1" placeholder="Height" style="width: 80px;">
                                    <span style="align-self: center;">inches</span>
                                </div>
                            </div>
                        </div>

                        <div class="ms-form-group">
                            <label>Grid Layout:</label>
                            <div style="display: flex; gap: 10px;">
                                <div>
                                    <label style="font-size: 11px;">Columns:</label>
                                    <input type="number" id="thumbnail-cols" min="1" max="6" value="3" style="width: 60px;">
                                </div>
                                <div>
                                    <label style="font-size: 11px;">Rows:</label>
                                    <input type="number" id="thumbnail-rows" min="1" max="8" value="4" style="width: 60px;">
                                </div>
                            </div>
                        </div>

                        <div class="ms-form-group">
                            <label>Spacing (inches):</label>
                            <input type="number" id="thumbnail-spacing" min="0" max="2" step="0.1" value="0.25" style="width: 80px;">
                        </div>

                        <div class="ms-form-group">
                            <label>
                                <input type="checkbox" id="thumbnail-include-notes" checked>
                                Include Notes Field
                            </label>
                        </div>
                    </div>
                    <div class="ms-modal-buttons">
                        <button class="ms-btn ms-btn-secondary" id="cancel-thumbnails-btn">CANCEL</button>
                        <button class="ms-btn ms-btn-primary" id="export-individual-svgs-btn">EXPORT INDIVIDUAL SVGs</button>
                        <button class="ms-btn ms-btn-primary" id="generate-svg-grid-btn">GENERATE SVG GRID</button>
                    </div>
                </div>
            </div>
        `;

        // Append modals to document body for proper z-index stacking
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
    }

    async initializeMappingFunctionality() {
        this.stateModule = await import('./state.js');
        this.appState = this.stateModule.appState;

        // Initialize UndoManager - DISABLED: Using CommandUndoManager instead
        // this.stateModule.initializeUndoManager();

        // Initialize global flag configuration if not already set
        if (!this.appState.globalFlagConfiguration) {
            const { getDefaultFlagConfig } = await import('./flag-config.js');
            this.appState.globalFlagConfiguration = getDefaultFlagConfig();
        }

        this.initializeDefaultMarkerTypes();

        // Initialize flag customization UI
        const flagUIModule = await import('./flag-ui.js');
        flagUIModule.initializeFlagUI();

        // Initialize crop tool
        const { cropTool } = await import('./crop-tool.js');
        this.cropTool = cropTool;
        this.cropTool.initialize();

        // Initialize native tooltips toggle
        this.tooltipsEnabled = false; // Start with tooltips off
        this.setupNativeTooltips();

        this.setupAllEventListeners();

        // Expose mapping app instance globally for sync
        window.mappingApp = this;
    }

    initializeDefaultMarkerTypes() {
        // Initialize empty if no marker types exist
        if (!this.appState.markerTypes) {
            this.appState.markerTypes = {};
        }

        // Process any from DEFAULT_MARKER_TYPES if they exist
        this.stateModule.DEFAULT_MARKER_TYPES.forEach(markerType => {
            if (!this.appState.markerTypes[markerType.code]) {
                this.appState.markerTypes[markerType.code] = {
                    code: markerType.code,
                    name: markerType.name,
                    color: markerType.color,
                    textColor: markerType.textColor,
                    designReference: null
                };
            }
        });

        const firstMarkerType = Object.keys(this.appState.markerTypes)[0];
        this.appState.activeMarkerType = firstMarkerType || null;
    }

    setupAllEventListeners() {
        this.setupBasicEventListeners();
        addMarkerTypeEventListener();
        addPageNavigationEventListeners();
        addViewToggleEventListeners();
        addButtonEventListeners();
        setupModalEventListeners();

        // Initialize thumbnail generator
        thumbnailGenerator.init();

        // Remove setTimeout to match toggle behavior timing
        (async () => {
            this.updateFilterCheckboxes();
            this.updateLocationList();
            updateMarkerTypeSelect();
            this.enableButtons();

            // Initialize tolerance inputs
            const { updateToleranceInputs } = await import('./scrape.js');
            updateToleranceInputs();

            // Check if SaveManager is available
            console.log('📊 [Mapping] window.saveManager available:', !!window.saveManager);
            if (window.saveManager) {
                console.log('📊 [Mapping] SaveManager is ready for file handle support');
            }
        })();
    }

    setupBasicEventListeners() {
        // Collapse button for left panel
        const collapseBtn = this.container.querySelector('#left-panel-collapse-btn');
        const leftPanel = this.container.querySelector('.ms-left-panel');
        if (collapseBtn && leftPanel) {
            collapseBtn.addEventListener('click', () => {
                leftPanel.classList.toggle('collapsed');
            });
        }

        const helpBtn = this.container.querySelector('#help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                const controlsModal = document.getElementById('mapping-slayer-controls-modal');
                if (controlsModal) {
                    controlsModal.style.display = 'block';
                }
            });
        }

        // Controls modal close button
        const closeControlsModalBtn = document.getElementById('close-controls-modal-btn');
        if (closeControlsModalBtn) {
            closeControlsModalBtn.addEventListener('click', () => {
                const controlsModal = document.getElementById('mapping-slayer-controls-modal');
                if (controlsModal) {
                    controlsModal.style.display = 'none';
                }
            });
        }

        // Tooltips button for native tooltips
        const tooltipsBtn = document.getElementById('tooltips-btn');
        if (tooltipsBtn) {
            tooltipsBtn.addEventListener('click', () => {
                this.toggleNativeTooltips();
            });
        }

        // Full Guide button
        const guideBtn = document.getElementById('guide-btn');
        if (guideBtn) {
            guideBtn.addEventListener('click', () => {
                window.open(
                    'https://3toedsoftware.github.io/MappingSlayer-Dev/ms_user_guide.html',
                    '_blank'
                );
            });
        }

        const uploadArea = this.container.querySelector('#upload-area');
        const fileInput = this.container.querySelector('#file-input');
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', async () => {
                // Just use the simple file input approach that works
                fileInput.click();
            });

            const handleFileChange = async e => {
                const file = e.target.files[0];
                if (file) {
                    // This is the fallback path - no file handle available
                    console.log(
                        '📊 [Click Upload Fallback] File selected without handle:',
                        file.name
                    );

                    // For .slayer files without handle, use SaveManager's loadFileDirectly
                    if (file.name.toLowerCase().endsWith('.slayer') && window.saveManager) {
                        console.log(
                            '📊 [Click Upload Fallback] Loading .slayer file WITHOUT file handle'
                        );
                        await window.saveManager.loadFileDirectly(file);
                    } else {
                        await this.loadFile(file);
                    }
                }
            };
            fileInput.addEventListener('change', handleFileChange);

            // Add drag and drop support
            uploadArea.addEventListener('dragover', e => {
                e.preventDefault();
                e.currentTarget.classList.add('ms-dragover');
            });

            uploadArea.addEventListener('dragleave', e => {
                e.preventDefault();
                e.currentTarget.classList.remove('ms-dragover');
            });

            uploadArea.addEventListener('drop', async e => {
                e.preventDefault();
                e.currentTarget.classList.remove('ms-dragover');

                // Try to get file handle for .slayer files (enables SAVE button)
                let fileHandle = null;
                let file = null;

                // Check if we can get a file system handle (for SAVE functionality)
                if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                    const item = e.dataTransfer.items[0];

                    // Try to get file handle if available (Chrome 86+)
                    if (item.getAsFileSystemHandle) {
                        try {
                            const handle = await item.getAsFileSystemHandle();
                            if (handle.kind === 'file') {
                                fileHandle = handle;
                                file = await fileHandle.getFile();
                                console.log('📊 [Drag-Drop] Got file handle for:', file.name);
                            }
                        } catch (err) {
                            console.log('📊 [Drag-Drop] Could not get file handle:', err.message);
                        }
                    }

                    // Fallback to regular file if no handle
                    if (!file && item.getAsFile) {
                        file = item.getAsFile();
                    }
                } else {
                    // Fallback for older browsers
                    file = e.dataTransfer.files[0];
                }

                if (file) {
                    console.log('📄 File dropped:', file.name);

                    // Special handling for .slayer files with file handle
                    if (file.name.toLowerCase().endsWith('.slayer')) {
                        console.log('📊 [Drag-Drop] .slayer file detected');
                        console.log('📊 [Drag-Drop] fileHandle available:', !!fileHandle);
                        console.log(
                            '📊 [Drag-Drop] window.saveManager available:',
                            !!window.saveManager
                        );

                        if (fileHandle && window.saveManager) {
                            console.log(
                                '📊 [Drag-Drop] Loading .slayer file WITH file handle for SAVE support'
                            );
                            // Load through SaveManager with file handle
                            await window.saveManager.loadFileWithHandle(file, fileHandle);
                            return;
                        } else if (window.saveManager) {
                            console.log(
                                '📊 [Drag-Drop] Loading .slayer file WITHOUT file handle (no SAVE support)'
                            );
                            // Load through SaveManager without file handle
                            await window.saveManager.loadFileDirectly(file);
                            return;
                        } else {
                            console.log(
                                '📊 [Drag-Drop] SaveManager not available, falling back to regular load'
                            );
                        }
                    }

                    // Check if it's a PDF and we already have a PDF loaded
                    if (file.name.toLowerCase().endsWith('.pdf') && this.appState.pdfDoc) {
                        const confirmReplace = confirm(
                            'Replace existing PDF? Ensure dimensions are the same or markers will be off. All cropping will be reset.'
                        );
                        if (confirmReplace) {
                            await this.replacePDF(file);
                        }
                    } else {
                        await this.loadFile(file);
                    }
                }
            });
        }

        const dotSizeSlider = this.container.querySelector('#dot-size-slider');
        if (dotSizeSlider) {
            let dotSizeTimeout;

            // Ensure proper focus handling when slider is clicked
            dotSizeSlider.addEventListener('mousedown', e => {
                // Force focus back to the map container after a short delay
                setTimeout(() => {
                    const mapContainer = this.container.querySelector('#map-container');
                    if (mapContainer) {
                        // Make sure map container is focusable
                        if (!mapContainer.hasAttribute('tabindex')) {
                            mapContainer.setAttribute('tabindex', '-1');
                        }
                        mapContainer.focus();
                    }
                }, 100);
            });

            dotSizeSlider.addEventListener('input', e => {
                this.appState.dotSize = parseFloat(e.target.value);

                // Debounce the rendering to avoid conflicts with undo system
                clearTimeout(dotSizeTimeout);
                dotSizeTimeout = setTimeout(async () => {
                    await renderDotsForCurrentPage();
                    // Also ensure annotation lines are rendered
                    renderAnnotationLines();
                }, 10);
            });

            // Add mouseup to ensure undo system is ready after slider change
            dotSizeSlider.addEventListener('mouseup', () => {
                // Blur the slider to ensure it's not capturing keyboard events
                dotSizeSlider.blur();

                // Reset the undo system's execution flag if it got stuck
                if (window.CommandUndoManager && window.CommandUndoManager.isExecuting) {
                    window.CommandUndoManager.resetExecutionFlag();
                }

                // Ensure map container has focus
                setTimeout(() => {
                    const mapContainer = this.container.querySelector('#map-container');
                    if (mapContainer) {
                        // Make sure map container is focusable
                        if (!mapContainer.hasAttribute('tabindex')) {
                            mapContainer.setAttribute('tabindex', '-1');
                        }
                        mapContainer.focus();

                        // Also dispatch a synthetic click event
                        const clickEvent = new MouseEvent('mousedown', {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            clientX: 0,
                            clientY: 0
                        });
                        mapContainer.dispatchEvent(clickEvent);
                    }
                }, 0);
            });

            // Also handle when slider loses focus
            dotSizeSlider.addEventListener('blur', () => {
                if (window.CommandUndoManager && window.CommandUndoManager.isExecuting) {
                    window.CommandUndoManager.resetExecutionFlag();
                }
            });
        }

        // Add a global mousedown handler on the map container to reset undo flag if needed
        const mapContainer = this.container.querySelector('#map-container');
        if (mapContainer) {
            mapContainer.addEventListener(
                'mousedown',
                e => {
                    // Skip if clicking on the slider
                    if (e.target.id === 'dot-size-slider') return;

                    if (window.CommandUndoManager && window.CommandUndoManager.isExecuting) {
                        window.CommandUndoManager.resetExecutionFlag();
                    }
                },
                true
            ); // Use capture phase

            // Add click handler for empty state to flash upload area
            mapContainer.addEventListener('click', e => {
                // Only handle clicks when no PDF is loaded and not clicking on upload area
                if (!this.appState.pdfDoc && !e.target.closest('.ms-upload-area')) {
                    const uploadArea = this.container.querySelector('#upload-area');
                    if (uploadArea && uploadArea.style.display !== 'none') {
                        // Add flash class
                        uploadArea.classList.add('ms-flash-green');

                        // Remove class after animation completes (3 flashes * 0.5s = 1.5s)
                        setTimeout(() => {
                            uploadArea.classList.remove('ms-flash-green');
                        }, 1500);
                    }
                }
            });

            // Add drag and drop support to map container for PDF replacement
            mapContainer.addEventListener('dragover', e => {
                // Only allow PDF files when a PDF is already loaded
                if (this.appState.pdfDoc && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    mapContainer.classList.add('ms-dragover');
                }
            });

            mapContainer.addEventListener('dragleave', e => {
                // Only remove class if we're actually leaving the container
                if (e.target === mapContainer) {
                    mapContainer.classList.remove('ms-dragover');
                }
            });

            mapContainer.addEventListener('drop', async e => {
                e.preventDefault();
                mapContainer.classList.remove('ms-dragover');

                const file = e.dataTransfer.files[0];
                if (file && file.name.toLowerCase().endsWith('.pdf') && this.appState.pdfDoc) {
                    const confirmReplace = confirm(
                        'Replace existing PDF? Ensure dimensions are the same or markers will be off. All cropping will be reset.'
                    );
                    if (confirmReplace) {
                        await this.replacePDF(file);
                    }
                }
            });
        }

        const hToleranceInput = this.container.querySelector('#h-tolerance-input');
        const vToleranceInput = this.container.querySelector('#v-tolerance-input');

        if (hToleranceInput) {
            hToleranceInput.addEventListener('change', e => {
                this.appState.scrapeHorizontalTolerance = parseFloat(e.target.value);
            });

            // Add Enter key support
            hToleranceInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur(); // This will trigger the change event if value changed
                    this.appState.scrapeHorizontalTolerance = parseFloat(e.target.value);
                }
            });
        }

        if (vToleranceInput) {
            vToleranceInput.addEventListener('change', e => {
                this.appState.scrapeVerticalTolerance = parseFloat(e.target.value);
            });

            // Add Enter key support
            vToleranceInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur(); // This will trigger the change event if value changed
                    this.appState.scrapeVerticalTolerance = parseFloat(e.target.value);
                }
            });
        }
    }

    enableButtons() {
        const buttonsToEnable = [
            '#create-thumbnails-btn',
            '#create-pdf-btn',
            '#create-schedule-btn',
            '#update-from-schedule-btn',
            '#export-html-btn',
            '#single-automap-btn'
        ];

        buttonsToEnable.forEach(selector => {
            const btn = this.container.querySelector(selector);
            if (btn && this.appState.pdfDoc) {
                btn.disabled = false;
            }
        });

        updateMarkerTypeSelect();
    }

    // Note: updateAutomapSelect is now handled by updateMarkerTypeSelect in ui.js

    async loadFile(file) {
        const uploadArea = this.container.querySelector('#upload-area');
        if (uploadArea) {
            uploadArea.innerHTML = '<div>⚙️ Loading file...</div>';
            uploadArea.style.display = 'flex';
        }

        const loadedData = await ProjectIO.load(file);

        if (!loadedData) {
            console.error('File loading failed.');
            if (uploadArea) {
                uploadArea.innerHTML = '<div>❌ File loading failed. Please try again.</div>';
            }
            return;
        }

        // Handle .slayer files - delegate to save manager
        if (loadedData.isSlayerFile && loadedData.requiresSuiteHandling) {
            console.log('🔄 Delegating .slayer file to save manager');
            if (uploadArea) uploadArea.innerHTML = '<div>🔄 Loading project...</div>';

            // Use SaveManager to load the file (which won't have a file handle from drag-drop)
            if (window.saveManager) {
                await window.saveManager.loadFileDirectly(loadedData.file);
                if (uploadArea) {
                    uploadArea.innerHTML = '<div>✅ Suite project loaded successfully!</div>';
                }
                console.log('✅ .slayer file loaded successfully via SaveManager');
            } else {
                // Fallback to project manager if SaveManager not available
                const { projectManager } = await import('../core/project-manager.js');
                const success = await projectManager.load(loadedData.file);

                if (success) {
                    if (uploadArea) {
                        uploadArea.innerHTML = '<div>✅ Suite project loaded successfully!</div>';
                    }
                    console.log('✅ .slayer file loaded successfully');
                } else {
                    if (uploadArea) {
                        uploadArea.innerHTML = '<div>❌ Failed to load suite project.</div>';
                    }
                    console.error('❌ Failed to load .slayer file');
                }
            }
            return;
        }

        // Clear the PDF cache when loading a new PDF
        clearPDFCache();

        // Clear all existing data when loading a new file (but preserve marker types)
        this.clearAllDataExceptMarkerTypes();

        // Clear the file handle when loading a new PDF (not a project file)
        if (!loadedData.isProject) {
            if (window.saveManager && window.saveManager.clearFileHandle) {
                await window.saveManager.clearFileHandle();
            }
        }

        this.appState.pdfDoc = loadedData.pdfDoc;
        this.appState.sourcePdfBuffer = loadedData.pdfBuffer;
        this.appState.sourcePdfName = file.name;
        this.appState.totalPages = loadedData.pdfDoc.numPages;
        this.appState.currentPdfPage = 1;

        // Convert PDF buffer to base64 for saving
        if (loadedData.pdfBuffer) {
            const uint8Array = new Uint8Array(loadedData.pdfBuffer);
            let binary = '';
            for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i]);
            }
            this.appState.sourcePdfBase64 = btoa(binary);
            console.log('PDF converted to base64, length:', this.appState.sourcePdfBase64.length);
        }

        // DEBUG: Track PDF buffer state

        if (loadedData.isProject && loadedData.projectData) {
            await this.importData(loadedData.projectData);
            if (this.bridge && this.bridge.updateProjectName) {
                this.bridge.updateProjectName(loadedData.projectData.sourcePdfName || file.name);
            }
        } else {
            if (this.bridge && this.bridge.updateProjectName) {
                this.bridge.updateProjectName(file.name);
            }
        }

        // Reset transform but don't apply yet - let zoom-to-fit handle it
        this.appState.mapTransform = { x: 0, y: 0, scale: 1 };

        await renderPDFPage(1);

        await renderDotsForCurrentPage();

        // Zoom to fit all dots on the page if there are any
        const currentPageDots = getCurrentPageDots();
        console.log(
            '[Zoom-to-fit] Checking dots after load:',
            currentPageDots ? currentPageDots.size : 'null'
        );
        if (currentPageDots && currentPageDots.size > 0) {
            const allDotIds = Array.from(currentPageDots.keys());
            console.log('[Zoom-to-fit] Calling zoomToFitDots with', allDotIds.length, 'dots');

            // Small delay to ensure DOM is ready
            setTimeout(() => {
                zoomToFitDots(allDotIds);
                console.log('[Zoom-to-fit] Transform after zoom:', this.appState.mapTransform);
            }, 100);
        } else {
            console.log('[Zoom-to-fit] No dots found, using default view');
            // Apply default transform only if no dots
            applyMapTransform();
        }

        // Apply any saved crops for the first page
        if (this.cropTool) {
            this.cropTool.applySavedCrop();
        }

        setupCanvasEventListeners();
        setupMapInteraction();

        updateAllSectionsForCurrentPage();

        updatePageInfo();

        this.enableButtons();

        if (uploadArea) {
            uploadArea.style.display = 'none';
        }

        // Clear undo history when loading new file
        if (this.stateModule.CommandUndoManager) {
            this.stateModule.CommandUndoManager.clear();
        }

        console.log('✅ PDF loaded and rendered successfully.');
    }

    async replacePDF(file) {
        const uploadArea = this.container.querySelector('#upload-area');
        if (uploadArea) {
            uploadArea.innerHTML = '<div>⚙️ Replacing PDF...</div>';
            uploadArea.style.display = 'flex';
        }

        // Load the new PDF without clearing project data
        const loadedData = await ProjectIO.load(file);
        if (!loadedData || !loadedData.pdfDoc) {
            console.error('PDF loading failed.');
            if (uploadArea) {
                uploadArea.innerHTML = '<div>❌ PDF loading failed. Please try again.</div>';
                uploadArea.style.display = 'none';
            }
            return;
        }

        // Clear the PDF cache for the new PDF
        clearPDFCache();

        // Replace the PDF document and buffer
        this.appState.pdfDoc = loadedData.pdfDoc;
        this.appState.sourcePdfBuffer = loadedData.pdfBuffer;
        this.appState.sourcePdfName = file.name;

        // Convert PDF buffer to base64 for saving
        if (loadedData.pdfBuffer) {
            const uint8Array = new Uint8Array(loadedData.pdfBuffer);
            let binary = '';
            for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i]);
            }
            this.appState.sourcePdfBase64 = btoa(binary);
            console.log(
                'Replacement PDF converted to base64, length:',
                this.appState.sourcePdfBase64.length
            );
        }

        // Check if page count changed
        const newTotalPages = loadedData.pdfDoc.numPages;
        if (newTotalPages < this.appState.totalPages) {
            console.warn(
                `⚠️ New PDF has fewer pages (${newTotalPages}) than original (${this.appState.totalPages})`
            );
        }
        this.appState.totalPages = newTotalPages;

        // Ensure current page is valid
        if (this.appState.currentPdfPage > newTotalPages) {
            this.appState.currentPdfPage = 1;
        }

        // Clear all cropping data
        if (this.cropTool) {
            this.cropTool.clearAllCrops();
        }

        // Update project name if bridge is available
        if (this.bridge && this.bridge.updateProjectName) {
            this.bridge.updateProjectName(file.name);
        }

        // Re-render with the new PDF
        await renderPDFPage(this.appState.currentPdfPage);
        await renderDotsForCurrentPage();
        updateAllSectionsForCurrentPage();

        updatePageInfo();

        if (uploadArea) {
            uploadArea.style.display = 'none';
        }

        // Mark project as dirty since PDF changed
        setDirtyState();

        console.log('✅ PDF replaced successfully. All dots and data preserved.');
    }

    updateFilterCheckboxes() {
        updateFilterCheckboxes();
    }

    updateLocationList() {
        updateLocationList();
    }

    serializeAnnotationLines(annotationLinesMap) {
        const obj = {};
        for (const [pageNum, linesMap] of annotationLinesMap.entries()) {
            obj[pageNum] = Array.from(linesMap.values());
        }
        return obj;
    }

    deserializeAnnotationLines(serializedObj) {
        const annotationLinesMap = new Map();
        for (const [pageNum, lines] of Object.entries(serializedObj)) {
            const linesMap = new Map();
            lines.forEach(line => {
                linesMap.set(line.id, line);
            });
            annotationLinesMap.set(parseInt(pageNum), linesMap);
        }
        return annotationLinesMap;
    }

    exportData() {
        if (!this.appState) {
            return { version: this.version, data: null };
        }

        // Convert PDF buffer to base64 if it exists
        let pdfBase64 = null;

        console.log('🔍 exportData called - checking PDF buffer...');
        console.log('🔍 sourcePdfBuffer exists?', !!this.appState.sourcePdfBuffer);
        if (this.appState.sourcePdfBuffer) {
            console.log('🔍 sourcePdfBuffer size:', this.appState.sourcePdfBuffer.byteLength);
        }

        if (this.appState.sourcePdfBuffer) {
            try {
                const uint8Array = new Uint8Array(this.appState.sourcePdfBuffer);
                const binaryString = uint8Array.reduce(
                    (str, byte) => str + String.fromCharCode(byte),
                    ''
                );
                pdfBase64 = btoa(binaryString);
                console.log('🔍 PDF converted to base64, length:', pdfBase64.length);
            } catch (e) {
                console.error('🔍 Failed to convert PDF to base64:', e);
            }
        } else {
            console.warn('🔍 No sourcePdfBuffer found - PDF will not be saved!');
        }

        return {
            version: this.version,
            appState: {
                dotsByPage: this.stateModule.serializeDotsByPage(this.appState.dotsByPage),
                markerTypes: this.appState.markerTypes,
                // flagConfigurations: this.appState.flagConfigurations, // DEPRECATED - now using globalFlagConfiguration
                globalFlagConfiguration: this.appState.globalFlagConfiguration,
                customIconLibrary: this.appState.customIconLibrary || [],
                nextInternalId: this.appState.nextInternalId,
                dotSize: this.appState.dotSize,
                currentPdfPage: this.appState.currentPdfPage,
                totalPages: this.appState.totalPages,
                pageLabels: Object.fromEntries(this.appState.pageLabels || new Map()),
                recentSearches: this.appState.recentSearches,
                automapExactPhrase: this.appState.automapExactPhrase,
                scrapeHorizontalTolerance: this.appState.scrapeHorizontalTolerance,
                scrapeVerticalTolerance: this.appState.scrapeVerticalTolerance,
                annotationLines: this.serializeAnnotationLines(this.appState.annotationLines),
                showAnnotationEndpoints: this.appState.showAnnotationEndpoints,
                // Include crop data
                cropData: this.cropTool
                    ? {
                          cropBoundsPerPage: Array.from(this.cropTool.cropBoundsPerPage.entries()),
                          globalCropBounds: this.cropTool.globalCropBounds,
                          cropAllPages: this.cropTool.cropAllPages
                      }
                    : null,
                // Include PDF data
                sourcePdfBase64: pdfBase64,
                sourcePdfName: this.appState.sourcePdfName
            },
            exported: new Date().toISOString()
        };
    }

    clearAllDataExceptMarkerTypes() {
        // Save marker types and active marker type before clearing
        const savedMarkerTypes = { ...this.appState.markerTypes };
        const savedActiveMarkerType = this.appState.activeMarkerType;

        // Call the full clear
        this.clearAllData();

        // Restore marker types and active marker type
        this.appState.markerTypes = savedMarkerTypes;
        this.appState.activeMarkerType = savedActiveMarkerType;

        // Update UI to reflect the preserved marker types
        updateFilterCheckboxes();
        updateMarkerTypeSelect();

        // Trigger manual sync after restoring marker types
    }

    clearAllData() {
        // CRITICAL: First clear all DOM dot elements to prevent persistence
        const existingDots = document.querySelectorAll('.ms-map-dot');

        // Remove all dot elements from DOM
        existingDots.forEach((dotElement, index) => {
            dotElement.remove();
        });

        // Also clear any dots that might be in map-content specifically
        const mapContent = document.getElementById('map-content');
        if (mapContent) {
            const mapContentDots = mapContent.querySelectorAll('.ms-map-dot');
            mapContentDots.forEach(dot => dot.remove());
        }

        // Clear dots from state
        this.appState.dotsByPage.clear();

        // Clear marker types
        this.appState.markerTypes = {};

        // Clear annotation lines
        this.appState.annotationLines.clear();

        // Reset counters and settings
        this.appState.nextInternalId = 1;
        this.appState.nextAnnotationId = 1;
        this.appState.dotSize = 1;
        this.appState.currentPdfPage = 1;
        this.appState.totalPages = 1;
        this.appState.pageLabels.clear();
        this.appState.recentSearches = [];
        this.appState.automapExactPhrase = true;
        this.appState.scrapeHorizontalTolerance = 10;
        this.appState.scrapeVerticalTolerance = 25;
        this.appState.showAnnotationEndpoints = true;
        this.appState.activeMarkerType = null;

        // Clear selection
        this.appState.selectedDots.clear();

        // Clear canvas
        const canvas = document.getElementById('pdf-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Clear undo history
        if (this.stateModule && this.stateModule.CommandUndoManager) {
            this.stateModule.CommandUndoManager.clear();
        }

        // CRITICAL: Clear location list DOM to prevent persistence
        const locationList = document.getElementById('location-list');
        if (locationList) {
            locationList.innerHTML = '';
        }

        // Update UI to reflect cleared state
        updateFilterCheckboxes();
        updateLocationList();
        updatePageInfo();

        // Final verification
        const remainingDots = document.querySelectorAll('.ms-map-dot');
        if (remainingDots.length > 0) {
            console.error(
                'WARNING! Still found',
                remainingDots.length,
                'dot elements after cleanup!'
            );
        }
    }

    async importData(data) {
        if (!this.appState || !data) {
            return;
        }

        // CRITICAL: Clear all existing data first with detailed logging
        this.clearAllData();

        // Reset dirty state when importing
        this.appState.isDirty = false;

        // Handle different data structures - old suite format vs new format
        let stateToImport;
        if (data.appState) {
            // New format from getExportData
            stateToImport = data.appState;
            console.log('🔍 Using new format (has appState wrapper)');
        } else if (data.data && data.data.appState) {
            // Old suite format has appState nested in data
            stateToImport = data.data.appState;
            console.log('🔍 Using old suite format (data.appState)');
        } else if (data.data) {
            // Old suite format might have data directly
            stateToImport = data.data;
            console.log('🔍 Using old suite format (data directly)');
        } else {
            // Direct data
            stateToImport = data;
            console.log('🔍 Using direct data (no wrapper)');
        }

        console.log('🔍 stateToImport has sourcePdfBase64?', !!stateToImport.sourcePdfBase64);
        if (stateToImport.sourcePdfBase64) {
            console.log(
                '🔍 sourcePdfBase64 first 100 chars:',
                stateToImport.sourcePdfBase64.substring(0, 100)
            );
        }

        // Log details of each page's dots in the import data
        if (stateToImport.dotsByPage) {
            Object.entries(stateToImport.dotsByPage).forEach(([pageNum, pageData]) => {
                if (pageData.dots && pageData.dots.length > 0) {
                    pageData.dots.forEach((dot, index) => {});
                }
            });
        }

        this.appState.dotsByPage = this.stateModule.deserializeDotsByPage(
            stateToImport.dotsByPage || {}
        );

        // Import marker types directly
        this.appState.markerTypes = stateToImport.markerTypes || {};

        // Import flag configurations (migrate from old per-marker to global)
        if (stateToImport.globalFlagConfiguration) {
            this.appState.globalFlagConfiguration = stateToImport.globalFlagConfiguration;
        } else if (stateToImport.flagConfigurations) {
            // Migrate from old per-marker-type flags to global
            // Use the first marker type's config as the global config
            const firstConfig = Object.values(stateToImport.flagConfigurations)[0];
            this.appState.globalFlagConfiguration = firstConfig || null;
        }

        // Initialize global flag configuration if not present
        if (!this.appState.globalFlagConfiguration) {
            const { getDefaultFlagConfig } = await import('./flag-config.js');
            this.appState.globalFlagConfiguration = getDefaultFlagConfig();
        }

        // Import custom icon library
        if (stateToImport.customIconLibrary) {
            this.appState.customIconLibrary = stateToImport.customIconLibrary;
        } else if (!this.appState.customIconLibrary) {
            this.appState.customIconLibrary = [];
        }

        this.appState.nextInternalId = stateToImport.nextInternalId || 1;
        this.appState.dotSize = stateToImport.dotSize || 1;
        this.appState.currentPdfPage = stateToImport.currentPdfPage || 1;
        this.appState.totalPages = stateToImport.totalPages || this.appState.totalPages;
        this.appState.pageLabels = new Map(Object.entries(stateToImport.pageLabels || {}));
        this.appState.recentSearches = stateToImport.recentSearches || [];
        this.appState.automapExactPhrase =
            stateToImport.automapExactPhrase !== undefined
                ? stateToImport.automapExactPhrase
                : true;
        this.appState.scrapeHorizontalTolerance = stateToImport.scrapeHorizontalTolerance || 1;
        this.appState.scrapeVerticalTolerance = stateToImport.scrapeVerticalTolerance || 25;

        // Import annotation lines
        if (stateToImport.annotationLines) {
            this.appState.annotationLines = this.deserializeAnnotationLines(
                stateToImport.annotationLines
            );
        }

        // Import annotation endpoints setting
        if (stateToImport.showAnnotationEndpoints !== undefined) {
            this.appState.showAnnotationEndpoints = stateToImport.showAnnotationEndpoints;
        }

        // Update next annotation ID based on imported lines
        let maxAnnotationId = 0;
        this.appState.annotationLines.forEach(linesMap => {
            linesMap.forEach(line => {
                const idNum = parseInt(line.id.replace('annotation_', ''));
                if (idNum > maxAnnotationId) maxAnnotationId = idNum;
            });
        });
        this.appState.nextAnnotationId = maxAnnotationId + 1;

        // Set active marker type
        if (stateToImport.activeMarkerType) {
            this.appState.activeMarkerType = stateToImport.activeMarkerType;
        }

        // Set active marker type if not set
        if (
            this.appState.markerTypes &&
            Object.keys(this.appState.markerTypes).length > 0 &&
            !this.appState.activeMarkerType
        ) {
            this.appState.activeMarkerType = Object.keys(this.appState.markerTypes)[0];
        }

        // Import crop data if available
        if (stateToImport.cropData && this.cropTool) {
            // Clear existing crop data
            this.cropTool.cropBoundsPerPage.clear();

            // Restore crop bounds per page
            if (stateToImport.cropData.cropBoundsPerPage) {
                stateToImport.cropData.cropBoundsPerPage.forEach(([pageNum, bounds]) => {
                    this.cropTool.cropBoundsPerPage.set(pageNum, bounds);
                });
            }

            // Restore global crop bounds
            if (stateToImport.cropData.globalCropBounds) {
                this.cropTool.globalCropBounds = stateToImport.cropData.globalCropBounds;
            }

            // Restore crop all pages setting
            if (stateToImport.cropData.cropAllPages !== undefined) {
                this.cropTool.cropAllPages = stateToImport.cropData.cropAllPages;
            }
        }

        // Load PDF if available
        console.log('🔍 importData: Checking for PDF data...');
        console.log('🔍 Has sourcePdfBase64?', !!stateToImport.sourcePdfBase64);
        console.log('🔍 Has sourcePdfBuffer?', !!this.appState.sourcePdfBuffer);
        if (stateToImport.sourcePdfBase64) {
            console.log(
                '🔍 importData: Found PDF base64 data, length:',
                stateToImport.sourcePdfBase64.length
            );
            try {
                // Convert base64 back to ArrayBuffer
                const binaryString = atob(stateToImport.sourcePdfBase64);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                this.appState.sourcePdfBuffer = bytes.buffer;
                this.appState.sourcePdfBase64 = stateToImport.sourcePdfBase64; // Keep the base64 for future saves
                this.appState.sourcePdfName =
                    stateToImport.pdfFileName || stateToImport.sourcePdfName || 'imported.pdf';
                console.log(
                    '🔍 importData: PDF buffer restored, size:',
                    this.appState.sourcePdfBuffer.byteLength
                );

                // CRITICAL: Create a copy of the buffer for PDF.js to avoid detachment
                const pdfBufferCopy = bytes.buffer.slice(0);

                // Load the PDF document with the copy
                const loadingTask = window.pdfjsLib.getDocument({ data: pdfBufferCopy });
                this.appState.pdfDoc = await loadingTask.promise;
                this.appState.totalPages = this.appState.pdfDoc.numPages;
                console.log('🔍 PDF loaded successfully, pages:', this.appState.totalPages);
                console.log('🔍 pdfDoc exists?', !!this.appState.pdfDoc);

                // Clear PDF cache and render first page
                clearPDFCache();
                console.log('🔍 About to render PDF page:', this.appState.currentPdfPage || 1);
                await renderPDFPage(this.appState.currentPdfPage || 1);
                console.log('🔍 PDF page rendered');

                // Update page info display
                const { updatePageInfo } = await import('./ui.js');
                updatePageInfo();

                // Hide upload area
                const uploadArea = document.getElementById('upload-area');
                if (uploadArea) {
                    uploadArea.style.display = 'none';
                }

                // Apply any saved crops
                if (this.cropTool) {
                    this.cropTool.applySavedCrop();
                }

                // Setup canvas event listeners
                setupCanvasEventListeners();
                setupMapInteraction();

                // Enable buttons
                this.enableButtons();
            } catch (e) {
                console.error('Failed to restore PDF from base64:', e);
            }
        } else if (!stateToImport.sourcePdfBase64 && !this.appState.sourcePdfBuffer) {
            console.log('No PDF data available to restore');
        }

        // Update UI after importing with a delay to ensure DOM is ready
        // This 500ms delay allows filter checkboxes to initialize properly so the location list can populate
        // Without this delay, dots get filtered out and the list appears empty
        setTimeout(() => {
            updateFilterCheckboxes();
            updateLocationList();
            updateAllSectionsForCurrentPage();
        }, 500);

        // Update dot size slider if available
        const dotSizeSlider = document.getElementById('dot-size-slider');
        if (dotSizeSlider) {
            dotSizeSlider.value = this.appState.dotSize;
        }

        // Render dots for current page
        await renderDotsForCurrentPage();

        // Render annotation lines
        const { renderAnnotationLines } = await import('./ui.js');
        renderAnnotationLines();

        // CRITICAL: Sync loaded marker types with other apps via App Bridge
        // This was missing, causing DS to not receive marker types from .slayer files
        if (
            this.syncAdapter &&
            window.appBridge &&
            this.appState.markerTypes &&
            Object.keys(this.appState.markerTypes).length > 0
        ) {
            console.log(
                '📢 Syncing',
                Object.keys(this.appState.markerTypes).length,
                'marker types with other apps'
            );
            await this.syncAdapter.syncMarkerTypes(window.appBridge);
        }

        // Auto zoom-to-fit after importing project data
        console.log('[Zoom-to-fit] Checking for dots after import...');
        const currentPageDots = getCurrentPageDots();
        if (currentPageDots && currentPageDots.size > 0) {
            const allDotIds = Array.from(currentPageDots.keys());
            console.log(
                '[Zoom-to-fit] Found',
                allDotIds.length,
                'dots after import, zooming to fit...'
            );

            // Delay to ensure DOM is ready after import
            setTimeout(() => {
                zoomToFitDots(allDotIds);
                console.log('[Zoom-to-fit] Zoom-to-fit completed after import');
            }, 200);
        } else {
            console.log('[Zoom-to-fit] No dots found after import');
        }
    }

    async handleDataRequest(fromApp, query) {
        if (!this.appState) {
            return { error: 'State not initialized' };
        }

        switch (query.type) {
            case 'get-coordinates':
                const currentPageData = this.stateModule.getDotsForPage(
                    this.appState.currentPdfPage
                );
                return {
                    coordinates: Array.from(currentPageData.values()).map(dot => ({
                        id: dot.internalId,
                        x: dot.x,
                        y: dot.y,
                        locationNumber: dot.locationNumber
                    }))
                };
            case 'get-locations':
                const allLocations = [];
                for (const [pageNum, pageData] of this.appState.dotsByPage.entries()) {
                    for (const dot of pageData.dots.values()) {
                        allLocations.push(Object.assign({}, dot, { page: pageNum }));
                    }
                }
                return { locations: allLocations };
            case 'get-status':
                return {
                    currentPage: this.appState.currentPdfPage,
                    totalPages: this.appState.totalPages,
                    totalDots: Array.from(this.appState.dotsByPage.values()).reduce(
                        (total, page) => total + page.dots.size,
                        0
                    ),
                    activeMarkerType: this.appState.activeMarkerType
                };
            case 'get-sign-types':
                // Return marker types as sign types for Design Slayer
                return {
                    signTypes: this.appState.markerTypes || {}
                };
            case 'get-sign-type-details':
                // Return details for a specific sign type
                const signType = this.appState.markerTypes
                    ? this.appState.markerTypes[query.code]
                    : null;
                return {
                    signType: signType || null
                };
            case 'create-sign-type':
                // Create a new sign type (marker type)
                if (!query.signType || !query.signType.code || !query.signType.name) {
                    return { error: 'Missing sign type data' };
                }

                // Add the new marker type
                if (!this.appState.markerTypes) {
                    this.appState.markerTypes = {};
                }

                this.appState.markerTypes[query.signType.code] = {
                    code: query.signType.code,
                    name: query.signType.name,
                    color: query.signType.color || '#F72020',
                    textColor: query.signType.textColor || '#FFFFFF',
                    designReference: null
                };

                // Update the marker type dropdown
                updateMarkerTypeSelect();

                // Broadcast the creation
                if (window.appBridge) {
                    window.appBridge.broadcast('sign-type:created', query.signType);
                }

                return { success: true, signType: this.appState.markerTypes[query.signType.code] };
            case 'get-all-locations':
                // Return all locations with full details for Thumbnail Slayer
                const detailedLocations = [];

                // Check if state is properly initialized
                if (!this.appState.dotsByPage) {
                    return {
                        locations: [],
                        markerTypes: {},
                        pageNames: {},
                        pageInfo: { totalPages: 0, pageLabels: [] },
                        globalFlagConfiguration: null
                    };
                }

                for (const [pageNum, pageData] of this.appState.dotsByPage.entries()) {
                    const pageName = this.appState.pageNames
                        ? this.appState.pageNames.get(pageNum) || `Page ${pageNum}`
                        : `Page ${pageNum}`;

                    for (const dot of pageData.dots.values()) {
                        detailedLocations.push({
                            id: dot.internalId,
                            locationNumber: dot.locationNumber,
                            pageNumber: pageNum,
                            sheetName: pageName,
                            message: dot.message || '',
                            message2: dot.message2 || '',
                            markerType: dot.markerType || 'default',
                            markerTypeInfo: this.appState.markerTypes
                                ? this.appState.markerTypes[dot.markerType] || {}
                                : {},
                            x: dot.x,
                            y: dot.y,
                            installed: dot.installed || false,
                            notes: dot.notes || '',
                            // Include the actual flags data!
                            flags: dot.flags || {
                                topLeft: false,
                                topRight: false,
                                bottomLeft: false,
                                bottomRight: false
                            }
                        });
                    }
                }
                return {
                    locations: detailedLocations,
                    markerTypes: this.appState.markerTypes || {},
                    pageNames: this.appState.pageNames
                        ? Object.fromEntries(this.appState.pageNames)
                        : {},
                    pageInfo: {
                        totalPages: this.appState.totalPages || 0,
                        pageLabels: this.appState.pageLabels
                            ? Array.from(this.appState.pageLabels.entries()).map(
                                  ([num, label]) => ({ pageNumber: num, label: label })
                              )
                            : []
                    },
                    // Include global flag configuration so Thumbnail Slayer can use proper names
                    globalFlagConfiguration: this.appState.globalFlagConfiguration || null
                };
            case 'update-dot':
                // Update a dot's properties from external apps
                if (!query.locationId || !query.updates) {
                    return { error: 'Missing locationId or updates' };
                }

                // Find the dot by ID across all pages
                let foundDot = null;
                let foundPage = null;

                for (const [pageNum, pageData] of this.appState.dotsByPage.entries()) {
                    for (const dot of pageData.dots.values()) {
                        if (dot.internalId === query.locationId) {
                            foundDot = dot;
                            foundPage = pageNum;
                            break;
                        }
                    }
                    if (foundDot) break;
                }

                if (!foundDot) {
                    return { error: 'Dot not found' };
                }

                // Update the dot properties
                // Handle flag fields specially - ensure they update the flags object
                if (
                    query.updates.topLeft !== undefined ||
                    query.updates.topRight !== undefined ||
                    query.updates.bottomLeft !== undefined ||
                    query.updates.bottomRight !== undefined
                ) {
                    // Initialize flags if not present
                    if (!foundDot.flags) {
                        foundDot.flags = {
                            topLeft: false,
                            topRight: false,
                            bottomLeft: false,
                            bottomRight: false
                        };
                    }

                    // Update individual flag fields
                    if (query.updates.topLeft !== undefined) {
                        foundDot.flags.topLeft = query.updates.topLeft;
                    }
                    if (query.updates.topRight !== undefined) {
                        foundDot.flags.topRight = query.updates.topRight;
                    }
                    if (query.updates.bottomLeft !== undefined) {
                        foundDot.flags.bottomLeft = query.updates.bottomLeft;
                    }
                    if (query.updates.bottomRight !== undefined) {
                        foundDot.flags.bottomRight = query.updates.bottomRight;
                    }

                    // Remove flag fields from updates to avoid direct assignment
                    const cleanedUpdates = { ...query.updates };
                    delete cleanedUpdates.topLeft;
                    delete cleanedUpdates.topRight;
                    delete cleanedUpdates.bottomLeft;
                    delete cleanedUpdates.bottomRight;

                    // Apply other updates
                    Object.assign(foundDot, cleanedUpdates);
                } else {
                    // Normal update for non-flag fields
                    Object.assign(foundDot, query.updates);
                }

                // Re-render if on current page
                if (foundPage === this.appState.currentPdfPage) {
                    // Try to update just the single dot first
                    const updated = updateSingleDot(query.locationId);
                    if (!updated) {
                        // Fallback to full re-render if single update fails
                        renderDotsForCurrentPage();
                    }
                }

                // Mark as dirty
                if (this.stateModule && this.stateModule.setDirtyState) {
                    this.stateModule.setDirtyState();
                }

                // Broadcast update event
                if (window.appBridge) {
                    window.appBridge.broadcast('marker:updated', {
                        locationId: query.locationId,
                        updates: query.updates
                    });
                }

                return { success: true };
            case 'get-marker-types':
                return { markerTypes: this.appState.markerTypes };
            case 'get-marker-type-details':
                const markerType = this.appState.markerTypes[query.code];
                return markerType ? { markerType } : { error: 'Marker type not found' };
            case 'create-marker-type':
                if (
                    query.markerType &&
                    query.markerType.code &&
                    !this.appState.markerTypes[query.markerType.code]
                ) {
                    this.appState.markerTypes[query.markerType.code] = {
                        code: query.markerType.code,
                        name: query.markerType.name || 'Unnamed Marker Type',
                        color: query.markerType.color || '#F72020',
                        textColor: query.markerType.textColor || '#FFFFFF',
                        designReference: null
                    };

                    // Set as active if no active type
                    if (!this.appState.activeMarkerType) {
                        this.appState.activeMarkerType = query.markerType.code;
                    }

                    // Update UI if available
                    updateFilterCheckboxes();
                    updateEditModalOptions();

                    // Broadcast marker type created event
                    if (window.appBridge) {
                        window.appBridge.broadcast('marker-type:created', {
                            code: query.markerType.code,
                            markerType: this.appState.markerTypes[query.markerType.code]
                        });
                    }

                    return {
                        success: true,
                        markerType: this.appState.markerTypes[query.markerType.code]
                    };
                } else {
                    return { error: 'Invalid marker type data or code already exists' };
                }
            case 'get-page-image':
                // Return PDF page canvas data for Map Location Preview
                try {
                    const pageNum = query.pageNumber || this.appState.currentPdfPage;

                    if (!this.appState.pdfDoc) {
                        return { error: 'No PDF loaded' };
                    }

                    if (pageNum < 1 || pageNum > this.appState.totalPages) {
                        return { error: 'Invalid page number' };
                    }

                    // Get the PDF page
                    const page = await this.appState.pdfDoc.getPage(pageNum);
                    const scale = query.scale || 2.0; // Default scale for preview
                    const viewport = page.getViewport({ scale });

                    // Create a canvas for rendering
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    // Render the PDF page to canvas
                    const renderTask = page.render({
                        canvasContext: context,
                        viewport: viewport
                    });

                    await renderTask.promise;

                    // Convert canvas to data URL
                    const imageData = canvas.toDataURL('image/png');

                    return {
                        success: true,
                        pageNumber: pageNum,
                        imageData,
                        dimensions: {
                            width: viewport.width,
                            height: viewport.height
                        },
                        scale,
                        pageName: this.appState.pageNames
                            ? this.appState.pageNames.get(pageNum) || `Page ${pageNum}`
                            : `Page ${pageNum}`
                    };
                } catch (error) {
                    console.error('Error rendering PDF page:', error);
                    return { error: 'Failed to render PDF page: ' + error.message };
                }
            default:
                return { error: 'Unknown query type' };
        }
    }

    async getExportData() {
        if (!this.appState) {
            throw new Error('State not initialized');
        }

        // Serialize dots data
        const serializedDotsByPage = {};
        for (const [pageNum, pageData] of this.appState.dotsByPage.entries()) {
            serializedDotsByPage[pageNum] = {
                dots: Array.from(pageData.dots.values())
            };
        }

        // Serialize annotation lines
        const serializedAnnotationLines = {};
        for (const [pageNum, linesMap] of this.appState.annotationLines.entries()) {
            serializedAnnotationLines[pageNum] = Array.from(linesMap.values());
        }

        // Convert page labels Map to object
        const pageLabelsObj = {};
        for (const [pageNum, label] of this.appState.pageLabels.entries()) {
            pageLabelsObj[pageNum] = label;
        }

        return {
            appState: {
                dotsByPage: serializedDotsByPage,
                markerTypes: this.appState.markerTypes || {},
                globalFlagConfiguration: this.appState.globalFlagConfiguration || null,
                customIconLibrary: this.appState.customIconLibrary || [],
                nextInternalId: this.appState.nextInternalId || 1,
                dotSize: this.appState.dotSize || 1,
                currentPdfPage: this.appState.currentPdfPage || 1,
                totalPages: this.appState.totalPages || 0,
                pageLabels: pageLabelsObj,
                recentSearches: this.appState.recentSearches || [],
                automapExactPhrase:
                    this.appState.automapExactPhrase !== undefined
                        ? this.appState.automapExactPhrase
                        : true,
                scrapeHorizontalTolerance: this.appState.scrapeHorizontalTolerance || 1,
                scrapeVerticalTolerance: this.appState.scrapeVerticalTolerance || 25,
                annotationLines: serializedAnnotationLines,
                showAnnotationEndpoints: this.appState.showAnnotationEndpoints || false,
                nextAnnotationId: this.appState.nextAnnotationId || 1,
                activeMarkerType: this.appState.activeMarkerType || null,
                sourcePdfBase64: this.appState.sourcePdfBase64 || null,
                pdfFileName: this.appState.sourcePdfName || this.appState.pdfFileName || null,
                sourcePdfName: this.appState.sourcePdfName || null, // Also include for backward compatibility
                pdfDimensions: this.appState.pdfDimensions || null,
                pageNames: this.appState.pageNames
                    ? Object.fromEntries(this.appState.pageNames)
                    : {},
                pageOffsets: this.appState.pageOffsets || {},
                pageRotations: this.appState.pageRotations || {},
                dotColorOverrides: this.appState.dotColorOverrides || {},
                dotMetadata: this.appState.dotMetadata || {},
                lastSearchTerm: this.appState.lastSearchTerm || '',
                mapTransform: this.appState.mapTransform || null,
                showMarkerSettings: this.appState.showMarkerSettings || {},
                selectedDots: this.appState.selectedDots
                    ? Array.from(this.appState.selectedDots)
                    : [],
                isDirty: false // Reset dirty state on export
            }
        };
    }

    setupNativeTooltips() {
        // Store all title attributes so we can toggle them
        this.tooltipElements = new Map();

        // Define all the native tooltips
        const tooltipDefinitions = [
            // Header buttons
            { selector: '#save-btn', title: 'Save project' },
            { selector: '#load-btn', title: 'Load project' },

            // Marker type controls
            { selector: '#add-marker-type-btn', title: 'Add a new marker type' },
            { selector: '#import-marker-types-btn', title: 'Import marker types from file' },
            { selector: '#export-marker-types-btn', title: 'Export marker types to file' },
            { selector: '.ms-marker-type-item', title: 'Right-click to set Sign Template' },

            // List controls
            { selector: '#sort-toggle-btn', title: 'Toggle sort by location or name' },
            { selector: '#toggle-view-btn', title: 'Toggle grouped/ungrouped view' },
            { selector: '#all-pages-checkbox', title: 'Show locations from all pages' },

            // Find/Replace
            { selector: '#find-all-btn', title: 'Find all matching text' },
            { selector: '#find-input', title: 'Enter text to search for' },
            { selector: '#replace-input', title: 'Enter replacement text' },
            { selector: '#replace-btn', title: 'Replace all occurrences' },

            // Control buttons
            { selector: '#help-btn', title: 'Show keyboard shortcuts and controls' },
            { selector: '#toggle-locations-btn', title: 'Show/hide location numbers' },
            { selector: '#toggle-messages-btn', title: 'Show/hide message 1' },
            { selector: '#toggle-messages2-btn', title: 'Show/hide message 2' },
            { selector: '#toggle-inst-display-btn', title: 'Cycle installed display modes' },
            { selector: '#renumber-btn', title: 'Renumber all locations sequentially' },
            { selector: '#dotcam-btn', title: 'Focus camera on selected location' },

            // Navigation
            { selector: '#prev-page', title: 'Previous page' },
            { selector: '#next-page', title: 'Next page' },
            { selector: '#page-label-input', title: 'Set custom page label' },

            // Crop controls
            { selector: '#crop-toggle-btn', title: 'Toggle crop mode' },
            { selector: '#crop-all-pages-checkbox', title: 'Apply crop to all pages' },

            // Scrape controls
            { selector: '#h-tolerance-input', title: 'Horizontal text grouping distance' },
            { selector: '#v-tolerance-input', title: 'Vertical text grouping distance' },
            { selector: '#dot-size-slider', title: 'Adjust location dot size' },

            // Automap
            { selector: '#automap-text-input', title: 'Text to search and map' },
            { selector: '#automap-exact-phrase', title: 'Match exact phrase only' },
            { selector: '#single-automap-btn', title: 'Find and map all occurrences' },

            // Export buttons
            { selector: '#create-pdf-btn', title: 'Create detailed PDF report' },
            { selector: '#create-schedule-btn', title: 'Export CSV message schedule' },
            { selector: '#update-from-schedule-btn', title: 'Import updates from CSV' },
            { selector: '#export-html-btn', title: 'Export interactive HTML report' },

            // Modal buttons and fields
            { selector: '#delete-dot-btn', title: 'Delete this location' },
            { selector: '#cancel-modal-btn', title: 'Cancel without saving' },
            { selector: '#update-dot-btn', title: 'Save changes' },
            { selector: '#edit-installed', title: 'Mark as installed' },
            { selector: '#edit-location-number', title: 'Change location number' },
            { selector: '#edit-notes', title: 'Add notes for this location' },

            // Gallery buttons
            { selector: '#gallery-add-btn', title: 'Add photo to location' },
            { selector: '#gallery-close-btn', title: 'Remove photo from location' },

            // Group edit buttons and fields
            { selector: '#group-delete-btn', title: 'Delete all selected locations' },
            { selector: '#group-cancel-btn', title: 'Cancel without changes' },
            { selector: '#group-update-btn', title: 'Apply changes to all selected' },
            { selector: '#group-edit-installed', title: 'Mark all as installed' },
            { selector: '#group-edit-notes', title: 'Set notes for all selected locations' },

            // Other modal buttons
            { selector: '#flag-save-btn', title: 'Save flag configuration' },
            { selector: '#cancel-renumber-btn', title: 'Cancel renumbering' },
            { selector: '#cancel-automap-btn', title: 'Cancel automap operation' },
            { selector: '#close-automap-btn', title: 'Close results' },
            { selector: '#cancel-pdf-export-btn', title: 'Cancel PDF export' },
            { selector: '#guide-btn', title: 'Open full user guide' },
            { selector: '#tooltips-btn', title: 'Toggle tooltips on/off' },
            { selector: '#close-controls-modal-btn', title: 'Close this dialog' },

            // Panel controls
            { selector: '#left-panel-collapse-btn', title: 'Collapse/expand left panel' }
        ];

        // Store the title attributes
        tooltipDefinitions.forEach(def => {
            const element = document.querySelector(def.selector);
            if (element) {
                this.tooltipElements.set(element, def.title);
            }
        });
    }

    toggleNativeTooltips() {
        this.tooltipsEnabled = !this.tooltipsEnabled;
        const button = document.getElementById('tooltips-btn');

        if (this.tooltipsEnabled) {
            // Add all title attributes
            this.tooltipElements.forEach((title, element) => {
                element.setAttribute('title', title);
            });
            button?.classList.add('ms-active');
        } else {
            // Remove all title attributes
            this.tooltipElements.forEach((title, element) => {
                element.removeAttribute('title');
            });
            button?.classList.remove('ms-active');
        }
    }
}

export default MappingSlayerApp;
