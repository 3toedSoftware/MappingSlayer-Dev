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
