// flag-ui.js - UI functionality for the flag customization system

import { appState } from './state.js';
import {
    FLAG_SYMBOLS,
    FLAG_POSITIONS,
    getDefaultFlagConfig,
    getNextSymbol,
    getPreviousSymbol,
    getSymbolInfo
} from './flag-config.js';
import { renderDotsForCurrentPage } from './map-controller.js';

let currentMarkerTypeForFlags = null;

// Initialize global flag configuration if it doesn't exist
export function initializeGlobalFlags() {
    if (!appState.globalFlagConfiguration) {
        appState.globalFlagConfiguration = getDefaultFlagConfig();
    }
    return appState.globalFlagConfiguration;
}

// DEPRECATED - kept for compatibility but returns global config
export function initializeMarkerTypeFlags(markerTypeCode) {
    // Now just returns the global configuration
    return initializeGlobalFlags();
}

// Open the flag customization modal
export function openFlagModal(markerTypeCode = null) {
    const modal = document.getElementById('flag-customization-modal');

    if (!modal) {
        console.error('Flag customization modal not found!');
        return;
    }

    // Initialize global flags if needed
    const flagConfig = initializeGlobalFlags();

    // Update modal header to show global flags
    const markerTypeSpan = modal.querySelector('.ms-flag-modal-marker-type');
    if (markerTypeSpan) {
        markerTypeSpan.textContent = 'All Marker Types';
    }

    // Update preview dot color to neutral
    const previewDot = modal.querySelector('.ms-flag-preview-dot');
    if (previewDot) {
        previewDot.style.background = '#888888';
    }

    // Update each corner's configuration
    Object.keys(FLAG_POSITIONS).forEach(key => {
        const position = FLAG_POSITIONS[key];
        updateFlagCornerUI(position, flagConfig[position]);
    });

    // Show modal
    modal.style.display = 'flex';
}

// Close the flag modal
export function closeFlagModal() {
    const modal = document.getElementById('flag-customization-modal');
    modal.style.display = 'none';
    currentMarkerTypeForFlags = null;
}

// Update the UI for a specific flag corner
function updateFlagCornerUI(position, config) {
    // Update name input
    const nameInput = document.querySelector(`.ms-flag-name-input[data-position="${position}"]`);
    if (nameInput) {
        nameInput.value = config.name || '';
    }

    // Update symbol display
    const symbolDisplay = document.querySelector(
        `.ms-flag-symbol-display[data-position="${position}"]`
    );
    if (symbolDisplay) {
        const symbolInfo = getSymbolInfo(config.symbol);
        symbolDisplay.textContent = symbolInfo.symbol || '';
        symbolDisplay.classList.toggle('ms-flag-active', config.symbol !== null);
    }
}

// Handle symbol navigation
export function handleFlagSymbolNavigation(position, direction) {
    // No longer checking for current marker type since flags are global

    const flagConfig = appState.globalFlagConfiguration;
    if (!flagConfig || !flagConfig[position]) return;

    const currentSymbol = flagConfig[position].symbol;
    const newSymbol =
        direction === 'next' ? getNextSymbol(currentSymbol) : getPreviousSymbol(currentSymbol);

    flagConfig[position].symbol = newSymbol;
    updateFlagCornerUI(position, flagConfig[position]);

    // Update preview on the dot
    updateFlagPreviewOnDot();
}

// Update flag preview on the center dot
function updateFlagPreviewOnDot() {
    // No longer checking for current marker type since flags are global

    const previewDot = document.querySelector('.ms-flag-preview-dot');
    if (!previewDot) return;

    // Remove existing flag previews
    previewDot.querySelectorAll('.ms-dot-flag-preview').forEach(el => el.remove());

    const flagConfig = appState.globalFlagConfiguration;
    if (!flagConfig) return;

    // Add flag previews for each position
    Object.keys(FLAG_POSITIONS).forEach(key => {
        const position = FLAG_POSITIONS[key];
        const config = flagConfig[position];

        if (config.symbol) {
            const symbolInfo = getSymbolInfo(config.symbol);
            const flagEl = document.createElement('div');
            flagEl.className = `ms-dot-flag-preview ms-dot-flag-preview-${position}`;
            flagEl.textContent = symbolInfo.symbol;
            flagEl.style.position = 'absolute';
            flagEl.style.fontSize = '16px';
            flagEl.style.lineHeight = '1';

            // Position the flag
            switch (position) {
                case 'topLeft':
                    flagEl.style.top = '-12px';
                    flagEl.style.left = '-12px';
                    break;
                case 'topRight':
                    flagEl.style.top = '-12px';
                    flagEl.style.right = '-12px';
                    break;
                case 'bottomLeft':
                    flagEl.style.bottom = '-12px';
                    flagEl.style.left = '-12px';
                    break;
                case 'bottomRight':
                    flagEl.style.bottom = '-12px';
                    flagEl.style.right = '-12px';
                    break;
            }

            previewDot.appendChild(flagEl);
        }
    });
}

// Save flag configuration
export function saveFlagConfiguration() {
    // No longer checking for current marker type since flags are global

    const flagConfig = appState.globalFlagConfiguration;
    if (!flagConfig) return;

    // Update names from inputs
    Object.keys(FLAG_POSITIONS).forEach(key => {
        const position = FLAG_POSITIONS[key];
        const nameInput = document.querySelector(
            `.ms-flag-name-input[data-position="${position}"]`
        );
        if (nameInput) {
            flagConfig[position].name = nameInput.value || `Flag ${key + 1}`;
        }
    });

    // Trigger update of all dots with this marker type
    updateAllDotsWithMarkerType(currentMarkerTypeForFlags);

    closeFlagModal();
}

// Apply flag configuration to all marker types
// DEPRECATED - no longer needed with global flags
export function applyFlagConfigToAll() {
    // This function is no longer needed since flags are global
    // Just save and close
    saveFlagConfiguration();
    closeFlagModal();
}

// Update all dots with a specific marker type
function updateAllDotsWithMarkerType(markerTypeCode) {
    renderDotsForCurrentPage();
}

// Update all dots
function updateAllDots() {
    renderDotsForCurrentPage();
}

// Initialize event listeners
export function initializeFlagUI() {
    // Close button
    const closeBtn = document.querySelector('#flag-customization-modal .ms-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeFlagModal);
    }

    // Save button
    const saveBtn = document.getElementById('flag-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveFlagConfiguration);
    }

    // Apply to all button - DEPRECATED with global flags
    // const applyAllBtn = document.getElementById('flag-apply-all-btn');
    // if (applyAllBtn) {
    //     applyAllBtn.addEventListener('click', applyFlagConfigToAll);
    // }

    // Symbol navigation buttons
    document.querySelectorAll('.ms-flag-prev-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const position = e.target.dataset.position;
            handleFlagSymbolNavigation(position, 'prev');
        });
    });

    document.querySelectorAll('.ms-flag-next-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const position = e.target.dataset.position;
            handleFlagSymbolNavigation(position, 'next');
        });
    });

    // Name input changes
    document.querySelectorAll('.ms-flag-name-input').forEach(input => {
        input.addEventListener('input', e => {
            // No longer checking for current marker type since flags are global
            const position = e.target.dataset.position;
            const flagConfig = appState.globalFlagConfiguration;
            if (flagConfig && flagConfig[position]) {
                flagConfig[position].name = e.target.value;
            }
        });
    });

    // Click outside to close
    const modal = document.getElementById('flag-customization-modal');
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                closeFlagModal();
            }
        });
    }
}

// Export functions for global access
window.openFlagModal = openFlagModal;
window.closeFlagModal = closeFlagModal;
