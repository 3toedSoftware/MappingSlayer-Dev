/**
 * Sign Template System for Mapping Slayer
 * Handles HTML sign templates with dynamic message injection
 */

export class SignTemplateSystem {
    constructor() {
        this.templateCache = new Map();
        this.previewContainer = null;
        this.exportCanvas = null;
        this.init();
    }

    init() {
        // Create a hidden iframe for rendering templates
        this.templateFrame = document.createElement('iframe');
        this.templateFrame.style.display = 'none';
        this.templateFrame.style.width = '600px';
        this.templateFrame.style.height = '900px';
        document.body.appendChild(this.templateFrame);

        // Create canvas for export
        this.exportCanvas = document.createElement('canvas');
        this.exportCanvas.style.display = 'none';
        document.body.appendChild(this.exportCanvas);
    }

    /**
     * Check if a design reference is an HTML template
     */
    isTemplate(designReference) {
        return (
            designReference &&
            (designReference.endsWith('.html') || designReference.startsWith('sign-templates/'))
        );
    }

    /**
     * Load and render a template with a message
     */
    async renderTemplate(templatePath, message) {
        // Ensure path is relative to mapping_slayer
        if (!templatePath.startsWith('http') && !templatePath.startsWith('/')) {
            templatePath = `/apps/mapping_slayer/${templatePath}`;
        }

        return new Promise((resolve, reject) => {
            this.templateFrame.onload = () => {
                try {
                    // Set the message in the template
                    const templateWindow = this.templateFrame.contentWindow;
                    if (templateWindow.signTemplate && templateWindow.signTemplate.setMessage) {
                        templateWindow.signTemplate.setMessage(message);
                    }

                    // Get the SVG content
                    const svg = templateWindow.document.querySelector('svg');
                    if (svg) {
                        resolve(svg.outerHTML);
                    } else {
                        reject(new Error('No SVG found in template'));
                    }
                } catch (error) {
                    reject(error);
                }
            };

            this.templateFrame.onerror = () => {
                reject(new Error('Failed to load template'));
            };

            // Load the template
            this.templateFrame.src = templatePath;
        });
    }

    /**
     * Create a preview element for a template
     */
    async createPreview(templatePath, message, width = 200) {
        try {
            const svgContent = await this.renderTemplate(templatePath, message);

            const previewDiv = document.createElement('div');
            previewDiv.className = 'sign-template-preview';
            previewDiv.style.width = width + 'px';
            previewDiv.innerHTML = svgContent;

            // Scale the SVG to fit
            const svg = previewDiv.querySelector('svg');
            if (svg) {
                svg.style.width = '100%';
                svg.style.height = 'auto';
            }

            return previewDiv;
        } catch (error) {
            console.error('Error creating preview:', error);
            return null;
        }
    }

    /**
     * Export template as SVG with text converted to paths
     */
    async exportAsSVG(templatePath, message) {
        try {
            const svgContent = await this.renderTemplate(templatePath, message);

            // For now, return the SVG as-is
            // TODO: Implement text-to-path conversion using opentype.js
            return svgContent;
        } catch (error) {
            console.error('Error exporting SVG:', error);
            return null;
        }
    }

    /**
     * Export template as PNG image
     */
    async exportAsPNG(templatePath, message, scale = 2) {
        try {
            const svgContent = await this.renderTemplate(templatePath, message);

            // Create a temporary container
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = svgContent;
            const svg = tempDiv.querySelector('svg');

            if (!svg) throw new Error('No SVG found');

            // Get SVG dimensions
            const viewBox = svg.getAttribute('viewBox').split(' ');
            const width = parseInt(viewBox[2]) * scale;
            const height = parseInt(viewBox[3]) * scale;

            // Set canvas size
            this.exportCanvas.width = width;
            this.exportCanvas.height = height;

            const ctx = this.exportCanvas.getContext('2d');

            // Convert SVG to data URL
            const svgData = new window.XMLSerializer().serializeToString(svg);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);

                    this.exportCanvas.toBlob(blob => {
                        resolve(blob);
                    }, 'image/png');
                };
                img.onerror = reject;
                img.src = url;
            });
        } catch (error) {
            console.error('Error exporting PNG:', error);
            return null;
        }
    }

    /**
     * Batch export multiple signs
     */
    async batchExport(dotsWithMessages, format = 'svg') {
        const results = [];

        for (const dot of dotsWithMessages) {
            if (!dot.templatePath || !dot.message) continue;

            try {
                let result;
                if (format === 'svg') {
                    result = await this.exportAsSVG(dot.templatePath, dot.message);
                } else if (format === 'png') {
                    result = await this.exportAsPNG(dot.templatePath, dot.message);
                }

                if (result) {
                    results.push({
                        id: dot.id,
                        message: dot.message,
                        data: result,
                        format: format
                    });
                }
            } catch (error) {
                console.error(`Error exporting dot ${dot.id}:`, error);
            }
        }

        return results;
    }

    /**
     * Get available templates
     */
    async getAvailableTemplates() {
        try {
            const response = await fetch('/apps/mapping_slayer/sign-templates/');
            if (!response.ok) throw new Error('Failed to fetch templates');

            // Parse directory listing or return hardcoded list for now
            return [
                { name: 'Parking Reserved', path: 'sign-templates/parking-reserved.html' },
                { name: 'ADA Accessible', path: 'sign-templates/ada-accessible.html' },
                { name: 'No Parking', path: 'sign-templates/no-parking.html' }
            ];
        } catch {
            // Return hardcoded list as fallback
            return [{ name: 'Parking Reserved', path: 'sign-templates/parking-reserved.html' }];
        }
    }
}

// Create global instance
window.signTemplateSystem = new SignTemplateSystem();
