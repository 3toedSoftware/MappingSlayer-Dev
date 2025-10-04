// ui.js - Fixed version with proper syntax
/* global Pickr, EyeDropper */

// Import the state system
import {
    appState,
    getCurrentPageDots,
    getDotsForPage,
    setDirtyState,
    getCurrentPageData,
    CommandUndoManager,
    getCurrentPageAnnotationLines
} from './state.js';
import {
    renderDotsForCurrentPage,
    renderPDFPage,
    centerOnDot,
    applyMapTransform,
    updateSingleDot,
    updateViewportDotsThrottled
} from './map-controller.js';
import {
    AddDotCommand,
    DeleteDotCommand,
    EditDotCommand,
    MoveDotCommand,
    CompositeCommand,
    AddAnnotationLineCommand,
    DeleteAnnotationLineCommand,
    MoveAnnotationLineEndpointCommand
} from './command-undo.js';
import { cropTool } from './crop-tool.js';
import {
    getSymbolInfo,
    FLAG_POSITIONS,
    initializeDotFlags,
    migrateDotToFlags,
    getNextSymbol
} from './flag-config.js';
import { initializeMarkerTypeFlags, openFlagModal } from './flag-ui.js';

const previewTimeout = null;

// DOTCAM mode state
let isDotcamMode = false;

// Performance optimization: Cache dot counts by marker type
const dotCountCache = new Map(); // markerType -> count
let dotCountCacheValid = false;

// Performance optimization: Track marker type UI elements
const markerTypeElements = new Map(); // markerType -> DOM element

// Function to force clear the marker type element cache
function clearMarkerTypeElementCache() {
    markerTypeElements.clear();
    console.log('Marker type element cache cleared');
}

// Performance optimization: Debounce marker checkbox updates
let updateCheckboxesTimeout = null;
const UPDATE_CHECKBOXES_DELAY = 100; // ms

// Invalidate dot count cache when dots change
function invalidateDotCountCache() {
    dotCountCacheValid = false;
}

// Get dot count for a marker type (with caching)
function getDotCountForMarkerType(markerType) {
    if (!dotCountCacheValid) {
        // Rebuild the entire cache
        dotCountCache.clear();
        const dots = getCurrentPageDots();
        for (const dot of dots.values()) {
            const count = dotCountCache.get(dot.markerType) || 0;
            dotCountCache.set(dot.markerType, count + 1);
        }
        dotCountCacheValid = true;
    }
    return dotCountCache.get(markerType) || 0;
}

function showCSVStatus(message, isSuccess = true, duration = 5000) {
    const statusDiv = document.getElementById('csv-status');
    const contentDiv = document.getElementById('csv-status-content');
    if (statusDiv && contentDiv) {
        contentDiv.textContent = message;
        statusDiv.className = 'ms-csv-status ms-visible ' + (isSuccess ? 'ms-success' : 'ms-error');
        setTimeout(() => statusDiv.classList.remove('ms-visible'), duration);
    }
}

function updatePageInfo() {
    if (!appState.pdfDoc) return;
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (pageInfo) {
        pageInfo.textContent = 'PAGE ' + appState.currentPdfPage + ' OF ' + appState.totalPages;
    }
    if (prevBtn) {
        prevBtn.disabled = appState.currentPdfPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = appState.currentPdfPage >= appState.totalPages;
    }
}

function updatePageLabelInput() {
    const labelInput = document.getElementById('page-label-input');
    if (labelInput) {
        const currentLabel = appState.pageLabels.get(appState.currentPdfPage) || '';
        labelInput.value = currentLabel;
    }
}

function updateAllSectionsForCurrentPage() {
    // Invalidate cache when page changes or needs full update
    invalidateDotCountCache();
    updateFilterCheckboxes();
    updateLocationList();
    updateMapLegend();
    updateProjectLegend();
    updateEditModalOptions();
}

// Debounced version of updateFilterCheckboxes
function updateFilterCheckboxes() {
    if (updateCheckboxesTimeout) {
        clearTimeout(updateCheckboxesTimeout);
    }
    updateCheckboxesTimeout = setTimeout(() => {
        updateFilterCheckboxesImmediate();
    }, UPDATE_CHECKBOXES_DELAY);
}

// Force immediate update (bypasses debouncing)
function updateFilterCheckboxesImmediate() {
    const container = document.getElementById('filter-checkboxes');
    if (!container) return;

    const scrollPosition = container.scrollTop;

    const sortedMarkerTypeCodes = Object.keys(appState.markerTypes).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    if (sortedMarkerTypeCodes.length === 0) {
        container.innerHTML =
            '<div class="ms-empty-state" style="font-size: 12px; padding: 10px;">No marker types exist. Click + to add one.</div>';
        markerTypeElements.clear();
        return;
    }

    // Clear any empty state message if we have marker types
    const emptyState = container.querySelector('.ms-empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Determine which marker types need to be added/removed/updated
    const existingTypes = new Set(markerTypeElements.keys());
    const currentTypes = new Set(sortedMarkerTypeCodes);

    // Remove marker types that no longer exist
    for (const typeCode of existingTypes) {
        if (!currentTypes.has(typeCode)) {
            const element = markerTypeElements.get(typeCode);
            if (element) {
                element.remove();
                markerTypeElements.delete(typeCode);
            }
        }
    }

    // Update or add marker types
    sortedMarkerTypeCodes.forEach((markerTypeCode, index) => {
        const typeData = appState.markerTypes[markerTypeCode];
        const count = getDotCountForMarkerType(markerTypeCode);

        let item = markerTypeElements.get(markerTypeCode);

        if (item) {
            // Update existing element
            // Count labels removed - counts shown in legend and list

            // Update active state
            if (markerTypeCode === appState.activeMarkerType) {
                item.classList.add('ms-legend-item-active');
            } else {
                item.classList.remove('ms-legend-item-active');
            }

            // Update design reference image if it exists
            const designRefEmpty = item.querySelector('.ms-design-reference-empty');
            const designRefFilled = item.querySelector('.ms-design-reference-filled');
            const designRefThumbnail = item.querySelector('.ms-design-reference-thumbnail');

            if (designRefEmpty && designRefFilled) {
                if (typeData.designReference) {
                    // Show the thumbnail
                    designRefEmpty.style.display = 'none';
                    designRefFilled.style.display = 'flex';
                    if (designRefThumbnail) {
                        designRefThumbnail.src = typeData.designReference;
                    } else {
                        // Create thumbnail if it doesn't exist
                        designRefFilled.innerHTML =
                            '<img class="ms-design-reference-thumbnail" src="' +
                            typeData.designReference +
                            '" alt="Design Reference"><button class="ms-design-reference-delete" type="button">&times;</button>';
                        // Re-setup handlers after modifying innerHTML
                        setupDesignReferenceHandlers(item, markerTypeCode);
                    }
                } else {
                    // Show the empty state
                    designRefEmpty.style.display = 'flex';
                    designRefFilled.style.display = 'none';
                }
            }

            // Check if design reference container exists, add if missing
            if (!item.querySelector('.ms-design-reference-container')) {
                // Add design reference container to existing element
                const markerTypeControls = item.querySelector('.ms-marker-type-controls');
                if (markerTypeControls) {
                    const designRefContainer = document.createElement('div');
                    designRefContainer.className = 'ms-design-reference-container';

                    const designRefSquare = document.createElement('div');
                    designRefSquare.className = 'ms-design-reference-square';
                    designRefSquare.setAttribute('data-marker-type', markerTypeCode);

                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'ms-design-reference-empty';
                    emptyDiv.style.display = typeData.designReference ? 'none' : 'flex';
                    emptyDiv.title = 'Click to upload design reference image';
                    emptyDiv.innerHTML = '<span class="ms-upload-plus-icon">+</span>';

                    const filledDiv = document.createElement('div');
                    filledDiv.className = 'ms-design-reference-filled';
                    filledDiv.style.display = typeData.designReference ? 'flex' : 'none';
                    if (typeData.designReference) {
                        filledDiv.innerHTML =
                            '<img class="ms-design-reference-thumbnail" src="' +
                            typeData.designReference +
                            '" alt="Design Reference"><button class="ms-design-reference-delete" type="button">&times;</button>';
                    }

                    designRefSquare.appendChild(emptyDiv);
                    designRefSquare.appendChild(filledDiv);

                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.className = 'ms-design-reference-input';
                    fileInput.accept = 'image/jpeg,image/jpg,image/png';
                    fileInput.style.display = 'none';
                    fileInput.setAttribute('data-marker-type', markerTypeCode);

                    designRefContainer.appendChild(designRefSquare);
                    designRefContainer.appendChild(fileInput);

                    // Insert before marker type controls
                    markerTypeControls.parentNode.insertBefore(
                        designRefContainer,
                        markerTypeControls
                    );

                    // Setup handlers for the new elements
                    setupDesignReferenceHandlers(item, markerTypeCode);
                }
            }

            // Move to correct position if needed
            const currentIndex = Array.from(container.children).indexOf(item);
            if (currentIndex !== index) {
                const nextSibling = container.children[index];
                if (nextSibling && nextSibling !== item) {
                    container.insertBefore(item, nextSibling);
                } else {
                    container.appendChild(item);
                }
            }
        } else {
            // Create new element
            item = document.createElement('div');
            item.className = 'ms-marker-type-item';
            if (markerTypeCode === appState.activeMarkerType) {
                item.classList.add('ms-legend-item-active');
            }

            // Build innerHTML with proper concatenation to avoid template literal issues
            const checkboxInput =
                '<input type="checkbox" data-marker-type-code="' +
                markerTypeCode +
                '" checked title="Show/hide this marker type">';
            // Count label removed - counts shown in legend and list
            const codeInput =
                '<input type="text" class="ms-marker-type-code-input" placeholder="Enter code..." title="Marker type code" value="' +
                markerTypeCode +
                '" data-original-code="' +
                markerTypeCode +
                '">';
            const nameInput =
                '<input type="text" class="ms-marker-type-name-input" placeholder="Enter name..." title="Marker type name" value="' +
                typeData.name +
                '" data-original-name="' +
                typeData.name +
                '" data-code="' +
                markerTypeCode +
                '">';
            const designRefSquare =
                '<div class="ms-design-reference-square" data-marker-type="' +
                markerTypeCode +
                '">' +
                '<div class="ms-design-reference-empty" style="display: ' +
                (typeData.designReference ? 'none' : 'flex') +
                ';" title="Click to upload design reference image"><span class="ms-upload-plus-icon">+</span></div>' +
                '<div class="ms-design-reference-filled" style="display: ' +
                (typeData.designReference ? 'flex' : 'none') +
                ';"><img class="ms-design-reference-thumbnail" src="' +
                (typeData.designReference || '') +
                '" alt="Design Reference"><button class="ms-design-reference-delete" type="button">&times;</button></div>' +
                '</div>';
            const fileInput =
                '<input type="file" class="ms-design-reference-input" accept="image/jpeg,image/jpg,image/png" style="display: none;" data-marker-type="' +
                markerTypeCode +
                '">';
            const colorPickers =
                '<div class="ms-color-picker-wrapper" data-marker-type-code="' +
                markerTypeCode +
                '" data-color-type="dot" title="Dot color"></div>' +
                '<div class="ms-color-picker-wrapper" data-marker-type-code="' +
                markerTypeCode +
                '" data-color-type="text" title="Text color"></div>';
            const deleteBtn =
                '<button class="ms-delete-marker-type-btn" data-marker-type-code="' +
                markerTypeCode +
                '" title="Delete marker type">×</button>';

            item.innerHTML =
                checkboxInput +
                '<div class="ms-marker-type-inputs">' +
                codeInput +
                nameInput +
                '</div>' +
                '<div class="ms-design-reference-container">' +
                designRefSquare +
                fileInput +
                '</div>' +
                '<div class="ms-marker-type-controls">' +
                colorPickers +
                deleteBtn +
                '</div>';

            setupDesignReferenceHandlers(item, markerTypeCode);

            const codeInputEl = item.querySelector('.ms-marker-type-code-input');
            const nameInputEl = item.querySelector('.ms-marker-type-name-input');

            resizeInput(codeInputEl);
            codeInputEl.addEventListener('input', () => resizeInput(codeInputEl));
            codeInputEl.addEventListener('focus', () => resizeInput(codeInputEl));
            codeInputEl.addEventListener('blur', () => resizeInput(codeInputEl));

            item.addEventListener('click', e => {
                // Only prevent selection when clicking the delete button
                if (e.target.closest('.ms-delete-marker-type-btn')) {
                    return;
                }
                // Don't prevent default for inputs and interactive elements - let them work normally
                // But still select the marker type
                appState.activeMarkerType = markerTypeCode;
                updateFilterCheckboxes();
                updateMarkerTypeSelect(); // Update automap display
            });

            // Double-click to select all dots of this marker type on current page
            item.addEventListener('dblclick', e => {
                // Only prevent selection when clicking the delete button
                if (e.target.closest('.ms-delete-marker-type-btn')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                selectAllDotsOfMarkerType(markerTypeCode);
            });

            // Right-click context menu for marker types
            item.addEventListener('contextmenu', e => {
                // Only prevent context menu when clicking the delete button
                if (e.target.closest('.ms-delete-marker-type-btn')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                showMarkerTypeContextMenu(e, markerTypeCode);
            });

            item.querySelector('input[type="checkbox"]').addEventListener('change', applyFilters);
            codeInputEl.addEventListener('change', e => handleMarkerTypeCodeChange(e.target));
            codeInputEl.addEventListener('blur', e => handleMarkerTypeCodeChange(e.target));
            codeInputEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMarkerTypeCodeChange(e.target);
                    e.target.blur();
                }
            });
            nameInputEl.addEventListener('change', e => handleMarkerTypeNameChange(e.target));
            nameInputEl.addEventListener('blur', e => handleMarkerTypeNameChange(e.target));
            nameInputEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMarkerTypeNameChange(e.target);
                    e.target.blur();
                }
            });
            item.querySelector('.ms-delete-marker-type-btn').addEventListener('click', () =>
                deleteMarkerType(markerTypeCode)
            );

            initializeColorPickers(item, markerTypeCode, typeData);

            // Store in cache
            markerTypeElements.set(markerTypeCode, item);

            // Insert at correct position
            const nextSibling = container.children[index];
            if (nextSibling) {
                container.insertBefore(item, nextSibling);
            } else {
                container.appendChild(item);
            }
        }
    });

    container.scrollTop = scrollPosition;
}

function updateMarkerTypeSelect() {
    // Enable/disable automap text input based on whether we have marker types and PDF
    const textInput = document.getElementById('automap-text-input');
    if (textInput) {
        const markerTypes = Object.keys(appState.markerTypes);
        textInput.disabled = markerTypes.length === 0 || !appState.pdfDoc;
    }
}

function resizeInput(input) {
    const temp = document.createElement('span');
    temp.style.visibility = 'hidden';
    temp.style.position = 'absolute';
    temp.style.font = window.getComputedStyle(input).font;
    temp.style.padding = window.getComputedStyle(input).padding;
    temp.textContent = input.value || input.placeholder || 'A';
    document.body.appendChild(temp);

    // Add 5px extra for padding to prevent text cutoff
    const width = Math.max(30, temp.offsetWidth + 2);
    input.style.width = width + 'px';

    document.body.removeChild(temp);
}

// Lazy color picker initialization
const colorPickerInstances = new Map(); // key: markerTypeCode-colorType, value: Pickr instance

function initializeColorPickers(item, markerTypeCode, typeData) {
    if (!window.Pickr) {
        console.warn('Pickr color picker library not loaded');
        return;
    }

    item.querySelectorAll('.ms-color-picker-wrapper').forEach(wrapper => {
        const colorType = wrapper.dataset.colorType;
        const initialColor = colorType === 'dot' ? typeData.color : typeData.textColor || '#FFFFFF';
        wrapper.style.backgroundColor = initialColor;

        // Add click handler for lazy initialization
        wrapper.addEventListener('click', function lazyInitHandler(e) {
            e.stopPropagation();

            const pickrKey = markerTypeCode + '-' + colorType;

            // Check if already initialized
            if (colorPickerInstances.has(pickrKey)) {
                return;
            }

            // Remove the lazy init handler
            wrapper.removeEventListener('click', lazyInitHandler);

            // Create the color picker
            const pickr = Pickr.create({
                el: wrapper,
                theme: 'classic',
                useAsButton: true,
                default: initialColor,
                components: {
                    preview: true,
                    opacity: false,
                    hue: true,
                    interaction: {
                        hex: false, // Disable the hex button
                        rgba: false, // Disable the rgba button
                        hsla: false, // Disable the hsla button
                        hsva: false, // Disable the hsva button
                        cmyk: false, // Disable the cmyk button
                        input: true,
                        save: true,
                        clear: false
                    }
                }
            });

            // Add flag to track eyedropper usage
            let isUsingEyedropper = false;

            // Override Pickr's hide method to check our flag
            const originalHide = pickr.hide.bind(pickr);
            pickr.hide = () => {
                if (!isUsingEyedropper) {
                    originalHide();
                }
            };

            // Add custom inputs after picker is created
            pickr.on('init', () => {
                const app = pickr.getRoot().app;
                const customInputsContainer = document.createElement('div');
                customInputsContainer.className = 'ms-custom-color-inputs';
                customInputsContainer.innerHTML = `
                <div class="ms-color-inputs-row">
                    <input type="text" class="ms-hexa-input" placeholder="HEXA" maxlength="7">
                    <input type="text" class="ms-r-input" placeholder="R" maxlength="3">
                    <input type="text" class="ms-g-input" placeholder="G" maxlength="3">
                    <input type="text" class="ms-b-input" placeholder="B" maxlength="3">
                </div>
            `;

                // Find the save button and move it
                const saveButton = app.querySelector('.pcr-save');
                const interaction = app.querySelector('.pcr-interaction');

                // Hide the original interaction section
                if (interaction) {
                    interaction.style.display = 'none';
                }

                // Create eyedropper button
                const eyedropperButton = document.createElement('button');
                eyedropperButton.className = 'ms-eyedropper-btn';
                eyedropperButton.innerHTML =
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21l1.65-1.65M16.71 4.88l2.12-2.12a2 2 0 112.83 2.83l-2.12 2.12m-2.83-2.83L7.5 14.1 4 21l7-3.5 9.21-9.21m-2.83-2.83l2.83 2.83"/></svg>';
                eyedropperButton.title = 'Pick color from screen';

                // Create container for buttons
                const buttonsContainer = document.createElement('div');
                buttonsContainer.className = 'ms-color-buttons-container';
                buttonsContainer.appendChild(eyedropperButton);

                // Move save button to our custom container
                if (saveButton) {
                    buttonsContainer.appendChild(saveButton);
                }

                customInputsContainer
                    .querySelector('.ms-color-inputs-row')
                    .appendChild(buttonsContainer);

                // Insert our custom inputs after the color selection area
                const selection = app.querySelector('.pcr-selection');
                if (selection) {
                    selection.parentNode.insertBefore(customInputsContainer, selection.nextSibling);
                }

                const hexaInput = customInputsContainer.querySelector('.ms-hexa-input');
                const rInput = customInputsContainer.querySelector('.ms-r-input');
                const gInput = customInputsContainer.querySelector('.ms-g-input');
                const bInput = customInputsContainer.querySelector('.ms-b-input');

                // Update inputs when color changes
                const updateInputs = color => {
                    const hexa = color.toHEXA().toString();
                    const rgba = color.toRGBA();

                    hexaInput.value = hexa;
                    rInput.value = Math.round(rgba[0]);
                    gInput.value = Math.round(rgba[1]);
                    bInput.value = Math.round(rgba[2]);
                };

                // Initial update
                updateInputs(pickr.getColor());

                // Update on color change
                pickr.on('change', updateInputs);

                // Handle HEXA input
                hexaInput.addEventListener('input', e => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        pickr.setColor(value);
                    }
                });

                // Handle RGB inputs - only allow numbers
                const validateRGBInput = input => {
                    // Remove any non-numeric characters
                    input.value = input.value.replace(/[^0-9]/g, '');

                    // Limit to 0-255
                    if (input.value !== '') {
                        const value = parseInt(input.value);
                        if (value > 255) {
                            input.value = '255';
                        }
                    }
                };

                // Handle RGB inputs
                const updateFromRGB = () => {
                    const r = parseInt(rInput.value) || 0;
                    const g = parseInt(gInput.value) || 0;
                    const b = parseInt(bInput.value) || 0;

                    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
                        const hex =
                            '#' +
                            [r, g, b]
                                .map(x => {
                                    const hex = x.toString(16);
                                    return hex.length === 1 ? '0' + hex : hex;
                                })
                                .join('');
                        pickr.setColor(hex);
                    }
                };

                // Add input validation and update handlers
                [rInput, gInput, bInput].forEach(input => {
                    input.addEventListener('input', e => {
                        validateRGBInput(e.target);
                        updateFromRGB();
                    });

                    // Prevent non-numeric input
                    input.addEventListener('keypress', e => {
                        if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete') {
                            e.preventDefault();
                        }
                    });
                });

                // Handle eyedropper button
                eyedropperButton.addEventListener('click', async e => {
                    // Prevent event bubbling that might close the picker
                    e.preventDefault();
                    e.stopPropagation();

                    // Check if the EyeDropper API is available
                    if ('EyeDropper' in window) {
                        try {
                            // Set flag to prevent closing
                            isUsingEyedropper = true;

                            const eyeDropper = new EyeDropper();
                            const result = await eyeDropper.open();

                            // Set the selected color
                            pickr.setColor(result.sRGBHex);

                            // Update inputs
                            updateInputs(pickr.getColor());

                            // Reset flag after a short delay
                            setTimeout(() => {
                                isUsingEyedropper = false;
                            }, 100);
                        } catch (err) {
                            // User cancelled the eyedropper
                            console.log('EyeDropper cancelled');
                            isUsingEyedropper = false;
                        }
                    } else {
                        alert(
                            'Color picker is not supported in this browser. Try Chrome, Edge, or Opera.'
                        );
                    }
                });

                // Prevent mousedown from closing the picker
                eyedropperButton.addEventListener('mousedown', e => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            pickr.on('change', color => {
                wrapper.style.backgroundColor = color.toHEXA().toString();
            });

            pickr.on('save', color => {
                const newColor = color.toHEXA().toString();
                if (colorType === 'dot') {
                    appState.markerTypes[markerTypeCode].color = newColor;
                } else {
                    appState.markerTypes[markerTypeCode].textColor = newColor;
                }
                wrapper.style.backgroundColor = newColor;
                setDirtyState();
                updateAllSectionsForCurrentPage();
                renderDotsForCurrentPage();
                pickr.hide();
            });

            pickr.on('hide', () => {
                const currentColor =
                    colorType === 'dot'
                        ? appState.markerTypes[markerTypeCode].color
                        : appState.markerTypes[markerTypeCode].textColor || '#FFFFFF';
                wrapper.style.backgroundColor = currentColor;
            });

            // Store the instance
            colorPickerInstances.set(pickrKey, pickr);

            // Show the picker immediately
            pickr.show();
        });
    });
}

function setupLegendCollapse() {
    // Setup collapse functionality for both legends
    const projectLegend = document.getElementById('project-legend');
    const mapLegend = document.getElementById('map-legend');

    if (projectLegend) {
        const header = projectLegend.querySelector('.ms-map-legend-header');
        if (header && !header.hasAttribute('data-collapse-setup')) {
            header.setAttribute('data-collapse-setup', 'true');
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                projectLegend.classList.toggle('ms-collapsed');
                const content = document.getElementById('project-legend-content');
                if (content) {
                    content.style.display = projectLegend.classList.contains('ms-collapsed')
                        ? 'none'
                        : 'block';
                }
            });
        }
    }

    if (mapLegend) {
        const header = mapLegend.querySelector('.ms-map-legend-header');
        if (header && !header.hasAttribute('data-collapse-setup')) {
            header.setAttribute('data-collapse-setup', 'true');
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                mapLegend.classList.toggle('ms-collapsed');
                const content = document.getElementById('map-legend-content');
                if (content) {
                    content.style.display = mapLegend.classList.contains('ms-collapsed')
                        ? 'none'
                        : 'block';
                }
            });
        }
    }
}

function updateMapLegend() {
    const legend = document.getElementById('map-legend');
    const content = document.getElementById('map-legend-content');
    if (!legend || !content) return;

    // Setup collapse functionality if not already done
    setupLegendCollapse();

    const usedMarkerTypeCodes = new Set(
        Array.from(getCurrentPageDots().values()).map(d => d.markerType)
    );

    legend.classList.toggle('ms-collapsed', appState.pageLegendCollapsed);

    if (usedMarkerTypeCodes.size === 0) {
        legend.classList.remove('ms-visible');
        return;
    }

    legend.classList.add('ms-visible');
    content.innerHTML = '';

    const sortedMarkerTypeCodes = Array.from(usedMarkerTypeCodes).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    sortedMarkerTypeCodes.forEach(code => {
        const typeData = appState.markerTypes[code];
        if (!typeData) return;

        const count = Array.from(getCurrentPageDots().values()).filter(
            d => d.markerType === code
        ).length;
        const item = document.createElement('div');
        item.className = 'ms-map-legend-item';
        item.innerHTML =
            '<div class="ms-map-legend-dot" style="background-color: ' +
            typeData.color +
            ';"></div>' +
            '<span class="ms-map-legend-text">' +
            code +
            ' - ' +
            typeData.name +
            '</span>' +
            '<span class="ms-map-legend-count">' +
            count +
            '</span>';
        content.appendChild(item);
    });
}

function updateProjectLegend() {
    const legend = document.getElementById('project-legend');
    const content = document.getElementById('project-legend-content');
    if (!legend || !content) return;

    // Setup collapse functionality if not already done
    setupLegendCollapse();

    const projectCounts = new Map();
    for (const pageData of appState.dotsByPage.values()) {
        for (const dot of pageData.dots.values()) {
            projectCounts.set(dot.markerType, (projectCounts.get(dot.markerType) || 0) + 1);
        }
    }

    legend.classList.toggle('ms-collapsed', appState.projectLegendCollapsed);

    if (projectCounts.size === 0) {
        legend.classList.remove('ms-visible');
        return;
    }

    legend.classList.add('ms-visible');
    content.innerHTML = '';

    const sortedMarkerTypeCodes = Array.from(projectCounts.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    sortedMarkerTypeCodes.forEach(code => {
        const typeData = appState.markerTypes[code];
        if (!typeData) return;

        const count = projectCounts.get(code);
        const item = document.createElement('div');
        item.className = 'ms-map-legend-item';
        item.innerHTML =
            '<div class="ms-map-legend-dot" style="background-color: ' +
            typeData.color +
            ';"></div>' +
            '<span class="ms-map-legend-text">' +
            code +
            ' - ' +
            typeData.name +
            '</span>' +
            '<span class="ms-map-legend-count">' +
            count +
            '</span>';
        content.appendChild(item);
    });
}

function getActiveFilters() {
    const container = document.getElementById('filter-checkboxes');
    if (!container || !container.hasChildNodes()) return [];
    return Array.from(container.querySelectorAll('input:checked')).map(
        cb => cb.dataset.markerTypeCode
    );
}

function applyFilters() {
    const activeFilters = getActiveFilters();
    document.querySelectorAll('.ms-map-dot').forEach(dotElement => {
        const dot = getCurrentPageDots().get(dotElement.dataset.dotId);
        dotElement.style.display = dot && activeFilters.includes(dot.markerType) ? 'flex' : 'none';
    });
    updateLocationList();
    updateMapLegend();
}

// Add a single dot to the location list without rebuilding everything
function addSingleDotToLocationList(dot) {
    const container = document.getElementById('location-list');
    if (!container) return;

    // Check if this dot's marker type is filtered out
    const activeFilters = getActiveFilters();
    if (!activeFilters.includes(dot.markerType)) return;

    // Create the list item for just this dot
    const typeData = appState.markerTypes[dot.markerType];
    // Skip if marker type doesn't exist
    if (!typeData) {
        console.warn(`Marker type ${dot.markerType} not found for dot ${dot.internalId}`);
        return;
    }

    const item = document.createElement('div');
    item.className = 'ms-location-item';
    item.dataset.dotId = dot.internalId;

    if (appState.selectedDots.has(dot.internalId)) {
        item.classList.add('ms-selected');
    }

    const badgeClass = 'ms-marker-type-badge';
    const badgeText = dot.markerType;
    const badgeTooltip = dot.markerType + ' - ' + typeData.name;

    // Calculate size for message1 input based on content (min 60px, grows with content)
    const message1Length = Math.max((dot.message || 'MESSAGE 1').length * 6, 60);

    item.innerHTML =
        '<div class="ms-location-header">' +
        '<span class="ms-location-number">' +
        dot.locationNumber +
        '</span>' +
        '<div class="ms-location-messages">' +
        '<input type="text" class="ms-location-message-input ms-message1" placeholder="MESSAGE 1" title="Edit message 1" value="' +
        dot.message +
        '" data-dot-id="' +
        dot.internalId +
        '" data-field="message" style="width: ' +
        message1Length +
        'px;">' +
        '<input type="text" class="ms-location-message-input ms-message2" placeholder="MESSAGE 2" title="Edit message 2" value="' +
        (dot.message2 || '') +
        '" data-dot-id="' +
        dot.internalId +
        '" data-field="message2">' +
        '</div>' +
        '<span class="' +
        badgeClass +
        '" style="background-color:' +
        typeData.color +
        '; color: ' +
        (typeData.textColor || '#FFFFFF') +
        ';" title="' +
        badgeTooltip +
        '">' +
        badgeText +
        '</span>' +
        '</div>';

    // Single click for selection only
    item.addEventListener('click', async e => {
        if (e.target.classList.contains('ms-location-message-input')) return;

        setTimeout(() => {
            if (e.shiftKey) {
                // Multi-select: toggle selection
                toggleDotSelection(dot.internalId);
            } else {
                // Single select: just select, don't center
                if (appState.selectedDots.has(dot.internalId) && appState.selectedDots.size === 1) {
                    clearSelection();
                } else {
                    clearSelection();
                    selectDot(dot.internalId);
                }
            }
            updateSelectionUI();
        }, 100);
    });

    // Middle mouse click to zoom/center on dot
    item.addEventListener('mousedown', async e => {
        if (e.button !== 1) return; // Only middle mouse button
        e.preventDefault(); // Prevent auto-scroll
        e.stopPropagation();
        if (e.target.classList.contains('ms-location-message-input')) return;

        // Just center on the dot, don't select
        centerOnDot(dot.internalId);
    });

    // Insert in the right position based on location number
    const items = container.querySelectorAll('.ms-location-item');
    let inserted = false;
    for (const existingItem of items) {
        const itemNum = parseInt(existingItem.querySelector('.ms-location-number').textContent);
        if (itemNum > parseInt(dot.locationNumber)) {
            container.insertBefore(item, existingItem);
            inserted = true;
            break;
        }
    }
    if (!inserted) {
        container.appendChild(item);
    }

    // Add message input event listeners for both inputs
    const messageInputs = item.querySelectorAll('.ms-location-message-input');
    messageInputs.forEach(input => {
        let originalValue = input.value;
        const field = input.dataset.field;

        input.addEventListener('focus', e => {
            originalValue = e.target.value;
        });

        input.addEventListener('blur', async e => {
            if (e.target.value !== originalValue) {
                const oldValues = {};
                const newValues = {};
                oldValues[field] = originalValue;
                newValues[field] = e.target.value;
                const command = new EditDotCommand(
                    appState.currentPdfPage,
                    dot.internalId,
                    oldValues,
                    newValues
                );
                await CommandUndoManager.execute(command);
                setDirtyState();
            }
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            }
        });

        input.addEventListener('input', e => {
            const dotToUpdate = getCurrentPageDots().get(dot.internalId);
            if (dotToUpdate) {
                dotToUpdate[field] = e.target.value;
                setDirtyState();
                if (field === 'message') {
                    // Resize the input based on content
                    const newWidth = Math.max((e.target.value || 'MESSAGE 1').length * 6, 60);
                    e.target.style.width = newWidth + 'px';
                    renderDotsForCurrentPage();
                } else if (field === 'message2') {
                    // Update the map view for message2 changes
                    renderDotsForCurrentPage();
                }
            }
        });

        input.addEventListener('click', e => {
            e.stopPropagation();
        });
    });

    // Update visibility
    const listWrapper = document.getElementById('list-with-renumber');
    const emptyState = document.getElementById('empty-state');
    if (listWrapper) listWrapper.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
}

function updateLocationList() {
    const container = document.getElementById('location-list');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    const listWrapper = document.getElementById('list-with-renumber');
    const emptyState = document.getElementById('empty-state');
    const activeFilters = getActiveFilters();
    let allDots = [];

    if (appState.isAllPagesView) {
        for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
            const dotsOnPage = Array.from(getDotsForPage(pageNum).values());
            const visibleDots = dotsOnPage
                .filter(dot => activeFilters.includes(dot.markerType))
                .map(dot => Object.assign({}, dot, { page: pageNum }));
            allDots.push(...visibleDots);
        }
    } else {
        const currentPageDotsMap = getCurrentPageDots();
        allDots = Array.from(currentPageDotsMap.values()).filter(dot =>
            activeFilters.includes(dot.markerType)
        );

        // DEBUG: Log each dot that will be shown
        allDots.forEach((dot, index) => {});
    }

    if (allDots.length === 0) {
        if (listWrapper) listWrapper.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'block';
            if (appState.isAllPagesView) {
                emptyState.textContent = 'No dots match the current filter across all pages.';
            } else {
                emptyState.textContent =
                    getCurrentPageDots().size > 0
                        ? 'No dots match the current filter.'
                        : 'Click on the map to add your first location dot.';
            }
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (listWrapper) listWrapper.style.display = 'block';

    const toggleBtn = document.getElementById('toggle-view-btn');
    if (toggleBtn) {
        toggleBtn.textContent = appState.listViewMode === 'flat' ? 'UNGROUPED' : 'GROUPED';
    }

    if (appState.listViewMode === 'grouped') {
        renderGroupedLocationList(allDots, container);
    } else {
        renderFlatLocationList(allDots, container);
    }
}

function renderFlatLocationList(allDots, container) {
    // Apply filters before sorting
    const filteredDots = allDots.filter(dot => {
        // Apply code filter

        // Apply inst filter
        if (appState.instFilterMode === 'instOnly' && !dot.installed) return false;
        if (appState.instFilterMode === 'hideInst' && dot.installed) return false;

        return true;
    });

    filteredDots.sort((a, b) => {
        // Sort by page first if in all pages view
        if (appState.isAllPagesView && a.page !== b.page) {
            return a.page - b.page;
        }
        // Then sort by location or message
        if (appState.sortMode === 'location') {
            return a.locationNumber.localeCompare(b.locationNumber);
        } else {
            return a.message.localeCompare(b.message);
        }
    });

    filteredDots.forEach(dot => {
        const typeData = appState.markerTypes[dot.markerType];
        // Skip if marker type doesn't exist
        if (!typeData) {
            console.warn(`Marker type ${dot.markerType} not found for dot ${dot.internalId}`);
            return;
        }

        const item = document.createElement('div');
        item.className = 'ms-location-item';
        item.dataset.dotId = dot.internalId;

        if (dot.page) {
            item.dataset.dotPage = dot.page;
        }
        if (appState.selectedDots.has(dot.internalId)) {
            item.classList.add('ms-selected');
        }

        const badgeClass = 'ms-marker-type-badge';
        const badgeText = dot.markerType;
        const badgeTooltip = dot.markerType + ' - ' + typeData.name;
        const pagePrefix = appState.isAllPagesView ? '(P' + dot.page + ') ' : '';

        // Calculate size for message1 input based on content (min 60px, grows with content)
        const message1Length = Math.max((dot.message || 'MESSAGE 1').length * 6, 60);

        item.innerHTML =
            '<div class="ms-location-header">' +
            '<span class="ms-location-number">' +
            pagePrefix +
            dot.locationNumber +
            '</span>' +
            '<div class="ms-location-messages">' +
            '<input type="text" class="ms-location-message-input ms-message1" placeholder="MESSAGE 1" value="' +
            dot.message +
            '" data-dot-id="' +
            dot.internalId +
            '" data-field="message" style="width: ' +
            message1Length +
            'px;">' +
            '<input type="text" class="ms-location-message-input ms-message2" placeholder="MESSAGE 2" value="' +
            (dot.message2 || '') +
            '" data-dot-id="' +
            dot.internalId +
            '" data-field="message2">' +
            '</div>' +
            '<span class="' +
            badgeClass +
            '" style="background-color:' +
            typeData.color +
            '; color: ' +
            (typeData.textColor || '#FFFFFF') +
            ';" title="' +
            badgeTooltip +
            '">' +
            badgeText +
            '</span>' +
            '</div>';

        container.appendChild(item);

        // Single click for selection only
        item.addEventListener('click', async e => {
            if (e.target.classList.contains('ms-location-message-input')) return;

            const dotPage = e.currentTarget.dataset.dotPage
                ? parseInt(e.currentTarget.dataset.dotPage, 10)
                : appState.currentPdfPage;
            if (dotPage !== appState.currentPdfPage) {
                await changePage(dotPage);
            }

            setTimeout(() => {
                if (e.shiftKey) {
                    // Multi-select: toggle selection
                    toggleDotSelection(dot.internalId);
                } else {
                    // Single select: just select, don't center
                    if (
                        appState.selectedDots.has(dot.internalId) &&
                        appState.selectedDots.size === 1
                    ) {
                        clearSelection();
                    } else {
                        clearSelection();
                        selectDot(dot.internalId);
                    }
                }
                updateSelectionUI();
            }, 100);
        });

        // Middle mouse click to zoom/center on dot
        item.addEventListener('mousedown', async e => {
            if (e.button !== 1) return; // Only middle mouse button
            e.preventDefault(); // Prevent auto-scroll
            e.stopPropagation();
            if (e.target.classList.contains('ms-location-message-input')) return;

            const dotPage = e.currentTarget.dataset.dotPage
                ? parseInt(e.currentTarget.dataset.dotPage, 10)
                : appState.currentPdfPage;
            if (dotPage !== appState.currentPdfPage) {
                await changePage(dotPage);
            }

            // Just center on the dot, don't select
            centerOnDot(dot.internalId);
        });

        // Add right-click context menu
        item.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();

            // If right-clicking on a selected item when multiple are selected, open group edit
            if (appState.selectedDots.has(dot.internalId) && appState.selectedDots.size > 1) {
                openGroupEditModal();
            } else {
                // Otherwise, select only this item and open single edit
                clearSelection();
                selectDot(dot.internalId);
                updateSelectionUI();
                openEditModal(dot.internalId);
            }
        });

        const messageInputs = item.querySelectorAll('.ms-location-message-input');
        messageInputs.forEach(input => {
            let originalValue = input.value;
            const field = input.dataset.field;

            input.addEventListener('focus', e => {
                originalValue = e.target.value;
            });

            input.addEventListener('blur', async e => {
                if (e.target.value !== originalValue) {
                    // Find the dot being edited
                    const dotElement = e.target.closest('.dot');
                    if (dotElement) {
                        const dotId = dotElement.dataset.id;
                        const dot = getCurrentPageDots().get(dotId);
                        if (dot) {
                            const oldValues = {};
                            const newValues = {};
                            oldValues[field] = originalValue;
                            newValues[field] = e.target.value;
                            const command = new EditDotCommand(
                                appState.currentPdfPage,
                                dotId,
                                oldValues,
                                newValues
                            );
                            await CommandUndoManager.execute(command);
                            setDirtyState();
                        }
                    }
                }
            });

            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur(); // This will trigger the blur event and save changes
                }
            });

            input.addEventListener('input', e => {
                const dotToUpdate = getDotsForPage(dot.page || appState.currentPdfPage).get(
                    dot.internalId
                );
                if (dotToUpdate) {
                    dotToUpdate[field] = e.target.value;
                    setDirtyState();
                    if (field === 'message') {
                        // Resize the input based on content
                        const newWidth = Math.max((e.target.value || 'MESSAGE 1').length * 6, 42);
                        e.target.style.width = newWidth + 'px';
                        renderDotsForCurrentPage();
                    } else if (field === 'message2') {
                        // Update the map view for message2 changes
                        renderDotsForCurrentPage();
                    }
                }
            });

            input.addEventListener('click', e => {
                e.stopPropagation();
            });
        });
    });
}

function renderGroupedLocationList(allDots, container) {
    // Apply filters first
    const filteredDots = allDots.filter(dot => {
        // Apply code filter

        // Apply inst filter
        if (appState.instFilterMode === 'instOnly' && !dot.installed) return false;
        if (appState.instFilterMode === 'hideInst' && dot.installed) return false;

        return true;
    });

    const groupedDots = {};
    filteredDots.forEach(dot => {
        if (!groupedDots[dot.markerType]) groupedDots[dot.markerType] = [];
        groupedDots[dot.markerType].push(dot);
    });

    const sortedMarkerTypeCodes = Object.keys(groupedDots).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    sortedMarkerTypeCodes.forEach(markerTypeCode => {
        const dots = groupedDots[markerTypeCode];

        // Sort dots within each group
        dots.sort((a, b) => {
            // Sort by page first if in all pages view
            if (appState.isAllPagesView && a.page !== b.page) {
                return a.page - b.page;
            }
            // Then sort by location or message
            if (appState.sortMode === 'location') {
                return a.locationNumber.localeCompare(b.locationNumber);
            } else {
                return a.message.localeCompare(b.message);
            }
        });

        const typeData = appState.markerTypes[markerTypeCode];
        const isExpanded = appState.expandedMarkerTypes.has(markerTypeCode);
        const category = document.createElement('div');
        category.className = 'ms-marker-type-category';
        category.style.borderLeftColor = typeData.color;
        const displayName = markerTypeCode;
        const tooltipText = markerTypeCode + ' - ' + typeData.name;

        category.innerHTML =
            '<div class="ms-marker-type-category-header" title="' +
            tooltipText +
            '">' +
            '<div class="ms-marker-type-category-title">' +
            '<span class="ms-expand-icon ' +
            (isExpanded ? 'ms-expanded' : '') +
            '">▶</span>' +
            displayName +
            '</div>' +
            '<span class="ms-marker-type-category-count">' +
            dots.length +
            '</span>' +
            '</div>' +
            '<div class="ms-marker-type-items ' +
            (isExpanded ? 'ms-expanded' : '') +
            '" id="items-' +
            markerTypeCode.replace(/[^a-zA-Z0-9]/g, '-') +
            '"></div>';

        container.appendChild(category);
        category
            .querySelector('.ms-marker-type-category-header')
            .addEventListener('click', () => toggleMarkerTypeExpansion(markerTypeCode));

        // Double-click to select all dots of this marker type
        category
            .querySelector('.ms-marker-type-category-header')
            .addEventListener('dblclick', e => {
                e.stopPropagation(); // Prevent the single click from also firing
                selectAllDotsOfMarkerType(markerTypeCode);
            });

        const itemsContainer = category.querySelector('.ms-marker-type-items');
        dots.forEach(dot => {
            const item = document.createElement('div');
            item.className = 'ms-grouped-location-item';
            item.dataset.dotId = dot.internalId;
            if (dot.page) {
                item.dataset.dotPage = dot.page;
            }
            if (appState.selectedDots.has(dot.internalId)) {
                item.classList.add('ms-selected');
            }

            const pagePrefix = appState.isAllPagesView ? '(P' + dot.page + ') ' : '';

            // Calculate size for message1 input based on content (min 60px, grows with content)
            const message1Length = Math.max((dot.message || 'MESSAGE 1').length * 6, 60);

            item.innerHTML =
                '<div class="ms-grouped-location-header">' +
                '<span class="ms-location-number">' +
                pagePrefix +
                dot.locationNumber +
                '</span>' +
                '<div class="ms-location-messages">' +
                '<input type="text" class="ms-location-message-input ms-message1" placeholder="MESSAGE 1" value="' +
                dot.message +
                '" data-dot-id="' +
                dot.internalId +
                '" data-field="message" style="width: ' +
                message1Length +
                'px;">' +
                '<input type="text" class="ms-location-message-input ms-message2" placeholder="MESSAGE 2" value="' +
                (dot.message2 || '') +
                '" data-dot-id="' +
                dot.internalId +
                '" data-field="message2">' +
                '</div>' +
                '</div>';
            itemsContainer.appendChild(item);

            // Single click for selection only
            item.addEventListener('click', async e => {
                // Skip if clicking on the input field
                if (e.target.classList.contains('ms-location-message-input')) return;

                const dotPage = e.currentTarget.dataset.dotPage
                    ? parseInt(e.currentTarget.dataset.dotPage, 10)
                    : appState.currentPdfPage;
                if (dotPage !== appState.currentPdfPage) {
                    await changePage(dotPage);
                }

                setTimeout(() => {
                    if (e.shiftKey) {
                        // Multi-select: toggle selection
                        toggleDotSelection(dot.internalId);
                    } else {
                        // Single select: just select, don't center
                        if (
                            appState.selectedDots.has(dot.internalId) &&
                            appState.selectedDots.size === 1
                        ) {
                            clearSelection();
                        } else {
                            clearSelection();
                            selectDot(dot.internalId);
                        }
                    }
                    updateSelectionUI();
                }, 100);
            });

            // Middle mouse click to zoom/center on dot
            item.addEventListener('mousedown', async e => {
                if (e.button !== 1) return; // Only middle mouse button
                e.preventDefault(); // Prevent auto-scroll
                e.stopPropagation();
                if (e.target.classList.contains('ms-location-message-input')) return;

                const dotPage = e.currentTarget.dataset.dotPage
                    ? parseInt(e.currentTarget.dataset.dotPage, 10)
                    : appState.currentPdfPage;
                if (dotPage !== appState.currentPdfPage) {
                    await changePage(dotPage);
                }

                // Just center on the dot, don't select
                centerOnDot(dot.internalId);
            });

            // Add right-click context menu
            item.addEventListener('contextmenu', e => {
                e.preventDefault();
                e.stopPropagation();

                // If right-clicking on a selected item when multiple are selected, open group edit
                if (appState.selectedDots.has(dot.internalId) && appState.selectedDots.size > 1) {
                    openGroupEditModal();
                } else {
                    // Otherwise, select only this item and open single edit
                    clearSelection();
                    selectDot(dot.internalId);
                    updateSelectionUI();
                    openEditModal(dot.internalId);
                }
            });

            // Add message editing functionality for both message inputs
            const messageInputs = item.querySelectorAll('.ms-location-message-input');
            messageInputs.forEach(input => {
                let originalValue = input.value;
                const field = input.dataset.field;

                input.addEventListener('focus', e => {
                    originalValue = e.target.value;
                    e.stopPropagation();
                });

                input.addEventListener('blur', async e => {
                    const newValue = e.target.value.trim();
                    if (newValue !== originalValue) {
                        const pageData = getCurrentPageData();
                        const dot = pageData.dots.get(e.target.dataset.dotId);
                        if (dot) {
                            const updateObj = {};
                            updateObj[field] = newValue;

                            // Execute command for undo/redo support
                            const command = new EditDotCommand(
                                appState.currentPdfPage,
                                dot.internalId,
                                updateObj
                            );
                            await CommandUndoManager.execute(command);

                            // Update any open modals
                            if (document.getElementById('edit-modal').style.display === 'block') {
                                const editDotId = document.getElementById('edit-dot-id').value;
                                if (editDotId === dot.internalId) {
                                    if (field === 'message') {
                                        document.getElementById('edit-message').value = newValue;
                                    } else if (field === 'message2') {
                                        document.getElementById('edit-message2').value = newValue;
                                    }
                                }
                            }
                        }
                    }
                });

                input.addEventListener('keydown', e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.target.blur();
                    }
                });

                input.addEventListener('input', e => {
                    const pageData = getCurrentPageData();
                    const dot = pageData.dots.get(e.target.dataset.dotId);
                    if (dot) {
                        dot[field] = e.target.value;
                        setDirtyState();
                        // Update the map view for message changes
                        renderDotsForCurrentPage();
                    }
                });

                input.addEventListener('click', e => {
                    e.stopPropagation();
                });
            });
        });
    });
}

// Global variables to track current design reference preview
let currentDesignPreview = null;
let currentPreviewOwner = null;

function setupDesignReferenceHandlers(item, markerTypeCode) {
    const square = item.querySelector('.ms-design-reference-square');
    const fileInput = item.querySelector('.ms-design-reference-input');
    const deleteBtn = item.querySelector('.ms-design-reference-delete');
    const thumbnail = item.querySelector('.ms-design-reference-thumbnail');

    if (square) {
        square.addEventListener('click', e => {
            if (e.target.classList.contains('ms-design-reference-delete')) return;
            e.stopPropagation();
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                handleDesignReferenceUpload(file, markerTypeCode);
            }
            e.target.value = null;
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (
                confirm(
                    'Are you sure you want to delete the design reference for ' +
                        markerTypeCode +
                        '?'
                )
            ) {
                handleDesignReferenceDelete(markerTypeCode);
            }
        });
    }

    // Add hover preview for thumbnail
    if (thumbnail) {
        thumbnail.addEventListener('mouseenter', e => {
            if (!appState.markerTypes[markerTypeCode]?.designReference) return;

            // Remove any existing preview first
            if (currentDesignPreview) {
                currentDesignPreview.remove();
                currentDesignPreview = null;
            }

            // Create new preview and mark this thumbnail as owner
            currentPreviewOwner = markerTypeCode;
            currentDesignPreview = document.createElement('div');
            currentDesignPreview.className = 'ms-design-reference-preview';
            currentDesignPreview.innerHTML = `
                <img src="${appState.markerTypes[markerTypeCode].designReference}" alt="Design Reference">
            `;
            document.body.appendChild(currentDesignPreview);

            // Position near cursor
            const rect = thumbnail.getBoundingClientRect();
            currentDesignPreview.style.left = rect.right + 10 + 'px';
            currentDesignPreview.style.top = rect.top + 'px';

            // Trigger animation
            setTimeout(() => currentDesignPreview?.classList.add('ms-visible'), 10);
        });

        thumbnail.addEventListener('mouseleave', () => {
            // Only remove if this thumbnail owns the current preview
            if (currentDesignPreview && currentPreviewOwner === markerTypeCode) {
                currentDesignPreview.classList.remove('ms-visible');
                setTimeout(() => {
                    // Double check ownership hasn't changed
                    if (currentDesignPreview && currentPreviewOwner === markerTypeCode) {
                        currentDesignPreview.remove();
                        currentDesignPreview = null;
                        currentPreviewOwner = null;
                    }
                }, 200);
            }
        });
    }
}

function updateEditModalOptions(selectElementId = 'edit-marker-type', isGroupEdit = false) {
    const select = document.getElementById(selectElementId);
    if (!select) return;

    const sortedMarkerTypeCodes = Object.keys(appState.markerTypes).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );
    let optionsHtml = isGroupEdit ? '<option value="">-- Keep Individual Types --</option>' : '';
    optionsHtml += sortedMarkerTypeCodes
        .map(code => {
            const typeData = appState.markerTypes[code];
            return '<option value="' + code + '">' + code + ' - ' + typeData.name + '</option>';
        })
        .join('');
    select.innerHTML = optionsHtml;
}

// Canvas event setup functions
// Touch drag support for dots
let touchDraggingDot = null;
let touchDragStartPos = { x: 0, y: 0 };
let touchDragOriginalDotPos = { x: 0, y: 0 };
let longPressTimer = null;
let isLongPress = false;

function handleDotTouchStart(e) {
    const dotElement = e.target.closest('.ms-map-dot');
    if (!dotElement) return;

    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dotId = dotElement.dataset.dotId;
        const dot = getCurrentPageDots().get(dotId);

        if (dot) {
            touchDraggingDot = { element: dotElement, dot: dot, id: dotId };
            touchDragStartPos = { x: touch.clientX, y: touch.clientY };
            touchDragOriginalDotPos = { x: dot.x, y: dot.y };

            // Start long press timer (500ms)
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                // Trigger haptic feedback if available
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }

                // Open edit modal
                clearSelection();
                selectDot(dotId);
                updateSelectionUI();
                openEditModal(dotId);

                // Reset drag state since we're opening modal
                touchDraggingDot = null;
                dotElement.style.zIndex = '';
                dotElement.style.opacity = '';
            }, 500);

            // Add visual feedback
            dotElement.style.zIndex = '1000';
            dotElement.style.opacity = '0.8';

            e.preventDefault();
            e.stopPropagation();
        }
    }
}

function handleDotTouchMove(e) {
    if (!touchDraggingDot || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = (touch.clientX - touchDragStartPos.x) / appState.mapTransform.scale;
    const deltaY = (touch.clientY - touchDragStartPos.y) / appState.mapTransform.scale;

    // Cancel long press if user moves more than 10 pixels
    if (longPressTimer && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    // Update dot position
    const newX = touchDragOriginalDotPos.x + deltaX;
    const newY = touchDragOriginalDotPos.y + deltaY;

    // Update the dot's data
    touchDraggingDot.dot.x = newX;
    touchDraggingDot.dot.y = newY;

    // Update the visual position
    const size = 20 * appState.dotSize * 2;
    const halfSize = size / 2;
    touchDraggingDot.element.style.left = `${newX - halfSize}px`;
    touchDraggingDot.element.style.top = `${newY - halfSize}px`;

    e.preventDefault();
    e.stopPropagation();
}

function handleDotTouchEnd(e) {
    // Clear long press timer
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    // If long press was triggered, don't do anything else
    if (isLongPress) {
        isLongPress = false;
        return;
    }

    if (touchDraggingDot) {
        // Restore visual style
        touchDraggingDot.element.style.zIndex = '';
        touchDraggingDot.element.style.opacity = '';

        // Check if dot was actually moved (more than 5px threshold)
        const movedX = Math.abs(touchDraggingDot.dot.x - touchDragOriginalDotPos.x);
        const movedY = Math.abs(touchDraggingDot.dot.y - touchDragOriginalDotPos.y);

        if (movedX > 5 || movedY > 5) {
            // Dot was dragged - update and save
            import('./state.js').then(({ setDirtyState }) => {
                setDirtyState();
            });

            // Update any annotation lines
            import('./ui.js').then(({ renderAnnotationLines }) => {
                renderAnnotationLines();
            });
        } else {
            // Dot was tapped, not dragged - handle as click
            const dotId = touchDraggingDot.id;
            if (appState.selectedDots.has(dotId) && appState.selectedDots.size === 1) {
                clearSelection();
            } else {
                clearSelection();
                selectDot(dotId);
            }
            updateSelectionUI();
        }

        touchDraggingDot = null;
    }
}

function setupCanvasEventListeners() {
    const mapContent = document.getElementById('map-content');
    const mapContainer = document.getElementById('map-container');
    if (!mapContent || !mapContainer) return;

    // Click events should be on the map content, not just the canvas
    mapContent.addEventListener('click', handleMapClick);
    mapContainer.addEventListener('wheel', handleZoom);
    mapContainer.addEventListener('mousedown', handleMouseDown);

    // Add document-level mouse listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Handle right-click to open edit modal
    mapContent.addEventListener('contextmenu', handleContextMenu);
    mapContainer.addEventListener('contextmenu', handleContextMenu);

    // Touch events for dot dragging
    mapContent.addEventListener('touchstart', handleDotTouchStart, { passive: false });
    mapContent.addEventListener('touchmove', handleDotTouchMove, { passive: false });
    mapContent.addEventListener('touchend', handleDotTouchEnd, { passive: false });

    // Set initial cursor state
    mapContainer.style.cursor = 'default';

    // Handle mouse leave to cancel panning
    mapContainer.addEventListener('mouseleave', () => {
        if (appState.isPanning) {
            appState.isPanning = false;
            mapContainer.style.cursor = 'default';
        }
    });

    console.log('✅ Canvas event listeners attached');
}

function handleMapClick(e) {
    if (
        appState.hasMoved ||
        appState.isPanning ||
        appState.isSelecting ||
        appState.isScraping ||
        !appState.pdfDoc
    ) {
        return;
    }
    if (appState.justFinishedSelecting) {
        appState.justFinishedSelecting = false;
        return;
    }

    // Check if click is on a dot element
    const dotElement = e.target.closest('.ms-map-dot');
    if (dotElement) {
        const internalId = dotElement.dataset.dotId;
        if (e.shiftKey) {
            toggleDotSelection(internalId);
        } else {
            if (appState.selectedDots.has(internalId) && appState.selectedDots.size === 1) {
                clearSelection();
            } else {
                clearSelection();
                selectDot(internalId);
            }
        }
        updateSelectionUI();
        return;
    }

    if (e.target.closest('.ms-tolerance-controls')) {
        return;
    }

    if (!e.shiftKey) {
        clearSearchHighlights();

        // Always clear selection when clicking empty area (not holding Shift)
        if (appState.selectedDots.size > 0) {
            clearSelection();
            updateSelectionUI();
            return; // Don't create new dot, just deselect
        }

        // Only create new dot if no dots were selected
        // Get the map container rect for coordinate calculation
        const mapContainer = document.getElementById('map-container');
        const rect = mapContainer.getBoundingClientRect();
        const mapTransform = appState.mapTransform;

        // Calculate coordinates relative to the map content
        const x = (e.clientX - rect.left - mapTransform.x) / mapTransform.scale;
        const y = (e.clientY - rect.top - mapTransform.y) / mapTransform.scale;

        if (!isCollision(x, y)) {
            // Create the dot object
            const dot = createDotObject(x, y);

            // Only proceed if dot was created (marker types exist)
            if (dot) {
                // Execute the add command
                const command = new AddDotCommand(appState.currentPdfPage, dot);
                CommandUndoManager.execute(command).then(() => {
                    // Invalidate cache when dot is added
                    invalidateDotCountCache();
                    // Update the UI after command executes
                    updateSingleDot(dot.internalId);
                    updateLocationList(); // Use full list update for consistency
                    updateMapLegend(); // Update the page legend
                    updateProjectLegend(); // Update the project legend
                    setDirtyState();

                    // Check if DOTCAM mode is active for new dots
                    if (isDotcamMode) {
                        // Store the dot reference for photo capture
                        currentGalleryDot = dot;

                        // Open camera directly for the newly created dot
                        openCameraForDotcam();
                    }
                });
            }
        }
    }
}

function handleZoom(e) {
    e.preventDefault();
    const oldScale = appState.mapTransform.scale;
    const direction = e.deltaY < 0 ? 1 : -1;
    let newScale = oldScale * (1 + 0.1 * direction);
    newScale = Math.max(0.01, Math.min(newScale, 10));
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    appState.mapTransform.x = mouseX - (mouseX - appState.mapTransform.x) * (newScale / oldScale);
    appState.mapTransform.y = mouseY - (mouseY - appState.mapTransform.y) * (newScale / oldScale);
    appState.mapTransform.scale = newScale;
    applyMapTransform();
}

function handleMouseDown(e) {
    appState.hasMoved = false;
    appState.dragStart = { x: e.clientX, y: e.clientY };

    if (e.button === 1) {
        // Middle mouse button
        e.preventDefault();
        appState.isPanning = true;
        e.currentTarget.style.cursor = 'grabbing';

        // Disable transitions during panning for better performance
        const mapContent = document.getElementById('map-content');
        if (mapContent) {
            mapContent.style.transition = 'none';
        }

        // Set up document-wide listeners for drag
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    } else if (e.button === 2 && e.shiftKey) {
        // Right mouse button with Shift key - scraping
        e.preventDefault();
        appState.isScraping = true;

        // Check if Ctrl/Cmd is also pressed for OCR scraping
        if (e.ctrlKey || e.metaKey) {
            appState.isOCRScraping = true;
        }

        const mapContainer = document.getElementById('map-container');
        const rect = mapContainer.getBoundingClientRect();

        // Create scrape box
        appState.scrapeBox = document.createElement('div');
        appState.scrapeBox.className = appState.isOCRScraping
            ? 'ms-scrape-box ms-ocr-scrape'
            : 'ms-scrape-box';
        appState.scrapeBox.style.position = 'absolute';
        appState.scrapeBox.style.left = e.clientX - rect.left + 'px';
        appState.scrapeBox.style.top = e.clientY - rect.top + 'px';
        appState.scrapeBox.style.width = '0px';
        appState.scrapeBox.style.height = '0px';

        mapContainer.appendChild(appState.scrapeBox);

        appState.scrapeStart = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            clientX: e.clientX,
            clientY: e.clientY
        };

        // Scraping movement handled in handleMouseMove
        document.addEventListener('contextmenu', preventContextMenu, { capture: true });
    } else if (e.button === 0) {
        // Left mouse button
        const dotElement = e.target.closest('.ms-map-dot');

        if (dotElement) {
            if (e.ctrlKey) {
                // Ctrl+click on dot - start drawing annotation line
                e.preventDefault();
                const internalId = dotElement.dataset.dotId;
                const dot = getCurrentPageDots().get(internalId);
                if (dot) {
                    appState.isDrawingAnnotation = true;
                    appState.annotationStartDot = dot;

                    // Create temporary line element
                    const mapContent = document.getElementById('map-content');

                    appState.annotationTempLine = document.createElement('div');
                    appState.annotationTempLine.className = 'ms-annotation-line-temp';
                    appState.annotationTempLine.style.position = 'absolute';
                    appState.annotationTempLine.style.left = dot.x + 'px';
                    appState.annotationTempLine.style.top = dot.y + 'px';
                    appState.annotationTempLine.style.width = '0px';
                    appState.annotationTempLine.style.height = 2 * appState.dotSize + 'px';
                    // Use the dot's marker type color
                    const markerType = appState.markerTypes[dot.markerType];
                    const lineColor = markerType ? markerType.color : '#FF6B6B';
                    appState.annotationTempLine.style.backgroundColor = lineColor;
                    appState.annotationTempLine.style.transformOrigin = '0 50%';
                    appState.annotationTempLine.style.pointerEvents = 'none';
                    appState.annotationTempLine.style.zIndex = '500'; // Below dots

                    mapContent.appendChild(appState.annotationTempLine);
                }
            } else {
                // Set as drag target - drag will start if mouse moves
                appState.dragTarget = dotElement;
            }
        } else if (e.shiftKey) {
            // Shift+drag for selection box
            e.preventDefault();
            const mapContainer = document.getElementById('map-container');
            const rect = mapContainer.getBoundingClientRect();

            appState.isSelecting = true;
            appState.selectionStart = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                clientX: e.clientX,
                clientY: e.clientY
            };

            // Create selection box
            appState.selectionBox = document.createElement('div');
            appState.selectionBox.className = 'ms-selection-box';
            appState.selectionBox.style.position = 'absolute';
            appState.selectionBox.style.left = appState.selectionStart.x + 'px';
            appState.selectionBox.style.top = appState.selectionStart.y + 'px';
            appState.selectionBox.style.width = '0px';
            appState.selectionBox.style.height = '0px';
            appState.selectionBox.style.border = '2px solid #00ff88';
            appState.selectionBox.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
            appState.selectionBox.style.pointerEvents = 'none';
            appState.selectionBox.style.zIndex = '999';

            mapContainer.appendChild(appState.selectionBox);

            // Selection box movement handled in handleMouseMove
        }
    }
}

function handleMouseMove(e) {
    // Check if we've moved enough to consider it movement
    if (
        !appState.hasMoved &&
        (Math.abs(e.clientX - appState.dragStart.x) > 3 ||
            Math.abs(e.clientY - appState.dragStart.y) > 3)
    ) {
        appState.hasMoved = true;

        // Capture original positions when drag actually starts
        if (appState.dragTarget) {
            appState.dragOriginalPositions.clear();
            const draggedInternalId = appState.dragTarget.dataset.dotId;
            const dotsToMove =
                appState.selectedDots.has(draggedInternalId) && appState.selectedDots.size > 1
                    ? appState.selectedDots
                    : [draggedInternalId];

            dotsToMove.forEach(internalId => {
                const dot = getCurrentPageDots().get(internalId);
                if (dot) {
                    appState.dragOriginalPositions.set(internalId, { x: dot.x, y: dot.y });
                }
            });
        }
    }

    // Track mouse position for paste
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
        const rect = mapContainer.getBoundingClientRect();
        const { x: mapX, y: mapY, scale } = appState.mapTransform;
        appState.lastMousePosition = {
            x: (e.clientX - rect.left - mapX) / scale,
            y: (e.clientY - rect.top - mapY) / scale
        };
    }

    if (appState.isPanning) {
        appState.mapTransform.x += e.clientX - appState.dragStart.x;
        appState.mapTransform.y += e.clientY - appState.dragStart.y;

        // Apply transform immediately for smooth visual feedback
        const mapContent = document.getElementById('map-content');
        const { x, y, scale } = appState.mapTransform;
        mapContent.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

        // Use throttled viewport updates for better performance
        updateViewportDotsThrottled();

        appState.dragStart = { x: e.clientX, y: e.clientY };
        return;
    }

    if (!e.buttons) return;

    // Handle dot dragging
    if (appState.dragTarget && appState.hasMoved) {
        setDirtyState();
        const moveDeltaX = (e.clientX - appState.dragStart.x) / appState.mapTransform.scale;
        const moveDeltaY = (e.clientY - appState.dragStart.y) / appState.mapTransform.scale;
        const draggedInternalId = appState.dragTarget.dataset.dotId;
        const dotsToMove =
            appState.selectedDots.has(draggedInternalId) && appState.selectedDots.size > 1
                ? appState.selectedDots
                : [draggedInternalId];

        dotsToMove.forEach(internalId => {
            const dot = getCurrentPageDots().get(internalId);
            const dotElement = document.querySelector(`.ms-map-dot[data-dot-id="${internalId}"]`);
            if (dot && dotElement) {
                dot.x += moveDeltaX;
                dot.y += moveDeltaY;

                // Calculate size to match createDotElement
                const effectiveMultiplier = appState.dotSize * 2;
                const size = 20 * effectiveMultiplier;
                const halfSize = size / 2;

                // Position the dot centered on the point (same as createDotElement)
                Object.assign(dotElement.style, {
                    left: `${dot.x - halfSize}px`,
                    top: `${dot.y - halfSize}px`,
                    transform: 'none' // Override CSS transform
                });
                dotElement.classList.add('ms-dragging');

                // Update any annotation lines that start from this dot
                const pageLines = getCurrentPageAnnotationLines();
                pageLines.forEach(line => {
                    if (line.startDotId === internalId) {
                        line.startX = dot.x;
                        line.startY = dot.y;
                    }
                });
            }
        });

        // Re-render annotation lines if any dots were moved
        renderAnnotationLines();

        appState.dragStart = { x: e.clientX, y: e.clientY };
    } else if (appState.isSelecting) {
        // Handle selection box update
        if (appState.selectionBox) {
            const mapContainer = document.getElementById('map-container');
            const rect = mapContainer.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            const left = Math.min(currentX, appState.selectionStart.x);
            const top = Math.min(currentY, appState.selectionStart.y);
            const width = Math.abs(currentX - appState.selectionStart.x);
            const height = Math.abs(currentY - appState.selectionStart.y);

            appState.selectionBox.style.left = left + 'px';
            appState.selectionBox.style.top = top + 'px';
            appState.selectionBox.style.width = width + 'px';
            appState.selectionBox.style.height = height + 'px';
        }
    } else if (appState.isScraping) {
        // Handle scrape box update
        if (appState.scrapeBox) {
            const mapContainer = document.getElementById('map-container');
            const rect = mapContainer.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            const left = Math.min(currentX, appState.scrapeStart.x);
            const top = Math.min(currentY, appState.scrapeStart.y);
            const width = Math.abs(currentX - appState.scrapeStart.x);
            const height = Math.abs(currentY - appState.scrapeStart.y);

            appState.scrapeBox.style.left = left + 'px';
            appState.scrapeBox.style.top = top + 'px';
            appState.scrapeBox.style.width = width + 'px';
            appState.scrapeBox.style.height = height + 'px';
        }
    } else if (appState.isDrawingAnnotation && appState.annotationTempLine) {
        // Handle annotation line drawing
        const mapContainer = document.getElementById('map-container');
        const rect = mapContainer.getBoundingClientRect();
        const { x: mapX, y: mapY, scale } = appState.mapTransform;

        // Convert mouse position to canvas coordinates
        const endX = (e.clientX - rect.left - mapX) / scale;
        const endY = (e.clientY - rect.top - mapY) / scale;

        // Calculate angle and length in canvas coordinates
        const deltaX = endX - appState.annotationStartDot.x;
        const deltaY = endY - appState.annotationStartDot.y;
        const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

        // Update temporary line
        appState.annotationTempLine.style.width = length + 'px';
        appState.annotationTempLine.style.transform = `rotate(${angle}deg)`;
    } else if (appState.draggingAnnotationEndpoint) {
        // Handle dragging annotation line endpoint
        const mapContainer = document.getElementById('map-container');
        const rect = mapContainer.getBoundingClientRect();
        const { x: mapX, y: mapY, scale } = appState.mapTransform;

        // Calculate new endpoint position in canvas coordinates
        const newEndX = (e.clientX - rect.left - mapX) / scale;
        const newEndY = (e.clientY - rect.top - mapY) / scale;

        // Update the line in state
        const pageLines = getCurrentPageAnnotationLines();
        const line = pageLines.get(appState.draggingAnnotationEndpoint);
        if (line) {
            line.endX = newEndX;
            line.endY = newEndY;

            // Re-render lines to show update
            renderAnnotationLines();
        }
    }
}

async function handleMouseUp(e) {
    const justFinishedScraping = appState.isScraping;

    if (appState.isPanning) {
        appState.isPanning = false;
        const mapContainer = document.getElementById('map-container');
        const mapContent = document.getElementById('map-content');

        if (mapContainer) {
            mapContainer.style.cursor = 'default';
        }

        // Re-enable transitions after panning
        if (mapContent) {
            mapContent.style.transition = 'transform 0.3s ease-out';
        }
    }

    if (appState.dragTarget) {
        // Clean up dragging state
        document
            .querySelectorAll('.ms-map-dot.ms-dragging')
            .forEach(dot => dot.classList.remove('ms-dragging'));

        // Create move command if dot was actually moved
        if (appState.hasMoved && appState.dragOriginalPositions.size > 0) {
            if (appState.dragOriginalPositions.size === 1) {
                // Single dot move
                const [[dotId, originalPos]] = appState.dragOriginalPositions.entries();
                const dot = getCurrentPageDots().get(dotId);
                if (dot) {
                    const command = new MoveDotCommand(
                        appState.currentPdfPage,
                        dotId,
                        originalPos,
                        { x: dot.x, y: dot.y }
                    );
                    await CommandUndoManager.execute(command);
                }
            } else {
                // Multiple dot move - use composite command
                const compositeCommand = new CompositeCommand('Move dots');
                for (const [dotId, originalPos] of appState.dragOriginalPositions.entries()) {
                    const dot = getCurrentPageDots().get(dotId);
                    if (dot) {
                        const moveCommand = new MoveDotCommand(
                            appState.currentPdfPage,
                            dotId,
                            originalPos,
                            { x: dot.x, y: dot.y }
                        );
                        compositeCommand.add(moveCommand);
                    }
                }
                await CommandUndoManager.execute(compositeCommand);
            }
            appState.dragOriginalPositions.clear();
        }

        appState.dragTarget = null;
    }

    if (appState.isSelecting) {
        finishSelectionBox();
        appState.isSelecting = false;
    }

    if (appState.isScraping) {
        if (appState.isOCRScraping) {
            // Import and call finishOCRScrape from scrape.js
            import('./scrape.js').then(module => {
                module.finishOCRScrape();
            });
            appState.isOCRScraping = false;
        } else {
            // Import and call finishScrape from scrape.js
            import('./scrape.js').then(module => {
                module.finishScrape();
            });
        }

        appState.justFinishedScraping = true;
        setTimeout(() => {
            appState.justFinishedScraping = false;
        }, 100);
    }

    if (appState.isDrawingAnnotation && appState.annotationTempLine) {
        // Finish drawing annotation line
        const mapContainer = document.getElementById('map-container');
        const rect = mapContainer.getBoundingClientRect();
        const { x: mapX, y: mapY, scale } = appState.mapTransform;

        // Calculate end position in canvas coordinates
        const endX = (e.clientX - rect.left - mapX) / scale;
        const endY = (e.clientY - rect.top - mapY) / scale;

        // Get the color from the dot's marker type
        const markerType = appState.markerTypes[appState.annotationStartDot.markerType];
        const lineColor = markerType ? markerType.color : '#FF6B6B';

        // Create annotation line object
        // Line width is proportional to dot size (base 2px * dotSize multiplier)
        const annotationLine = {
            id: `annotation_${appState.nextAnnotationId++}`,
            startDotId: appState.annotationStartDot.internalId,
            startX: appState.annotationStartDot.x,
            startY: appState.annotationStartDot.y,
            endX: endX,
            endY: endY,
            color: lineColor,
            width: 2 * appState.dotSize
        };

        // Create and execute the command
        const command = new AddAnnotationLineCommand(appState.currentPdfPage, annotationLine);
        await CommandUndoManager.execute(command);

        // Remove temporary line
        if (appState.annotationTempLine) {
            appState.annotationTempLine.remove();
            appState.annotationTempLine = null;
        }

        // Reset drawing state
        appState.isDrawingAnnotation = false;
        appState.annotationStartDot = null;

        // Render the new line
        renderAnnotationLines();
        setDirtyState();
    }

    if (appState.draggingAnnotationEndpoint) {
        // Finished dragging annotation endpoint
        const lineId = appState.draggingAnnotationEndpoint;
        const pageLines = getCurrentPageAnnotationLines();
        const line = pageLines.get(lineId);

        if (line && appState.draggingAnnotationOriginalPos) {
            const oldPos = appState.draggingAnnotationOriginalPos;
            const newPos = { x: line.endX, y: line.endY };

            // Only create command if position actually changed
            if (oldPos.x !== newPos.x || oldPos.y !== newPos.y) {
                const command = new MoveAnnotationLineEndpointCommand(
                    appState.currentPdfPage,
                    lineId,
                    oldPos,
                    newPos
                );
                await CommandUndoManager.execute(command);
            }
        }

        appState.draggingAnnotationEndpoint = null;
        appState.draggingAnnotationOriginalPos = null;
        setDirtyState();
    }
}

function finishSelectionBox() {
    if (!appState.selectionBox) return;

    // Check if selection box is too small (likely just a click)
    const width = parseFloat(appState.selectionBox.style.width);
    const height = parseFloat(appState.selectionBox.style.height);

    if (width > 5 || height > 5) {
        // This was a real selection, not just a click
        // Get selection box bounds
        const boxRect = appState.selectionBox.getBoundingClientRect();
        const mapRect = document.getElementById('map-container').getBoundingClientRect();
        const { x: mapX, y: mapY, scale } = appState.mapTransform;

        // Convert to canvas coordinates
        const canvasLeft = (boxRect.left - mapRect.left - mapX) / scale;
        const canvasTop = (boxRect.top - mapRect.top - mapY) / scale;
        const canvasRight = (boxRect.right - mapRect.left - mapX) / scale;
        const canvasBottom = (boxRect.bottom - mapRect.top - mapY) / scale;

        // Clear previous selection if not holding shift
        const e = window.event || {};
        if (!e.shiftKey) {
            clearSelection();
        }

        // Select or deselect dots within the box (don't scroll for multi-select)
        const dots = getCurrentPageDots();
        dots.forEach((dot, internalId) => {
            if (
                dot.x >= canvasLeft &&
                dot.x <= canvasRight &&
                dot.y >= canvasTop &&
                dot.y <= canvasBottom
            ) {
                // If shift is held and dot is already selected, deselect it
                if (e.shiftKey && appState.selectedDots.has(internalId)) {
                    deselectDot(internalId);
                } else {
                    selectDot(internalId, false);
                }
            }
        });

        // Update UI
        updateSelectionUI();

        appState.justFinishedSelecting = true;

        // Reset flag after a short delay
        setTimeout(() => {
            appState.justFinishedSelecting = false;
        }, 100);
    }

    // Remove selection box
    appState.selectionBox.remove();
    appState.selectionBox = null;
}

function preventContextMenu(e) {
    if (appState.isScraping || appState.isTrainingScrape) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}

function handleContextMenu(e) {
    e.preventDefault();

    if (appState.justFinishedScraping) {
        return;
    }

    const dotElement = e.target.closest('.ms-map-dot');
    if (dotElement) {
        const internalId = dotElement.dataset.dotId;
        if (appState.selectedDots.has(internalId) && appState.selectedDots.size > 1) {
            openGroupEditModal();
        } else {
            clearSelection();
            selectDot(internalId);
            updateSelectionUI();
            openEditModal(internalId);
        }
    }
}

function clearSearchHighlights() {
    document
        .querySelectorAll('.ms-search-highlight')
        .forEach(el => el.classList.remove('ms-search-highlight'));
}

function clearSelection() {
    appState.selectedDots.forEach(internalId => {
        const dotElement = document.querySelector('.ms-map-dot[data-dot-id="' + internalId + '"]');
        if (dotElement) {
            dotElement.classList.remove('ms-selected');
            Object.assign(dotElement.style, { boxShadow: '', border: '', zIndex: '' });
        }
    });
    appState.selectedDots.clear();
    document
        .querySelectorAll('.ms-location-item.ms-selected, .ms-grouped-location-item.ms-selected')
        .forEach(item => {
            item.classList.remove('ms-selected');
        });
    updateSelectionUI();
}

function selectDot(internalId, scrollToView = true) {
    appState.selectedDots.add(internalId);
    const dotElement = document.querySelector('.ms-map-dot[data-dot-id="' + internalId + '"]');
    if (dotElement) {
        dotElement.classList.add('ms-selected');
        Object.assign(dotElement.style, {
            boxShadow: '0 0 15px #00ff88, 0 0 30px #00ff88',
            border: '2px solid #00ff88',
            zIndex: '200'
        });
    }
    // Update list item highlighting and optionally scroll into view
    const listItem = document.querySelector(
        `.ms-location-item[data-dot-id="${internalId}"], .ms-grouped-location-item[data-dot-id="${internalId}"]`
    );
    if (listItem) {
        listItem.classList.add('ms-selected');
        if (scrollToView) {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function deselectDot(internalId) {
    appState.selectedDots.delete(internalId);
    const dotElement = document.querySelector('.ms-map-dot[data-dot-id="' + internalId + '"]');
    if (dotElement) {
        dotElement.classList.remove('ms-selected');
        Object.assign(dotElement.style, { boxShadow: '', border: '', zIndex: '' });
    }
    // Update list item highlighting
    const listItem = document.querySelector(
        `.ms-location-item[data-dot-id="${internalId}"], .ms-grouped-location-item[data-dot-id="${internalId}"]`
    );
    if (listItem) {
        listItem.classList.remove('ms-selected');
    }
}

function toggleDotSelection(internalId) {
    if (appState.selectedDots.has(internalId)) {
        deselectDot(internalId);
    } else {
        // Don't scroll when multi-selecting
        selectDot(internalId, false);
    }
}

function updateSelectionUI() {
    updateListHighlighting();
}

function updateListHighlighting() {
    document.querySelectorAll('.ms-location-item, .ms-grouped-location-item').forEach(item => {
        const internalId = item.dataset.dotId;
        item.classList.toggle('ms-selected', appState.selectedDots.has(internalId));
    });
}

// Create a dot object without modifying state
function createDotObject(x, y, markerTypeCode, message, providedLocationNumber = null) {
    const pageData = getCurrentPageData();
    const effectiveMarkerTypeCode =
        markerTypeCode || appState.activeMarkerType || Object.keys(appState.markerTypes)[0];

    if (!effectiveMarkerTypeCode) {
        console.log('Cannot create dot: No marker types exist');

        // Flash the add marker type button to guide the user
        const addMarkerTypeBtn = document.getElementById('add-marker-type-btn');
        if (addMarkerTypeBtn) {
            addMarkerTypeBtn.classList.add('ms-flash-green');
            setTimeout(() => {
                addMarkerTypeBtn.classList.remove('ms-flash-green');
            }, 1800); // 3 flashes × 0.6s = 1.8s
        }

        return null;
    }

    // Get the marker type to inherit properties
    const markerTypeData = appState.markerTypes[effectiveMarkerTypeCode];

    const internalId = String(appState.nextInternalId).padStart(7, '0');

    let locationNumber;
    if (providedLocationNumber !== null) {
        locationNumber = String(providedLocationNumber).padStart(4, '0');
    } else {
        let highestLocationNum = 0;
        for (const dot of pageData.dots.values()) {
            const num = parseInt(dot.locationNumber, 10);
            if (!isNaN(num) && num > highestLocationNum) {
                highestLocationNum = num;
            }
        }
        locationNumber = String(highestLocationNum + 1).padStart(4, '0');
    }

    const dot = {
        internalId: internalId,
        locationNumber: locationNumber,
        x: x,
        y: y,
        markerType: effectiveMarkerTypeCode,
        message: message || 'MESSAGE 1',
        message2: '',
        notes: '',
        installed: false,
        flags: {
            topLeft: false,
            topRight: false,
            bottomLeft: false,
            bottomRight: false
        }
    };

    // Increment for next time (but don't save to state yet)
    appState.nextInternalId++;

    return dot;
}

// Legacy function - now just creates and adds a dot using the command system
// Legacy function - now uses the command system
function addDot(x, y, markerTypeCode, message) {
    const dot = createDotObject(x, y, markerTypeCode, message);
    if (!dot) return;

    // Execute the add command
    const command = new AddDotCommand(appState.currentPdfPage, dot);
    CommandUndoManager.execute(command).then(() => {
        // Invalidate cache when dot is added
        invalidateDotCountCache();
        // Update the UI after command executes
        updateSingleDot(dot.internalId);
        updateLocationList(); // Use full list update for consistency
        updateMapLegend(); // Update the page legend
        updateProjectLegend(); // Update the project legend
        setDirtyState();
    });

    return dot;
}

function addDotToData(x, y, markerTypeCode, message, message2) {
    const dot = addDot(x, y, markerTypeCode, message);
    // Don't capture here - capture should happen after the dot is fully rendered
    return dot;
}

function isCollision(newX, newY) {
    const dots = getCurrentPageDots();
    const minDistance = 20 * appState.dotSize + 1;
    for (const dot of dots.values()) {
        const distance = Math.sqrt(Math.pow(dot.x - newX, 2) + Math.pow(dot.y - newY, 2));
        if (distance < minDistance) {
            return true;
        }
    }
    return false;
}

function handleMarkerTypeCodeChange(input) {
    const newCode = input.value.trim();
    const originalCode = input.dataset.originalCode;

    if (!newCode || newCode === originalCode) {
        input.value = originalCode;
        return;
    }

    if (appState.markerTypes[newCode] && newCode !== originalCode) {
        alert('A marker type with this code already exists.');
        input.value = originalCode;
        return;
    }

    // Store the type data before deleting
    const typeData = appState.markerTypes[originalCode];
    if (!typeData) {
        console.error('Could not find marker type data for:', originalCode);
        return;
    }

    // Update the marker types object
    delete appState.markerTypes[originalCode];
    appState.markerTypes[newCode] = typeData;

    // Update all dots across all pages that use this marker type
    for (const [pageNum, pageData] of appState.dotsByPage.entries()) {
        for (const [dotId, dot] of pageData.dots.entries()) {
            if (dot.markerType === originalCode) {
                dot.markerType = newCode;
                console.log(
                    `Updated dot ${dotId} on page ${pageNum} from ${originalCode} to ${newCode}`
                );
            }
        }
    }

    // Update active marker type if it was the one being changed
    if (appState.activeMarkerType === originalCode) {
        appState.activeMarkerType = newCode;
    }

    // Update the data attribute for future changes
    input.dataset.originalCode = newCode;

    // Mark as dirty and update UI
    setDirtyState();

    // Force a complete refresh of all UI elements
    setTimeout(() => {
        // Use immediate update to bypass debouncing
        updateFilterCheckboxesImmediate();
        updateMarkerTypeSelect();
        updateMapLegend();
        updateProjectLegend();

        // Force clear and rebuild the location list
        const container = document.getElementById('location-list');
        if (container) {
            container.innerHTML = ''; // Clear it completely
        }
        updateLocationList(); // Rebuild from scratch

        renderDotsForCurrentPage();

        // Also trigger a filter apply to ensure list is properly filtered
        applyFilters();

        console.log(`Marker type ${originalCode} changed to ${newCode}, UI updated`);
    }, 10); // Small delay to ensure DOM updates have completed
}

function handleMarkerTypeNameChange(input) {
    const newName = input.value.trim();
    const originalName = input.dataset.originalName;
    const code = input.dataset.code;

    if (!newName) {
        input.value = originalName;
        return;
    }

    appState.markerTypes[code].name = newName;
    input.dataset.originalName = newName;
    setDirtyState();
    updateAllSectionsForCurrentPage();
}

async function deleteMarkerType(markerTypeCode) {
    // Use sync adapter if available
    if (window.mappingApp && window.mappingApp.syncAdapter) {
        try {
            const result = await window.mappingApp.syncAdapter.deleteMarkerType(
                markerTypeCode,
                message => confirm(message)
            );

            if (!result) return; // User cancelled
        } catch (error) {
            console.error('Failed to delete marker type via sync:', error);
            // Fallback to direct deletion
            deleteMarkerTypeDirectly(markerTypeCode);
        }
    } else {
        // Direct deletion when sync not available
        deleteMarkerTypeDirectly(markerTypeCode);
    }
}

function deleteMarkerTypeDirectly(markerTypeCode) {
    let dotsCount = 0;
    for (const pageData of appState.dotsByPage.values()) {
        for (const dot of pageData.dots.values()) {
            if (dot.markerType === markerTypeCode) {
                dotsCount++;
            }
        }
    }

    const typeData = appState.markerTypes[markerTypeCode];
    const confirmMessage =
        dotsCount > 0
            ? 'Delete marker type "' +
              markerTypeCode +
              ' - ' +
              typeData.name +
              '" and ' +
              dotsCount +
              ' associated dots?'
            : 'Delete marker type "' + markerTypeCode + ' - ' + typeData.name + '"?';

    if (!confirm(confirmMessage)) return;

    for (const pageData of appState.dotsByPage.values()) {
        const dotsToRemove = [];
        for (const [id, dot] of pageData.dots.entries()) {
            if (dot.markerType === markerTypeCode) {
                dotsToRemove.push(id);
            }
        }
        dotsToRemove.forEach(id => pageData.dots.delete(id));
    }

    delete appState.markerTypes[markerTypeCode];

    if (appState.activeMarkerType === markerTypeCode) {
        const remainingTypes = Object.keys(appState.markerTypes);
        appState.activeMarkerType = remainingTypes.length > 0 ? remainingTypes[0] : null;
    }

    setDirtyState();
    updateAllSectionsForCurrentPage();
    renderDotsForCurrentPage();
}

function handleDesignReferenceUpload(file, markerTypeCode) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (JPEG, PNG).');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('Image file is too large. Please use an image smaller than 5MB.');
        return;
    }

    const reader = new FileReader();

    reader.onload = e => {
        if (!appState.markerTypes[markerTypeCode]) {
            return;
        }

        appState.markerTypes[markerTypeCode].designReference = e.target.result;
        setDirtyState();
        updateFilterCheckboxes();
    };

    reader.onerror = () => {
        alert('Failed to read the image file.');
    };

    reader.readAsDataURL(file);
}

function handleDesignReferenceDelete(markerTypeCode) {
    appState.markerTypes[markerTypeCode].designReference = null;
    setDirtyState();
    updateFilterCheckboxes();
}

function toggleMarkerTypeExpansion(markerTypeCode) {
    if (appState.expandedMarkerTypes.has(markerTypeCode)) {
        appState.expandedMarkerTypes.delete(markerTypeCode);
    } else {
        appState.expandedMarkerTypes.add(markerTypeCode);
    }
    updateLocationList();
}

function exportMarkerTypes() {
    try {
        // Create export data with all marker type properties including design references
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            markerTypes: {}
        };

        // Copy all marker type data including design references
        for (const [code, typeData] of Object.entries(appState.markerTypes)) {
            exportData.markerTypes[code] = {
                name: typeData.name,
                color: typeData.color,
                textColor: typeData.textColor || '#FFFFFF',
                defaultVinylBacker: typeData.defaultVinylBacker || false,
                designReference: typeData.designReference || null,
                textFields: typeData.textFields || []
            };
        }

        // Convert to JSON
        const jsonString = JSON.stringify(exportData, null, 2);

        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marker-types-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showCSVStatus('Marker types exported successfully', true, 3000);
    } catch (error) {
        console.error('Error exporting marker types:', error);
        showCSVStatus('Failed to export marker types', false, 4000);
    }
}

function importMarkerTypes() {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            // Validate import data
            if (!importData.markerTypes || typeof importData.markerTypes !== 'object') {
                throw new Error('Invalid marker types file format');
            }

            // Ask for confirmation
            const markerCount = Object.keys(importData.markerTypes).length;
            const existingCount = Object.keys(appState.markerTypes).length;

            // Check for conflicts
            const conflicts = Object.keys(importData.markerTypes).filter(code =>
                Object.prototype.hasOwnProperty.call(appState.markerTypes, code)
            );

            let message = `Import ${markerCount} marker type(s)?`;
            if (existingCount > 0) {
                message += `\n\nYou currently have ${existingCount} marker type(s).`;
                if (conflicts.length > 0) {
                    message += `\n${conflicts.length} marker type(s) will be updated: ${conflicts.join(', ')}`;
                }
            }

            if (!confirm(message)) return;

            // Add/update marker types (don't clear existing ones)
            for (const [code, typeData] of Object.entries(importData.markerTypes)) {
                appState.markerTypes[code] = {
                    name: typeData.name || code,
                    color: typeData.color || '#FF6B6B',
                    textColor: typeData.textColor || '#FFFFFF',
                    defaultVinylBacker: typeData.defaultVinylBacker || false,
                    designReference: typeData.designReference || null,
                    textFields: typeData.textFields || []
                };
            }

            // Update UI
            updateFilterCheckboxes();
            updateMarkerTypeSelect();
            updateLocationList();
            updateMapLegend();
            updateProjectLegend();

            // Trigger manual sync after bulk import

            renderDotsForCurrentPage();
            setDirtyState();

            const addedCount = markerCount - conflicts.length;
            const statusMessage =
                conflicts.length > 0
                    ? `Added ${addedCount} new and updated ${conflicts.length} existing marker type(s)`
                    : `Added ${markerCount} marker type(s) successfully`;
            showCSVStatus(statusMessage, true, 3000);
        } catch (error) {
            console.error('Error importing marker types:', error);
            showCSVStatus('Failed to import marker types: ' + error.message, false, 4000);
        }
    });

    // Trigger file selection
    input.click();
}

async function changePage(pageNum) {
    if (pageNum < 1 || pageNum > appState.totalPages || pageNum === appState.currentPdfPage) return;

    const previousPage = appState.currentPdfPage;
    appState.currentPdfPage = pageNum;
    await renderPDFPage(pageNum);
    await renderDotsForCurrentPage();
    updateAllSectionsForCurrentPage();
    updatePageInfo();
    updatePageLabelInput();

    // Dispatch page changed event
    document.dispatchEvent(new CustomEvent('pageChanged'));

    // Apply any saved crops for this page
    cropTool.applySavedCrop();

    // Don't capture undo state for page navigation - only for dot changes
}

function isDotVisible(internalId) {
    const dotElement = document.querySelector('.ms-map-dot[data-dot-id="' + internalId + '"]');
    if (!dotElement) return false;

    const mapRect = document.getElementById('map-container').getBoundingClientRect();
    const dotRect = dotElement.getBoundingClientRect();

    return !(
        dotRect.right < mapRect.left ||
        dotRect.left > mapRect.right ||
        dotRect.bottom < mapRect.top ||
        dotRect.top > mapRect.bottom
    );
}

function addMarkerTypeEventListener() {
    const addBtn = document.querySelector('#add-marker-type-btn');
    const exportBtn = document.querySelector('#export-marker-types-btn');
    const importBtn = document.querySelector('#import-marker-types-btn');

    // Add right-click handler to marker types header for flag configuration
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        const markerTypesText = document.querySelector(
            '.ms-filter-section .ms-panel-header > span'
        );
        if (markerTypesText) {
            markerTypesText.addEventListener('contextmenu', e => {
                e.preventDefault();
                e.stopPropagation();
                openFlagModal(); // Open global flag configuration modal
            });

            // Add visual hint that text is right-clickable
            markerTypesText.style.cursor = 'context-menu';
            markerTypesText.title = 'Right-click to configure flags';
        }
    }, 100);

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            // Find next available code number
            let codeNum = 1;
            let newCode = `ID.${codeNum}`;

            // Keep incrementing until we find an unused code
            while (appState.markerTypes[newCode]) {
                codeNum++;
                newCode = `ID.${codeNum}`;
            }

            // Use sync adapter if available, otherwise fallback to direct creation
            if (window.mappingApp && window.mappingApp.syncAdapter) {
                try {
                    await window.mappingApp.syncAdapter.createMarkerType(
                        newCode,
                        'Marker Type Name',
                        '#F72020',
                        '#FFFFFF'
                    );
                } catch (error) {
                    console.error('Failed to create marker type via sync:', error);
                    // Fallback to direct creation
                    createMarkerTypeDirectly(newCode);
                }
            } else {
                // Direct creation when sync not available
                createMarkerTypeDirectly(newCode);
            }

            // Set the new marker type as active
            appState.activeMarkerType = newCode;

            updateEditModalOptions();

            // Focus the code input of the newly created marker type
            setTimeout(() => {
                const newCodeInput = document.querySelector(
                    `input.marker-type-code-input[value="${newCode}"]`
                );
                if (newCodeInput) {
                    newCodeInput.focus();
                    newCodeInput.select();
                }
            }, 100);
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportMarkerTypes();
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importMarkerTypes();
        });
    }
}

function addPageNavigationEventListeners() {
    const prevBtn = document.querySelector('#prev-page');
    const nextBtn = document.querySelector('#next-page');
    const pageInput = document.querySelector('#page-label-input');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (appState.currentPdfPage > 1) {
                changePage(appState.currentPdfPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (appState.currentPdfPage < appState.totalPages) {
                changePage(appState.currentPdfPage + 1);
            }
        });
    }

    if (pageInput) {
        pageInput.addEventListener('change', e => {
            const label = e.target.value.trim();
            if (label) {
                appState.pageLabels.set(appState.currentPdfPage, label);
            } else {
                appState.pageLabels.delete(appState.currentPdfPage);
            }
            setDirtyState();
            updateAllSectionsForCurrentPage();
        });

        // Add Enter key support
        pageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur(); // This will trigger the change event
            }
        });
    }

    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'PageUp' && appState.currentPdfPage > 1) {
            e.preventDefault();
            changePage(appState.currentPdfPage - 1);
        } else if (e.key === 'PageDown' && appState.currentPdfPage < appState.totalPages) {
            e.preventDefault();
            changePage(appState.currentPdfPage + 1);
        }
    });
}

function addViewToggleEventListeners() {
    const toggleViewBtn = document.querySelector('#toggle-view-btn');
    const sortToggleBtn = document.querySelector('#sort-toggle-btn');
    const allPagesCheckbox = document.querySelector('#all-pages-checkbox');

    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', () => {
            appState.listViewMode = appState.listViewMode === 'flat' ? 'grouped' : 'flat';
            updateLocationList();
        });
    }

    if (sortToggleBtn) {
        sortToggleBtn.addEventListener('click', () => {
            appState.sortMode = appState.sortMode === 'location' ? 'name' : 'location';
            sortToggleBtn.textContent = appState.sortMode === 'location' ? 'BY LOC' : 'BY NAME';
            updateLocationList();
        });
    }

    if (allPagesCheckbox) {
        allPagesCheckbox.addEventListener('change', e => {
            appState.isAllPagesView = e.target.checked;
            updateLocationList();
        });
    }
}

function setupModalEventListeners() {
    // Controls Modal Event Listeners
    const closeControlsModalBtn = document.getElementById('close-controls-modal-btn');
    if (closeControlsModalBtn) {
        closeControlsModalBtn.addEventListener('click', () => {
            const controlsModal = document.getElementById('mapping-slayer-controls-modal');
            if (controlsModal) {
                controlsModal.style.display = 'none';
            }
        });
    }

    const guideBtn = document.getElementById('guide-btn');
    if (guideBtn) {
        guideBtn.addEventListener('click', () => {
            window.open(
                'https://3toedsoftware.github.io/MappingSlayer-Dev/ms_user_guide.html',
                '_blank'
            );
        });
    }

    // Edit Modal Event Listeners
    const editModal = document.getElementById('mapping-slayer-edit-modal');
    const updateDotBtn = document.getElementById('update-dot-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const deleteDotBtn = document.getElementById('delete-dot-btn');
    const editMarkerTypeSelect = document.getElementById('edit-marker-type');

    if (updateDotBtn) {
        updateDotBtn.addEventListener('click', updateDot);
    }

    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeEditModal);
    }

    if (deleteDotBtn) {
        deleteDotBtn.addEventListener('click', deleteDot);
    }

    // Update fields when marker type changes
    if (editMarkerTypeSelect) {
        editMarkerTypeSelect.addEventListener('change', () => {
            console.log('=== MARKER TYPE CHANGE SNIFFER ===');
            const newMarkerType = editMarkerTypeSelect.value;
            console.log('New marker type selected:', newMarkerType);

            const dot = appState.editingDot ? getCurrentPageDots().get(appState.editingDot) : null;
            console.log('Current dot data:', JSON.parse(JSON.stringify(dot)));

            // Log current field values before regenerating
            const currentValues = {};
            const dynamicFields = document.querySelectorAll(
                '#edit-dynamic-fields input, #edit-dynamic-fields textarea'
            );
            console.log('Current dynamic fields in DOM:', dynamicFields.length);
            dynamicFields.forEach(field => {
                const fieldName = field.id.replace('edit-field-', '');
                currentValues[fieldName] = field.value;
                console.log(`Field "${fieldName}" current value:`, field.value);
            });

            // Check what the new marker type defines
            const markerTypeConfig = appState.markerTypes[newMarkerType];
            console.log('New marker type configuration:', markerTypeConfig);
            console.log('Text fields defined in new marker type:', markerTypeConfig?.textFields);

            generateDynamicTextFields('edit', dot);

            // Log what fields exist after regenerating
            console.log('=== AFTER REGENERATING FIELDS ===');
            const newDynamicFields = document.querySelectorAll(
                '#edit-dynamic-fields input, #edit-dynamic-fields textarea'
            );
            console.log('New dynamic fields in DOM:', newDynamicFields.length);
            newDynamicFields.forEach(field => {
                const fieldName = field.id.replace('edit-field-', '');
                console.log(`New field "${fieldName}" exists, initial value:`, field.value);
            });

            // Restore field values after regenerating
            Object.keys(currentValues).forEach(fieldName => {
                const field = document.getElementById(`edit-field-${fieldName}`);
                if (field) {
                    field.value = currentValues[fieldName];
                    console.log(`Restored "${fieldName}" to:`, currentValues[fieldName]);
                } else {
                    console.log(`WARNING: Field "${fieldName}" no longer exists in DOM!`);
                }
            });
            console.log('=== END MARKER TYPE CHANGE ===');
        });
    }

    // Group Edit Modal Event Listeners
    const groupEditModal = document.getElementById('mapping-slayer-group-edit-modal');
    const groupUpdateBtn = document.getElementById('group-update-btn');
    const groupCancelBtn = document.getElementById('group-cancel-btn');
    const groupDeleteBtn = document.getElementById('group-delete-btn');

    if (groupUpdateBtn) {
        groupUpdateBtn.addEventListener('click', groupUpdateDots);
    }

    if (groupCancelBtn) {
        groupCancelBtn.addEventListener('click', closeGroupEditModal);
    }

    if (groupDeleteBtn) {
        groupDeleteBtn.addEventListener('click', groupDeleteDots);
    }

    // Close modals when clicking outside (but not when selecting text)
    window.addEventListener('mousedown', e => {
        // Track if we're starting a click on the backdrop
        if (e.target === editModal) {
            editModal.dataset.backdropMousedown = 'true';
        }
        if (e.target === groupEditModal) {
            groupEditModal.dataset.backdropMousedown = 'true';
        }
    });

    window.addEventListener('mouseup', e => {
        // Only close if both mousedown and mouseup were on the backdrop
        // This prevents closing when dragging text selection
        if (e.target === editModal && editModal.dataset.backdropMousedown === 'true') {
            const selection = window.getSelection();
            // Don't close if there's text selected
            if (!selection || selection.toString().length === 0) {
                closeEditModal();
            }
        }
        if (e.target === groupEditModal && groupEditModal.dataset.backdropMousedown === 'true') {
            const selection = window.getSelection();
            // Don't close if there's text selected
            if (!selection || selection.toString().length === 0) {
                closeGroupEditModal();
            }
        }
        // Reset the flags
        if (editModal) editModal.dataset.backdropMousedown = 'false';
        if (groupEditModal) groupEditModal.dataset.backdropMousedown = 'false';
    });

    // Close modals with Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (isModalOpen()) {
                closeEditModal();
                closeGroupEditModal();
                closeRenumberModal();
            }
        }
    });

    // Add comprehensive keyboard shortcuts
    setupKeyboardShortcuts();

    // Renumber Modal Event Listeners
    const renumberModal = document.getElementById('mapping-slayer-renumber-modal');
    const cancelRenumberBtn = document.getElementById('cancel-renumber-btn');
    const renumberModalClose = renumberModal?.querySelector('.ms-close');

    if (cancelRenumberBtn) {
        cancelRenumberBtn.addEventListener('click', closeRenumberModal);
    }

    if (renumberModalClose) {
        renumberModalClose.addEventListener('click', closeRenumberModal);
    }

    // Close renumber modal when clicking outside (but not when selecting text)
    if (renumberModal) {
        window.addEventListener('mousedown', e => {
            if (e.target === renumberModal) {
                renumberModal.dataset.backdropMousedown = 'true';
            }
        });

        window.addEventListener('mouseup', e => {
            if (e.target === renumberModal && renumberModal.dataset.backdropMousedown === 'true') {
                const selection = window.getSelection();
                // Don't close if there's text selected
                if (!selection || selection.toString().length === 0) {
                    closeRenumberModal();
                }
            }
            if (renumberModal) renumberModal.dataset.backdropMousedown = 'false';
        });
    }

    // Automap Modal Event Listeners
    const automapModal = document.getElementById('mapping-slayer-automap-progress-modal');
    const cancelAutomapBtn = document.getElementById('cancel-automap-btn');
    const closeAutomapBtn = document.getElementById('close-automap-btn');

    if (cancelAutomapBtn) {
        cancelAutomapBtn.addEventListener('click', async () => {
            const { isAutomapCancelled } = await import('./automap.js');
            window.isAutomapCancelled = true; // Set the cancellation flag
            cancelAutomapBtn.disabled = true;
            cancelAutomapBtn.textContent = 'Cancelling...';
        });
    }

    if (closeAutomapBtn) {
        closeAutomapBtn.addEventListener('click', () => {
            if (automapModal) {
                automapModal.style.display = 'none';
            }
        });
    }

    // PDF Export Modal Event Listeners
    const pdfExportModal = document.getElementById('mapping-slayer-pdf-export-modal');
    const cancelPdfExportBtn = document.getElementById('cancel-pdf-export-btn');
    const pdfExportModalClose = pdfExportModal?.querySelector('.ms-close');

    if (cancelPdfExportBtn) {
        cancelPdfExportBtn.addEventListener('click', () => {
            if (pdfExportModal) {
                pdfExportModal.style.display = 'none';
            }
        });
    }

    if (pdfExportModalClose) {
        pdfExportModalClose.addEventListener('click', () => {
            if (pdfExportModal) {
                pdfExportModal.style.display = 'none';
            }
        });
    }

    // Sign Preview Modal Event Listeners
    const signPreviewCloseBtn = document.getElementById('sign-preview-close-btn');
    if (signPreviewCloseBtn) {
        signPreviewCloseBtn.addEventListener('click', closeSignPreviewModal);
    }

    // Toggle Button Event Listeners
    const toggleSignPreviewBtn = document.getElementById('toggle-sign-preview-btn');
    const toggleGalleryBtn = document.getElementById('toggle-gallery-btn');

    if (toggleSignPreviewBtn) {
        toggleSignPreviewBtn.addEventListener('click', e => {
            e.stopPropagation(); // Prevent event bubbling
            const isActive = toggleSignPreviewBtn.classList.contains('active');
            console.log(
                'Sign Preview button clicked, current state:',
                isActive ? 'active' : 'inactive'
            );

            if (isActive) {
                toggleSignPreviewBtn.classList.remove('active');
                appState.signPreviewToggleActive = false;
                closeSignPreviewModal();
            } else {
                const dot = appState.editingDot
                    ? getCurrentPageDots().get(appState.editingDot)
                    : null;
                if (dot) {
                    openSignPreviewModal(dot);
                    appState.signPreviewToggleActive = true;
                    // Add active class after opening modal to ensure it sticks
                    setTimeout(() => {
                        toggleSignPreviewBtn.classList.add('active');
                    }, 0);
                }
            }
        });
    }

    if (toggleGalleryBtn) {
        toggleGalleryBtn.addEventListener('click', e => {
            e.stopPropagation(); // Prevent event bubbling
            const isActive = toggleGalleryBtn.classList.contains('active');
            console.log('Gallery button clicked, current state:', isActive ? 'active' : 'inactive');

            if (isActive) {
                toggleGalleryBtn.classList.remove('active');
                appState.galleryToggleActive = false;
                closeGalleryModal();
            } else {
                const dot = appState.editingDot
                    ? getCurrentPageDots().get(appState.editingDot)
                    : null;
                if (dot) {
                    openGalleryModal(dot);
                    appState.galleryToggleActive = true;
                    // Add active class after opening modal to ensure it sticks
                    setTimeout(() => {
                        toggleGalleryBtn.classList.add('active');
                    }, 0);
                }
            }
        });
    }
}

function addButtonEventListeners() {
    const toggleMessagesBtn = document.querySelector('#toggle-messages-btn');
    const toggleMessages2Btn = document.querySelector('#toggle-messages2-btn');
    const toggleLocationsBtn = document.querySelector('#toggle-locations-btn');
    const renumberBtn = document.querySelector('#renumber-btn');
    const dotcamBtn = document.querySelector('#dotcam-btn');
    const findInput = document.querySelector('#find-input');
    const replaceInput = document.querySelector('#replace-input');
    const findAllBtn = document.querySelector('#find-all-btn');
    const replaceBtn = document.querySelector('#replace-btn');
    const copyBtn = document.querySelector('#copy-btn');
    const pasteBtn = document.querySelector('#paste-btn');
    const deleteBtn = document.querySelector('#delete-btn');
    const editSelectedBtn = document.querySelector('#edit-selected-btn');

    if (renumberBtn) {
        renumberBtn.addEventListener('click', () => {
            openRenumberModal();
        });
    }

    if (dotcamBtn) {
        dotcamBtn.addEventListener('click', () => {
            isDotcamMode = !isDotcamMode;
            dotcamBtn.classList.toggle('active', isDotcamMode);
            if (isDotcamMode) {
                dotcamBtn.style.background = '#f07727';
                dotcamBtn.style.color = 'white';
            } else {
                dotcamBtn.style.background = '';
                dotcamBtn.style.color = '';
            }
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', copySelectedDots);
    }

    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => await pasteDots());
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => await deleteSelectedDots());
    }

    if (editSelectedBtn) {
        editSelectedBtn.addEventListener('click', () => {
            if (appState.selectedDots.size === 1) {
                const [internalId] = appState.selectedDots;
                openEditModal(internalId);
            } else if (appState.selectedDots.size > 1) {
                openGroupEditModal();
            }
        });
    }

    if (findInput) {
        findInput.addEventListener('input', handleFind);
        findInput.addEventListener('keydown', handleFindEnter);
        // Prevent browser's default undo/redo in find input
        findInput.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
                e.preventDefault();
                // Trigger the app's undo/redo instead
                if (e.key === 'z' && !e.shiftKey) {
                    CommandUndoManager.undo().then(action => {
                        if (action) showCSVStatus(`Undo: ${action}`, true, 2000);
                    });
                } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                    CommandUndoManager.redo().then(action => {
                        if (action) showCSVStatus(`Redo: ${action}`, true, 2000);
                    });
                }
            }
        });
    }

    if (replaceInput) {
        replaceInput.addEventListener('input', updateReplaceStatus);
        // Prevent browser's default undo/redo in replace input
        replaceInput.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
                e.preventDefault();
                // Trigger the app's undo/redo instead
                if (e.key === 'z' && !e.shiftKey) {
                    CommandUndoManager.undo().then(action => {
                        if (action) showCSVStatus(`Undo: ${action}`, true, 2000);
                    });
                } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                    CommandUndoManager.redo().then(action => {
                        if (action) showCSVStatus(`Redo: ${action}`, true, 2000);
                    });
                }
            }
        });
    }

    if (findAllBtn) {
        findAllBtn.addEventListener('click', performFindAll);
    }

    if (replaceBtn) {
        replaceBtn.addEventListener('click', performReplace);
    }

    if (toggleMessagesBtn) {
        // Set initial button text based on current state
        toggleMessagesBtn.textContent = appState.messagesVisible ? 'HIDE MSG1' : 'SHOW MSG1';

        toggleMessagesBtn.addEventListener('click', () => {
            appState.messagesVisible = !appState.messagesVisible;
            toggleMessagesBtn.textContent = appState.messagesVisible ? 'HIDE MSG1' : 'SHOW MSG1';

            document.querySelectorAll('.ms-map-dot-message').forEach(msg => {
                msg.classList.toggle('ms-visible', appState.messagesVisible);
            });
        });
    }

    if (toggleMessages2Btn) {
        toggleMessages2Btn.addEventListener('click', () => {
            appState.messages2Visible = !appState.messages2Visible;
            toggleMessages2Btn.textContent = appState.messages2Visible ? 'HIDE MSG2' : 'SHOW MSG2';

            document.querySelectorAll('.ms-map-dot-message2').forEach(msg => {
                msg.classList.toggle('ms-visible', appState.messages2Visible);
            });
        });
    }

    const toggleInstDisplayBtn = document.getElementById('toggle-inst-display-btn');
    if (toggleInstDisplayBtn) {
        toggleInstDisplayBtn.addEventListener('click', () => {
            // Cycle through: showInst -> instOnly -> hideInst -> showInst
            if (appState.instFilterMode === 'showInst') {
                appState.instFilterMode = 'instOnly';
                toggleInstDisplayBtn.textContent = 'HIDE INST'; // Next action will hide inst
            } else if (appState.instFilterMode === 'instOnly') {
                appState.instFilterMode = 'hideInst';
                toggleInstDisplayBtn.textContent = 'SHOW INST'; // Next action will show inst
            } else {
                appState.instFilterMode = 'showInst';
                toggleInstDisplayBtn.textContent = 'INST ONLY'; // Next action will show inst only
            }

            // Update dots and location list
            renderDotsForCurrentPage();
            updateLocationList();
        });
    }

    if (toggleLocationsBtn) {
        toggleLocationsBtn.addEventListener('click', () => {
            appState.locationsVisible = !appState.locationsVisible;
            toggleLocationsBtn.textContent = appState.locationsVisible ? 'HIDE LOC' : 'SHOW LOC';

            document.querySelectorAll('.ms-dot-number').forEach(num => {
                num.style.display = appState.locationsVisible ? '' : 'none';
            });
        });
    }

    const createPdfBtn = document.querySelector('#create-pdf-btn');
    const createScheduleBtn = document.querySelector('#create-schedule-btn');

    if (createPdfBtn) {
        createPdfBtn.addEventListener('click', async () => {
            const { createAnnotatedPDF } = await import('./export.js');
            createAnnotatedPDF();
        });
    }

    if (createScheduleBtn) {
        createScheduleBtn.addEventListener('click', async () => {
            const { createMessageSchedule } = await import('./export.js');
            createMessageSchedule();
        });
    }

    const exportHtmlBtn = document.querySelector('#export-html-btn');
    if (exportHtmlBtn) {
        exportHtmlBtn.addEventListener('click', async () => {
            const { exportToHTML } = await import('./export.js');
            exportToHTML();
        });
    }

    const updateFromScheduleBtn = document.querySelector('#update-from-schedule-btn');
    const updateCsvInput = document.querySelector('#update-csv-input');

    if (updateFromScheduleBtn && updateCsvInput) {
        updateFromScheduleBtn.addEventListener('click', () => {
            updateCsvInput.click();
        });

        updateCsvInput.addEventListener('change', handleScheduleUpdate);
    }

    const automapBtn = document.querySelector('#single-automap-btn');
    if (automapBtn) {
        automapBtn.addEventListener('click', async () => {
            const { automapSingleLocation } = await import('./automap.js');
            automapSingleLocation();
        });
    }

    const automapTextInput = document.querySelector('#automap-text-input');
    if (automapTextInput) {
        automapTextInput.addEventListener('keydown', async e => {
            if (e.key === 'Enter' && automapBtn && !automapBtn.disabled) {
                e.preventDefault();
                const { automapSingleLocation } = await import('./automap.js');
                automapSingleLocation();
            }
        });
    }
}

// Generate flag checkboxes for edit/group-edit modals
function generateFlagSelectors(modalType, dot, multipleDots = null) {
    const containerId = modalType === 'edit' ? 'edit-modal-flags' : 'group-edit-modal-flags';
    const container = document.getElementById(containerId);
    if (!container) return;

    // Initialize global flag configuration (no longer per-marker-type)
    const flagConfig = initializeMarkerTypeFlags(dot.markerType); // Still works, returns global config

    container.innerHTML = '';

    // Create flag checkboxes for each position
    Object.keys(FLAG_POSITIONS).forEach(key => {
        const position = FLAG_POSITIONS[key];
        const config = flagConfig[position];

        // Always show flag checkboxes (removed symbol requirement)

        const flagDiv = document.createElement('div');
        flagDiv.className = 'ms-form-group-inline';

        // For group edit, check if all dots have the same flag value
        let isChecked = dot.flags ? dot.flags[position] : false;
        let isIndeterminate = false;

        if (multipleDots) {
            const values = multipleDots.map(d => (d.flags ? d.flags[position] : false));
            const allTrue = values.every(v => v === true);
            const allFalse = values.every(v => v === false);
            if (allTrue) {
                isChecked = true;
                isIndeterminate = false;
            } else if (allFalse) {
                isChecked = false;
                isIndeterminate = false;
            } else {
                isChecked = false;
                isIndeterminate = true;
            }
        }

        const checkboxId = `${modalType}-flag-${position}`;

        flagDiv.innerHTML = `
            <label for="${checkboxId}">${config.name}</label>
            <input type="checkbox"
                   id="${checkboxId}"
                   data-position="${position}"
                   title="Toggle ${config.name} flag"
                   ${isChecked ? 'checked' : ''}
                   ${isIndeterminate ? 'indeterminate' : ''}>
        `;

        container.appendChild(flagDiv);

        // Set indeterminate state if needed (must be done after element is in DOM)
        if (isIndeterminate) {
            document.getElementById(checkboxId).indeterminate = true;
        }
    });
}

function openEditModal(internalId) {
    const dot = getCurrentPageDots().get(internalId);
    if (!dot) return;

    // Migrate old properties to new flag system if needed
    migrateDotToFlags(dot);

    appState.editingDot = internalId;
    updateEditModalOptions();
    // Set marker type AFTER updateEditModalOptions to ensure it's not overwritten
    document.getElementById('edit-marker-type').value = dot.markerType;
    document.getElementById('edit-location-number').value = dot.locationNumber;

    // Set installed checkbox
    document.getElementById('edit-installed').checked = dot.installed || false;

    // Generate dynamic text fields based on marker type
    generateDynamicTextFields('edit', dot);

    // Generate flag selectors for this marker type
    generateFlagSelectors('edit', dot);

    document.getElementById('edit-notes').value = dot.notes || '';

    const modal = document.getElementById('mapping-slayer-edit-modal');
    modal.style.display = 'block';

    // Create toggle buttons if they don't exist
    let toggleSignPreviewBtn = document.getElementById('toggle-sign-preview-btn');
    let toggleGalleryBtn = document.getElementById('toggle-gallery-btn');

    if (!toggleSignPreviewBtn || !toggleGalleryBtn) {
        // Find where to insert the buttons
        const installedDiv = document
            .querySelector('#edit-installed')
            ?.closest('.ms-form-group-inline');
        if (installedDiv) {
            // Create container for toggle buttons
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'ms-modal-toggle-buttons';
            toggleContainer.style.marginTop = '10px';

            // Create Sign Preview button
            toggleSignPreviewBtn = document.createElement('button');
            toggleSignPreviewBtn.type = 'button';
            toggleSignPreviewBtn.className = 'ms-modal-toggle-btn';
            toggleSignPreviewBtn.id = 'toggle-sign-preview-btn';
            toggleSignPreviewBtn.title = 'Toggle Sign Preview';
            toggleSignPreviewBtn.textContent = 'SIGN PREVIEW';

            // Create Gallery button
            toggleGalleryBtn = document.createElement('button');
            toggleGalleryBtn.type = 'button';
            toggleGalleryBtn.className = 'ms-modal-toggle-btn';
            toggleGalleryBtn.id = 'toggle-gallery-btn';
            toggleGalleryBtn.title = 'Toggle Gallery';
            toggleGalleryBtn.textContent = 'GALLERY';

            toggleContainer.appendChild(toggleSignPreviewBtn);
            toggleContainer.appendChild(toggleGalleryBtn);

            // Insert after the installed checkbox
            installedDiv.parentNode.insertBefore(toggleContainer, installedDiv.nextSibling);

            // Add event listeners
            toggleSignPreviewBtn.addEventListener('click', e => {
                e.stopPropagation();
                const isActive = toggleSignPreviewBtn.classList.contains('active');

                if (isActive) {
                    toggleSignPreviewBtn.classList.remove('active');
                    appState.signPreviewToggleActive = false;
                    closeSignPreviewModal();
                } else {
                    // Get the current editing dot, not the one from when buttons were created
                    const currentDot = appState.editingDot
                        ? getCurrentPageDots().get(appState.editingDot)
                        : null;
                    if (currentDot) {
                        openSignPreviewModal(currentDot);
                        appState.signPreviewToggleActive = true;
                        toggleSignPreviewBtn.classList.add('active');
                    }
                }
            });

            toggleGalleryBtn.addEventListener('click', e => {
                e.stopPropagation();
                const isActive = toggleGalleryBtn.classList.contains('active');

                if (isActive) {
                    toggleGalleryBtn.classList.remove('active');
                    appState.galleryToggleActive = false;
                    closeGalleryModal();
                } else {
                    // Get the current editing dot, not the one from when buttons were created
                    const currentDot = appState.editingDot
                        ? getCurrentPageDots().get(appState.editingDot)
                        : null;
                    if (currentDot) {
                        openGalleryModal(currentDot);
                        appState.galleryToggleActive = true;
                        toggleGalleryBtn.classList.add('active');
                    }
                }
            });
        }
    } else {
        // Restore toggle button states from appState when opening edit modal
        if (appState.signPreviewToggleActive) {
            toggleSignPreviewBtn.classList.add('active');
            const dot = appState.editingDot ? getCurrentPageDots().get(appState.editingDot) : null;
            if (dot) {
                openSignPreviewModal(dot);
            }
        } else {
            toggleSignPreviewBtn.classList.remove('active');
        }

        if (appState.galleryToggleActive) {
            toggleGalleryBtn.classList.add('active');
            const dot = appState.editingDot ? getCurrentPageDots().get(appState.editingDot) : null;
            if (dot) {
                openGalleryModal(dot);
            }
        } else {
            toggleGalleryBtn.classList.remove('active');
        }
    }
}

function openGroupEditModal() {
    const selectedCount = appState.selectedDots.size;
    if (selectedCount < 2) return;

    document.getElementById('mapping-slayer-group-edit-count').textContent = selectedCount;
    updateEditModalOptions('group-edit-marker-type', true);

    // Generate dynamic fields for group edit
    generateDynamicTextFields('group-edit');

    const selectedDots = Array.from(appState.selectedDots).map(id => getCurrentPageDots().get(id));

    // Migrate all selected dots to new flag system
    selectedDots.forEach(dot => migrateDotToFlags(dot));

    // Generate flag selectors for group edit
    if (selectedDots.length > 0) {
        generateFlagSelectors('group-edit', selectedDots[0], selectedDots);
    }

    // Set installed checkbox state for group edit
    if (selectedDots.length > 0) {
        const installedValues = selectedDots.map(d => d.installed || false);
        const allInstalled = installedValues.every(v => v === true);
        const allNotInstalled = installedValues.every(v => v === false);
        const installedCheckbox = document.getElementById('group-edit-installed');

        if (allInstalled) {
            installedCheckbox.checked = true;
            installedCheckbox.indeterminate = false;
        } else if (allNotInstalled) {
            installedCheckbox.checked = false;
            installedCheckbox.indeterminate = false;
        } else {
            installedCheckbox.checked = false;
            installedCheckbox.indeterminate = true;
        }
    }

    document.getElementById('mapping-slayer-group-edit-modal').style.display = 'block';
}

function closeEditModal() {
    const modal = document.getElementById('mapping-slayer-edit-modal');
    if (modal) {
        modal.style.display = 'none';
        appState.editingDot = null;

        // Clear focus from any input fields to ensure keyboard shortcuts work
        if (
            document.activeElement &&
            (document.activeElement.tagName === 'INPUT' ||
                document.activeElement.tagName === 'TEXTAREA')
        ) {
            document.activeElement.blur();
        }
    }

    // Also close the gallery modal and sign preview modal
    closeGalleryModal();
    closeSignPreviewModal();
}

function closeGroupEditModal() {
    const modal = document.getElementById('mapping-slayer-group-edit-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function isModalOpen() {
    const modals = [
        'mapping-slayer-edit-modal',
        'mapping-slayer-group-edit-modal',
        'mapping-slayer-renumber-modal'
    ];
    return modals.some(id => {
        const modal = document.getElementById(id);
        return modal && modal.style.display === 'block';
    });
}

async function updateDot() {
    console.log('=== UPDATE DOT SNIFFER ===');
    if (!appState.editingDot) return;

    const dot = getCurrentPageDots().get(appState.editingDot);
    if (!dot) return;

    console.log('Dot before update:', JSON.parse(JSON.stringify(dot)));

    // Collect old values
    const oldValues = {
        locationNumber: dot.locationNumber,
        markerType: dot.markerType,
        message: dot.message,
        message2: dot.message2,
        installed: dot.installed,
        notes: dot.notes,
        flags: dot.flags ? { ...dot.flags } : initializeDotFlags()
    };
    console.log('Old values collected:', oldValues);

    // Collect new values from form
    const newValues = {
        locationNumber: document.getElementById('edit-location-number').value,
        markerType: document.getElementById('edit-marker-type').value,
        notes: document.getElementById('edit-notes').value || '',
        installed: document.getElementById('edit-installed').checked,
        flags: dot.flags || initializeDotFlags()
    };

    // Get flag checkbox values
    Object.keys(FLAG_POSITIONS).forEach(key => {
        const position = FLAG_POSITIONS[key];
        const checkbox = document.getElementById(`edit-flag-${position}`);
        if (checkbox) {
            newValues.flags[position] = checkbox.checked;
        }
    });

    // Get dynamic text fields
    const markerType = appState.markerTypes[newValues.markerType];
    console.log('Marker type for save:', newValues.markerType, markerType);

    // If marker type has empty or no textFields, still use default message fields
    let textFields = markerType?.textFields;
    if (!textFields || textFields.length === 0) {
        textFields = [{ fieldName: 'message' }, { fieldName: 'message2' }];
    }
    console.log('Text fields to save:', textFields);

    textFields.forEach(field => {
        const input = document.getElementById(`edit-field-${field.fieldName}`);
        if (input) {
            newValues[field.fieldName] = input.value || '';
            console.log(`Saving field "${field.fieldName}":`, input.value);
        } else {
            console.log(`WARNING: Field "${field.fieldName}" not found in DOM!`);
        }
    });

    console.log('New values to save:', newValues);

    // Create and execute edit command
    const command = new EditDotCommand(
        appState.currentPdfPage,
        appState.editingDot,
        oldValues,
        newValues
    );
    await CommandUndoManager.execute(command);
    console.log('Command executed');
    console.log('=== END UPDATE DOT ===');

    setDirtyState();

    // Sync changes if available
    if (window.mappingApp && window.mappingApp.syncAdapter) {
        try {
            // Sync text field changes
            textFields.forEach(field => {
                if (oldValues[field.fieldName] !== newValues[field.fieldName]) {
                    window.mappingApp.syncAdapter.syncDotChange(
                        dot,
                        field.fieldName,
                        newValues[field.fieldName]
                    );
                }
            });

            // Sync notes changes
            if (oldValues.notes !== newValues.notes) {
                await window.mappingApp.syncAdapter.syncDotChange(dot, 'notes', newValues.notes);
            }
        } catch (error) {
            console.error('Failed to sync dot changes:', error);
        }
    }

    // Use single dot update for better performance
    const updated = updateSingleDot(appState.editingDot);
    if (!updated) {
        // Fallback to full re-render if single update fails
        renderDotsForCurrentPage();
    }
    // Only update what changed, not everything
    updateLocationList();
    updateMapLegend();
    closeEditModal();
}

async function deleteDot() {
    if (!appState.editingDot || !confirm('Delete this location?')) return;

    const dot = getCurrentPageDots().get(appState.editingDot);
    if (!dot) return;

    // Create and execute delete command
    const command = new DeleteDotCommand(appState.currentPdfPage, dot);
    await CommandUndoManager.execute(command);

    // Invalidate cache when dot is deleted
    invalidateDotCountCache();

    setDirtyState();
    renderDotsForCurrentPage();
    updateAllSectionsForCurrentPage();
    closeEditModal();
}

async function groupUpdateDots() {
    const selectedDots = Array.from(appState.selectedDots);
    const markerType = document.getElementById('group-edit-marker-type').value;
    const notes = document.getElementById('group-edit-notes').value;
    const installedCheckbox = document.getElementById('group-edit-installed');

    // Get dynamic field values
    const dynamicFieldValues = {};
    const container = document.getElementById('group-edit-dynamic-fields');
    if (container) {
        const inputs = container.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            if (input.value) {
                const fieldName = input.id.replace('group-edit-field-', '');
                dynamicFieldValues[fieldName] = input.value;
            }
        });
    }

    const compositeCommand = new CompositeCommand('Edit multiple dots');

    for (const internalId of selectedDots) {
        const dot = getCurrentPageDots().get(internalId);
        if (!dot) continue;

        // Collect old values
        const oldValues = {
            markerType: dot.markerType,
            notes: dot.notes,
            installed: dot.installed,
            flags: dot.flags ? { ...dot.flags } : initializeDotFlags()
        };

        // Add dynamic text fields to old values
        const dotMarkerType = appState.markerTypes[dot.markerType];
        let textFields = dotMarkerType?.textFields;
        // If marker type has empty or no textFields, still preserve default message fields
        if (!textFields || textFields.length === 0) {
            textFields = [{ fieldName: 'message' }, { fieldName: 'message2' }];
        }

        textFields.forEach(field => {
            oldValues[field.fieldName] = dot[field.fieldName] || '';
        });
        Object.entries(dynamicFieldValues).forEach(([fieldName, value]) => {
            if (!Object.prototype.hasOwnProperty.call(oldValues, fieldName)) {
                oldValues[fieldName] = dot[fieldName] || '';
            }
        });

        // Collect new values (deep copy to avoid reference issues)
        const newValues = { ...oldValues };
        // Deep copy the flags object to avoid modifying the original
        newValues.flags = { ...oldValues.flags };

        // Apply changes to new values
        Object.entries(dynamicFieldValues).forEach(([fieldName, value]) => {
            newValues[fieldName] = value;
        });

        if (markerType) newValues.markerType = markerType;
        if (notes) newValues.notes = notes;

        // Apply installed checkbox if not indeterminate
        if (installedCheckbox && !installedCheckbox.indeterminate) {
            newValues.installed = installedCheckbox.checked;
        }

        // Apply flag checkbox changes if any (skip indeterminate checkboxes)
        Object.keys(FLAG_POSITIONS).forEach(key => {
            const position = FLAG_POSITIONS[key];
            const checkbox = document.getElementById(`group-edit-flag-${position}`);
            if (checkbox && !checkbox.indeterminate) {
                newValues.flags[position] = checkbox.checked;
            }
        });

        // Only create command if there are actual changes
        const hasChanges = Object.keys(newValues).some(key => {
            if (key === 'flags') {
                // For flags, compare each flag value individually
                return Object.keys(FLAG_POSITIONS).some(posKey => {
                    const position = FLAG_POSITIONS[posKey];
                    return oldValues.flags[position] !== newValues.flags[position];
                });
            }
            return oldValues[key] !== newValues[key];
        });

        if (hasChanges) {
            const editCommand = new EditDotCommand(
                appState.currentPdfPage,
                internalId,
                oldValues,
                newValues
            );
            compositeCommand.add(editCommand);
        }
    }

    // Execute the composite command if there are any changes
    if (compositeCommand.commands.length > 0) {
        await CommandUndoManager.execute(compositeCommand);
    }

    setDirtyState();
    renderDotsForCurrentPage();
    updateAllSectionsForCurrentPage();
    clearSelection();
    updateSelectionUI();
    closeGroupEditModal();
}

async function groupDeleteDots() {
    const count = appState.selectedDots.size;
    if (!confirm('Delete ' + count + ' selected locations?')) return;

    const compositeCommand = new CompositeCommand(`Delete ${count} dots`);

    appState.selectedDots.forEach(internalId => {
        const dot = getCurrentPageDots().get(internalId);
        if (dot) {
            const deleteCommand = new DeleteDotCommand(appState.currentPdfPage, dot);
            compositeCommand.add(deleteCommand);
        }
    });

    if (compositeCommand.commands.length > 0) {
        await CommandUndoManager.execute(compositeCommand);
    }

    setDirtyState();
    renderDotsForCurrentPage();
    updateAllSectionsForCurrentPage();
    clearSelection();
    updateSelectionUI();
    closeGroupEditModal();
}

function openRenumberModal() {
    const modal = document.getElementById('mapping-slayer-renumber-modal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeRenumberModal() {
    const modal = document.getElementById('mapping-slayer-renumber-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function performRenumber(type) {
    let count = 0;
    let description = '';

    switch (type) {
        case 'page':
            count = renumberCurrentPage();
            description = 'Renumber current page';
            break;
        case 'page-by-type':
            count = renumberCurrentPageByMarkerType();
            description = 'Renumber current page by marker type';
            break;
        case 'all':
            count = renumberAllPages();
            description = 'Renumber all pages';
            break;
        case 'all-by-type':
            count = renumberAllPagesByMarkerType();
            description = 'Renumber all pages by marker type';
            break;
    }

    closeRenumberModal();

    renderDotsForCurrentPage();
    updateAllSectionsForCurrentPage();
    setDirtyState();

    // Capture undo state if any dots were renumbered
    if (count > 0) {
        // TODO: Convert to Command Pattern
        // UndoManager.capture(description);
    }

    showCSVStatus('Successfully renumbered ' + count + ' locations', true);
}

function renumberCurrentPage() {
    const pageData = getCurrentPageData();
    const dots = Array.from(pageData.dots.values());

    dots.sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) < 30) {
            return a.x - b.x;
        }
        return yDiff;
    });

    dots.forEach((dot, index) => {
        dot.locationNumber = String(index + 1).padStart(4, '0');
    });

    pageData.nextLocationNumber = dots.length + 1;
    return dots.length;
}

function renumberCurrentPageByMarkerType() {
    const pageData = getCurrentPageData();
    const dots = Array.from(pageData.dots.values());
    const dotsByType = {};

    dots.forEach(dot => {
        if (!dotsByType[dot.markerType]) {
            dotsByType[dot.markerType] = [];
        }
        dotsByType[dot.markerType].push(dot);
    });

    const sortedMarkerTypes = Object.keys(dotsByType).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    let highestNumber = 0;
    sortedMarkerTypes.forEach(markerType => {
        const typeDots = dotsByType[markerType];
        typeDots.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 30) {
                return a.x - b.x;
            }
            return yDiff;
        });

        typeDots.forEach((dot, index) => {
            dot.locationNumber = String(index + 1).padStart(4, '0');
            highestNumber = Math.max(highestNumber, index + 1);
        });
    });

    pageData.nextLocationNumber = highestNumber + 1;
    return dots.length;
}

function renumberAllPages() {
    let globalCounter = 1;
    let totalDots = 0;

    for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
        const pageData = getDotsForPage(pageNum);
        const dots = Array.from(pageData.values());

        dots.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 30) {
                return a.x - b.x;
            }
            return yDiff;
        });

        dots.forEach(dot => {
            dot.locationNumber = String(globalCounter).padStart(4, '0');
            globalCounter++;
        });

        totalDots += dots.length;
    }

    return totalDots;
}

function renumberAllPagesByMarkerType() {
    const allDotsByType = {};
    let totalDots = 0;

    // Collect all dots from all pages
    for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
        const pageData = getDotsForPage(pageNum);
        pageData.forEach(dot => {
            if (!allDotsByType[dot.markerType]) {
                allDotsByType[dot.markerType] = [];
            }
            allDotsByType[dot.markerType].push({ dot, pageNum });
            totalDots++;
        });
    }

    const sortedMarkerTypes = Object.keys(allDotsByType).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    sortedMarkerTypes.forEach(markerType => {
        const dotInfos = allDotsByType[markerType];

        // Sort by page number first, then by position
        dotInfos.sort((a, b) => {
            if (a.pageNum !== b.pageNum) {
                return a.pageNum - b.pageNum;
            }
            const yDiff = a.dot.y - b.dot.y;
            if (Math.abs(yDiff) < 30) {
                return a.dot.x - b.dot.x;
            }
            return yDiff;
        });

        dotInfos.forEach((info, index) => {
            info.dot.locationNumber = String(index + 1).padStart(4, '0');
        });
    });

    return totalDots;
}

// Find and Replace Functions
function handleFind(e) {
    const query = e.target.value.toLowerCase().trim();
    const findInput = e.target;

    clearSearchHighlights();

    if (!query) {
        findInput.classList.remove('ms-has-results', 'ms-no-results');
        appState.searchResults = [];
        appState.currentSearchIndex = -1;
        updateReplaceStatus();
        return;
    }

    appState.searchResults = Array.from(getCurrentPageDots().values()).filter(
        dot =>
            dot.locationNumber.toLowerCase().includes(query) ||
            dot.message.toLowerCase().includes(query) ||
            (dot.message2 && dot.message2.toLowerCase().includes(query))
    );

    if (appState.searchResults.length > 0) {
        appState.currentSearchIndex = 0;
        findInput.classList.add('ms-has-results');
        findInput.classList.remove('ms-no-results');
        updateFindUI();
    } else {
        appState.currentSearchIndex = -1;
        findInput.classList.add('ms-no-results');
        findInput.classList.remove('ms-has-results');
    }
    updateReplaceStatus();
}

function handleFindEnter(e) {
    if (e.key === 'Enter' && appState.searchResults.length > 0) {
        e.preventDefault();
        appState.currentSearchIndex =
            (appState.currentSearchIndex + 1) % appState.searchResults.length;
        updateFindUI();
    }
}

function updateFindUI() {
    clearSearchHighlights();

    if (appState.searchResults.length > 0) {
        const dot = appState.searchResults[appState.currentSearchIndex];

        // Always center on the dot to bring it into viewport
        centerOnDot(dot.internalId);

        // Give viewport update time to render the dot, then highlight it
        setTimeout(() => {
            const dotElement = document.querySelector(
                `.ms-map-dot[data-dot-id="${dot.internalId}"]`
            );
            if (dotElement) {
                dotElement.classList.add('ms-search-highlight');
            }

            // Also highlight in the list
            const listItem = document.querySelector(
                `.location-item[data-dot-id="${dot.internalId}"], .grouped-location-item[data-dot-id="${dot.internalId}"]`
            );
            if (listItem) {
                listItem.classList.add('ms-search-highlight');
                listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
}

function zoomToFitSelectedDots() {
    if (appState.selectedDots.size === 0) return;

    const dots = getCurrentPageDots();
    let minX = Infinity,
        minY = Infinity;
    let maxX = -Infinity,
        maxY = -Infinity;

    // Find bounds of selected dots
    appState.selectedDots.forEach(id => {
        const dot = dots.get(id);
        if (dot) {
            minX = Math.min(minX, dot.x);
            minY = Math.min(minY, dot.y);
            maxX = Math.max(maxX, dot.x);
            maxY = Math.max(maxY, dot.y);
        }
    });

    // Add padding
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Calculate required scale and position
    const mapContainer = document.getElementById('map-container');
    const containerRect = mapContainer.getBoundingClientRect();
    const width = maxX - minX;
    const height = maxY - minY;

    // Calculate scale to fit both dimensions
    const scaleX = containerRect.width / width;
    const scaleY = containerRect.height / height;
    const scale = Math.min(scaleX, scaleY, 3); // Cap at 3x zoom

    // Center the selection
    appState.mapTransform.scale = scale;
    appState.mapTransform.x = (containerRect.width - width * scale) / 2 - minX * scale;
    appState.mapTransform.y = (containerRect.height - height * scale) / 2 - minY * scale;

    applyMapTransform();
}

function performFindAll() {
    const findText = document.getElementById('find-input').value.toLowerCase();
    if (!findText) return;

    clearSelection();

    const dots = getCurrentPageDots();
    const matches = [];

    dots.forEach((dot, id) => {
        if (
            dot.message.toLowerCase().includes(findText) ||
            (dot.message2 && dot.message2.toLowerCase().includes(findText))
        ) {
            matches.push(id);
            selectDot(id);
        }
    });

    updateSelectionUI();
    updateReplaceStatus();

    if (matches.length > 0) {
        showCSVStatus('Selected ' + matches.length + ' locations with matching text', true);
        zoomToFitSelectedDots();
    } else {
        showCSVStatus('No locations found with matching text', false);
    }
}

function performReplace() {
    const findText = document.getElementById('find-input').value;
    const replaceText = document.getElementById('replace-input').value;

    if (!findText || appState.selectedDots.size === 0) return;

    let replacedCount = 0;
    const regex = new RegExp(escapeRegExp(findText), 'gi');

    appState.selectedDots.forEach(id => {
        const dot = getCurrentPageDots().get(id);
        if (!dot) return;

        const originalMessage = dot.message;
        const originalMessage2 = dot.message2 || '';

        if (regex.test(originalMessage)) {
            dot.message = originalMessage.replace(regex, replaceText);
            replacedCount++;
        }

        if (regex.test(originalMessage2)) {
            dot.message2 = originalMessage2.replace(regex, replaceText);
            if (originalMessage === dot.message) {
                replacedCount++;
            }
        }
    });

    if (replacedCount > 0) {
        setDirtyState();
        renderDotsForCurrentPage();
        updateAllSectionsForCurrentPage();
        document.getElementById('replace-input').value = '';
        showCSVStatus('Replaced text in ' + replacedCount + ' locations', true);
        // TODO: Convert to Command Pattern
        // UndoManager.capture(`Replace "${findText}" with "${replaceText}"`);
    }

    updateReplaceStatus();
}

function updateReplaceStatus() {
    const findInput = document.getElementById('find-input');
    const replaceBtn = document.getElementById('replace-btn');
    const findAllBtn = document.getElementById('find-all-btn');
    const statusDiv = document.getElementById('replace-status');

    const searchText = findInput.value.toLowerCase();

    if (!searchText) {
        statusDiv.innerHTML = '';
        if (findAllBtn) findAllBtn.disabled = true;
        if (replaceBtn) replaceBtn.disabled = true;
        return;
    }

    if (findAllBtn) findAllBtn.disabled = false;

    const dots = getCurrentPageDots();
    let totalMatches = 0;
    let selectedMatches = 0;

    dots.forEach((dot, id) => {
        if (
            dot.message.toLowerCase().includes(searchText) ||
            (dot.message2 && dot.message2.toLowerCase().includes(searchText))
        ) {
            totalMatches++;
            if (appState.selectedDots.has(id)) {
                selectedMatches++;
            }
        }
    });

    if (appState.selectedDots.size === 0) {
        statusDiv.innerHTML = totalMatches + ' matches on this page';
        if (replaceBtn) replaceBtn.disabled = true;
    } else {
        statusDiv.innerHTML =
            appState.selectedDots.size + ' selected, ' + selectedMatches + ' with matches';
        if (replaceBtn) replaceBtn.disabled = selectedMatches === 0;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function zoomToFitDots(dotIds) {
    console.log('[zoomToFitDots] Called with', dotIds.length, 'dot IDs');
    if (dotIds.length === 0) return;

    const dots = dotIds.map(id => getCurrentPageDots().get(id)).filter(dot => dot);
    console.log('[zoomToFitDots] Found', dots.length, 'valid dots');
    if (dots.length === 0) return;

    // Calculate bounds of all dots
    let minX = dots[0].x,
        maxX = dots[0].x;
    let minY = dots[0].y,
        maxY = dots[0].y;

    dots.forEach(dot => {
        minX = Math.min(minX, dot.x);
        maxX = Math.max(maxX, dot.x);
        minY = Math.min(minY, dot.y);
        maxY = Math.max(maxY, dot.y);
    });

    // Add padding
    const padding = 100;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    // Calculate required scale and position
    const container = document.getElementById('map-container');
    if (!container) {
        console.log('[zoomToFitDots] Container not found');
        return;
    }

    const containerRect = container.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
        console.log('[zoomToFitDots] Container has no size, retrying...');
        // Retry after a short delay
        setTimeout(() => zoomToFitDots(dotIds), 100);
        return;
    }

    const scaleX = containerRect.width / (maxX - minX);
    const scaleY = containerRect.height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

    // Center the bounds
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    appState.mapTransform.scale = scale;
    appState.mapTransform.x = containerRect.width / 2 - centerX * scale;
    appState.mapTransform.y = containerRect.height / 2 - centerY * scale;

    console.log('[zoomToFitDots] Setting transform:', {
        scale: scale,
        x: appState.mapTransform.x,
        y: appState.mapTransform.y,
        bounds: { minX, maxX, minY, maxY },
        container: { width: containerRect.width, height: containerRect.height }
    });

    applyMapTransform();
    console.log('[zoomToFitDots] Completed');
}

function updateRecentSearches(searchTerm) {
    appState.recentSearches = appState.recentSearches.filter(s => s !== searchTerm);
    appState.recentSearches.unshift(searchTerm);
    if (appState.recentSearches.length > 10) {
        appState.recentSearches.pop();
    }
    updateAutomapControls();
    setDirtyState();
}

function updateAutomapControls() {
    const datalist = document.getElementById('recent-searches-datalist');
    if (datalist) {
        datalist.innerHTML = appState.recentSearches
            .map(search => '<option value="' + search + '"></option>')
            .join('');
    }
}

// Clipboard state
let clipboard = [];

function copySelectedDots() {
    if (appState.selectedDots.size !== 1) {
        showCSVStatus('Please select exactly one dot to copy', false);
        return;
    }

    clipboard = [];
    const dots = getCurrentPageDots();
    const [internalId] = appState.selectedDots;
    const dot = dots.get(internalId);

    if (dot) {
        // Migrate old properties to new flag system if needed
        migrateDotToFlags(dot);

        clipboard = [
            {
                message: dot.message,
                message2: dot.message2 || '',
                markerType: dot.markerType,
                notes: dot.notes || '',
                flags: dot.flags ? { ...dot.flags } : initializeDotFlags()
            }
        ];
        showCSVStatus('Copied 1 dot');
    }
}

async function pasteDots() {
    if (clipboard.length === 0) {
        showCSVStatus('Nothing to paste', false);
        return;
    }

    const clipDot = clipboard[0];

    // Use last mouse position from appState
    const pasteX = appState.lastMousePosition.x;
    const pasteY = appState.lastMousePosition.y;

    if (!isCollision(pasteX, pasteY)) {
        clearSelection();

        // Generate next location number by finding highest existing number
        const pageData = getCurrentPageData();
        let highestLocationNum = 0;
        for (const dot of pageData.dots.values()) {
            const num = parseInt(dot.locationNumber, 10);
            if (!isNaN(num) && num > highestLocationNum) {
                highestLocationNum = num;
            }
        }
        const nextLocationNumber = String(highestLocationNum + 1).padStart(4, '0');

        // Create new dot with ALL properties including flags
        const newDot = {
            internalId: String(appState.nextInternalId++).padStart(7, '0'),
            locationNumber: nextLocationNumber,
            x: pasteX,
            y: pasteY,
            markerType: clipDot.markerType,
            message: clipDot.message || 'MESSAGE 1',
            message2: clipDot.message2 || '',
            notes: clipDot.notes || '',
            flags: clipDot.flags ? { ...clipDot.flags } : initializeDotFlags()
        };

        // Use AddDotCommand to add the dot
        const command = new AddDotCommand(appState.currentPdfPage, newDot);
        await CommandUndoManager.execute(command);

        // Select the newly created dot
        selectDot(newDot.internalId);

        renderDotsForCurrentPage();
        updateAllSectionsForCurrentPage();
        updateSelectionUI();
        setDirtyState();

        showCSVStatus('Pasted 1 dot');
    } else {
        showCSVStatus('Cannot paste - collision at cursor location', false);
    }
}

async function pasteDotAtPosition(x, y) {
    if (clipboard.length === 0) {
        showCSVStatus('Nothing to paste', false);
        return;
    }

    const clipDot = clipboard[0];

    if (!isCollision(x, y)) {
        clearSelection();

        // Generate next location number by finding highest existing number
        const pageData = getCurrentPageData();
        let highestLocationNum = 0;
        for (const dot of pageData.dots.values()) {
            const num = parseInt(dot.locationNumber, 10);
            if (!isNaN(num) && num > highestLocationNum) {
                highestLocationNum = num;
            }
        }
        const nextLocationNumber = String(highestLocationNum + 1).padStart(4, '0');

        // Create new dot object with all copied properties INCLUDING flags
        const newDot = {
            internalId: String(appState.nextInternalId++).padStart(7, '0'),
            locationNumber: nextLocationNumber,
            x: x,
            y: y,
            markerType: clipDot.markerType,
            message: clipDot.message || '',
            message2: clipDot.message2 || '',
            notes: clipDot.notes || '',
            flags: clipDot.flags ? { ...clipDot.flags } : initializeDotFlags()
        };

        // Use AddDotCommand to add the dot
        const command = new AddDotCommand(appState.currentPdfPage, newDot);
        await CommandUndoManager.execute(command);

        // Get the created dot's internal ID for selection
        const dots = getCurrentPageDots();
        const createdDotEntry = Array.from(dots.entries()).find(
            ([id, dot]) => dot.x === x && dot.y === y && dot.markerType === clipDot.markerType
        );

        if (createdDotEntry) {
            selectDot(createdDotEntry[0]);
        }

        renderDotsForCurrentPage();
        updateAllSectionsForCurrentPage();
        updateSelectionUI();
        setDirtyState();

        showCSVStatus('Pasted 1 dot');
    } else {
        showCSVStatus('Cannot paste - collision at location', false);
    }
}

function selectAllDotsOnPage() {
    const dots = getCurrentPageDots();
    clearSelection();

    dots.forEach((dot, internalId) => {
        selectDot(internalId);
    });

    if (dots.size > 0) {
        showCSVStatus(`Selected ${dots.size} dots`);
    }
}

function selectAllDotsOfMarkerType(markerTypeCode) {
    clearSelection();

    let selectedCount = 0;

    if (appState.isAllPagesView) {
        // Select from all pages
        for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
            const dotsOnPage = getDotsForPage(pageNum);
            dotsOnPage.forEach((dot, internalId) => {
                if (dot.markerType === markerTypeCode) {
                    selectDot(internalId);
                    selectedCount++;
                }
            });
        }
    } else {
        // Select from current page only
        const dots = getCurrentPageDots();
        dots.forEach((dot, internalId) => {
            if (dot.markerType === markerTypeCode) {
                selectDot(internalId);
                selectedCount++;
            }
        });
    }

    if (selectedCount > 0) {
        const markerTypeName = appState.markerTypes[markerTypeCode]?.name || markerTypeCode;
        showCSVStatus(`Selected ${selectedCount} dots of type "${markerTypeName}"`);
    }

    updateSelectionUI();
}

async function deleteSelectedDots() {
    if (appState.selectedDots.size === 0) return;

    const count = appState.selectedDots.size;
    const compositeCommand = new CompositeCommand(`Delete ${count} dot(s)`);

    appState.selectedDots.forEach(internalId => {
        const dot = getCurrentPageDots().get(internalId);
        if (dot) {
            const deleteCommand = new DeleteDotCommand(appState.currentPdfPage, dot);
            compositeCommand.add(deleteCommand);
        }
    });

    if (compositeCommand.commands.length > 0) {
        await CommandUndoManager.execute(compositeCommand);
    }

    clearSelection();
    renderDotsForCurrentPage();
    updateAllSectionsForCurrentPage();
    setDirtyState();

    showCSVStatus(`Deleted ${count} dot(s)`);
}

function moveSelectedDots(deltaX, deltaY) {
    if (appState.selectedDots.size === 0) return;

    const dots = getCurrentPageDots();
    const movedDots = [];

    // Check if all dots can be moved without collision
    let canMove = true;
    appState.selectedDots.forEach(internalId => {
        const dot = dots.get(internalId);
        if (dot) {
            const newX = dot.x + deltaX;
            const newY = dot.y + deltaY;

            // Check collision excluding selected dots
            const hasCollision = Array.from(dots.values()).some(otherDot => {
                if (appState.selectedDots.has(otherDot.internalId)) return false;
                const distance = Math.sqrt(
                    Math.pow(newX - otherDot.x, 2) + Math.pow(newY - otherDot.y, 2)
                );
                return distance < 10;
            });

            if (hasCollision) {
                canMove = false;
            }
        }
    });

    if (!canMove) {
        showCSVStatus('Cannot move - collision detected', false);
        return;
    }

    // Move all dots
    appState.selectedDots.forEach(internalId => {
        const dot = dots.get(internalId);
        if (dot) {
            dot.x += deltaX;
            dot.y += deltaY;

            // Update visual position
            const dotElement = document.querySelector(`.ms-map-dot[data-dot-id="${internalId}"]`);
            if (dotElement) {
                const size = appState.dotSize * 12;
                const halfSize = size / 2;
                dotElement.style.left = `${dot.x - halfSize}px`;
                dotElement.style.top = `${dot.y - halfSize}px`;
            }
        }
    });

    setDirtyState();
}

let keyboardShortcutsSetup = false;

function setupKeyboardShortcuts() {
    if (keyboardShortcutsSetup) return; // Prevent duplicate listeners
    keyboardShortcutsSetup = true;

    document.addEventListener('keydown', async e => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Undo (Ctrl+Z or Cmd+Z)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            const action = await CommandUndoManager.undo();
            if (action) {
                showCSVStatus(`Undo: ${action}`, true, 2000);
            }
        }
        // Redo (Ctrl+Y or Cmd+Y or Ctrl+Shift+Z or Cmd+Shift+Z)
        else if (
            ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
        ) {
            e.preventDefault();
            const action = await CommandUndoManager.redo();
            if (action) {
                showCSVStatus(`Redo: ${action}`, true, 2000);
            }
        }
        // Copy (Ctrl+C)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copySelectedDots();
        }
        // Paste (Ctrl+V)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            await pasteDots();
        }
        // Cut (Ctrl+X)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            copySelectedDots();
            await deleteSelectedDots();
        }
        // Delete
        else if (e.key === 'Delete') {
            e.preventDefault();

            // Check if any annotation lines are selected
            if (appState.selectedAnnotationLines.size > 0) {
                const pageLines = getCurrentPageAnnotationLines();
                const compositeCommand = new CompositeCommand(
                    `Delete ${appState.selectedAnnotationLines.size} annotation line(s)`
                );

                appState.selectedAnnotationLines.forEach(lineId => {
                    const line = pageLines.get(lineId);
                    if (line) {
                        const deleteCommand = new DeleteAnnotationLineCommand(
                            appState.currentPdfPage,
                            line
                        );
                        compositeCommand.add(deleteCommand);
                    }
                });

                if (compositeCommand.commands.length > 0) {
                    await CommandUndoManager.execute(compositeCommand);
                }

                appState.selectedAnnotationLines.clear();
                renderAnnotationLines();
                setDirtyState();
            }

            // Also delete selected dots
            if (appState.selectedDots.size > 0) {
                await deleteSelectedDots();
            }
        }
        // Select All (Ctrl+A)
        else if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            clearSelection();
            getCurrentPageDots().forEach((dot, internalId) => {
                selectDot(internalId);
            });
            updateSelectionUI();
        }
        // Escape to clear selection
        else if (e.key === 'Escape' && !isModalOpen()) {
            clearSelection();
        }
    });
}

// CSV Update functionality
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

function generateErrorLog(skippedRows) {
    const timestamp = new Date().toLocaleString();
    let logContent = 'MAPPING SLAYER - CSV UPDATE ERROR LOG\n';
    logContent += `Generated on: ${timestamp}\n\n`;
    logContent += `Total Skipped Rows: ${skippedRows.length}\n\n`;

    skippedRows.forEach((row, index) => {
        logContent += `Row ${row.rowNumber}:\n`;
        logContent += `Reason: ${row.reason}\n`;
        logContent += `Data: ${JSON.stringify(row.data)}\n\n`;
    });

    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
        'download',
        `CSV_Update_Errors_${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.txt`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function handleScheduleUpdate(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const csvContent = event.target.result;
        const lines = csvContent.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            showCSVStatus('❌ CSV file appears to be empty', false, 5000);
            return;
        }

        // Parse headers (case-insensitive)
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine).map(h => h.toUpperCase());

        // Check for required columns (accept either MESSAGE or MESSAGE 1)
        const requiredColumns = [
            'MARKER TYPE CODE',
            'MARKER TYPE NAME',
            'LOCATION NUMBER',
            'MAP PAGE'
        ];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));

        // Check for MESSAGE or MESSAGE 1
        if (!headers.includes('MESSAGE') && !headers.includes('MESSAGE 1')) {
            missingColumns.push('MESSAGE');
        }

        if (missingColumns.length > 0) {
            showCSVStatus(`❌ Missing required columns: ${missingColumns.join(', ')}`, false, 8000);
            return;
        }

        // Get column indices - support both old and new column names
        const columnIndices = {
            markerTypeCode: headers.indexOf('MARKER TYPE CODE'),
            markerTypeName: headers.indexOf('MARKER TYPE NAME'),
            message:
                headers.indexOf('MESSAGE 1') !== -1
                    ? headers.indexOf('MESSAGE 1')
                    : headers.indexOf('MESSAGE'),
            message2: headers.indexOf('MESSAGE 2'),
            locationNumber: headers.indexOf('LOCATION NUMBER'),
            mapPage: headers.indexOf('MAP PAGE'),
            installed: headers.indexOf('INSTALLED'),
            notes: headers.indexOf('NOTES'),
            flags: {} // Will populate with flag column indices
        };

        // Find flag columns - they come after PAGE LABEL and before NOTES
        // Look for flag names from the global flag configuration
        if (appState.globalFlagConfiguration) {
            const flagConfig = appState.globalFlagConfiguration;
            Object.keys(FLAG_POSITIONS).forEach(key => {
                const position = FLAG_POSITIONS[key];
                const config = flagConfig[position] || { name: `Flag ${key + 1}` };
                const flagIndex = headers.indexOf(config.name.toUpperCase());
                if (flagIndex !== -1) {
                    columnIndices.flags[position] = flagIndex;
                }
            });
        }

        // Also check for default flag names
        if (Object.keys(columnIndices.flags).length === 0) {
            ['FLAG 1', 'FLAG 2', 'FLAG 3', 'FLAG 4'].forEach((flagName, index) => {
                const flagIndex = headers.indexOf(flagName);
                if (flagIndex !== -1) {
                    const positions = Object.values(FLAG_POSITIONS);
                    columnIndices.flags[positions[index]] = flagIndex;
                }
            });
        }

        let updatedCount = 0;
        let deletedCount = 0;
        const skippedRows = [];
        const dotsInCSV = new Set(); // Track all dots mentioned in CSV

        // First pass: collect all valid dot identifiers from CSV
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = parseCSVLine(line);
            const pageNum = parseInt(values[columnIndices.mapPage]);
            let locationNumber = values[columnIndices.locationNumber];

            if (locationNumber) {
                locationNumber = locationNumber.replace(/^["']|["']$/g, '').replace(/'/g, '');
            }

            if (
                !isNaN(pageNum) &&
                pageNum >= 1 &&
                pageNum <= appState.totalPages &&
                locationNumber
            ) {
                dotsInCSV.add(`${pageNum}-${locationNumber}`);
            }
        }

        // Check for dots to delete
        const dotsToDelete = [];
        for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
            const dotsOnPage = getDotsForPage(pageNum);

            for (const [internalId, dot] of dotsOnPage) {
                const dotKey = `${pageNum}-${dot.locationNumber}`;
                if (!dotsInCSV.has(dotKey)) {
                    const markerType = appState.markerTypes[dot.markerType] || {};
                    dotsToDelete.push({
                        internalId,
                        pageNum,
                        locationNumber: dot.locationNumber,
                        markerTypeCode: markerType.code || 'UNKNOWN',
                        markerTypeName: markerType.name || 'Unknown',
                        message: dot.message,
                        message2: dot.message2,
                        page: pageNum
                    });
                }
            }
        }

        // Show warning if dots will be deleted
        if (dotsToDelete.length > 0) {
            const confirmDelete = confirm(
                `WARNING: ${dotsToDelete.length} locations in the current map are not in the message schedule.\n\n` +
                    'These missing locations will be deleted from the map.\n\n' +
                    'Do you want to continue?'
            );

            if (!confirmDelete) {
                showCSVStatus('❌ Import cancelled', false, 3000);
                return;
            }

            // Delete the dots
            dotsToDelete.forEach(dot => {
                const dotsOnPage = getDotsForPage(dot.pageNum);
                dotsOnPage.delete(dot.internalId);
                deletedCount++;
            });
        }

        // Process each data row for updates
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = parseCSVLine(line);
            const rowNumber = i + 1;

            // Extract values
            const pageNum = parseInt(values[columnIndices.mapPage]);
            // Remove quotes and apostrophes from location number
            let locationNumber = values[columnIndices.locationNumber];
            if (locationNumber) {
                // Remove surrounding quotes first
                locationNumber = locationNumber.replace(/^["']|["']$/g, '');
                // Then remove any remaining apostrophes
                locationNumber = locationNumber.replace(/'/g, '');
            }
            const markerTypeCode = values[columnIndices.markerTypeCode];

            // Validate page number
            if (isNaN(pageNum) || pageNum < 1 || pageNum > appState.totalPages) {
                skippedRows.push({
                    rowNumber,
                    reason: `Invalid page number: ${values[columnIndices.mapPage]}`,
                    data: values
                });
                continue;
            }

            // Check if marker type exists
            if (!appState.markerTypes[markerTypeCode]) {
                skippedRows.push({
                    rowNumber,
                    reason: `Marker type not found: ${markerTypeCode}`,
                    data: values
                });
                continue;
            }

            // Find the dot
            const dotsOnPage = getDotsForPage(pageNum);
            let dotFound = false;

            for (const [internalId, dot] of dotsOnPage) {
                if (dot.locationNumber === locationNumber) {
                    // Update marker type if it has changed
                    if (dot.markerType !== markerTypeCode) {
                        dot.markerType = markerTypeCode;
                    }

                    // Update dot properties
                    dot.message = values[columnIndices.message] || '';

                    if (columnIndices.message2 !== -1) {
                        dot.message2 = values[columnIndices.message2] || '';
                    }

                    // Update installed status
                    if (columnIndices.installed !== -1) {
                        const installedValue = values[columnIndices.installed]?.toUpperCase();
                        dot.installed = installedValue === 'YES' || installedValue === 'TRUE';
                    }

                    // Handle new flag columns
                    if (Object.keys(columnIndices.flags).length > 0) {
                        if (!dot.flags) dot.flags = initializeDotFlags();
                        Object.entries(columnIndices.flags).forEach(([position, index]) => {
                            if (index !== -1 && values[index]) {
                                const flagValue = values[index].toUpperCase();
                                dot.flags[position] = flagValue === 'YES' || flagValue === 'TRUE';
                            }
                        });
                    }

                    if (columnIndices.notes !== -1) {
                        dot.notes = values[columnIndices.notes] || '';
                    }

                    updatedCount++;
                    dotFound = true;
                    break;
                }
            }

            if (!dotFound) {
                skippedRows.push({
                    rowNumber,
                    reason: `Location not found: ${locationNumber} on page ${pageNum}`,
                    data: values
                });
            }
        }

        // Show results
        if (updatedCount > 0 || deletedCount > 0) {
            setDirtyState();
            renderDotsForCurrentPage();
            updateAllSectionsForCurrentPage();
            // TODO: Convert to Command Pattern
            // UndoManager.capture('Import CSV update');

            let statusMessage = '';
            if (updatedCount > 0) statusMessage += `Updated ${updatedCount} locations. `;
            if (deletedCount > 0) statusMessage += `Deleted ${deletedCount} locations. `;
            if (skippedRows.length > 0) {
                statusMessage += `${skippedRows.length} rows skipped (see error log)`;
            }

            showCSVStatus(`✅ ${statusMessage.trim()}`, true, 8000);

            if (skippedRows.length > 0) {
                generateErrorLog(skippedRows);
            }
        } else {
            showCSVStatus('❌ No changes were made', false, 5000);
            if (skippedRows.length > 0) {
                generateErrorLog(skippedRows);
            }
        }
    };

    reader.readAsText(file);
    e.target.value = ''; // Clear the input so the same file can be selected again
}

// Make functions available globally for onclick handlers
window.performRenumber = performRenumber;
window.performPDFExport = async exportType => {
    const { performPDFExport } = await import('./export.js');
    performPDFExport(exportType);
};

// Helper function for direct marker type creation
function createMarkerTypeDirectly(newCode) {
    // Create new marker type with default values
    appState.markerTypes[newCode] = {
        code: newCode,
        name: 'Marker Type Name',
        color: '#F72020',
        textColor: '#FFFFFF',
        designReference: null
    };

    // Set the new marker type as active
    appState.activeMarkerType = newCode;

    setDirtyState();
    updateFilterCheckboxes();
    updateMarkerTypeSelect();
}

// Generate dynamic text fields based on marker type
function generateDynamicTextFields(prefix, dot = null) {
    const container = document.getElementById(`${prefix}-dynamic-fields`);
    if (!container) return;

    // Clear existing fields
    container.innerHTML = '';

    // Get the marker type
    const markerTypeCode =
        prefix === 'edit'
            ? dot?.markerType || document.getElementById('edit-marker-type').value
            : document.getElementById('group-edit-marker-type').value;

    const markerType = appState.markerTypes[markerTypeCode];

    // Get text fields from marker type or use defaults
    // If textFields is empty or undefined, use default message fields
    let textFields = markerType?.textFields;
    if (!textFields || textFields.length === 0) {
        textFields = [
            { fieldName: 'message', maxLength: null },
            { fieldName: 'message2', maxLength: null }
        ];
    }

    // Create scrollable fields container if needed
    const fieldsWrapper = document.createElement('div');
    fieldsWrapper.className =
        textFields.length > 2 ? 'ms-fields-wrapper ms-scrollable' : 'ms-fields-wrapper';

    // Generate form groups for each text field
    textFields.forEach((field, index) => {
        const formGroup = document.createElement('div');
        formGroup.className = 'ms-form-group ms-dynamic-text-field';
        formGroup.dataset.fieldName = field.fieldName;

        // Create field header with controls
        const fieldHeader = document.createElement('div');
        fieldHeader.className = 'ms-field-header';

        // Create label
        const label = document.createElement('label');
        label.className = 'ms-form-label';
        label.textContent = formatFieldName(field.fieldName);

        // Create field controls
        const fieldControls = document.createElement('div');
        fieldControls.className = 'ms-field-controls';

        // Edit field name button (only for custom fields)
        if (field.fieldName !== 'message' && field.fieldName !== 'message2') {
            const editBtn = document.createElement('button');
            editBtn.className = 'ms-field-edit-btn';
            editBtn.innerHTML = '✏️';
            editBtn.title = 'Edit field name';
            editBtn.onclick = () => editFieldName(markerTypeCode, field.fieldName, formGroup);
            fieldControls.appendChild(editBtn);

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'ms-field-delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Delete field';
            deleteBtn.onclick = () => deleteField(markerTypeCode, field.fieldName, formGroup);
            fieldControls.appendChild(deleteBtn);
        }

        fieldHeader.appendChild(label);
        fieldHeader.appendChild(fieldControls);

        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ms-form-input';
        input.id = `${prefix}-field-${field.fieldName}`;
        input.placeholder = 'Enter text...';

        // Set value for edit mode
        if (prefix === 'edit' && dot) {
            input.value = dot[field.fieldName] || '';

            // Add listener to update sign preview when message changes
            if (
                field.fieldName === 'message' ||
                field.fieldName === 'message2' ||
                field.fieldName === 'message1'
            ) {
                input.addEventListener('input', () => {
                    const editingDot = getCurrentPageDots().get(appState.editingDot);
                    if (editingDot) {
                        // Update the dot's message value
                        editingDot[field.fieldName] = input.value;

                        // Update the sign preview if it's open
                        const template = loadedTemplates.get(editingDot.markerType);
                        if (template) {
                            updateSignPreview(editingDot, template);
                        }
                    }
                });
            }
        } else if (prefix === 'group-edit') {
            input.placeholder = `Leave blank to keep existing ${formatFieldName(field.fieldName).toLowerCase()}`;
        }

        formGroup.appendChild(fieldHeader);
        formGroup.appendChild(input);
        fieldsWrapper.appendChild(formGroup);
    });

    container.appendChild(fieldsWrapper);
}

// Format field name for display
function formatFieldName(fieldName) {
    // Special case for message fields
    if (fieldName === 'message') {
        return 'Message 1';
    }
    if (fieldName === 'message2') {
        return 'Message 2';
    }

    // Convert camelCase to Title Case
    return fieldName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

// Edit field name
function editFieldName(markerTypeCode, oldFieldName, formGroup) {
    const markerType = appState.markerTypes[markerTypeCode];
    if (!markerType || !markerType.textFields) return;

    const field = markerType.textFields.find(f => f.fieldName === oldFieldName);
    if (!field) return;

    const label = formGroup.querySelector('.ms-form-label');
    const currentName = field.fieldName;

    // Create inline edit input
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'ms-field-name-edit-input';
    editInput.value = currentName;

    // Replace label with input
    label.style.display = 'none';
    label.parentElement.insertBefore(editInput, label.nextSibling);
    editInput.focus();
    editInput.select();

    // Handle save
    const saveEdit = () => {
        const newName = editInput.value.trim();
        if (newName && newName !== currentName) {
            // Update field name
            field.fieldName = newName;

            // Update all dots with this field
            updateFieldNameInDots(markerTypeCode, currentName, newName);

            // Update the form group's dataset
            formGroup.dataset.fieldName = newName;

            // Update the input ID
            const input = formGroup.querySelector('.ms-form-input');
            const prefix = input.id.split('-field-')[0];
            input.id = `${prefix}-field-${newName}`;

            // Sync if available
            if (window.mappingApp && window.mappingApp.syncAdapter) {
                window.mappingApp.syncAdapter.syncTextFieldUpdated(
                    markerTypeCode,
                    currentName,
                    field
                );
            }

            setDirtyState();
        }

        // Restore label
        label.textContent = formatFieldName(field.fieldName);
        label.style.display = '';
        editInput.remove();
    };

    // Handle cancel
    const cancelEdit = () => {
        label.style.display = '';
        editInput.remove();
    };

    editInput.addEventListener('blur', saveEdit);
    editInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// Delete field
function deleteField(markerTypeCode, fieldName, formGroup) {
    const markerType = appState.markerTypes[markerTypeCode];
    if (!markerType || !markerType.textFields) return;

    const fieldIndex = markerType.textFields.findIndex(f => f.fieldName === fieldName);
    if (fieldIndex === -1) return;

    // Confirm deletion
    if (
        !confirm(
            `Are you sure you want to delete the field "${formatFieldName(fieldName)}"? This will remove this field from all locations.`
        )
    ) {
        return;
    }

    // Remove field
    markerType.textFields.splice(fieldIndex, 1);

    // Remove the form group with animation
    formGroup.style.transition = 'opacity 0.2s, max-height 0.2s';
    formGroup.style.opacity = '0';
    formGroup.style.maxHeight = '0';
    formGroup.style.overflow = 'hidden';

    setTimeout(() => {
        formGroup.remove();

        // Check if we need to update the scrollable class
        const container =
            document.getElementById('edit-dynamic-fields') ||
            document.getElementById('group-edit-dynamic-fields');
        if (container) {
            const fieldsWrapper = container.querySelector('.ms-fields-wrapper');
            const remainingFields = fieldsWrapper.querySelectorAll('.ms-dynamic-text-field').length;
            if (remainingFields <= 2 && fieldsWrapper.classList.contains('ms-scrollable')) {
                fieldsWrapper.classList.remove('ms-scrollable');
            }
        }
    }, 200);

    // Sync if available
    if (window.mappingApp && window.mappingApp.syncAdapter) {
        window.mappingApp.syncAdapter.syncTextFieldRemoved(markerTypeCode, fieldName);
    }

    setDirtyState();
}

// Create text fields manager UI
function createTextFieldsManager(markerTypeCode) {
    const markerType = appState.markerTypes[markerTypeCode];
    const container = document.createElement('div');
    container.className = 'ms-text-fields-manager';

    // Header
    const header = document.createElement('div');
    header.className = 'ms-text-fields-header';
    header.innerHTML = `
        <span class="ms-text-fields-title">Manage Text Fields</span>
    `;
    container.appendChild(header);

    // Fields list
    const fieldsList = document.createElement('div');
    fieldsList.className = 'ms-text-fields-list';
    container.appendChild(fieldsList);

    // Get current text fields or use defaults
    const textFields = markerType.textFields || [
        { fieldName: 'message', maxLength: null },
        { fieldName: 'message2', maxLength: null }
    ];

    // Render existing fields
    textFields.forEach((field, index) => {
        const fieldItem = createTextFieldItem(field, index, markerTypeCode);
        fieldsList.appendChild(fieldItem);
    });

    return container;
}

// Create individual text field item
function createTextFieldItem(field, index, markerTypeCode) {
    const item = document.createElement('div');
    item.className = 'ms-text-field-item';
    item.dataset.fieldName = field.fieldName;

    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'ms-field-drag-handle';
    dragHandle.innerHTML = '≡';
    dragHandle.draggable = true;

    // Field name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'ms-field-name-input';
    nameInput.value = field.fieldName;
    nameInput.placeholder = 'Field name';

    // Don't allow editing of standard fields
    if (field.fieldName === 'message' || field.fieldName === 'message2') {
        nameInput.disabled = true;
    }

    // Required checkbox - Removed since fields are now auto-required based on usage
    // const requiredLabel = document.createElement('label');
    // requiredLabel.style.display = 'flex';
    // requiredLabel.style.alignItems = 'center';
    // requiredLabel.style.gap = '4px';
    // requiredLabel.innerHTML = `
    //     <input type="checkbox" class="ms-field-required-checkbox" ${field.required ? 'checked' : ''}>
    //     <span style="font-size: 12px; color: #ccc;">Required</span>
    // `;

    // Max length input
    const maxLengthInput = document.createElement('input');
    maxLengthInput.type = 'number';
    maxLengthInput.className = 'ms-field-max-length-input';
    maxLengthInput.value = field.maxLength || '';
    maxLengthInput.placeholder = 'Max';
    maxLengthInput.min = '1';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'ms-remove-field-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.title = 'Remove this field from the form';

    // Don't allow removing standard fields
    if (field.fieldName === 'message' || field.fieldName === 'message2') {
        removeBtn.disabled = true;
        removeBtn.style.opacity = '0.5';
    }

    // Add all elements to item
    item.appendChild(dragHandle);
    item.appendChild(nameInput);
    // item.appendChild(requiredLabel); // Removed - fields are now auto-required based on usage
    item.appendChild(maxLengthInput);
    item.appendChild(removeBtn);

    // Event handlers
    nameInput.addEventListener('change', () => {
        const oldName = field.fieldName;
        field.fieldName = nameInput.value;

        // Update all dots with this field
        updateFieldNameInDots(markerTypeCode, oldName, field.fieldName);

        // Sync if available
        if (window.mappingApp && window.mappingApp.syncAdapter) {
            window.mappingApp.syncAdapter.syncTextFieldUpdated(markerTypeCode, oldName, field);
        }

        setDirtyState();
    });

    // Required checkbox event listener - Removed since fields are now auto-required based on usage
    // requiredLabel.querySelector('input').addEventListener('change', (e) => {
    //     field.required = e.target.checked;
    //
    //     // Sync if available
    //     if (window.mappingApp && window.mappingApp.syncAdapter) {
    //         window.mappingApp.syncAdapter.syncTextFieldUpdated(markerTypeCode, field.fieldName, field);
    //     }
    //
    //     setDirtyState();
    // });

    maxLengthInput.addEventListener('change', () => {
        field.maxLength = maxLengthInput.value ? parseInt(maxLengthInput.value) : null;

        // Sync if available
        if (window.mappingApp && window.mappingApp.syncAdapter) {
            window.mappingApp.syncAdapter.syncTextFieldUpdated(
                markerTypeCode,
                field.fieldName,
                field
            );
        }

        setDirtyState();
    });

    removeBtn.addEventListener('click', () => {
        const markerType = appState.markerTypes[markerTypeCode];
        const textFields = markerType.textFields || [];
        const fieldIndex = textFields.findIndex(f => f.fieldName === field.fieldName);

        if (fieldIndex !== -1) {
            textFields.splice(fieldIndex, 1);
            item.remove();

            // Sync if available
            if (window.mappingApp && window.mappingApp.syncAdapter) {
                window.mappingApp.syncAdapter.syncTextFieldRemoved(markerTypeCode, field.fieldName);
            }

            setDirtyState();
        }
    });

    // Drag and drop handlers
    dragHandle.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
        item.classList.add('ms-dragging');
    });

    dragHandle.addEventListener('dragend', () => {
        item.classList.remove('ms-dragging');
    });

    item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('ms-drag-over');
    });

    item.addEventListener('dragleave', () => {
        item.classList.remove('ms-drag-over');
    });

    item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('ms-drag-over');

        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;

        if (fromIndex !== toIndex) {
            reorderTextFields(markerTypeCode, fromIndex, toIndex);
        }
    });

    return item;
}

// Update field name in all dots of this marker type
function updateFieldNameInDots(markerTypeCode, oldFieldName, newFieldName) {
    appState.allDots.forEach(dot => {
        if (
            dot.markerType === markerTypeCode &&
            Object.prototype.hasOwnProperty.call(dot, oldFieldName)
        ) {
            dot[newFieldName] = dot[oldFieldName];
            delete dot[oldFieldName];
        }
    });
}

// Reorder text fields
function reorderTextFields(markerTypeCode, fromIndex, toIndex) {
    const markerType = appState.markerTypes[markerTypeCode];
    const textFields = markerType.textFields || [];

    const [movedField] = textFields.splice(fromIndex, 1);
    textFields.splice(toIndex, 0, movedField);

    // Re-render the fields list
    const manager = document.querySelector('.ms-text-fields-manager');
    if (manager) {
        const fieldsList = manager.querySelector('.ms-text-fields-list');
        fieldsList.innerHTML = '';

        textFields.forEach((field, index) => {
            const fieldItem = createTextFieldItem(field, index, markerTypeCode);
            fieldsList.appendChild(fieldItem);
        });
    }

    setDirtyState();
}

function renderAnnotationLines() {
    const mapContent = document.getElementById('map-content');
    if (!mapContent) return;

    // Remove existing annotation lines
    document.querySelectorAll('.ms-annotation-line').forEach(line => line.remove());

    // Get lines for current page
    const pageLines = getCurrentPageAnnotationLines();
    const { scale } = appState.mapTransform;

    // Create line elements
    pageLines.forEach(line => {
        // Get the current color from the source dot's marker type
        const sourceDot = getCurrentPageDots().get(line.startDotId);
        let lineColor = line.color; // Default to stored color
        if (sourceDot && sourceDot.markerType && appState.markerTypes[sourceDot.markerType]) {
            lineColor = appState.markerTypes[sourceDot.markerType].color;
        }

        const lineElement = document.createElement('div');
        lineElement.className = 'ms-annotation-line';
        lineElement.dataset.lineId = line.id;
        lineElement.style.position = 'absolute';
        lineElement.style.backgroundColor = lineColor;
        // Use dynamic width based on current dot size (base 2px * dotSize multiplier)
        lineElement.style.height = 2 * appState.dotSize + 'px';
        lineElement.style.transformOrigin = '0 50%';
        lineElement.style.cursor = 'pointer';
        lineElement.style.zIndex = '50'; // Behind dots

        // Calculate line position and angle
        const deltaX = line.endX - line.startX;
        const deltaY = line.endY - line.startY;
        const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

        // Position line at start point (no scaling needed - parent container handles it)
        lineElement.style.left = line.startX + 'px';
        lineElement.style.top = line.startY + 'px';
        lineElement.style.width = length + 'px';
        lineElement.style.transform = `rotate(${angle}deg)`;

        // Add draggable endpoint if enabled
        if (appState.showAnnotationEndpoints) {
            const endpoint = document.createElement('div');
            endpoint.className = 'ms-annotation-endpoint';
            endpoint.style.position = 'absolute';
            // Endpoint size proportional to dot size (base 10px * dotSize multiplier)
            const endpointSize = 10 * appState.dotSize;
            endpoint.style.width = endpointSize + 'px';
            endpoint.style.height = endpointSize + 'px';
            endpoint.style.backgroundColor = lineColor;
            endpoint.style.borderRadius = '50%';
            endpoint.style.cursor = 'move';
            // Position endpoint centered on line end (adjust for scaled size)
            endpoint.style.right = -(endpointSize / 2) + 'px';
            endpoint.style.top = -(endpointSize / 2 - 1) + 'px';
            endpoint.dataset.lineId = line.id;

            lineElement.appendChild(endpoint);

            // Add endpoint drag functionality
            endpoint.addEventListener('mousedown', e => {
                if (e.button === 0) {
                    // Left click
                    e.preventDefault();
                    e.stopPropagation();
                    appState.draggingAnnotationEndpoint = line.id;
                    appState.draggingAnnotationOriginalPos = { x: line.endX, y: line.endY };
                }
            });
        }

        mapContent.appendChild(lineElement);

        // Add left-click selection
        lineElement.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();

            // Toggle selection
            if (appState.selectedAnnotationLines.has(line.id)) {
                appState.selectedAnnotationLines.delete(line.id);
                lineElement.classList.remove('ms-selected');
            } else {
                appState.selectedAnnotationLines.add(line.id);
                lineElement.classList.add('ms-selected');
            }
        });

        // Add right-click to toggle endpoints globally
        lineElement.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();

            // Toggle endpoint visibility for all lines
            appState.showAnnotationEndpoints = !appState.showAnnotationEndpoints;
            renderAnnotationLines(); // Re-render all lines
            setDirtyState();
        });
    });
}

// Spreadsheet sorting state

// Global function to force refresh the UI (useful for external triggers)
window.forceRefreshMappingUI = function () {
    console.log('Force refreshing Mapping UI...');
    updateFilterCheckboxesImmediate();
    updateMarkerTypeSelect();
    updateMapLegend();
    updateProjectLegend();

    // Clear and rebuild list
    const container = document.getElementById('location-list');
    if (container) {
        container.innerHTML = '';
    }
    updateLocationList();
    renderDotsForCurrentPage();
    applyFilters();
};

export {
    showCSVStatus,
    updatePageLabelInput,
    updatePageInfo,
    updateAllSectionsForCurrentPage,
    updateFilterCheckboxes,
    clearMarkerTypeElementCache,
    updateMarkerTypeSelect,
    updateMapLegend,
    updateProjectLegend,
    setupLegendCollapse,
    generateDynamicTextFields,
    editFieldName,
    deleteField,
    getActiveFilters,
    applyFilters,
    updateLocationList,
    renderFlatLocationList,
    renderGroupedLocationList,
    updateEditModalOptions,
    setupCanvasEventListeners,
    clearSearchHighlights,
    clearSelection,
    selectDot,
    selectAllDotsOfMarkerType,
    addDot,
    addDotToData,
    createDotObject,
    isCollision,
    handleMarkerTypeCodeChange,
    handleMarkerTypeNameChange,
    deleteMarkerType,
    handleDesignReferenceUpload,
    handleDesignReferenceDelete,
    toggleMarkerTypeExpansion,
    exportMarkerTypes,
    importMarkerTypes,
    changePage,
    isDotVisible,
    addMarkerTypeEventListener,
    addPageNavigationEventListeners,
    addViewToggleEventListeners,
    addButtonEventListeners,
    setupModalEventListeners,
    openEditModal,
    openGroupEditModal,
    openRenumberModal,
    performRenumber,
    updateRecentSearches,
    resetKeyboardShortcutsFlag,
    renderAnnotationLines,
    zoomToFitDots
};

// Function to reset keyboard shortcuts flag during app deactivation
function resetKeyboardShortcutsFlag() {
    keyboardShortcutsSetup = false;
}

// Gallery Modal Functions
let currentGalleryDot = null;
let galleryResizeHandler = null;
let showGalleryLabels = localStorage.getItem('showGalleryLabels') === 'true';

function updateGalleryPosition() {
    const galleryModal = document.getElementById('mapping-slayer-gallery-modal');
    const editModal = document.getElementById('mapping-slayer-edit-modal');
    if (!galleryModal || !editModal) return;

    const editModalContent = editModal.querySelector('.ms-modal-content');
    if (editModalContent) {
        const editHeight = editModalContent.offsetHeight;
        const galleryContent = galleryModal.querySelector('.ms-gallery-content');
        if (galleryContent) {
            galleryContent.style.height = editHeight + 'px';
            galleryContent.style.minHeight = editHeight + 'px';
        }

        // Position gallery 10px to the right of edit modal
        const editRect = editModalContent.getBoundingClientRect();
        const editTop = editRect.top;
        const editRight = editRect.right;

        galleryModal.style.top = editTop + 'px';
        galleryModal.style.left = editRight + 10 + 'px'; // 10px gap
        galleryModal.style.transform = 'none'; // Remove any transforms
    }
}

function openGalleryModal(dot) {
    const galleryModal = document.getElementById('mapping-slayer-gallery-modal');
    if (!galleryModal) return;

    console.log('=== OPENING GALLERY ===');
    // Store current dot reference
    currentGalleryDot = dot;

    // Position the gallery
    updateGalleryPosition();

    // Show the modal
    galleryModal.classList.add('ms-visible');
    galleryModal.style.display = 'block';

    // Initialize gallery with dot's photos
    populateGallery(dot);

    // Setup gallery event listeners if not already done
    setupGalleryEventListeners();

    // Add resize listener with debouncing
    if (galleryResizeHandler) {
        window.removeEventListener('resize', galleryResizeHandler);
    }

    let resizeTimeout;
    galleryResizeHandler = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (galleryModal.classList.contains('ms-visible')) {
                updateGalleryPosition();
            }
        }, 100); // Debounce by 100ms
    };

    window.addEventListener('resize', galleryResizeHandler);
}

function closeGalleryModal() {
    const galleryModal = document.getElementById('mapping-slayer-gallery-modal');
    if (galleryModal) {
        galleryModal.classList.remove('ms-visible');
        galleryModal.style.display = 'none';
    }

    // Clean up resize listener
    if (galleryResizeHandler) {
        window.removeEventListener('resize', galleryResizeHandler);
        galleryResizeHandler = null;
    }

    // Clear current dot reference
    currentGalleryDot = null;
}

function populateGallery(dot) {
    const mainImage = document.getElementById('gallery-main-image');

    // Display the photo if it exists, otherwise show placeholder
    if (mainImage) {
        if (dot.photo) {
            let html = `<img src="${dot.photo}" alt="Location photo">`;
            // Add location label if toggle is active
            if (showGalleryLabels) {
                html += `<div class="ms-gallery-location-label">${dot.locationNumber}</div>`;
            }
            mainImage.innerHTML = html;
        } else {
            mainImage.innerHTML = '<span class="ms-gallery-placeholder">NO PHOTO</span>';
        }
    }
}

// This function is no longer needed with single photo, but keeping for compatibility
function displayMainImage(imageSrc) {
    const mainImage = document.getElementById('gallery-main-image');
    if (mainImage) {
        if (imageSrc) {
            mainImage.innerHTML = `<img src="${imageSrc}" alt="Location photo">`;
        } else {
            mainImage.innerHTML = '<span class="ms-gallery-placeholder">NO PHOTO</span>';
        }
    }
}

function deletePhotoFromGallery() {
    if (!currentGalleryDot) return;

    // Get the current dot
    const dots = getCurrentPageDots();
    if (!dots) return;

    const dot = dots.get(currentGalleryDot.internalId);
    if (!dot || !dot.photo) return;

    // Remove the photo
    delete dot.photo;

    // Mark as dirty
    setDirtyState();

    // Update gallery display
    populateGallery(dot);
}

// Make delete function globally available
window.deletePhotoFromGallery = deletePhotoFromGallery;

function setupGalleryEventListeners() {
    // Only setup once
    if (window.galleryListenersSetup) return;
    window.galleryListenersSetup = true;

    // X button - deletes the current photo
    const closeBtn = document.getElementById('gallery-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (currentGalleryDot) {
                const dot = getCurrentPageDots().get(currentGalleryDot.internalId);
                if (dot && dot.photo) {
                    if (confirm('Delete this photo?')) {
                        deletePhotoFromGallery();
                    }
                }
            }
        });
    }

    // Add photo button - replaces existing photo
    const addBtn = document.getElementById('gallery-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            showPhotoOptions();
        });
    }

    // Toggle label button
    const labelToggleBtn = document.getElementById('gallery-label-toggle-btn');
    if (labelToggleBtn) {
        // Set initial state
        if (showGalleryLabels) {
            labelToggleBtn.classList.add('active');
        }

        labelToggleBtn.addEventListener('click', () => {
            showGalleryLabels = !showGalleryLabels;
            localStorage.setItem('showGalleryLabels', showGalleryLabels);

            // Update button state
            if (showGalleryLabels) {
                labelToggleBtn.classList.add('active');
            } else {
                labelToggleBtn.classList.remove('active');
            }

            // Refresh gallery display if there's a current dot
            if (currentGalleryDot) {
                const dots = getCurrentPageDots();
                if (dots) {
                    const dot = dots.get(currentGalleryDot.internalId);
                    if (dot) {
                        populateGallery(dot);
                    }
                }
            }
        });
    }
}

// Photo capture/upload functions
function showPhotoOptions() {
    if (!currentGalleryDot) return;

    // No limit check needed - we're replacing, not adding

    // Create options modal
    const optionsModal = document.createElement('div');
    optionsModal.className = 'ms-photo-options-modal';
    optionsModal.innerHTML = `
        <div class="ms-photo-options-content">
            <div class="ms-photo-options-header">
                <span>Update Pic</span>
                <button class="ms-modal-close" id="close-photo-options">×</button>
            </div>
            <div class="ms-photo-options-body">
                <button class="ms-btn ms-btn-primary ms-photo-option-btn" id="take-photo-btn">
                    📷 Take Photo
                </button>
                <button class="ms-btn ms-btn-primary ms-photo-option-btn" id="choose-file-btn">
                    📁 Choose File
                </button>
                <input type="file" id="photo-file-input" accept="image/*" style="display: none;">
            </div>
        </div>
    `;

    document.body.appendChild(optionsModal);

    // Handle close button
    document.getElementById('close-photo-options').addEventListener('click', () => {
        optionsModal.remove();
    });

    // Handle take photo button
    document.getElementById('take-photo-btn').addEventListener('click', () => {
        optionsModal.remove();
        openCameraCapture();
    });

    // Handle choose file button
    const fileInput = document.getElementById('photo-file-input');
    document.getElementById('choose-file-btn').addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (file) {
            optionsModal.remove();
            await processImageFile(file);
        }
    });

    // Close on background click
    optionsModal.addEventListener('click', e => {
        if (e.target === optionsModal) {
            optionsModal.remove();
        }
    });
}

function openCameraForDotcam() {
    // In DOTCAM mode, go directly to camera capture without the options modal
    openCameraCapture();
}

async function openCameraCapture() {
    // Create camera modal
    const cameraModal = document.createElement('div');
    cameraModal.className = 'ms-camera-modal';
    cameraModal.innerHTML = `
        <div class="ms-camera-content">
            <div class="ms-camera-header">
                <span>Capture Photo</span>
                <button class="ms-modal-close" id="close-camera">×</button>
            </div>
            <div class="ms-camera-body">
                <video id="camera-video" autoplay playsinline></video>
                <canvas id="camera-canvas" style="display: none;"></canvas>
            </div>
            <div class="ms-camera-controls">
                <button class="ms-btn ms-btn-primary" id="capture-btn">📷 CAPTURE</button>
            </div>
        </div>
    `;

    document.body.appendChild(cameraModal);

    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const ctx = canvas.getContext('2d');
    let stream = null;

    try {
        // Request camera access (prefer back camera on mobile)
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });

        video.srcObject = stream;

        // Handle capture button
        document.getElementById('capture-btn').addEventListener('click', async () => {
            // Set canvas size to video size
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw video frame to canvas
            ctx.drawImage(video, 0, 0);

            // Convert to blob
            canvas.toBlob(
                async blob => {
                    // Stop camera
                    stream.getTracks().forEach(track => track.stop());
                    cameraModal.remove();

                    // Process the captured image
                    await processImageBlob(blob);
                },
                'image/jpeg',
                0.9
            );
        });

        // Handle close button
        document.getElementById('close-camera').addEventListener('click', () => {
            stream.getTracks().forEach(track => track.stop());
            cameraModal.remove();
        });
    } catch (error) {
        console.error('Camera access denied:', error);
        alert('Camera access denied or not available.');
        cameraModal.remove();
    }
}

async function processImageFile(file) {
    // Convert file to blob for processing
    const blob = new Blob([file], { type: file.type });
    await processImageBlob(blob);
}

async function processImageBlob(blob) {
    // Compress image to max 500KB
    const compressedBlob = await compressImage(blob, 500);

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Data = reader.result;
        addPhotoToDot(base64Data);
    };
    reader.readAsDataURL(compressedBlob);
}

async function compressImage(blob, maxSizeKB) {
    return new Promise(resolve => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = async () => {
            // Calculate new dimensions (max 1920px on longest side)
            let width = img.width;
            let height = img.height;
            const maxDimension = 1920;

            if (width > height && width > maxDimension) {
                height = (height / width) * maxDimension;
                width = maxDimension;
            } else if (height > maxDimension) {
                width = (width / height) * maxDimension;
                height = maxDimension;
            }

            canvas.width = width;
            canvas.height = height;

            // Draw resized image
            ctx.drawImage(img, 0, 0, width, height);

            // Compress with reducing quality until under maxSizeKB
            let quality = 0.9;
            let compressedBlob;

            do {
                compressedBlob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                });
                quality -= 0.1;
            } while (compressedBlob.size > maxSizeKB * 1024 && quality > 0.1);

            resolve(compressedBlob);
        };

        // Create object URL and load image
        const url = URL.createObjectURL(blob);
        img.src = url;
    });
}

function addPhotoToDot(base64Data) {
    if (!currentGalleryDot) {
        console.error('NO currentGalleryDot!');
        return;
    }

    // Get the current dot
    const dots = getCurrentPageDots();
    if (!dots) {
        console.error('No dots map for current page!');
        return;
    }

    const dot = dots.get(currentGalleryDot.internalId);
    if (!dot) {
        console.error('Could not find dot in current page dots!');
        return;
    }

    // Replace the photo (single photo, not array)
    dot.photo = base64Data;

    // Mark as dirty for saving
    setDirtyState();

    // Update gallery display
    populateGallery(dot);
}

// Make gallery functions available globally
window.openGalleryModal = openGalleryModal;
window.closeGalleryModal = closeGalleryModal;

// Marker Type Context Menu Functions
function showMarkerTypeContextMenu(event, markerTypeCode) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.ms-marker-type-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'ms-marker-type-context-menu';

    // Add menu items
    menu.innerHTML = `
        <div class="ms-context-menu-item" data-action="template">
            <span>📄</span> Set Sign Template
        </div>
    `;

    // Position menu at cursor
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    // Add to body
    document.body.appendChild(menu);

    // Handle menu item clicks
    menu.addEventListener('click', e => {
        const item = e.target.closest('.ms-context-menu-item');
        if (item) {
            const action = item.dataset.action;

            if (action === 'template') {
                openTemplateModal(markerTypeCode);
            }

            menu.remove();
        }
    });

    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

window.showMarkerTypeContextMenu = showMarkerTypeContextMenu;

// Sign Preview Modal Functions
let signPreviewResizeHandler = null;
let currentSignPreviewDot = null;

function updateSignPreviewPosition() {
    const previewModal = document.getElementById('mapping-slayer-sign-preview-modal');
    const editModal = document.getElementById('mapping-slayer-edit-modal');
    if (!previewModal || !editModal) return;

    const editModalContent = editModal.querySelector('.ms-modal-content');
    if (editModalContent) {
        const editHeight = editModalContent.offsetHeight;
        const previewContent = previewModal.querySelector('.ms-sign-preview-content');
        if (previewContent) {
            previewContent.style.height = editHeight + 'px';
            previewContent.style.minHeight = editHeight + 'px';
        }

        // Position preview modal to the left of edit modal
        const editRect = editModalContent.getBoundingClientRect();
        const editTop = editRect.top;
        const editLeft = editRect.left;
        const modalWidth = 380; // Width of sign preview modal (matches gallery modal)
        const gap = 10; // Gap between modals (matches gallery modal gap)

        // Calculate position to the left
        let left = editLeft - modalWidth - gap;

        // Make sure it doesn't go off-screen
        if (left < 10) {
            left = 10;
        }

        previewModal.style.top = editTop + 'px';
        previewModal.style.left = left + 'px';
        previewModal.style.transform = 'none'; // Remove any transforms
    }
}

function openSignPreviewModal(dot) {
    const previewModal = document.getElementById('mapping-slayer-sign-preview-modal');
    if (!previewModal) return;

    console.log('=== OPENING SIGN PREVIEW ===');

    // Store current dot reference
    currentSignPreviewDot = dot;

    // Get the template for this marker type from loadedTemplates
    const template = loadedTemplates.get(dot.markerType);

    if (template) {
        console.log('Template found for marker type:', dot.markerType);
        updateSignPreview(dot, template);
    } else {
        console.log('No template found for marker type:', dot.markerType);
        console.log('Available templates:', Array.from(loadedTemplates.keys()));
        // Show placeholder if no template
        const display = document.getElementById('sign-preview-display');
        if (display) {
            display.innerHTML =
                '<span class="ms-sign-preview-placeholder">No template assigned</span>';
        }
    }

    // Position the preview modal
    updateSignPreviewPosition();

    // Show the modal
    previewModal.classList.add('ms-visible');
    previewModal.style.display = 'block';

    // Add resize listener with debouncing
    if (signPreviewResizeHandler) {
        window.removeEventListener('resize', signPreviewResizeHandler);
    }

    let resizeTimeout;
    signPreviewResizeHandler = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (previewModal.classList.contains('ms-visible')) {
                updateSignPreviewPosition();
            }
        }, 100); // Debounce by 100ms
    };

    window.addEventListener('resize', signPreviewResizeHandler);
}

function closeSignPreviewModal() {
    const previewModal = document.getElementById('mapping-slayer-sign-preview-modal');
    if (previewModal) {
        previewModal.classList.remove('ms-visible');
        previewModal.style.display = 'none';
    }

    // Clean up resize listener
    if (signPreviewResizeHandler) {
        window.removeEventListener('resize', signPreviewResizeHandler);
        signPreviewResizeHandler = null;
    }

    // Clear current dot reference
    currentSignPreviewDot = null;
}

function updateSignPreview(dot, templateData) {
    const display = document.getElementById('sign-preview-display');

    if (!display || !templateData) return;

    // Create a copy of the template data with actual messages
    const previewData = JSON.parse(JSON.stringify(templateData));

    // Replace MSG1 and MSG2 with actual message values
    if (previewData.messages) {
        if (previewData.messages['1']) {
            // Try message1, then message (for backward compatibility)
            previewData.messages['1'].text = dot.message1 || dot.message || 'MSG1';
        }
        if (previewData.messages['2']) {
            previewData.messages['2'].text = dot.message2 || 'MSG2';
        }
    }

    // Use the existing displayTemplate function to render the preview
    // Create a temporary container for the preview
    const tempContainer = document.createElement('div');
    tempContainer.id = 'template-display';
    const tempInfo = document.createElement('div');
    tempInfo.id = 'template-info';

    // Temporarily replace the display elements
    const originalDisplay = document.getElementById('template-display');
    const originalInfo = document.getElementById('template-info');

    display.innerHTML = '';
    display.appendChild(tempContainer);
    display.appendChild(tempInfo);

    // Call displayTemplate to render the sign
    displayTemplate(previewData);

    // Move the rendered content to our preview modal
    const renderedContent = tempContainer.innerHTML;

    display.innerHTML = renderedContent;

    // Clean up
    tempContainer.remove();
    tempInfo.remove();
}

// Template Modal Functions
let currentTemplateMarkerType = null;
const loadedTemplates = new Map(); // Store loaded templates by marker type
window.loadedTemplates = loadedTemplates; // Make it globally available for thumbnail generator

function openTemplateModal(markerTypeCode) {
    const modal = document.getElementById('mapping-slayer-template-modal');
    const markerTypeSpan = document.getElementById('template-marker-type');

    if (!modal) return;

    currentTemplateMarkerType = markerTypeCode;
    markerTypeSpan.textContent = markerTypeCode;

    // Show the modal
    modal.style.display = 'block';

    // Check if there's already a template loaded for this marker type
    if (loadedTemplates.has(markerTypeCode)) {
        displayTemplate(loadedTemplates.get(markerTypeCode));
    } else {
        resetTemplateDisplay();
    }

    // Setup event listeners if not already done
    setupTemplateModalListeners();
}

function closeTemplateModal() {
    const modal = document.getElementById('mapping-slayer-template-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentTemplateMarkerType = null;
}

function resetTemplateDisplay() {
    const display = document.getElementById('template-display');
    const info = document.getElementById('template-info');

    if (display) {
        display.innerHTML = '<span class="ms-template-placeholder">NO TEMPLATE LOADED</span>';
    }
    if (info) {
        info.style.display = 'none';
    }
}

// Helper function to wrap text for template display
function wrapTextForTemplate(text, fontSize, fontFamily, maxWidth) {
    // Create a temporary SVG for text measurement
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.visibility = 'hidden';
    document.body.appendChild(svg);

    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.style.fontSize = fontSize + 'px';
    textElement.style.fontFamily = fontFamily || 'Arial, sans-serif';
    svg.appendChild(textElement);

    // Split text by newlines first (manual line breaks)
    const paragraphs = text.split('\n');
    const allLines = [];

    // Process each paragraph
    paragraphs.forEach(paragraph => {
        if (paragraph.trim() === '') {
            allLines.push(''); // Preserve empty lines
            return;
        }

        const words = paragraph.trim().split(/\s+/);
        let currentLine = [];

        words.forEach(word => {
            currentLine.push(word);
            textElement.textContent = currentLine.join(' ');
            const lineWidth = textElement.getComputedTextLength();

            if (lineWidth > maxWidth && currentLine.length > 1) {
                // Line is too long, remove last word and start new line
                currentLine.pop();
                allLines.push(currentLine.join(' '));
                currentLine = [word];
            }
        });

        // Add remaining words
        if (currentLine.length > 0) {
            allLines.push(currentLine.join(' '));
        }
    });

    // Clean up
    document.body.removeChild(svg);

    return allLines;
}

// Helper function for braille translation (matches template maker's approach)
function translateToBrailleForTemplate(text) {
    console.log('=== BRAILLE TRANSLATION DEBUG ===');
    console.log('Input text:', text);
    console.log('window.translator:', window.translator);
    console.log('window.lou:', window.lou);
    console.log('window.LiblouisEasyApi:', window.LiblouisEasyApi);
    console.log('window.liblouisBuild:', window.liblouisBuild);

    // IMPORTANT: Convert to lowercase for ADA compliance
    // ADA signage is visually all caps, but braille should be lowercase
    const lowercaseText = text.toLowerCase();

    // Try LibLouis first if available
    if (typeof window.translator !== 'undefined' && window.translator?.translateString) {
        console.log('Found window.translator with translateString method');
        try {
            // Use the table list that includes unicode.dis for proper output
            const tableList = window.liblouisTableList || 'tables/unicode.dis,tables/en-us-g2.ctb';
            console.log('Attempting translation with table list:', tableList);
            const result = window.translator.translateString(tableList, lowercaseText);
            console.log(`LibLouis Grade 2 SUCCESS: "${lowercaseText}" -> "${result}"`);
            return result;
        } catch (e) {
            console.error('LibLouis translation FAILED:', e);
            console.error('Error details:', e.message, e.stack);
            // Return error message instead of falling back
            return 'BROKEN BRAILLE - LibLouis ERROR';
        }
    }

    // No LibLouis available - return error message
    console.error('LibLouis not available - checking why:');
    console.error('- window.translator undefined?', typeof window.translator === 'undefined');
    console.error(
        '- translator exists but no translateString?',
        window.translator && !window.translator.translateString
    );
    return 'BROKEN BRAILLE - NO LibLouis';
}

function displayTemplate(templateData, productionMode = false) {
    const display = document.getElementById('template-display');
    const info = document.getElementById('template-info');

    if (!display) return;

    // Load custom fonts if present in template
    if (templateData.customFonts) {
        Object.entries(templateData.customFonts).forEach(([fontName, fontData]) => {
            // Create and inject the @font-face rule
            const styleId = `template-font-${fontName.replace(/[^a-zA-Z0-9]/g, '-')}`;
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                document.head.appendChild(style);
            }
            style.textContent = `
                @font-face {
                    font-family: '${fontName}';
                    src: url(${fontData}) format('truetype');
                }
            `;
            console.log(`Loaded custom font: ${fontName}`);
        });
    }

    // Get actual container dimensions dynamically
    const containerRect = display.getBoundingClientRect();
    const containerWidth = containerRect.width || 340; // Sign preview modal is 380px minus padding
    const containerHeight = containerRect.height || 300; // Use actual height

    // Use less padding for better space utilization
    const padding = 20;

    const maxWidth = containerWidth - padding * 2;
    const maxHeight = containerHeight - padding * 2;

    // Calculate scale to fit the sign within the container
    const scaleX = maxWidth / templateData.signWidth;
    const scaleY = maxHeight / templateData.signHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%

    // Create SVG element for the sign preview
    // Use viewBox for proper scaling and preserveAspectRatio for maintaining proportions
    let svgContent = `
        <svg width="100%" height="100%" viewBox="0 0 ${templateData.signWidth} ${templateData.signHeight}"
             preserveAspectRatio="xMidYMid meet"
             xmlns="http://www.w3.org/2000/svg"
             style="max-width: ${templateData.signWidth * scale}px; max-height: ${templateData.signHeight * scale}px;">
            <!-- Sign background -->
            <rect width="${templateData.signWidth}" height="${templateData.signHeight}"
                  fill="${templateData.colors?.signBackground || '#ffffff'}"${
                      productionMode
                          ? ''
                          : `
                  stroke="#666" stroke-width="2"`
                  }/>
    `;

    // Add message boxes
    if (templateData.messages) {
        Object.entries(templateData.messages).forEach(([id, msg]) => {
            // Draw message box outline (skip in production mode)
            if (!productionMode) {
                svgContent += `
                    <rect x="${msg.boxX}" y="${msg.boxY}"
                          width="${msg.boxWidth}" height="${msg.boxHeight}"
                          fill="none" stroke="#999" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
                `;
            }

            // Add message text
            const messageText = msg.text || `MSG${id}`;

            // Calculate text position based on alignment
            const horizontalAlign = msg.horizontalAlign || 'center';
            const verticalAlign = msg.verticalAlign || 'middle';

            let textX, textAnchor;
            if (horizontalAlign === 'left') {
                textX = msg.boxX + 10; // Small padding
                textAnchor = 'start';
            } else if (horizontalAlign === 'right') {
                textX = msg.boxX + msg.boxWidth - 10;
                textAnchor = 'end';
            } else {
                // center
                textX = msg.boxX + msg.boxWidth / 2;
                textAnchor = 'middle';
            }

            let textY, dominantBaseline;
            if (verticalAlign === 'top') {
                textY = msg.boxY + (msg.capHeight || 62.5);
                dominantBaseline = 'hanging';
            } else if (verticalAlign === 'bottom') {
                textY = msg.boxY + msg.boxHeight - 10;
                dominantBaseline = 'baseline';
            } else {
                // middle
                textY = msg.boxY + msg.boxHeight / 2;
                dominantBaseline = 'middle';
            }

            // Check for multi-line text and wrap if needed
            const lineHeight = msg.lineHeight || 1.2;
            // Use the exact calculated fontSize from template maker
            const fontSize = msg.fontSize;
            const lineSpacing = fontSize * lineHeight;

            // Use wrapTextForTemplate to wrap text based on box width
            const lines = wrapTextForTemplate(
                messageText,
                fontSize,
                msg.fontFamily || 'Arial, sans-serif',
                msg.boxWidth - 20
            ); // 20px padding (10 on each side)

            if (lines.length > 1) {
                // Multi-line text - use tspan elements
                let startY = textY;

                // Adjust starting position for vertical alignment with multiple lines
                if (verticalAlign === 'middle') {
                    startY = textY - ((lines.length - 1) * lineSpacing) / 2;
                } else if (verticalAlign === 'bottom') {
                    startY = textY - (lines.length - 1) * lineSpacing;
                }

                svgContent += `
                    <text x="${textX}"
                          fill="${templateData.colors?.text || '#000000'}"
                          font-family="${msg.fontFamily || 'Arial, sans-serif'}"
                          font-size="${fontSize}"${
                              msg.fontWeight
                                  ? `
                          font-weight="${msg.fontWeight}"`
                                  : ''
                          }
                          letter-spacing="${msg.letterSpacing || 0}"
                          word-spacing="${msg.wordSpacing || 0}"
                          text-anchor="${textAnchor}">
                `;

                lines.forEach((line, index) => {
                    const lineY = startY + index * lineSpacing;
                    svgContent += `
                        <tspan x="${textX}" y="${lineY}" dominant-baseline="${dominantBaseline}">${line}</tspan>
                    `;
                });

                svgContent += '</text>';
            } else {
                // Single line text
                svgContent += `
                    <text x="${textX}" y="${textY}"
                          fill="${templateData.colors?.text || '#000000'}"
                          font-family="${msg.fontFamily || 'Arial, sans-serif'}"
                          font-size="${fontSize}"${
                              msg.fontWeight
                                  ? `
                          font-weight="${msg.fontWeight}"`
                                  : ''
                          }
                          letter-spacing="${msg.letterSpacing || 0}"
                          word-spacing="${msg.wordSpacing || 0}"
                          text-anchor="${textAnchor}"
                          dominant-baseline="${dominantBaseline}">
                        ${messageText}
                    </text>
                `;
            }

            // Add braille text if enabled
            if (msg.brailleEnabled) {
                // Remove line breaks so braille flows continuously (ADA standard)
                const textWithoutBreaks = messageText.replace(/\n/g, ' ');
                const brailleText = translateToBrailleForTemplate(textWithoutBreaks);

                // Calculate braille position based on the last line of text
                let lastTextY;

                if (lines.length > 1) {
                    // For multi-line text, calculate position of last line
                    let startY = textY;

                    if (verticalAlign === 'middle') {
                        startY = textY - ((lines.length - 1) * lineSpacing) / 2;
                    } else if (verticalAlign === 'bottom') {
                        startY = textY - (lines.length - 1) * lineSpacing;
                    }

                    // Last line position
                    lastTextY = startY + (lines.length - 1) * lineSpacing;
                } else {
                    // Single line text
                    lastTextY = textY;
                }

                // Position braille after the last text line with the specified gap
                const brailleY = lastTextY + (msg.brailleGap || 40) + (msg.brailleHeight || 23.9);

                // Check if this is an error message
                const isError = brailleText.startsWith('BROKEN BRAILLE');

                svgContent += `
                    <text x="${textX}" y="${brailleY}"
                          fill="${isError ? '#FF0000' : templateData.colors?.braille || '#000000'}"
                          font-family="${isError ? 'Arial, sans-serif' : 'Braille, monospace'}"
                          font-size="${isError ? '24' : msg.brailleFontSize}"
                          text-anchor="${textAnchor}"
                          dominant-baseline="middle">
                        ${brailleText}
                    </text>
                `;
            }
        });
    }

    // Add logo if present
    if (templateData.logo && templateData.logo.svgContent) {
        try {
            // Parse the SVG to get its viewBox or dimensions
            /* global DOMParser */
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateData.logo.svgContent, 'image/svg+xml');
            const svgElement = doc.documentElement;

            // Get viewBox or dimensions from the original SVG
            const viewBox = svgElement.getAttribute('viewBox');
            let originalWidth, originalHeight;

            if (viewBox) {
                const parts = viewBox.split(' ');
                originalWidth = parseFloat(parts[2]) || 100;
                originalHeight = parseFloat(parts[3]) || 100;
            } else {
                originalWidth = parseFloat(svgElement.getAttribute('width')) || 100;
                originalHeight = parseFloat(svgElement.getAttribute('height')) || 100;
            }

            // Calculate scale to fit the specified dimensions
            const scaleX = templateData.logo.width / originalWidth;
            const scaleY = templateData.logo.height / originalHeight;

            // Extract inner content of SVG
            const innerContent = svgElement.innerHTML;

            svgContent += `
                <g transform="translate(${templateData.logo.x}, ${templateData.logo.y}) scale(${scaleX}, ${scaleY})">
                    ${innerContent}
                </g>
            `;
        } catch (e) {
            console.error('Error parsing logo SVG:', e);
        }
    }

    svgContent += '</svg>';

    display.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 20px; width: 100%; height: 100%; box-sizing: border-box; overflow: auto;">
            ${svgContent}
        </div>
    `;

    // Show info section
    if (info) {
        const filenameDiv = info.querySelector('.ms-template-filename');
        const detailsDiv = info.querySelector('.ms-template-details');

        if (filenameDiv) {
            filenameDiv.textContent = templateData.filename || 'template.json';
        }
        if (detailsDiv) {
            detailsDiv.textContent = `Loaded for ${currentTemplateMarkerType}`;
        }

        info.style.display = 'block';
    }
}

// Make displayTemplate globally available for thumbnail generator
window.displayTemplate = displayTemplate;

function setupTemplateModalListeners() {
    const addBtn = document.getElementById('template-add-btn');
    const removeBtn = document.getElementById('template-remove-btn');
    const closeBtn = document.getElementById('template-close-btn');
    const fileInput = document.getElementById('template-file-input');

    // Remove existing listeners to prevent duplicates
    if (addBtn && !addBtn.hasListener) {
        addBtn.hasListener = true;
        addBtn.addEventListener('click', () => {
            fileInput?.click();
        });
    }

    if (removeBtn && !removeBtn.hasListener) {
        removeBtn.hasListener = true;
        removeBtn.addEventListener('click', () => {
            if (currentTemplateMarkerType && loadedTemplates.has(currentTemplateMarkerType)) {
                loadedTemplates.delete(currentTemplateMarkerType);
                resetTemplateDisplay();
                console.log(`Removed template for ${currentTemplateMarkerType}`);
            }
        });
    }

    if (closeBtn && !closeBtn.hasListener) {
        closeBtn.hasListener = true;
        closeBtn.addEventListener('click', closeTemplateModal);
    }

    const createBtn = document.getElementById('template-create-btn');
    if (createBtn && !createBtn.hasListener) {
        createBtn.hasListener = true;
        createBtn.addEventListener('click', () => {
            window.open('/sign-template-maker/sign-template-maker.html', '_blank');
        });
    }

    if (fileInput && !fileInput.hasListener) {
        fileInput.hasListener = true;
        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file && file.type === 'application/json') {
                const reader = new FileReader();
                reader.onload = event => {
                    try {
                        const templateData = JSON.parse(event.target.result);
                        templateData.filename = file.name;

                        // Store the template for this marker type
                        if (currentTemplateMarkerType) {
                            loadedTemplates.set(currentTemplateMarkerType, templateData);
                            displayTemplate(templateData);
                            console.log(
                                `Loaded template for ${currentTemplateMarkerType}:`,
                                templateData
                            );
                        }
                    } catch (err) {
                        console.error('Invalid JSON file:', err);
                        alert('Invalid template file. Please select a valid JSON template.');
                    }
                };
                reader.readAsText(file);
            }
            // Reset file input for re-selection
            fileInput.value = '';
        });
    }
}

// Make template functions available globally
window.openTemplateModal = openTemplateModal;
window.closeTemplateModal = closeTemplateModal;
