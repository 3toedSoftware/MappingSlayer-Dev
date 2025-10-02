/**
 * Thumbnail Generator for Mapping Slayer
 * Generates a PDF grid of sign thumbnails using the existing displayTemplate renderer
 */

import { appState } from './state.js';

class ThumbnailGenerator {
    constructor() {
        this.modal = null;
    }

    init() {
        // Set up button event listener
        const createThumbnailsBtn = document.getElementById('create-thumbnails-btn');
        if (createThumbnailsBtn) {
            createThumbnailsBtn.addEventListener('click', () => this.openModal());
        }

        // Set up modal buttons
        const cancelBtn = document.getElementById('cancel-thumbnails-btn');
        const exportSVGsBtn = document.getElementById('export-individual-svgs-btn');
        const generateGridBtn = document.getElementById('generate-svg-grid-btn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }

        if (exportSVGsBtn) {
            exportSVGsBtn.addEventListener('click', () => this.exportIndividualSVGs());
        }

        if (generateGridBtn) {
            generateGridBtn.addEventListener('click', () => this.generateSVGGrid());
        }

        this.modal = document.getElementById('mapping-slayer-thumbnails-modal');
    }

    openModal() {
        if (!this.modal) return;

        // Populate marker types
        this.populateMarkerTypes();

        // Set up page size dropdown handler
        const pageSizeSelect = document.getElementById('thumbnail-page-size');
        const customSizeDiv = document.getElementById('custom-page-size');

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', e => {
                if (customSizeDiv) {
                    customSizeDiv.style.display = e.target.value === 'custom' ? 'block' : 'none';
                }
            });
        }

        // Show modal
        this.modal.style.display = 'block';
    }

    closeModal() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    populateMarkerTypes() {
        const container = document.getElementById('thumbnail-marker-types');
        if (!container) return;

        container.innerHTML = '';

        // Get all marker types that have dots
        const markerTypesWithDots = new Map();

        // Collect dots by marker type
        for (const [_pageNum, pageData] of appState.dotsByPage.entries()) {
            for (const [_dotId, dot] of pageData.dots.entries()) {
                const markerType = dot.markerType;
                if (!markerTypesWithDots.has(markerType)) {
                    markerTypesWithDots.set(markerType, []);
                }
                markerTypesWithDots.get(markerType).push(dot);
            }
        }

        // Create checkboxes for each marker type
        for (const [markerType, dots] of markerTypesWithDots.entries()) {
            const typeData = appState.markerTypes[markerType];
            if (!typeData) continue;

            const checkbox = document.createElement('div');
            checkbox.className = 'ms-thumbnail-type-option';
            checkbox.innerHTML = `
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <input type="checkbox" value="${markerType}" checked>
                    <span style="background: ${typeData.color}; width: 12px; height: 12px; border-radius: 2px;"></span>
                    <span>${markerType} - ${typeData.name} (${dots.length} locations)</span>
                </label>
            `;
            container.appendChild(checkbox);
        }
    }

    async exportIndividualSVGs() {
        // Get selected options
        const selectedTypes = [];
        const checkboxes = document.querySelectorAll(
            '#thumbnail-marker-types input[type="checkbox"]:checked'
        );
        checkboxes.forEach(cb => selectedTypes.push(cb.value));

        if (selectedTypes.length === 0) {
            alert('Please select at least one marker type');
            return;
        }

        // Disable button and show progress
        const exportBtn = document.getElementById('export-individual-svgs-btn');
        exportBtn.disabled = true;
        exportBtn.textContent = 'EXPORTING...';

        try {
            // Group dots by marker type
            const dotsByType = new Map();
            for (const [_pageNum, pageData] of appState.dotsByPage.entries()) {
                for (const [_dotId, dot] of pageData.dots.entries()) {
                    if (selectedTypes.includes(dot.markerType)) {
                        if (!dotsByType.has(dot.markerType)) {
                            dotsByType.set(dot.markerType, []);
                        }
                        dotsByType.get(dot.markerType).push(dot);
                    }
                }
            }

            // Process each marker type and generate individual SVGs
            for (const [markerType, dots] of dotsByType.entries()) {
                const typeData = appState.markerTypes[markerType];
                const template = window.loadedTemplates?.get(markerType);

                if (!template) {
                    console.warn(`No template loaded for marker type: ${markerType}`);
                    continue;
                }

                // Sort dots by location number
                dots.sort((a, b) => {
                    const locA = parseInt(a.locationNumber) || 0;
                    const locB = parseInt(b.locationNumber) || 0;
                    return locA - locB;
                });

                // Generate SVG for each dot
                for (const dot of dots) {
                    await this.generateSingleSVG(dot, template, typeData, markerType);
                }
            }

            // Close modal
            this.closeModal();
            alert('SVG files generated successfully!');
        } catch (error) {
            console.error('Error generating SVGs:', error);
            alert('Error generating SVGs: ' + error.message);
        } finally {
            // Re-enable button
            exportBtn.disabled = false;
            exportBtn.textContent = 'EXPORT INDIVIDUAL SVGs';
        }
    }

    async generateSVGGrid() {
        // Get selected options
        const selectedTypes = [];
        const checkboxes = document.querySelectorAll(
            '#thumbnail-marker-types input[type="checkbox"]:checked'
        );
        checkboxes.forEach(cb => selectedTypes.push(cb.value));

        if (selectedTypes.length === 0) {
            alert('Please select at least one marker type');
            return;
        }

        // Disable button and show progress
        const generateBtn = document.getElementById('generate-svg-grid-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'GENERATING...';

        try {
            // Get page settings
            const pageSize = document.getElementById('thumbnail-page-size').value;
            const orientation = document.getElementById('thumbnail-orientation').value;
            const thumbWidth = parseFloat(document.getElementById('thumbnail-width').value) || 2;
            const thumbHeight = parseFloat(document.getElementById('thumbnail-height').value) || 2;

            // Calculate page dimensions in inches (convert to pixels at 96 DPI)
            const DPI = 96;
            let pageWidth, pageHeight;
            if (pageSize === 'custom') {
                pageWidth = parseFloat(document.getElementById('custom-page-width').value) || 8.5;
                pageHeight = parseFloat(document.getElementById('custom-page-height').value) || 11;
            } else {
                const sizes = {
                    letter: [8.5, 11],
                    legal: [8.5, 14],
                    tabloid: [11, 17],
                    a4: [8.27, 11.69]
                };
                [pageWidth, pageHeight] = sizes[pageSize];
            }

            // Swap dimensions for landscape
            if (orientation === 'landscape') {
                [pageWidth, pageHeight] = [pageHeight, pageWidth];
            }

            // Convert to pixels
            const pageWidthPx = pageWidth * DPI;
            const pageHeightPx = pageHeight * DPI;
            const thumbWidthPx = thumbWidth * DPI;
            const thumbHeightPx = thumbHeight * DPI;

            // Calculate grid layout
            const margin = 0.5 * DPI; // pixels
            const spacing = 0.25 * DPI; // pixels between thumbnails
            const usableWidth = pageWidthPx - 2 * margin;
            const usableHeight = pageHeightPx - 2 * margin;

            const cols = Math.floor((usableWidth + spacing) / (thumbWidthPx + spacing));
            const rows = Math.floor((usableHeight + spacing) / (thumbHeightPx + spacing));
            const thumbnailsPerPage = cols * rows;

            // Collect all dots to process
            const allDots = [];
            for (const [_pageNum, pageData] of appState.dotsByPage.entries()) {
                for (const [_dotId, dot] of pageData.dots.entries()) {
                    if (selectedTypes.includes(dot.markerType)) {
                        allDots.push(dot);
                    }
                }
            }

            // Sort by marker type and location number
            allDots.sort((a, b) => {
                if (a.markerType !== b.markerType) {
                    return a.markerType.localeCompare(b.markerType);
                }
                const locA = parseInt(a.locationNumber) || 0;
                const locB = parseInt(b.locationNumber) || 0;
                return locA - locB;
            });

            if (allDots.length === 0) {
                alert('No locations found for selected marker types');
                return;
            }

            // Calculate total pages needed
            const totalPages = Math.ceil(allDots.length / thumbnailsPerPage);

            // Generate SVG for each page
            for (let pageNum = 0; pageNum < totalPages; pageNum++) {
                const startIdx = pageNum * thumbnailsPerPage;
                const endIdx = Math.min(startIdx + thumbnailsPerPage, allDots.length);
                const pageDots = allDots.slice(startIdx, endIdx);

                // Create master SVG for this page
                let pageSVG = `<svg width="${pageWidthPx}" height="${pageHeightPx}" xmlns="http://www.w3.org/2000/svg">`;

                // Add white background
                pageSVG += `<rect width="${pageWidthPx}" height="${pageHeightPx}" fill="white"/>`;

                // Add each thumbnail
                for (let i = 0; i < pageDots.length; i++) {
                    const dot = pageDots[i];
                    const template = window.loadedTemplates?.get(dot.markerType);
                    if (!template) {
                        console.warn(`No template for marker type: ${dot.markerType}`);
                        continue;
                    }

                    // Calculate position on page
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = margin + col * (thumbWidthPx + spacing);
                    const y = margin + row * (thumbHeightPx + spacing);

                    // Generate SVG for this sign
                    const svgElement = await this.generateSVGElement(dot, template);
                    if (svgElement) {
                        // Get the inner content of the SVG (everything except the svg tag)
                        const svgContent = svgElement.innerHTML;
                        const viewBox = svgElement.getAttribute('viewBox');

                        // Add as a nested group with positioning and scaling
                        pageSVG += `<g transform="translate(${x}, ${y})">`;
                        pageSVG += `<svg width="${thumbWidthPx}" height="${thumbHeightPx}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">`;
                        pageSVG += svgContent;
                        pageSVG += '</svg></g>';
                    }
                }

                pageSVG += '</svg>';

                // Download this page
                const blob = new Blob([pageSVG], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `sign-thumbnails-page-${pageNum + 1}.svg`;
                link.click();
                URL.revokeObjectURL(url);
            }

            this.closeModal();
            alert(`Generated ${totalPages} SVG grid page(s) with ${allDots.length} thumbnails`);
        } catch (error) {
            console.error('Error generating SVG grid:', error);
            alert('Error generating SVG grid: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'GENERATE SVG GRID';
        }
    }

    async generateSVGElement(dot, template) {
        try {
            // Create a copy of the template with actual messages
            const templateData = JSON.parse(JSON.stringify(template));

            // Replace MSG1 and MSG2 with actual values
            if (templateData.messages) {
                if (templateData.messages['1']) {
                    templateData.messages['1'].text = dot.message1 || dot.message || '';
                }
                if (templateData.messages['2']) {
                    templateData.messages['2'].text = dot.message2 || '';
                }
            }

            // Create temporary container for displayTemplate
            const tempContainer = document.createElement('div');
            tempContainer.id = 'template-display';
            tempContainer.style.width = '400px';
            tempContainer.style.height = '400px';
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            document.body.appendChild(tempContainer);

            // Store original element if it exists
            const originalDisplay = document.getElementById('template-display');
            if (originalDisplay && originalDisplay !== tempContainer) {
                originalDisplay.id = 'template-display-original';
            }

            // Call displayTemplate to render the sign (production mode = no outlines)
            if (window.displayTemplate) {
                window.displayTemplate(templateData, true);
            }

            // Get the rendered SVG
            const svgElement = tempContainer.querySelector('svg');
            if (!svgElement) {
                throw new Error('No SVG generated');
            }

            // Clone the SVG for return
            const clonedSVG = svgElement.cloneNode(true);

            // Restore original element
            if (originalDisplay && originalDisplay !== tempContainer) {
                originalDisplay.id = 'template-display';
            }

            // Clean up temp container
            document.body.removeChild(tempContainer);

            return clonedSVG;
        } catch (error) {
            console.error('Error generating SVG element:', error);
            return null;
        }
    }

    async generateSingleSVG(dot, template, typeData, markerType) {
        try {
            // Create a copy of the template with actual messages
            const templateData = JSON.parse(JSON.stringify(template));

            // Replace MSG1 and MSG2 with actual values
            if (templateData.messages) {
                if (templateData.messages['1']) {
                    templateData.messages['1'].text = dot.message1 || dot.message || '';
                }
                if (templateData.messages['2']) {
                    templateData.messages['2'].text = dot.message2 || '';
                }
            }

            // Create temporary container for displayTemplate
            const tempContainer = document.createElement('div');
            tempContainer.id = 'template-display';
            tempContainer.style.width = '400px';
            tempContainer.style.height = '400px';
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            document.body.appendChild(tempContainer);

            // Store original element if it exists
            const originalDisplay = document.getElementById('template-display');
            if (originalDisplay) {
                originalDisplay.id = 'template-display-original';
            }

            // Call displayTemplate to render the sign (production mode = no outlines)
            if (window.displayTemplate) {
                window.displayTemplate(templateData, true);
            }

            // Get the rendered SVG
            const svgElement = tempContainer.querySelector('svg');
            if (!svgElement) {
                throw new Error('No SVG generated');
            }

            // Embed fonts into the SVG if they exist
            if (templateData.customFonts) {
                const defs =
                    svgElement.querySelector('defs') ||
                    svgElement.insertBefore(
                        document.createElementNS('http://www.w3.org/2000/svg', 'defs'),
                        svgElement.firstChild
                    );

                const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
                let fontStyles = '';

                Object.entries(templateData.customFonts).forEach(([fontName, fontData]) => {
                    fontStyles += `
                        @font-face {
                            font-family: '${fontName}';
                            src: url(${fontData}) format('truetype');
                        }
                    `;
                });

                style.textContent = fontStyles;
                defs.appendChild(style);
            }

            // Convert SVG to string
            // eslint-disable-next-line no-undef
            const svgString = new XMLSerializer().serializeToString(svgElement);

            // Create blob and download
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = `${markerType}_location_${dot.locationNumber}.svg`;
            link.click();

            // Clean up
            URL.revokeObjectURL(url);

            // Restore original element
            if (originalDisplay) {
                originalDisplay.id = 'template-display';
            }

            // Clean up temp container
            document.body.removeChild(tempContainer);
        } catch (error) {
            console.error(`Error generating SVG for location ${dot.locationNumber}:`, error);
        }
    }

    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace('#', '');

        // Parse hex values
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return [r, g, b];
    }
}

export const thumbnailGenerator = new ThumbnailGenerator();
