/**
 * Sidekick - AI Interface for Mapping Slayer
 *
 * This module provides a clean JSON-based interface for AI agents to interact
 * with Mapping Slayer. AI can request current state, modify it, and apply changes
 * back to the application.
 *
 * Usage:
 * - AI requests: const state = window.sidekick.getStateJSON()
 * - AI modifies the JSON
 * - AI applies: window.sidekick.applyStateJSON(modifiedState)
 */

(function () {
    'use strict';

    // Wait for Mapping Slayer to be fully loaded
    function initializeSidekick() {
        // Check if required globals are available
        if (!window.mappingApp || !window.appState) {
            setTimeout(initializeSidekick, 100);
            return;
        }

        console.log('🤖 Sidekick: Initializing AI interface for Mapping Slayer');

        // Store reference to last state for undo
        let lastStateBeforeAI = null;
        let previewMode = false;
        const operationHistory = [];

        /**
         * Main Sidekick interface
         */
        window.sidekick = {
            // ===== Core State Management =====

            /**
             * Get current application state as JSON
             * @param {Object} options - Export options
             * @returns {Object} Current state in JSON format
             */
            getStateJSON: function (options = {}) {
                try {
                    const exportData = window.mappingApp.exportData();

                    // Add metadata for AI context
                    exportData.metadata = {
                        currentPage: window.appState.currentPdfPage,
                        totalPages: window.appState.totalPages,
                        selectedDots: Array.from(window.appState.selectedDots),
                        dotCount: this.getDotCount(),
                        markerTypeCount: Object.keys(window.appState.markerTypes).length,
                        timestamp: new Date().toISOString()
                    };

                    // Optionally filter to current page only
                    if (options.currentPageOnly) {
                        const currentPage = window.appState.currentPdfPage;
                        const filteredState = { ...exportData };
                        filteredState.appState.dotsByPage = {
                            [currentPage]: exportData.appState.dotsByPage[currentPage]
                        };
                        return filteredState;
                    }

                    return exportData;
                } catch (error) {
                    console.error('🤖 Sidekick: Error getting state:', error);
                    return { error: error.message };
                }
            },

            /**
             * Apply modified JSON state back to the application
             * @param {Object} modifiedState - Modified state from AI
             * @param {Object} options - Apply options
             * @returns {Object} Result of the operation
             */
            applyStateJSON: function (modifiedState, options = {}) {
                try {
                    // Store current state for undo
                    if (!options.skipUndo) {
                        lastStateBeforeAI = this.getStateJSON();
                    }

                    // Validate the incoming state
                    const validation = this.validateState(modifiedState);
                    if (!validation.valid) {
                        return {
                            success: false,
                            error: 'Invalid state',
                            details: validation.errors
                        };
                    }

                    // Preview mode - don't actually apply
                    if (options.preview || previewMode) {
                        return this.previewChanges(modifiedState);
                    }

                    // Apply the state
                    window.mappingApp.importData(modifiedState);

                    // Record operation
                    this.recordOperation('applyState', modifiedState);

                    // Update UI
                    this.refreshUI();

                    return {
                        success: true,
                        message: 'State applied successfully',
                        changes: this.summarizeChanges(lastStateBeforeAI, modifiedState)
                    };
                } catch (error) {
                    console.error('🤖 Sidekick: Error applying state:', error);
                    return { success: false, error: error.message };
                }
            },

            // ===== Partial Updates =====

            /**
             * Update dots on specific page
             * @param {number} pageNum - Page number
             * @param {Array} dots - Modified dots array
             */
            updatePageDots: function (pageNum, dots) {
                try {
                    const pageData = window.appState.dotsByPage.get(pageNum);
                    if (!pageData) {
                        return { success: false, error: `Page ${pageNum} not found` };
                    }

                    // Clear existing dots
                    pageData.dots.clear();

                    // Add modified dots
                    dots.forEach(dot => {
                        pageData.dots.set(dot.internalId, dot);
                    });

                    // Mark dirty and refresh
                    window.appState.isDirty = true;
                    this.refreshUI();

                    return {
                        success: true,
                        message: `Updated ${dots.length} dots on page ${pageNum}`
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            /**
             * Update marker types
             * @param {Object} markerTypes - Modified marker types object
             */
            updateMarkerTypes: function (markerTypes) {
                try {
                    // Update marker types
                    window.appState.markerTypes = markerTypes;

                    // Trigger sync if available
                    if (window.triggerManualSync) {
                        window.triggerManualSync();
                    }

                    this.refreshUI();
                    return { success: true, message: 'Marker types updated' };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            // ===== Direct Actions =====

            /**
             * Run Automap It! function
             * @param {string} searchTerm - Optional search term
             */
            runAutomap: async function (searchTerm) {
                try {
                    if (searchTerm) {
                        const searchInput = document.getElementById('single-location-search');
                        if (searchInput) {
                            searchInput.value = searchTerm;
                        }
                    }

                    const { automapSingleLocation } = await import('./automap.js');
                    const result = await automapSingleLocation();

                    return {
                        success: true,
                        message: 'Automap completed',
                        result: result
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            /**
             * Select dots based on criteria
             * @param {Object} criteria - Selection criteria
             */
            selectDots: function (criteria) {
                try {
                    window.appState.selectedDots.clear();
                    const dots = window.getCurrentPageDots();
                    let selected = 0;

                    for (const [id, dot] of dots) {
                        let match = true;

                        // Check various criteria
                        if (criteria.ids && !criteria.ids.includes(dot.internalId)) {
                            match = false;
                        }
                        if (criteria.markerType && dot.markerType !== criteria.markerType) {
                            match = false;
                        }
                        if (criteria.message && !dot.message.includes(criteria.message)) {
                            match = false;
                        }
                        if (criteria.locationRange) {
                            const locNum = parseInt(dot.locationNumber);
                            if (
                                locNum < criteria.locationRange.start ||
                                locNum > criteria.locationRange.end
                            ) {
                                match = false;
                            }
                        }

                        if (match) {
                            window.appState.selectedDots.add(id);
                            selected++;
                        }
                    }

                    // Update UI to show selection
                    if (window.updateSelectionUI) {
                        window.updateSelectionUI();
                    }

                    return {
                        success: true,
                        message: `Selected ${selected} dots`,
                        selectedIds: Array.from(window.appState.selectedDots)
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            /**
             * Navigate to specific page
             * @param {number} pageNum - Page number
             */
            navigateToPage: function (pageNum) {
                try {
                    if (pageNum < 1 || pageNum > window.appState.totalPages) {
                        return { success: false, error: 'Invalid page number' };
                    }

                    window.appState.currentPdfPage = pageNum;
                    window.renderPDFPage(pageNum);
                    window.renderDotsForCurrentPage();

                    return { success: true, message: `Navigated to page ${pageNum}` };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            // ===== Utility Functions =====

            /**
             * Get dot count statistics
             */
            getDotCount: function () {
                let total = 0;
                const byPage = {};
                const byMarkerType = {};

                for (const [pageNum, pageData] of window.appState.dotsByPage) {
                    const pageDots = pageData.dots.size;
                    total += pageDots;
                    byPage[pageNum] = pageDots;

                    for (const dot of pageData.dots.values()) {
                        byMarkerType[dot.markerType] = (byMarkerType[dot.markerType] || 0) + 1;
                    }
                }

                return { total, byPage, byMarkerType };
            },

            /**
             * Validate state structure
             */
            validateState: function (state) {
                const errors = [];

                if (!state.appState) {
                    errors.push('Missing appState');
                }
                if (!state.appState?.dotsByPage) {
                    errors.push('Missing dotsByPage');
                }
                if (!state.appState?.markerTypes) {
                    errors.push('Missing markerTypes');
                }

                // Validate dot structure
                if (state.appState?.dotsByPage) {
                    for (const [pageNum, pageData] of Object.entries(state.appState.dotsByPage)) {
                        if (!pageData.dots || !Array.isArray(pageData.dots)) {
                            errors.push(`Invalid dots array for page ${pageNum}`);
                        }
                    }
                }

                return {
                    valid: errors.length === 0,
                    errors: errors
                };
            },

            /**
             * Preview changes without applying
             */
            previewChanges: function (modifiedState) {
                const current = this.getStateJSON();
                const changes = this.summarizeChanges(current, modifiedState);

                return {
                    success: true,
                    preview: true,
                    changes: changes,
                    message: 'Preview mode - changes not applied'
                };
            },

            /**
             * Summarize changes between two states
             */
            summarizeChanges: function (oldState, newState) {
                const changes = {
                    dots: { added: 0, modified: 0, removed: 0 },
                    markerTypes: { added: 0, modified: 0, removed: 0 },
                    pages: []
                };

                // Compare dots
                if (oldState?.appState?.dotsByPage && newState?.appState?.dotsByPage) {
                    const oldPages = oldState.appState.dotsByPage;
                    const newPages = newState.appState.dotsByPage;

                    for (const pageNum in newPages) {
                        if (!oldPages[pageNum]) {
                            changes.pages.push(`Added page ${pageNum}`);
                        }
                    }
                }

                return changes;
            },

            /**
             * Record operation for history
             */
            recordOperation: function (type, data) {
                operationHistory.push({
                    type: type,
                    data: data,
                    timestamp: new Date().toISOString()
                });

                // Keep only last 50 operations
                if (operationHistory.length > 50) {
                    operationHistory.shift();
                }
            },

            /**
             * Refresh UI after changes
             */
            refreshUI: function () {
                if (window.renderDotsForCurrentPage) {
                    window.renderDotsForCurrentPage();
                }
                if (window.updateAllSectionsForCurrentPage) {
                    window.updateAllSectionsForCurrentPage();
                }
                if (window.updateLocationList) {
                    window.updateLocationList();
                }
            },

            // ===== Undo/Redo =====

            /**
             * Undo last AI operation
             */
            undo: function () {
                if (!lastStateBeforeAI) {
                    return { success: false, error: 'No operation to undo' };
                }

                const result = this.applyStateJSON(lastStateBeforeAI, { skipUndo: true });
                if (result.success) {
                    lastStateBeforeAI = null;
                    return { success: true, message: 'Undo successful' };
                }
                return result;
            },

            // ===== Status and Info =====

            /**
             * Get current status and capabilities
             */
            getStatus: function () {
                return {
                    ready: true,
                    version: '1.0.0',
                    capabilities: [
                        'getStateJSON',
                        'applyStateJSON',
                        'updatePageDots',
                        'updateMarkerTypes',
                        'runAutomap',
                        'selectDots',
                        'navigateToPage',
                        'undo'
                    ],
                    currentPage: window.appState.currentPdfPage,
                    totalPages: window.appState.totalPages,
                    dotCount: this.getDotCount(),
                    hasUndo: lastStateBeforeAI !== null,
                    previewMode: previewMode
                };
            },

            /**
             * Enable/disable preview mode
             */
            setPreviewMode: function (enabled) {
                previewMode = enabled;
                return { success: true, previewMode: previewMode };
            },

            /**
             * Get operation history
             */
            getHistory: function () {
                return operationHistory;
            },

            // ===== PDF Rasterization =====

            /**
             * Extract current PDF page as image data
             * AI agents can use this to get visual context of the PDF
             */
            extractPDFPage: function (pageNum) {
                try {
                    const canvas = document.getElementById('pdf-canvas');
                    if (!canvas) {
                        return { success: false, error: 'PDF canvas not found' };
                    }

                    const currentPage = pageNum || window.appState.currentPdfPage || 1;
                    const pdfName = window.appState.sourcePdfName || 'unnamed.pdf';

                    // Remove .pdf extension and create filename
                    const baseName = pdfName.replace(/\.pdf$/i, '');
                    const filename = `${baseName}_page_${currentPage}.png`;

                    // Get image data
                    const dataURL = canvas.toDataURL('image/png');

                    console.log(`Extracted ${filename} - ${dataURL.length} bytes`);

                    return {
                        success: true,
                        filename: filename,
                        page: currentPage,
                        pdfName: pdfName,
                        width: canvas.width,
                        height: canvas.height,
                        dataURL: dataURL,
                        suggestedPath: `apps/mapping_slayer/raster-map-pages/${filename}`
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            /**
             * Save extracted page to downloads (since we can't write directly to project folder)
             * The user will need to move it to raster-map-pages folder manually
             */
            downloadExtractedPage: function (pageNum) {
                try {
                    // First extract the page
                    const extracted = this.extractPDFPage(pageNum);
                    if (!extracted.success) {
                        return extracted;
                    }

                    // Convert base64 to blob
                    const base64Data = extracted.dataURL.split(',')[1];
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);

                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }

                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/png' });

                    // Create download link
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = extracted.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    console.log(`Downloaded: ${extracted.filename}`);
                    console.log(`Please move to: ${extracted.suggestedPath}`);

                    return {
                        success: true,
                        message: `Downloaded ${extracted.filename} to Downloads folder`,
                        filename: extracted.filename,
                        suggestedPath: extracted.suggestedPath,
                        note: 'Please move the file to the raster-map-pages folder'
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            /**
             * Extract and download all PDF pages
             */
            downloadAllPDFPages: async function () {
                try {
                    const totalPages = window.appState.totalPages;
                    const originalPage = window.appState.currentPdfPage;
                    const results = [];

                    console.log(`Starting extraction of ${totalPages} pages...`);

                    for (let i = 1; i <= totalPages; i++) {
                        // Navigate to page
                        this.navigateToPage(i);

                        // Wait for render
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Download page
                        const result = this.downloadExtractedPage(i);
                        results.push(result);

                        console.log(`Page ${i}/${totalPages} complete`);

                        // Small delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Return to original page
                    this.navigateToPage(originalPage);

                    return {
                        success: true,
                        message: `Downloaded ${results.length} pages to Downloads folder`,
                        pages: results,
                        note: 'Please move files to apps/mapping_slayer/raster-map-pages/'
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            // ===== File System Access API Methods =====

            /**
             * Let user pick a directory for saving raster pages
             * Uses File System Access API (requires user interaction)
             */
            pickSaveDirectory: async function () {
                try {
                    // Check if File System Access API is available
                    if (!window.showDirectoryPicker) {
                        return {
                            success: false,
                            error: 'File System Access API not supported in this browser',
                            note: 'Try Chrome, Edge, or Opera'
                        };
                    }

                    // Request directory access
                    const dirHandle = await window.showDirectoryPicker({
                        mode: 'readwrite',
                        startIn: 'documents'
                    });

                    // Store the handle for later use
                    this._dirHandle = dirHandle;

                    console.log(`Selected directory: ${dirHandle.name}`);

                    return {
                        success: true,
                        directoryName: dirHandle.name,
                        message: 'Directory selected successfully'
                    };
                } catch (error) {
                    if (error.name === 'AbortError') {
                        return { success: false, error: 'User cancelled directory selection' };
                    }
                    return { success: false, error: error.message };
                }
            },

            /**
             * Save extracted page directly to selected directory
             * Requires pickSaveDirectory to be called first
             */
            savePageToDirectory: async function (pageNum) {
                try {
                    if (!this._dirHandle) {
                        return {
                            success: false,
                            error: 'No directory selected. Call pickSaveDirectory() first'
                        };
                    }

                    // Extract the page
                    const extracted = this.extractPDFPage(pageNum);
                    if (!extracted.success) {
                        return extracted;
                    }

                    // Convert base64 to blob
                    const base64Data = extracted.dataURL.split(',')[1];
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);

                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }

                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/png' });

                    // Create file in directory
                    const fileHandle = await this._dirHandle.getFileHandle(extracted.filename, {
                        create: true
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    console.log(`Saved ${extracted.filename} to selected directory`);

                    return {
                        success: true,
                        filename: extracted.filename,
                        message: `Saved ${extracted.filename} directly to selected directory`
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },

            /**
             * Save all PDF pages to selected directory
             */
            saveAllPagesToDirectory: async function () {
                try {
                    if (!this._dirHandle) {
                        // Prompt user to select directory first
                        const dirResult = await this.pickSaveDirectory();
                        if (!dirResult.success) {
                            return dirResult;
                        }
                    }

                    const totalPages = window.appState.totalPages;
                    const originalPage = window.appState.currentPdfPage;
                    const results = [];

                    console.log(`Saving ${totalPages} pages to selected directory...`);

                    for (let i = 1; i <= totalPages; i++) {
                        // Navigate to page
                        this.navigateToPage(i);

                        // Wait for render
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Save page
                        const result = await this.savePageToDirectory(i);
                        results.push(result);

                        console.log(`Page ${i}/${totalPages} complete`);

                        // Small delay between saves
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }

                    // Return to original page
                    this.navigateToPage(originalPage);

                    return {
                        success: true,
                        message: `Saved ${results.length} pages to selected directory`,
                        pages: results
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
        };

        // Add to window for debugging
        window.sidekick._internal = {
            lastStateBeforeAI,
            operationHistory
        };

        console.log('🤖 Sidekick: Interface ready. Access via window.sidekick');
        console.log('🤖 Sidekick: Try sidekick.getStatus() to see available commands');
    }

    // Initialize when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSidekick);
    } else {
        initializeSidekick();
    }
})();
