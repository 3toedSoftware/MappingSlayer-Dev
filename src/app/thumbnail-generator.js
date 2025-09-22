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
        const generateBtn = document.getElementById('generate-thumbnails-btn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generatePDF());
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
        for (const [pageNum, pageData] of appState.dotsByPage.entries()) {
            for (const [dotId, dot] of pageData.dots.entries()) {
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

    async generatePDF() {
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

        const width = parseFloat(document.getElementById('thumbnail-width').value);
        const height = parseFloat(document.getElementById('thumbnail-height').value);
        const cols = parseInt(document.getElementById('thumbnail-cols').value);
        const rows = parseInt(document.getElementById('thumbnail-rows').value);
        const spacing = parseFloat(document.getElementById('thumbnail-spacing').value);
        const includeNotes = document.getElementById('thumbnail-include-notes').checked;

        // Get page size settings
        const pageSizeSelect = document.getElementById('thumbnail-page-size').value;
        const orientation = document.getElementById('thumbnail-orientation').value;

        let pageWidth, pageHeight;

        // Define page sizes in inches
        const pageSizes = {
            letter: { width: 8.5, height: 11 },
            legal: { width: 8.5, height: 14 },
            tabloid: { width: 11, height: 17 },
            a4: { width: 8.27, height: 11.69 } // A4 in inches
        };

        if (pageSizeSelect === 'custom') {
            pageWidth = parseFloat(document.getElementById('custom-page-width').value) || 8.5;
            pageHeight = parseFloat(document.getElementById('custom-page-height').value) || 11;
        } else {
            const size = pageSizes[pageSizeSelect] || pageSizes.letter;
            pageWidth = size.width;
            pageHeight = size.height;
        }

        // Swap dimensions for landscape
        if (orientation === 'landscape') {
            [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }

        // Disable generate button and show progress
        const generateBtn = document.getElementById('generate-thumbnails-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'GENERATING...';

        try {
            // Initialize jsPDF
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: orientation,
                unit: 'in',
                format: [pageWidth, pageHeight]
            });

            const margin = 0.5;

            // Calculate actual thumbnail dimensions including text space
            const textHeight = includeNotes ? 0.5 : 0.3; // Space for location number and notes
            const totalThumbHeight = height + textHeight;

            // Group dots by marker type
            const dotsByType = new Map();
            for (const [pageNum, pageData] of appState.dotsByPage.entries()) {
                for (const [dotId, dot] of pageData.dots.entries()) {
                    if (selectedTypes.includes(dot.markerType)) {
                        if (!dotsByType.has(dot.markerType)) {
                            dotsByType.set(dot.markerType, []);
                        }
                        dotsByType.get(dot.markerType).push(dot);
                    }
                }
            }

            let isFirstPage = true;

            // Process each marker type
            for (const [markerType, dots] of dotsByType.entries()) {
                const typeData = appState.markerTypes[markerType];
                const template = window.loadedTemplates?.get(markerType);

                // Start new page for each marker type
                if (!isFirstPage) {
                    pdf.addPage();
                } else {
                    isFirstPage = false;
                }

                // Add marker type header
                pdf.setFontSize(16);
                pdf.setTextColor(0, 0, 0);
                pdf.text(`${markerType} - ${typeData.name}`, margin, margin + 0.3);

                let currentY = margin + 0.6;
                let thumbnailIndex = 0;

                // Sort dots by location number
                dots.sort((a, b) => {
                    const locA = parseInt(a.locationNumber) || 0;
                    const locB = parseInt(b.locationNumber) || 0;
                    return locA - locB;
                });

                // Process dots in batches for this page
                while (thumbnailIndex < dots.length) {
                    // Check if we need a new page
                    if (currentY + totalThumbHeight > pageHeight - margin) {
                        pdf.addPage();
                        currentY = margin;
                    }

                    // Draw row of thumbnails
                    for (let col = 0; col < cols && thumbnailIndex < dots.length; col++) {
                        const dot = dots[thumbnailIndex];
                        const x = margin + col * (width + spacing);

                        // Draw thumbnail box
                        pdf.setDrawColor(200, 200, 200);
                        pdf.rect(x, currentY, width, height);

                        // Generate sign preview
                        if (template) {
                            await this.renderSignThumbnail(
                                pdf,
                                dot,
                                template,
                                x,
                                currentY,
                                width,
                                height
                            );
                        } else {
                            // Placeholder if no template
                            pdf.setFontSize(10);
                            pdf.setTextColor(150, 150, 150);
                            pdf.text('No Template', x + width / 2, currentY + height / 2, {
                                align: 'center'
                            });
                        }

                        // Add location dot and number
                        const dotX = x + 0.15;
                        const dotY = currentY + height + 0.1;

                        // Draw colored dot
                        pdf.setFillColor(...this.hexToRgb(typeData.color));
                        pdf.circle(dotX, dotY, 0.08, 'F');

                        // Add location number
                        pdf.setFontSize(10);
                        pdf.setTextColor(0, 0, 0);
                        pdf.text(dot.locationNumber, dotX + 0.15, dotY + 0.03);

                        // Add notes if enabled
                        if (includeNotes && dot.notes) {
                            pdf.setFontSize(8);
                            pdf.setTextColor(80, 80, 80);
                            const notes = dot.notes.substring(0, 50); // Limit notes length
                            pdf.text(notes, x + 0.05, dotY + 0.2);
                        }

                        thumbnailIndex++;
                    }

                    currentY += totalThumbHeight + spacing;
                }
            }

            // Save the PDF
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            pdf.save(`thumbnails_${timestamp}.pdf`);

            // Close modal
            this.closeModal();
        } catch (error) {
            console.error('Error generating thumbnails:', error);
            alert('Error generating thumbnails: ' + error.message);
        } finally {
            // Re-enable button
            generateBtn.disabled = false;
            generateBtn.textContent = 'GENERATE PDF';
        }
    }

    async renderSignThumbnail(pdf, dot, template, x, y, width, height) {
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

            // Call displayTemplate to render the sign
            if (window.displayTemplate) {
                window.displayTemplate(templateData);
            }

            // Get the rendered SVG
            const svgElement = tempContainer.querySelector('svg');
            if (!svgElement) {
                throw new Error('No SVG generated');
            }

            // Convert SVG to image and add to PDF
            await this.svgToPDF(svgElement, pdf, x, y, width, height);

            // Restore original element
            if (originalDisplay) {
                originalDisplay.id = 'template-display';
            }

            // Clean up
            document.body.removeChild(tempContainer);
        } catch (error) {
            console.error('Error rendering sign thumbnail:', error);
            // Draw placeholder
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.text('Error', x + width / 2, y + height / 2, { align: 'center' });
        }
    }

    async svgToPDF(svgElement, pdf, x, y, width, height) {
        // Create a canvas to render the SVG
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Get SVG dimensions
        const viewBox = svgElement.getAttribute('viewBox');
        let svgWidth = 400,
            svgHeight = 400;
        if (viewBox) {
            const parts = viewBox.split(' ');
            svgWidth = parseFloat(parts[2]) || 400;
            svgHeight = parseFloat(parts[3]) || 400;
        }

        // Set canvas size with scale for quality
        const scale = 2;
        canvas.width = svgWidth * scale;
        canvas.height = svgHeight * scale;

        // Clear canvas with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);

        // Convert SVG to image
        const svgString = new window.XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Wait for image to load
        await new Promise((resolve, reject) => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load SVG'));
            };
            img.src = url;
        });

        // Add canvas to PDF preserving aspect ratio
        const imgData = canvas.toDataURL('image/png');

        // Calculate aspect ratio to fit within thumbnail box
        const aspectRatio = svgWidth / svgHeight;
        let finalWidth = width;
        let finalHeight = height;
        let finalX = x;
        let finalY = y;

        if (aspectRatio > width / height) {
            // Sign is wider than thumbnail box - fit by width
            finalHeight = width / aspectRatio;
            finalY = y + (height - finalHeight) / 2; // Center vertically
        } else {
            // Sign is taller than thumbnail box - fit by height
            finalWidth = height * aspectRatio;
            finalX = x + (width - finalWidth) / 2; // Center horizontally
        }

        pdf.addImage(imgData, 'PNG', finalX, finalY, finalWidth, finalHeight);
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
