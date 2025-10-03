// export.js
/* global pako */

import { appState, getDotsForPage } from './state.js';
import { getActiveFilters, showCSVStatus } from './ui.js';
import { getSymbolInfo, FLAG_POSITIONS, migrateDotToFlags } from './flag-config.js';
import { getFlagIconBase64, collectUniqueFlags, clearFlagIconCache } from './flag-icons-base64.js';

function getMapFileName() {
    // First try to get from saveManager (actual saved filename)
    if (window.saveManager?.projectName) {
        return window.saveManager.projectName
            .replace('.pdf', '')
            .replace('.mslay', '')
            .replace('.slayer', '');
    }

    // Try to get from the unified header project name
    const projectNameEl = document.getElementById('project-name');
    if (projectNameEl && projectNameEl.textContent !== 'No Project') {
        return projectNameEl.textContent.replace('.pdf', '').replace('.mslay', '');
    }

    // Fallback to a default name
    return 'MappingSlayerExport';
}

function getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

async function drawLegendWithJsPDF(pdf, dotsOnPage, flagImageMap) {
    if (dotsOnPage.length === 0) return;
    const usedMarkerTypeCodes = new Set(dotsOnPage.map(d => d.markerType));
    const sortedMarkerTypeCodes = Array.from(usedMarkerTypeCodes).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    // Calculate flag section height
    const flagConfig = appState.globalFlagConfiguration;
    const flagSectionHeight = flagConfig ? 100 : 0;

    const padding = 40,
        itemHeight = 32,
        dotRadius = 10,
        legendWidth = 440,
        headerHeight = 50;
    const legendHeight = headerHeight + sortedMarkerTypeCodes.length * itemHeight + padding + flagSectionHeight;
    const x = padding,
        y = padding;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(1);
    pdf.rect(x, y, legendWidth, legendHeight, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    pdf.setTextColor(0, 0, 0);
    pdf.text('PAGE LEGEND', x + legendWidth / 2, y + 34, { align: 'center' });
    let currentY = y + headerHeight + 20;
    pdf.setFont('helvetica', 'normal');
    sortedMarkerTypeCodes.forEach(code => {
        const typeData = appState.markerTypes[code];
        const count = dotsOnPage.filter(d => d.markerType === code).length;
        const displayText = `(${count}) ${typeData.code} - ${typeData.name}`;
        pdf.setFillColor(typeData.color);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(1);
        pdf.circle(x + padding, currentY, dotRadius, 'FD');
        pdf.setFontSize(24);
        pdf.setTextColor(0, 0, 0);
        pdf.text(displayText, x + padding + 30, currentY, { baseline: 'middle' });
        currentY += itemHeight;
    });

    // Add flag legend section
    if (flagConfig) {
        currentY += 20; // Add spacing
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.text('FLAGS:', x + padding, currentY);
        currentY += 25;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(18);

        const flagSize = 20; // Size of flag icon in legend
        const flagPositions = Object.keys(FLAG_POSITIONS);

        for (let index = 0; index < flagPositions.length; index++) {
            const key = flagPositions[index];
            const position = FLAG_POSITIONS[key];
            const config = flagConfig[position];

            if (config && config.name) {
                const xPos = x + padding + (index % 2) * 200;
                const yPos = currentY + Math.floor(index / 2) * 25;

                // Get the flag image from the map
                const cacheKey = `${config.symbol || 'custom'}_${config.customIcon || 'default'}_${position}`;
                const base64 = flagImageMap.get(cacheKey);

                if (base64) {
                    // Draw flag icon
                    pdf.addImage(base64, 'PNG', xPos, yPos - flagSize/2, flagSize, flagSize);
                    // Draw equal sign and name
                    pdf.text(` = ${config.name}`, xPos + flagSize + 5, yPos, { baseline: 'middle' });
                } else {
                    // Fallback to text only if no image
                    pdf.text(config.name, xPos, yPos, { baseline: 'middle' });
                }
            }
        }
    }
}

async function drawDotsWithJsPDF(pdf, dotsOnPage, messagesVisible, flagImageMap) {
    const effectiveMultiplier = appState.dotSize * 2;

    // Now draw all dots with cached flag images
    dotsOnPage.forEach(dot => {
        const markerTypeInfo = appState.markerTypes[dot.markerType] || {
            color: '#ff0000',
            textColor: '#FFFFFF'
        };
        const radius = (20 * effectiveMultiplier) / 2;
        const fontSize = 8 * effectiveMultiplier;
        const pdfX = dot.x;
        const pdfY = dot.y;

        // Migrate old properties to new flag system if needed
        migrateDotToFlags(dot);

        pdf.setFillColor(markerTypeInfo.color);
        pdf.setDrawColor(markerTypeInfo.color);
        pdf.circle(pdfX, pdfY, radius, 'F');

        // Draw flag indicators (matching canvas rendering)
        const flagSize = 10 * effectiveMultiplier; // Size of flag icons (matches canvas)
        const flagOffset = radius - 4 * effectiveMultiplier; // Offset from edge (matches canvas)
        const flagConfig = appState.globalFlagConfiguration;

        if (dot.flags && flagConfig) {

            // Top-left flag
            if (dot.flags[FLAG_POSITIONS.TOP_LEFT] && flagConfig[FLAG_POSITIONS.TOP_LEFT]) {
                const flag = flagConfig[FLAG_POSITIONS.TOP_LEFT];
                const key = `${flag.symbol || 'custom'}_${flag.customIcon || 'default'}_topLeft`;
                const base64 = flagImageMap.get(key);

                if (base64) {
                    pdf.addImage(
                        base64,
                        'PNG',
                        pdfX - flagOffset - flagSize / 2,
                        pdfY - flagOffset - flagSize / 2,
                        flagSize,
                        flagSize
                    );
                }
            }

            // Top-right flag
            if (dot.flags[FLAG_POSITIONS.TOP_RIGHT] && flagConfig[FLAG_POSITIONS.TOP_RIGHT]) {
                const flag = flagConfig[FLAG_POSITIONS.TOP_RIGHT];
                const key = `${flag.symbol || 'custom'}_${flag.customIcon || 'default'}_topRight`;
                const base64 = flagImageMap.get(key);

                if (base64) {
                    pdf.addImage(
                        base64,
                        'PNG',
                        pdfX + flagOffset - flagSize / 2,
                        pdfY - flagOffset - flagSize / 2,
                        flagSize,
                        flagSize
                    );
                }
            }

            // Bottom-left flag
            if (dot.flags[FLAG_POSITIONS.BOTTOM_LEFT] && flagConfig[FLAG_POSITIONS.BOTTOM_LEFT]) {
                const flag = flagConfig[FLAG_POSITIONS.BOTTOM_LEFT];
                const key = `${flag.symbol || 'custom'}_${flag.customIcon || 'default'}_bottomLeft`;
                const base64 = flagImageMap.get(key);

                if (base64) {
                    pdf.addImage(
                        base64,
                        'PNG',
                        pdfX - flagOffset - flagSize / 2,
                        pdfY + flagOffset - flagSize / 2,
                        flagSize,
                        flagSize
                    );
                }
            }

            // Bottom-right flag
            if (dot.flags[FLAG_POSITIONS.BOTTOM_RIGHT] && flagConfig[FLAG_POSITIONS.BOTTOM_RIGHT]) {
                const flag = flagConfig[FLAG_POSITIONS.BOTTOM_RIGHT];
                const key = `${flag.symbol || 'custom'}_${flag.customIcon || 'default'}_bottomRight`;
                const base64 = flagImageMap.get(key);

                if (base64) {
                    pdf.addImage(
                        base64,
                        'PNG',
                        pdfX + flagOffset - flagSize / 2,
                        pdfY + flagOffset - flagSize / 2,
                        flagSize,
                        flagSize
                    );
                }
            }
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(fontSize);
        pdf.setTextColor(markerTypeInfo.textColor);
        pdf.text(dot.locationNumber, pdfX, pdfY, { align: 'center', baseline: 'middle' });

        if (messagesVisible && dot.message) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(fontSize * 1.1);
            pdf.setTextColor(markerTypeInfo.color);
            pdf.text(dot.message, pdfX, pdfY + radius + fontSize * 0.5, {
                align: 'center',
                baseline: 'top'
            });
        }
    });
}

function createDetailPage(pdf, dot, sourcePageNum, originalToNewPageMap) {
    const markerTypeInfo = appState.markerTypes[dot.markerType] || {
        color: '#ff0000',
        textColor: '#FFFFFF',
        code: 'UNKNOWN',
        name: 'Unknown Type'
    };

    pdf.addPage([612, 792], 'portrait');
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 40;
    const contentWidth = pageWidth - 2 * margin;
    let currentY = margin;

    // Back to Map Button
    const buttonWidth = 150;
    const buttonHeight = 30;
    const buttonX = (pageWidth - buttonWidth) / 2;
    pdf.setFillColor(220, 220, 220);
    pdf.setDrawColor(153, 153, 153);
    pdf.setLineWidth(1);
    pdf.roundedRect(buttonX, currentY, buttonWidth, buttonHeight, 5, 5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text('BACK TO MAP', pageWidth / 2, currentY + 20, { align: 'center' });

    // Use the map to get the correct page number for the link
    const correctMapPage = originalToNewPageMap.get(sourcePageNum);
    if (correctMapPage) {
        pdf.link(buttonX, currentY, buttonWidth, buttonHeight, { pageNumber: correctMapPage });
    }

    currentY += 80;

    // Main Content Area (no border)
    const contentInnerMargin = 20;
    let contentY = currentY;
    const contentInnerWidth = contentWidth - 2 * contentInnerMargin;

    // Location ID
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(36);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`LOC# ${dot.locationNumber}`, margin + contentInnerMargin, contentY);
    contentY += 20;

    // Marker Type - Draw as circle to match dots
    pdf.setFillColor(markerTypeInfo.color);
    pdf.circle(margin + contentInnerMargin + 10, contentY + 10, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(
        `Marker Type: ${markerTypeInfo.code} - ${markerTypeInfo.name}`,
        margin + contentInnerMargin + 30,
        contentY + 14
    );
    contentY += 40;

    // Message 1
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Message 1:', margin + contentInnerMargin, contentY);
    contentY += 20;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    const messageLines = pdf.splitTextToSize(dot.message, contentInnerWidth);
    pdf.text(messageLines, margin + contentInnerMargin, contentY);
    contentY += messageLines.length * 15 + 20;

    // Notes Section
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('NOTES:', margin + contentInnerMargin, contentY);
    contentY += 10;
    pdf.setDrawColor(220);
    pdf.roundedRect(margin + contentInnerMargin, contentY, contentInnerWidth, 100, 3, 3, 'S');
    if (dot.notes) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        const notesLines = pdf.splitTextToSize(dot.notes, contentInnerWidth - 10);
        pdf.text(notesLines, margin + contentInnerMargin + 5, contentY + 12);
    }
    contentY += 140;

    // Status Section
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Status:', margin + contentInnerMargin, contentY);
    contentY += 20;

    // Installed Status
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Installed?', margin + contentInnerMargin, contentY);
    pdf.setFont('helvetica', 'bold');
    pdf.text(dot.installed ? 'YES' : 'NO', margin + contentInnerMargin + 60, contentY);

    contentY += 40;

    // Reference Image Section
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('REFERENCE IMAGE', margin + contentInnerMargin, contentY);
    contentY += 10;

    const placeholderWidth = 240;
    const placeholderHeight = 240;

    if (markerTypeInfo.designReference) {
        // Draw placeholder border first
        pdf.setDrawColor(200);
        pdf.rect(margin + contentInnerMargin, contentY, placeholderWidth, placeholderHeight, 'S');

        // Show the actual reference image, maintaining aspect ratio
        try {
            // Get image properties to calculate aspect ratio
            const imgProps = pdf.getImageProperties(markerTypeInfo.designReference);
            const imgRatio = imgProps.width / imgProps.height;
            const placeholderRatio = placeholderWidth / placeholderHeight;

            let scaledWidth, scaledHeight, offsetX, offsetY;

            if (imgRatio > placeholderRatio) {
                // Image is wider - scale to fit width
                scaledWidth = placeholderWidth;
                scaledHeight = placeholderWidth / imgRatio;
                offsetX = 0;
                offsetY = (placeholderHeight - scaledHeight) / 2;
            } else {
                // Image is taller - scale to fit height
                scaledHeight = placeholderHeight;
                scaledWidth = placeholderHeight * imgRatio;
                offsetX = (placeholderWidth - scaledWidth) / 2;
                offsetY = 0;
            }

            pdf.addImage(
                markerTypeInfo.designReference,
                'JPEG',
                margin + contentInnerMargin + offsetX,
                contentY + offsetY,
                scaledWidth,
                scaledHeight
            );
        } catch (error) {
            // If image fails to load, show placeholder text
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(150);
            pdf.text(
                '[Reference image placeholder]',
                margin + contentInnerMargin + placeholderWidth / 2,
                contentY + placeholderHeight / 2,
                { align: 'center' }
            );
            pdf.setTextColor(0);
        }
    } else {
        // Show placeholder when no image is uploaded
        pdf.setDrawColor(200);
        pdf.setFillColor(224, 224, 224);
        pdf.rect(margin + contentInnerMargin, contentY, placeholderWidth, placeholderHeight, 'FD');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text(
            '[Reference image placeholder]',
            margin + contentInnerMargin + placeholderWidth / 2,
            contentY + placeholderHeight / 2,
            { align: 'center' }
        );
        pdf.setTextColor(0);
    }
    contentY += placeholderHeight + 20;

    // Footer
    currentY = pageHeight - margin;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(150);
    pdf.text(
        `Created with Mapping Slayer on ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        currentY,
        { align: 'center' }
    );
    // Use the saved filename if available, otherwise fall back to default
    const projectName =
        window.saveManager?.projectName ||
        document.getElementById('project-name')?.textContent ||
        'Mapping Slayer Project';
    pdf.text(`Project: ${projectName}`, pageWidth / 2, currentY + 12, { align: 'center' });
    const pageLabel = appState.pageLabels.get(sourcePageNum) || '';
    if (pageLabel) {
        pdf.text(`Page: ${pageLabel}`, pageWidth / 2, currentY + 24, { align: 'center' });
    }
}

function createMessageSchedule() {
    if (!appState.pdfDoc) {
        alert('Please load a PDF first.');
        return;
    }
    const activeFilters = getActiveFilters();
    const allVisibleDots = [];
    for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
        const dotsOnPage = Array.from(getDotsForPage(pageNum).values());
        const visibleDots = dotsOnPage
            .filter(dot => activeFilters.includes(dot.markerType))
            .map(dot => ({ ...dot, page: pageNum }));
        allVisibleDots.push(...visibleDots);
    }
    if (allVisibleDots.length === 0) {
        alert('No annotations match the current filters. CSV not created.');
        return;
    }
    allVisibleDots.sort((a, b) => {
        const markerTypeComparison = a.markerType.localeCompare(b.markerType, undefined, {
            numeric: true
        });
        if (markerTypeComparison !== 0) return markerTypeComparison;
        return a.locationNumber.localeCompare(b.locationNumber);
    });
    // Get flag names for headers
    const flagHeaders = [];
    if (allVisibleDots.length > 0) {
        const firstDot = allVisibleDots[0];
        const flagConfig = appState.globalFlagConfiguration || {}; // Now using global flags
        Object.keys(FLAG_POSITIONS).forEach(key => {
            const position = FLAG_POSITIONS[key];
            const config = flagConfig[position] || { name: `Flag ${key + 1}` };
            flagHeaders.push(config.name.toUpperCase());
        });
    } else {
        // Default headers if no dots
        flagHeaders.push('FLAG 1', 'FLAG 2', 'FLAG 3', 'FLAG 4');
    }

    let csvContent = `MARKER TYPE CODE,MARKER TYPE NAME,MESSAGE 1,MESSAGE 2,LOCATION NUMBER,MAP PAGE,PAGE LABEL,${flagHeaders.join(',')},INSTALLED,NOTES\n`;
    allVisibleDots.forEach(dot => {
        // Migrate old properties to new flag system if needed
        migrateDotToFlags(dot);

        const typeData = appState.markerTypes[dot.markerType];
        const pageLabel = appState.pageLabels.get(dot.page) || '';

        // Get flag values (now boolean)
        const flagValues = [];
        Object.keys(FLAG_POSITIONS).forEach(key => {
            const position = FLAG_POSITIONS[key];
            const isChecked = dot.flags ? dot.flags[position] : false;
            flagValues.push(isChecked ? 'YES' : 'NO');
        });

        const row = [
            `"${dot.markerType.replace(/"/g, '""')}"`,
            `"${typeData.name.replace(/"/g, '""')}"`,
            `"${dot.message.replace(/"/g, '""')}"`,
            `"${(dot.message2 || '').replace(/"/g, '""')}"`,
            `'${dot.locationNumber}'`,
            dot.page,
            `"${pageLabel.replace(/"/g, '""')}"`,
            ...flagValues,
            dot.installed ? 'YES' : 'NO',
            `"${(dot.notes || '').replace(/"/g, '""')}"`
        ].join(',');
        csvContent += row + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const mapFileName = getMapFileName();
    link.setAttribute('download', `${mapFileName}_report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function createAnnotatedPDF() {
    if (!appState.pdfDoc) {
        alert('Please load a PDF first.');
        return;
    }
    document.getElementById('mapping-slayer-pdf-export-modal').style.display = 'block';
}

async function performPDFExport(exportType) {
    document.getElementById('mapping-slayer-pdf-export-modal').style.display = 'none';

    const createPdfBtn = document.getElementById('create-pdf-btn');
    const originalBtnText = createPdfBtn.textContent;
    createPdfBtn.disabled = true;
    createPdfBtn.textContent = 'Generating...';
    createPdfBtn.classList.add('ms-btn-processing');

    const activeFilters = getActiveFilters();
    const messagesVisible = appState.messagesVisible;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    try {
        const { jsPDF } = window.jspdf;

        // Determine which pages to process based on export type
        let pagesToProcess = [];
        if (exportType === 'current-with-details' || exportType === 'current-only') {
            pagesToProcess = [appState.currentPdfPage];
        } else {
            pagesToProcess = Array.from({ length: appState.totalPages }, (_, i) => i + 1);
        }

        // Filter pages that have dots
        const pagesWithDots = pagesToProcess.filter(pageNum => {
            const dots = Array.from(getDotsForPage(pageNum).values()).filter(dot =>
                activeFilters.includes(dot.markerType)
            );
            return dots.length > 0;
        });

        if (pagesWithDots.length === 0) {
            alert('No annotations match the current filters. PDF not created.');
            return;
        }

        // Split into chunks of 10 maps
        const CHUNK_SIZE = 10;
        const chunks = [];
        for (let i = 0; i < pagesWithDots.length; i += CHUNK_SIZE) {
            chunks.push(pagesWithDots.slice(i, i + CHUNK_SIZE));
        }

        const pdfChunks = [];
        const globalDetailPageNumbers = new Map();
        const globalOriginalToNewPageMap = new Map();
        let totalPagesProcessed = 0;

        // Process each chunk
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            createPdfBtn.textContent = `Processing chunk ${chunkIndex + 1} of ${chunks.length}...`;

            let chunkPdf = null;
            const chunkDetailPageNumbers = new Map();
            const chunkOriginalToNewPageMap = new Map();

            // Pre-generate flag images for this chunk (only once)
            const allChunkDots = [];
            for (const pageNum of chunk) {
                const dots = Array.from(getDotsForPage(pageNum).values()).filter(dot =>
                    activeFilters.includes(dot.markerType)
                );
                allChunkDots.push(...dots);
            }

            const uniqueFlags = collectUniqueFlags(allChunkDots, appState.globalFlagConfiguration);
            const flagImageMap = new Map();

            for (const [key, flagData] of uniqueFlags) {
                const base64 = await getFlagIconBase64(flagData.flag, flagData.position);
                if (base64) {
                    flagImageMap.set(key, base64);
                }
            }

            // Create map pages for this chunk
            for (const pageNum of chunk) {
                const dotsToDraw = Array.from(getDotsForPage(pageNum).values()).filter(dot =>
                    activeFilters.includes(dot.markerType)
                );

                const page = await appState.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: appState.pdfScale });
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                await page.render({ canvasContext: tempCtx, viewport: viewport }).promise;
                const imgData = tempCanvas.toDataURL('image/jpeg', 0.9);

                if (!chunkPdf) {
                    chunkPdf = new jsPDF({
                        orientation: viewport.width > viewport.height ? 'landscape' : 'portrait',
                        unit: 'pt',
                        format: [viewport.width, viewport.height]
                    });
                } else {
                    chunkPdf.addPage(
                        [viewport.width, viewport.height],
                        viewport.width > viewport.height ? 'landscape' : 'portrait'
                    );
                }

                const newPageNumForMap = chunkPdf.internal.getNumberOfPages();
                chunkOriginalToNewPageMap.set(pageNum, newPageNumForMap);
                globalOriginalToNewPageMap.set(pageNum, totalPagesProcessed + newPageNumForMap);

                chunkPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
                await drawLegendWithJsPDF(chunkPdf, dotsToDraw, flagImageMap);
                drawAnnotationLinesWithJsPDF(chunkPdf, pageNum);
                await drawDotsWithJsPDF(chunkPdf, dotsToDraw, messagesVisible, flagImageMap);
            }

            // Create detail pages for this chunk only if requested
            if (exportType === 'current-with-details') {
                for (const pageNum of chunk) {
                    const dotsToDraw = Array.from(getDotsForPage(pageNum).values()).filter(dot =>
                        activeFilters.includes(dot.markerType)
                    );
                    for (const dot of dotsToDraw) {
                        const detailPageNum = chunkPdf.internal.getNumberOfPages() + 1;
                        chunkDetailPageNumbers.set(dot.internalId, detailPageNum);
                        globalDetailPageNumbers.set(
                            dot.internalId,
                            totalPagesProcessed + detailPageNum
                        );
                        createDetailPage(chunkPdf, dot, pageNum, chunkOriginalToNewPageMap);
                    }
                }

                // Add hyperlinks for this chunk
                for (const pageNum of chunk) {
                    const dotsToDraw = Array.from(getDotsForPage(pageNum).values()).filter(dot =>
                        activeFilters.includes(dot.markerType)
                    );
                    if (dotsToDraw.length === 0) continue;

                    const mapPageNum = chunkOriginalToNewPageMap.get(pageNum);
                    if (mapPageNum) {
                        chunkPdf.setPage(mapPageNum);

                        dotsToDraw.forEach(dot => {
                            const effectiveMultiplier = appState.dotSize * 2;
                            const radius = (20 * effectiveMultiplier) / 2;
                            const detailPageNum = chunkDetailPageNumbers.get(dot.internalId);

                            if (detailPageNum) {
                                chunkPdf.link(
                                    dot.x - radius,
                                    dot.y - radius,
                                    radius * 2,
                                    radius * 2,
                                    { pageNumber: detailPageNum }
                                );
                            }
                        });
                    }
                }
            }

            totalPagesProcessed += chunkPdf.internal.getNumberOfPages();
            pdfChunks.push(chunkPdf);
        }

        // Combine all chunks into final PDF
        createPdfBtn.textContent = 'Combining chunks...';
        let finalPdf = null;

        for (let i = 0; i < pdfChunks.length; i++) {
            const chunk = pdfChunks[i];

            if (i === 0) {
                finalPdf = chunk;
            } else {
                // Add all pages from this chunk to the final PDF
                const pageCount = chunk.internal.getNumberOfPages();
                for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
                    chunk.setPage(pageNum);
                    const pageData = chunk.internal.pages[pageNum];
                    finalPdf.addPage();
                    finalPdf.internal.pages[finalPdf.internal.getNumberOfPages()] = pageData;
                }
            }
        }

        if (finalPdf) {
            const mapFileName = getMapFileName();
            let suffix = '';
            switch (exportType) {
                case 'current-with-details':
                    suffix = '_report';
                    break;
                case 'current-only':
                    const currentLabel =
                        appState.pageLabels.get(appState.currentPdfPage) ||
                        `Page${appState.currentPdfPage}`;
                    suffix = `_${currentLabel}_MapOnly`;
                    break;
                case 'all-maps-only':
                    suffix = '_AllMaps_MapOnly';
                    break;
            }
            finalPdf.save(`${mapFileName}${suffix}.pdf`);
        }
    } catch (error) {
        console.error('Failed to create PDF:', error);
        alert('An error occurred while creating the PDF. Check the console for details.');
    } finally {
        createPdfBtn.disabled = false;
        createPdfBtn.textContent = originalBtnText;
        createPdfBtn.classList.remove('ms-btn-processing');
        tempCanvas.remove();
        // Clear flag icon cache to free memory
        clearFlagIconCache();
    }
}

function drawAnnotationLinesWithJsPDF(pdf, pageNum) {
    const linesMap = appState.annotationLines.get(pageNum);
    if (!linesMap || linesMap.size === 0) return;

    const effectiveMultiplier = appState.dotSize * 2;
    const endpointRadius = 3 * effectiveMultiplier;

    linesMap.forEach(line => {
        // Get the line color (default to red if not set)
        const lineColor = line.color || '#FF0000';

        // Convert hex color to RGB values for jsPDF
        const r = parseInt(lineColor.substr(1, 2), 16);
        const g = parseInt(lineColor.substr(3, 2), 16);
        const b = parseInt(lineColor.substr(5, 2), 16);

        // Draw the line
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(2 * effectiveMultiplier);
        pdf.line(line.startX, line.startY, line.endX, line.endY);

        // Draw endpoints if enabled
        if (appState.showAnnotationEndpoints) {
            pdf.setFillColor(r, g, b);
            pdf.circle(line.startX, line.startY, endpointRadius, 'F');
            pdf.circle(line.endX, line.endY, endpointRadius, 'F');
        }
    });
}

async function exportToHTML() {
    const activeFilters = getActiveFilters();
    if (activeFilters.length === 0) {
        alert('Please select at least one marker type to export');
        return;
    }

    if (!appState.pdfDoc) {
        alert('No PDF loaded');
        return;
    }

    showCSVStatus('Generating HTML export...', true);

    // Group dots by page
    const dotsByPage = new Map();
    for (let pageNum = 1; pageNum <= appState.totalPages; pageNum++) {
        const pageDots = Array.from(getDotsForPage(pageNum).values()).filter(dot =>
            activeFilters.includes(dot.markerType)
        );

        if (pageDots.length > 0) {
            dotsByPage.set(pageNum, pageDots);
        }
    }

    if (dotsByPage.size === 0) {
        alert('No locations found matching the current filters');
        return;
    }

    // Convert PDF pages to images and create HTML
    const pageImages = [];
    const pageThumbnails = new Map(); // Store thumbnails for detail view

    // Option to disable thumbnails for smaller file size
    const includeThumbnails = false; // Set to true if you want thumbnails (increases file size)

    for (const [pageNum, dots] of dotsByPage) {
        try {
            const page = await appState.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 4.0 }); // Match Mapping Slayer's 4x scale

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const imageData = canvas.toDataURL('image/png', 0.8); // Use 80% quality for smaller size

            // Only create thumbnails if enabled
            if (includeThumbnails) {
                const thumbViewport = page.getViewport({ scale: 0.3 }); // Smaller thumbnails
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = thumbViewport.width;
                thumbCanvas.height = thumbViewport.height;
                const thumbContext = thumbCanvas.getContext('2d');

                await page.render({
                    canvasContext: thumbContext,
                    viewport: thumbViewport
                }).promise;

                const thumbnailData = thumbCanvas.toDataURL('image/jpeg', 0.6); // JPEG with 60% quality
                pageThumbnails.set(pageNum, {
                    data: thumbnailData,
                    width: thumbViewport.width,
                    height: thumbViewport.height
                });
            }

            pageImages.push({
                pageNum,
                width: viewport.width,
                height: viewport.height,
                imageData,
                dots
            });
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
    }

    // Generate HTML content
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mapping Slayer Export - ${appState.sourcePdfName || 'Project'}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html {
            scroll-behavior: smooth;
        }
        body {
            font-family: Arial, sans-serif;
            background: #2a2a2a;
            padding: 20px;
        }
        tr:target {
            background-color: #fffacd !important;
            animation: highlight 2s ease-in-out;
        }
        @keyframes highlight {
            0% { background-color: #ffff99; }
            100% { background-color: #fffacd; }
        }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 20px;
        }
        .page-container {
            background: white;
            margin: 20px auto;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #ddd;
            max-width: 90%;
            overflow-x: auto;
        }
        .page-header {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 15px;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 4px;
        }
        .map-container {
            position: relative;
            display: inline-block;
            border: 2px solid #ccc;
        }
        .map-image {
            display: block;
            max-width: 100%;
            height: auto;
        }
        .dot {
            position: absolute;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            z-index: 10;
        }
        .dot:hover {
            transform: translate(-50%, -50%) scale(1.2);
            z-index: 100;
        }
        .dot-number {
            font-size: 10px;
            font-weight: bold;
            line-height: 20px;
        }
        .dot-installed {
            position: absolute;
            width: 141%;
            height: 3px;
            background: #00ff00;
            transform: rotate(-45deg);
            top: 50%;
            left: 50%;
            margin-left: -70.5%;
            margin-top: -1.5px;
            z-index: 5;
            pointer-events: none;
        }
        .dot-flag {
            position: absolute;
            font-size: 14px;
            z-index: 15;
        }
        .dot-flag-top-left {
            top: -8px;
            left: -8px;
        }
        .dot-flag-top-right {
            top: -8px;
            right: -8px;
        }
        .dot-flag-bottom-left {
            bottom: -8px;
            left: -8px;
        }
        .dot-flag-bottom-right {
            bottom: -8px;
            right: -8px;
        }
        .dot-tooltip {
            display: none;
            position: absolute;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 1000;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-bottom: 5px;
        }
        .dot:hover .dot-tooltip {
            display: block;
        }
        .legend {
            margin-top: 20px;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 4px;
        }
        .legend-title {
            font-weight: bold;
            margin-bottom: 10px;
        }
        .legend-item {
            display: inline-flex;
            align-items: center;
            margin-right: 20px;
            margin-bottom: 5px;
        }
        .legend-dot {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 8px;
        }
        @media print {
            body {
                background: white;
            }
            .page-container {
                page-break-inside: avoid;
                box-shadow: none;
                border: 1px solid #ccc;
            }
        }
    </style>
</head>
<body>
    <h1>${appState.sourcePdfName || 'Mapping Slayer Export'}</h1>
`;

    // Generate visual maps for each page
    for (const pageData of pageImages) {
        const { pageNum, width, height, imageData, dots } = pageData;
        const pageLabel = appState.pageLabels?.get(pageNum) || `Page ${pageNum}`;

        html += `
    <div class="page-container" id="page-${pageNum}">
        <div class="page-header">${pageLabel} - ${dots.length} Location${dots.length !== 1 ? 's' : ''}</div>
        <div class="map-container">
            <img class="map-image" src="${imageData}" width="${width}" height="${height}" alt="${pageLabel}">`;

        // Add dots to the map
        for (const dot of dots) {
            const markerType = appState.markerTypes[dot.markerType] || {};
            const color = markerType.color || '#ff0000';
            const textColor = markerType.textColor || '#FFFFFF';
            const flagConfig = appState.globalFlagConfiguration; // Now using global flags

            // Calculate position - dots are stored at 4x scale, now rendering at 4x too
            const dotX = (dot.x / width) * 100;
            const dotY = (dot.y / height) * 100;

            // Migrate if needed
            migrateDotToFlags(dot);

            html += `
            <div class="dot" style="left: ${dotX}%; top: ${dotY}%; background: ${color}; width: 20px; height: 20px; color: ${textColor};">`;

            // Add installed indicator
            if (dot.installed) {
                html += '<div class="dot-installed"></div>';
            }

            // Add flags
            if (dot.flags && flagConfig) {
                Object.keys(FLAG_POSITIONS).forEach(key => {
                    const position = FLAG_POSITIONS[key];
                    if (dot.flags[position] && flagConfig[position]) {
                        const config = flagConfig[position];
                        if (config.symbol) {
                            const symbolInfo = getSymbolInfo(config.symbol);
                            const posClass = position.replace(/([A-Z])/g, '-$1').toLowerCase();
                            html += `<div class="dot-flag dot-flag-${posClass}">${symbolInfo.symbol}</div>`;
                        }
                    }
                });
            }

            // Add location number with link to detail row and id for back-linking
            html += `<a id="dot-${dot.locationNumber}" href="#detail-${dot.locationNumber}" class="dot-number" style="text-decoration: none; color: ${textColor};">${dot.locationNumber}</a>`;

            // Add tooltip with details
            html += '<div class="dot-tooltip">';
            html += `<strong>Location ${dot.locationNumber}</strong><br>`;
            html += `${markerType.code || dot.markerType} - ${markerType.name || 'Unknown'}`;
            if (dot.message) html += `<br>Message: ${dot.message}`;
            if (dot.message2) html += `<br>Message 2: ${dot.message2}`;
            if (dot.notes) html += `<br>Notes: ${dot.notes}`;
            html += '</div>';

            html += '</div>';
        }

        // Add annotation lines for this page using SVG
        const linesMap = appState.annotationLines.get(pageNum);
        if (linesMap && linesMap.size > 0) {
            // Create an SVG overlay for lines
            html += `
            <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">`;

            linesMap.forEach(line => {
                const lineColor = line.color || '#FF0000';
                const lineWidth = 2;

                // Calculate line positions as percentages
                const startX = (line.startX / width) * 100;
                const startY = (line.startY / height) * 100;
                const endX = (line.endX / width) * 100;
                const endY = (line.endY / height) * 100;

                // Draw the line
                html += `
                <line x1="${startX}%" y1="${startY}%" x2="${endX}%" y2="${endY}%" 
                      stroke="${lineColor}" stroke-width="${lineWidth}" />`;

                // Add endpoints if enabled
                if (appState.showAnnotationEndpoints) {
                    const endpointRadius = 3;
                    html += `
                <circle cx="${startX}%" cy="${startY}%" r="${endpointRadius}" fill="${lineColor}" />
                <circle cx="${endX}%" cy="${endY}%" r="${endpointRadius}" fill="${lineColor}" />`;
                }
            });

            html += `
            </svg>`;
        }

        html += `
        </div>`;

        // Add legend for this page with counts
        const usedMarkerTypes = new Set(dots.map(d => d.markerType));
        if (usedMarkerTypes.size > 0) {
            html += `
        <div class="legend">
            <div class="legend-title">Legend:</div>`;

            for (const markerTypeCode of usedMarkerTypes) {
                const markerType = appState.markerTypes[markerTypeCode] || {};
                const count = dots.filter(d => d.markerType === markerTypeCode).length;
                html += `
            <div class="legend-item">
                <div class="legend-dot" style="background: ${markerType.color || '#ff0000'};"></div>
                <span>(${count}) ${markerType.code || markerTypeCode} - ${markerType.name || 'Unknown'}</span>
            </div>`;
            }

            html += `
        </div>`;
        }

        html += `
    </div>`;
    }

    // Add detail pages section
    html += `
    <div class="page-container">
        <h2 style="text-align: center; margin: 20px 0;">Location Details</h2>`;

    // Create a sorted list of all dots across all pages
    const allDots = [];
    for (const pageData of pageImages) {
        const { pageNum, dots } = pageData;
        const pageLabel = appState.pageLabels?.get(pageNum) || `Page ${pageNum}`;
        dots.forEach(dot => {
            allDots.push({ ...dot, pageNum, pageLabel });
        });
    }

    // Sort by location number
    allDots.sort((a, b) => {
        const numA = parseInt(a.locationNumber) || 0;
        const numB = parseInt(b.locationNumber) || 0;
        return numA - numB;
    });

    // Get all flag names used across all marker types
    const allFlagNames = new Map();
    // DEPRECATED - now using global flag configuration
    // Object.entries(appState.flagConfigurations || {}).forEach(([markerType, config]) => {
    if (appState.globalFlagConfiguration) {
        const config = appState.globalFlagConfiguration;
        Object.keys(FLAG_POSITIONS).forEach(key => {
            const position = FLAG_POSITIONS[key];
            if (config[position] && config[position].name) {
                allFlagNames.set(position, config[position].name);
            }
        });
    }

    // Collect unique design reference images
    const designRefImages = new Map();
    let designRefIndex = 0;
    Object.entries(appState.markerTypes).forEach(([code, markerType]) => {
        if (markerType.designReference) {
            designRefImages.set(code, {
                id: `design-ref-${designRefIndex++}`,
                data: markerType.designReference
            });
        }
    });

    // Add style for design reference images
    if (designRefImages.size > 0) {
        html += `
        <style>`;
        designRefImages.forEach((ref, code) => {
            html += `
            .${ref.id} {
                background-image: url('${ref.data}');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                width: 100px;
                height: 100px;
                display: inline-block;
            }`;
        });
        html += `
        </style>`;
    }

    // Create detail table
    html += `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12pt;">
            <thead>
                <tr style="background: #f0f0f0;">
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Location ID</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Design Reference</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Page</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Type</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Message</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Message 2</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12pt;">Notes</th>`;

    // Add flag columns
    ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].forEach(position => {
        const flagName = allFlagNames.get(position) || `Flag ${position}`;
        html += `
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 12pt;">${flagName}</th>`;
    });

    html += `
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 12pt;">Installed</th>
                </tr>
            </thead>
            <tbody>`;

    for (const dot of allDots) {
        const markerType = appState.markerTypes[dot.markerType] || {};
        const flagConfig = appState.flagConfigurations?.[dot.markerType];

        // Migrate if needed
        migrateDotToFlags(dot);

        // Get design reference image using CSS class
        let designRefHTML = '';
        const designRef = designRefImages.get(dot.markerType);
        if (designRef) {
            designRefHTML = `<div class="${designRef.id}"></div>`;
        }

        // Build flag cells
        let flagCells = '';
        ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].forEach(position => {
            let flagContent = '';
            if (dot.flags && dot.flags[position] && flagConfig && flagConfig[position]) {
                const config = flagConfig[position];
                if (config.symbol) {
                    const symbolInfo = getSymbolInfo(config.symbol);
                    flagContent = symbolInfo.symbol;
                } else {
                    flagContent = '✓';
                }
            }
            flagCells += `
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 14pt;">${flagContent}</td>`;
        });

        html += `
                <tr id="detail-${dot.locationNumber}">
                    <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold; font-size: 12pt;">
                        <a href="#dot-${dot.locationNumber}" style="text-decoration: none; color: inherit;">${dot.locationNumber}</a>
                    </td>
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${designRefHTML}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; font-size: 12pt;">${dot.pageLabel}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; font-size: 12pt;">
                        <span style="display: inline-block; width: 10px; height: 10px; background: ${markerType.color || '#ff0000'}; border-radius: 50%; margin-right: 5px;"></span>
                        ${markerType.code || dot.markerType} - ${markerType.name || 'Unknown'}
                    </td>
                    <td style="border: 1px solid #ddd; padding: 6px; font-size: 12pt;">${dot.message || ''}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; font-size: 12pt;">${dot.message2 || ''}</td>
                    <td style="border: 1px solid #ddd; padding: 6px; font-size: 12pt;">${dot.notes || ''}</td>${flagCells}
                    <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 12pt;">${dot.installed ? '✓' : ''}</td>
                </tr>`;
    }

    html += `
            </tbody>
        </table>`;

    // Add summary statistics
    const markerTypeCounts = {};
    allDots.forEach(dot => {
        markerTypeCounts[dot.markerType] = (markerTypeCounts[dot.markerType] || 0) + 1;
    });

    html += `
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <h3>Summary</h3>
            <p><strong>Total Locations:</strong> ${allDots.length}</p>
            <p><strong>Marker Types:</strong></p>
            <ul style="margin-left: 20px;">`;

    Object.entries(markerTypeCounts).forEach(([code, count]) => {
        const markerType = appState.markerTypes[code] || {};
        html += `
                <li>${markerType.code || code} - ${markerType.name || 'Unknown'}: ${count} location${count !== 1 ? 's' : ''}</li>`;
    });

    html += `
            </ul>
        </div>
    </div>`;

    html += `
</body>
</html>`;

    // Create blob and download
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const mapFileName = getMapFileName();
    const fileName = `${mapFileName}_report.html`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showCSVStatus(`HTML exported: ${fileName}`, true);
}

export { createMessageSchedule, createAnnotatedPDF, performPDFExport, exportToHTML };
