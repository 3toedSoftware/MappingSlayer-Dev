// map-controller.js
import { appState, getCurrentPageDots } from './state.js';
import { getSymbolInfo, migrateDotToFlags, FLAG_POSITIONS } from './flag-config.js';

// PDF Cache - This stores our pre-rendered PDF pages so we don't have to re-render them
// Think of it like taking a photo of the PDF page once, then using that photo instead of
// re-drawing the entire page every time
// Now supports multiple pages and handles zoom without re-rendering!
const pdfCache = new Map(); // Map of pageNum -> { canvas, scale }

// Function to clear the PDF cache - call this when loading a new PDF
function clearPDFCache() {
    pdfCache.clear();
}

// Viewport virtualization functions
function getViewportBounds() {
    const mapContainer = document.getElementById('map-container');
    const containerRect = mapContainer.getBoundingClientRect();
    const { x: mapX, y: mapY, scale } = appState.mapTransform;

    // Calculate visible area in canvas coordinates with buffer
    const bufferSize = 200; // pixels of buffer around visible area

    const viewportBounds = {
        left: (-mapX - bufferSize) / scale,
        top: (-mapY - bufferSize) / scale,
        right: (-mapX + containerRect.width + bufferSize) / scale,
        bottom: (-mapY + containerRect.height + bufferSize) / scale
    };

    return viewportBounds;
}

function isDotInViewport(dot, viewportBounds) {
    const dotRadius = (20 * appState.dotSize * 2) / 2; // Account for dot size

    return (
        dot.x + dotRadius >= viewportBounds.left &&
        dot.x - dotRadius <= viewportBounds.right &&
        dot.y + dotRadius >= viewportBounds.top &&
        dot.y - dotRadius <= viewportBounds.bottom
    );
}

function getVisibleDots() {
    const viewportBounds = getViewportBounds();
    const allDots = getCurrentPageDots();
    const visibleDots = new Map();

    for (const [id, dot] of allDots.entries()) {
        // Apply inst filter
        if (appState.instFilterMode === 'instOnly' && !dot.installed) continue;
        if (appState.instFilterMode === 'hideInst' && dot.installed) continue;

        // Check viewport
        if (isDotInViewport(dot, viewportBounds)) {
            visibleDots.set(id, dot);
        }
    }

    return visibleDots;
}

async function renderPDFPage(pageNum) {
    console.log('🔍 renderPDFPage called with pageNum:', pageNum);
    console.log('🔍 appState.pdfDoc exists?', !!appState.pdfDoc);
    if (!appState.pdfDoc) {
        console.log('🔍 No pdfDoc found, skipping render');
        return;
    }

    // Cancel any pending render task
    if (appState.pdfRenderTask) {
        appState.pdfRenderTask.cancel();
    }

    const canvas = document.getElementById('pdf-canvas');
    console.log('🔍 Canvas element found?', !!canvas);
    if (!canvas) {
        console.error('🔍 ERROR: pdf-canvas element not found!');
        return;
    }
    const context = canvas.getContext('2d');

    // Check if we already have this page cached
    const cached = pdfCache.get(pageNum);
    if (cached && cached.scale === appState.pdfScale) {
        // We have it cached at the right scale! Just copy it
        canvas.width = cached.canvas.width;
        canvas.height = cached.canvas.height;
        canvas.style.display = 'block';

        // Copy the cached image - this is MUCH faster than re-rendering
        context.drawImage(cached.canvas, 0, 0);
        return; // We're done!
    }

    // If we get here, we need to render the PDF page fresh
    const page = await appState.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: appState.pdfScale });

    // Set up our display canvas
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';
    console.log('🔍 Canvas dimensions set:', canvas.width, 'x', canvas.height);

    // Create a new cache canvas for this page
    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = viewport.width;
    cacheCanvas.height = viewport.height;

    // Render to BOTH canvases - display and cache
    const displayContext = {
        canvasContext: context,
        viewport: viewport
    };

    const cacheContext = {
        canvasContext: cacheCanvas.getContext('2d'),
        viewport: viewport
    };

    // Store and await the new render task
    appState.pdfRenderTask = page.render(displayContext);
    try {
        await appState.pdfRenderTask.promise;

        // Also render to cache canvas
        await page.render(cacheContext).promise;

        // Store in cache - keep up to 5 pages cached
        if (pdfCache.size >= 5) {
            // Remove oldest entry
            const firstKey = pdfCache.keys().next().value;
            pdfCache.delete(firstKey);
        }
        pdfCache.set(pageNum, {
            canvas: cacheCanvas,
            scale: appState.pdfScale
        });
    } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
            console.error('PDF rendering failed:', error);
        }
    } finally {
        appState.pdfRenderTask = null;
    }

    const mapContent = document.getElementById('map-content');
    mapContent.style.width = `${viewport.width}px`;
    mapContent.style.height = `${viewport.height}px`;
}

async function renderDotsForCurrentPage(useAsync = false) {
    // CRITICAL: Enhanced DOM cleanup with detailed logging
    const existingDots = document.getElementById('map-content').querySelectorAll('.ms-map-dot');
    existingDots.forEach((dot, index) => {
        dot.remove();
    });

    // DEBUG: Check viewport bounds calculation
    const viewportBounds = getViewportBounds();
    const allDots = getCurrentPageDots();

    // DEBUG: Log all dot IDs and their details
    if (allDots.size > 0) {
        allDots.forEach((dot, id) => {});
    }

    // CRITICAL FIX: Check if viewport bounds are invalid (happens on first load)
    const containerRect = document.getElementById('map-container')?.getBoundingClientRect();
    const hasValidContainer = containerRect && containerRect.width > 0 && containerRect.height > 0;

    let visibleDots;
    if (!hasValidContainer) {
        // On first load, render all dots because viewport calculation is unreliable
        // But still apply filters
        visibleDots = new Map();
        for (const [id, dot] of allDots.entries()) {
            // Apply inst filter
            if (appState.instFilterMode === 'instOnly' && !dot.installed) continue;
            if (appState.instFilterMode === 'hideInst' && dot.installed) continue;

            visibleDots.set(id, dot);
        }
    } else {
        visibleDots = getVisibleDots();
    }

    if (useAsync && visibleDots.size > 50) {
        // Use async rendering for large batches
        await renderDotsAsync(visibleDots);
    } else {
        // Use synchronous rendering for small amounts
        visibleDots.forEach(dot => createDotElement(dot));
    }

    // Also render annotation lines
    const { renderAnnotationLines } = await import('./ui.js');
    renderAnnotationLines();
}

function updateSingleDot(internalId) {
    // Find the dot data
    const dot = getCurrentPageDots().get(internalId);
    if (!dot) return false;

    // Check if dot was selected before removing element
    const wasSelected = appState.selectedDots.has(internalId);

    // Remove existing dot element
    const existingDot = document.querySelector(`.ms-map-dot[data-dot-id="${internalId}"]`);
    if (existingDot) {
        existingDot.remove();
    }

    // Re-create the dot with updated properties
    createDotElement(dot);

    // Restore selection state if it was selected
    if (wasSelected) {
        const newDotElement = document.querySelector(`.ms-map-dot[data-dot-id="${internalId}"]`);
        if (newDotElement) {
            newDotElement.classList.add('ms-selected');
            Object.assign(newDotElement.style, {
                boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.8), 0 0 0 6px rgba(0, 123, 255, 0.6)',
                border: '2px solid #007bff',
                zIndex: '1000'
            });
        }
    }

    return true;
}

function createDotElement(dot) {
    const mapContent = document.getElementById('map-content');
    if (!mapContent) {
        return;
    }

    // Check if dot already exists (shouldn't happen but let's be safe)
    const existingDot = mapContent.querySelector(`.ms-map-dot[data-dot-id="${dot.internalId}"]`);
    if (existingDot) {
        existingDot.remove();
    }

    const dotElement = document.createElement('div');
    dotElement.className = 'ms-map-dot';
    dotElement.dataset.dotId = dot.internalId;

    const effectiveMultiplier = appState.dotSize * 2;
    const size = 20 * effectiveMultiplier;
    const halfSize = size / 2;

    // Position the dot centered on the click point
    Object.assign(dotElement.style, {
        left: `${dot.x - halfSize}px`,
        top: `${dot.y - halfSize}px`,
        transform: 'none' // Override the CSS transform
    });

    const markerTypeInfo = appState.markerTypes[dot.markerType] || {
        color: '#ff0000',
        textColor: '#FFFFFF'
    };
    Object.assign(dotElement.style, {
        backgroundColor: markerTypeInfo.color,
        color: markerTypeInfo.textColor,
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${8 * effectiveMultiplier}px`
    });

    if (appState.selectedDots.has(dot.internalId)) {
        dotElement.classList.add('ms-selected');
        Object.assign(dotElement.style, {
            boxShadow: '0 0 15px #00ff88, 0 0 30px #00ff88',
            border: '2px solid #00ff88',
            zIndex: '200'
        });
    }

    // Migrate old properties to new flag system if needed
    migrateDotToFlags(dot);

    const messageFontSize = 10 * effectiveMultiplier;
    const locationDisplay = appState.locationsVisible ? '' : 'display: none;';
    const flagSize = 10 * effectiveMultiplier;

    // Build flag HTML for all 4 corners (now using global flag config)
    let flagsHTML = '';
    const flagConfig = appState.globalFlagConfiguration;

    if (dot.flags) {
        Object.keys(FLAG_POSITIONS).forEach(key => {
            const position = FLAG_POSITIONS[key];
            const isChecked = dot.flags[position];
            const config = flagConfig ? flagConfig[position] : null;

            // Show symbol if flag is checked
            if (isChecked) {
                const positionClass = position.replace(/([A-Z])/g, '-$1').toLowerCase();

                // Calculate flag offset based on dot size (halved to be closer to center)
                const flagOffset = -4 * effectiveMultiplier;
                let positionStyles = '';

                if (position === 'topLeft') {
                    positionStyles = `top: ${flagOffset}px; left: ${flagOffset}px;`;
                } else if (position === 'topRight') {
                    positionStyles = `top: ${flagOffset}px; right: ${flagOffset}px;`;
                } else if (position === 'bottomLeft') {
                    positionStyles = `bottom: ${flagOffset}px; left: ${flagOffset}px;`;
                } else if (position === 'bottomRight') {
                    positionStyles = `bottom: ${flagOffset}px; right: ${flagOffset}px;`;
                }

                // Get symbol info which now handles both emoji and custom icons
                const symbolToUse = config && config.symbol ? config.symbol : 'checkmark';
                const symbolInfo = getSymbolInfo(symbolToUse);

                if (symbolInfo && symbolInfo.isCustom) {
                    // Custom icon - display as image
                    flagsHTML += `<div class="ms-dot-flag ms-dot-flag-${positionClass}" style="${positionStyles}">
                        <img src="${symbolInfo.symbol}" style="width: ${flagSize}px; height: ${flagSize}px; object-fit: contain;" alt="${symbolInfo.label}">
                    </div>`;
                } else if (symbolInfo && symbolInfo.symbol) {
                    // Regular emoji symbol
                    flagsHTML += `<div class="ms-dot-flag ms-dot-flag-${positionClass}" style="font-size: ${flagSize}px; ${positionStyles}">${symbolInfo.symbol}</div>`;
                }
            }
        });
    }

    // Add installed indicator (green diagonal line)
    let installedHTML = '';
    if (dot.installed) {
        installedHTML = `<div class="ms-dot-installed" style="
            position: absolute;
            width: 141%;
            height: 3px;
            background: #00ff00;
            transform: rotate(-45deg);
            transform-origin: center;
            top: 50%;
            left: 50%;
            margin-left: -70.5%;
            margin-top: -1.5px;
            z-index: 10;
            pointer-events: none;
        "></div>`;
    }

    // Add camera icon if dot has a photo and mode is active
    let cameraHTML = '';
    if (appState.showPhotoIndicators && dot.photo) {
        const cameraSize = 16 * effectiveMultiplier;
        const cameraOffset = -(size / 2 + cameraSize / 2 + 2);
        cameraHTML = `<div class="ms-dot-camera-icon" style="
            position: absolute;
            top: ${cameraOffset}px;
            left: 50%;
            transform: translateX(-50%);
            font-size: ${cameraSize}px;
            z-index: 15;
            pointer-events: none;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
        ">📷</div>`;
    }

    dotElement.innerHTML = `${flagsHTML}${installedHTML}${cameraHTML}<span class="ms-dot-number" style="${locationDisplay}">${dot.locationNumber}</span><div class="ms-map-dot-message" style="color: ${markerTypeInfo.color}; font-size: ${messageFontSize}px;">${dot.message}</div><div class="ms-map-dot-message2" style="color: ${markerTypeInfo.color}; font-size: ${messageFontSize}px; margin-top: ${8 * effectiveMultiplier}px;">${dot.message2 || ''}</div>`;

    if (dot.notes && dot.notes.trim()) {
        dotElement.setAttribute('title', dot.notes);
    }

    if (appState.messagesVisible) {
        dotElement.querySelector('.ms-map-dot-message').classList.add('ms-visible');
    }
    if (appState.messages2Visible) {
        const msg2Element = dotElement.querySelector('.ms-map-dot-message2');
        if (msg2Element) msg2Element.classList.add('ms-visible');
    }
    mapContent.appendChild(dotElement);
}

function applyMapTransform() {
    const mapContent = document.getElementById('map-content');
    const { x, y, scale } = appState.mapTransform;
    mapContent.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

    // Update visible dots after transform change - use throttled version for performance
    updateViewportDotsThrottled();
}

function centerOnDot(internalId, zoomLevel = 1.5) {
    const dot = getCurrentPageDots().get(internalId);
    if (!dot) return;
    const containerRect = document.getElementById('map-container').getBoundingClientRect();

    appState.mapTransform.scale = zoomLevel;
    appState.mapTransform.x = containerRect.width / 2 - dot.x * zoomLevel;
    appState.mapTransform.y = containerRect.height / 2 - dot.y * zoomLevel;
    applyMapTransform();
}

async function renderDotsAsync(dots, statusCallback = null) {
    const BATCH_SIZE = 25; // Process 25 dots at a time
    const dotsArray = Array.from(dots.values());

    for (let i = 0; i < dotsArray.length; i += BATCH_SIZE) {
        const batch = dotsArray.slice(i, i + BATCH_SIZE);

        // Create DOM elements for this batch
        batch.forEach(dot => createDotElement(dot));

        // Update progress if callback provided
        if (statusCallback) {
            const progress = Math.min(100, Math.round(((i + BATCH_SIZE) / dotsArray.length) * 100));
            statusCallback(
                `Rendering dots: ${Math.min(i + BATCH_SIZE, dotsArray.length)}/${dotsArray.length}`,
                progress
            );
        }

        // Allow browser to breathe (paint, handle events)
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

function updateViewportDots() {
    // Only re-render if we have dots and a PDF loaded
    if (!appState.pdfDoc || getCurrentPageDots().size === 0) return;

    const currentVisibleIds = new Set();
    document.querySelectorAll('.ms-map-dot').forEach(dot => {
        currentVisibleIds.add(dot.dataset.dotId);
    });

    const shouldBeVisible = getVisibleDots();
    const shouldBeVisibleIds = new Set(shouldBeVisible.keys());

    // Remove dots that should no longer be visible
    currentVisibleIds.forEach(id => {
        if (!shouldBeVisibleIds.has(id)) {
            const dotElement = document.querySelector(`.ms-map-dot[data-dot-id="${id}"]`);
            if (dotElement) dotElement.remove();
        }
    });

    // Add dots that should now be visible
    shouldBeVisibleIds.forEach(id => {
        if (!currentVisibleIds.has(id)) {
            const dot = shouldBeVisible.get(id);
            if (dot) createDotElement(dot);
        }
    });
}

// Throttled version of updateViewportDots for smooth panning
function updateViewportDotsThrottled() {
    if (viewportUpdateScheduled) return;

    const now = performance.now();
    const timeSinceLastUpdate = now - lastViewportUpdate;

    if (timeSinceLastUpdate >= VIEWPORT_UPDATE_THROTTLE) {
        updateViewportDots();
        lastViewportUpdate = now;
    } else {
        viewportUpdateScheduled = true;
        const remainingTime = VIEWPORT_UPDATE_THROTTLE - timeSinceLastUpdate;

        requestAnimationFrame(() => {
            setTimeout(() => {
                updateViewportDots();
                lastViewportUpdate = performance.now();
                viewportUpdateScheduled = false;
            }, remainingTime);
        });
    }
}

function isDotVisible(internalId) {
    const dotElement = document.querySelector(`.ms-map-dot[data-dot-id="${internalId}"]`);
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

// Map interaction handlers
let isDragging = false;
const dragStart = { x: 0, y: 0 };
const lastTransform = { x: 0, y: 0 };

// Performance optimization variables
let viewportUpdateScheduled = false;
let lastViewportUpdate = 0;
const VIEWPORT_UPDATE_THROTTLE = 16; // ~60fps

function handleMapMouseDown(e) {
    if (e.button !== 1) return; // Only middle mouse button

    isDragging = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    lastTransform.x = appState.mapTransform.x;
    lastTransform.y = appState.mapTransform.y;

    // Add dragging class for cursor change
    const mapContainer = document.getElementById('map-container');
    mapContainer.classList.add('ms-dragging');

    document.addEventListener('mousemove', handleMapMouseMove);
    document.addEventListener('mouseup', handleMapMouseUp);

    e.preventDefault();
}

function handleMapMouseMove(e) {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    appState.mapTransform.x = lastTransform.x + deltaX;
    appState.mapTransform.y = lastTransform.y + deltaY;

    // Apply transform immediately for smooth visual feedback
    const mapContent = document.getElementById('map-content');
    const { x, y, scale } = appState.mapTransform;
    mapContent.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

    // Throttle viewport updates during drag for performance
    updateViewportDotsThrottled();
}

function handleMapMouseUp(e) {
    isDragging = false;
    document.removeEventListener('mousemove', handleMapMouseMove);
    document.removeEventListener('mouseup', handleMapMouseUp);

    // Remove dragging class to reset cursor
    const mapContainer = document.getElementById('map-container');
    mapContainer.classList.remove('ms-dragging');
}

function handleMapWheel(e) {
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.01, Math.min(5, appState.mapTransform.scale * zoomFactor));

    // Zoom towards mouse position
    const scaleChange = newScale / appState.mapTransform.scale;
    appState.mapTransform.x = mouseX - (mouseX - appState.mapTransform.x) * scaleChange;
    appState.mapTransform.y = mouseY - (mouseY - appState.mapTransform.y) * scaleChange;
    appState.mapTransform.scale = newScale;

    applyMapTransform();
    updateViewportDots();
}

// Touch handling variables
let touches = [];
let lastTouchDistance = 0;
let isPinching = false;
let touchDragging = false;
const touchDragStart = { x: 0, y: 0 };
const touchLastTransform = { x: 0, y: 0 };

function handleTouchStart(e) {
    // Store touch points
    touches = Array.from(e.touches);

    if (touches.length === 2) {
        // Two fingers - start pinch zoom
        isPinching = true;
        touchDragging = false;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        e.preventDefault();
    } else if (touches.length === 1) {
        // Single touch - start pan
        isPinching = false;
        touchDragging = true;
        touchDragStart.x = touches[0].clientX;
        touchDragStart.y = touches[0].clientY;
        touchLastTransform.x = appState.mapTransform.x;
        touchLastTransform.y = appState.mapTransform.y;

        // Add dragging class for visual feedback
        const mapContainer = document.getElementById('map-container');
        mapContainer.classList.add('ms-dragging');
    }
}

function handleTouchMove(e) {
    if (touches.length === 2 && e.touches.length === 2) {
        // Pinch zoom
        e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        // Calculate distance between touches
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (lastTouchDistance > 0) {
            // Calculate zoom
            const scale = distance / lastTouchDistance;
            const newScale = Math.max(0.1, Math.min(5, appState.mapTransform.scale * scale));

            // Find center point between touches
            const rect = e.currentTarget.getBoundingClientRect();
            const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
            const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

            // Zoom towards center point
            const scaleChange = newScale / appState.mapTransform.scale;
            appState.mapTransform.x = centerX - (centerX - appState.mapTransform.x) * scaleChange;
            appState.mapTransform.y = centerY - (centerY - appState.mapTransform.y) * scaleChange;
            appState.mapTransform.scale = newScale;

            applyMapTransform();
            updateViewportDots();
        }

        lastTouchDistance = distance;
        touches = Array.from(e.touches);
    } else if (touches.length === 1 && e.touches.length === 1 && !isPinching && touchDragging) {
        // Single finger pan
        e.preventDefault();

        const touch = e.touches[0];
        const deltaX = touch.clientX - touchDragStart.x;
        const deltaY = touch.clientY - touchDragStart.y;

        // Only consider it a drag if moved more than 5 pixels (to distinguish from tap)
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            appState.mapTransform.x = touchLastTransform.x + deltaX;
            appState.mapTransform.y = touchLastTransform.y + deltaY;

            applyMapTransform();
            updateViewportDotsThrottled();
        }
    }
}

function handleTouchEnd(e) {
    touches = Array.from(e.touches);
    if (touches.length < 2) {
        isPinching = false;
        lastTouchDistance = 0;
    }
    if (touches.length === 0) {
        touchDragging = false;
        // Remove dragging class
        const mapContainer = document.getElementById('map-container');
        mapContainer.classList.remove('ms-dragging');
    }
}

function setupMapInteraction() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    // Mouse events
    mapContainer.addEventListener('mousedown', handleMapMouseDown);
    mapContainer.addEventListener('wheel', handleMapWheel, { passive: false });

    // Touch events for mobile/tablet
    mapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    mapContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    mapContainer.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Prevent default touch behavior on the map
    mapContainer.style.touchAction = 'none';
}

export {
    renderPDFPage,
    renderDotsForCurrentPage,
    updateSingleDot,
    applyMapTransform,
    isDotVisible,
    centerOnDot,
    setupMapInteraction,
    updateViewportDotsThrottled,
    clearPDFCache
};
