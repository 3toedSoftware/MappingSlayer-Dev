import { chromium } from 'playwright';

async function selectMarkerType(markerTypeToSelect = null) {
    try {
        console.log('🔌 Connecting to Chrome on port 9222...');
        const browser = await chromium.connectOverCDP('http://localhost:9222');

        const contexts = browser.contexts();
        if (contexts.length === 0) {
            console.error('❌ No browser contexts found');
            return;
        }

        const pages = contexts[0].pages();
        let page = pages.find(p => p.url().includes('mapping_slayer.html')) || pages[0];

        console.log('📋 Connected to:', await page.title());

        // First, discover what marker types are available
        console.log('\n📊 Discovering available marker types...');

        const markerTypes = await page.evaluate(() => {
            const items = document.querySelectorAll('.ms-marker-type-item');
            const types = [];

            items.forEach((item, index) => {
                // Get all possible identifiers for this marker type
                const dataMarkerType = item.getAttribute('data-marker-type');
                const dataType = item.getAttribute('data-type');
                const labelElement = item.querySelector('.ms-legend-label');
                const labelText = labelElement?.textContent?.trim();
                const fullText = item.textContent?.trim();
                const isActive = item.classList.contains('ms-legend-item-active');

                // Also check from app state
                let markerTypeCode = null;
                if (window.appState?.markerTypes) {
                    // Try to match based on position or other attributes
                    const markerTypesArray = Object.keys(window.appState.markerTypes);
                    if (index < markerTypesArray.length) {
                        markerTypeCode = markerTypesArray[index];
                    }
                }

                types.push({
                    index: index,
                    dataMarkerType: dataMarkerType,
                    dataType: dataType,
                    labelText: labelText,
                    fullText: fullText,
                    isActive: isActive,
                    markerTypeCode: markerTypeCode,
                    elementClasses: item.className
                });
            });

            // Also get the marker types from app state
            const appStateTypes = window.appState?.markerTypes ?
                Object.entries(window.appState.markerTypes).map(([code, data]) => ({
                    code: code,
                    name: data.name || code,
                    color: data.color
                })) : [];

            return {
                domElements: types,
                appStateTypes: appStateTypes,
                currentMarkerType: window.appState?.currentMarkerType
            };
        });

        console.log('Found marker types:');
        console.log('DOM Elements:', JSON.stringify(markerTypes.domElements, null, 2));
        console.log('App State Types:', JSON.stringify(markerTypes.appStateTypes, null, 2));
        console.log('Currently Selected:', markerTypes.currentMarkerType);

        // If no specific marker type requested, show menu
        if (!markerTypeToSelect && markerTypes.domElements.length > 0) {
            console.log('\n📝 Available marker types to select:');
            markerTypes.domElements.forEach((type, idx) => {
                const label = type.labelText || type.fullText || type.markerTypeCode || `Item ${idx}`;
                const active = type.isActive ? ' (ACTIVE)' : '';
                console.log(`  ${idx}: ${label}${active}`);
            });
            console.log('\nTo select a marker type, pass its index or identifier as an argument');
            await browser.close();
            return;
        }

        // Select the requested marker type
        if (markerTypeToSelect !== null) {
            console.log(`\n🎯 Selecting marker type: ${markerTypeToSelect}`);

            const selectResult = await page.evaluate((selector) => {
                const items = document.querySelectorAll('.ms-marker-type-item');
                let targetItem = null;

                // If selector is a number, use as index
                if (typeof selector === 'number' || !isNaN(selector)) {
                    const index = parseInt(selector);
                    if (index >= 0 && index < items.length) {
                        targetItem = items[index];
                    }
                } else {
                    // Try to find by text content or data attribute
                    for (const item of items) {
                        const text = item.textContent?.trim();
                        const dataType = item.getAttribute('data-marker-type') || item.getAttribute('data-type');

                        if ((text && text.includes(selector)) ||
                            (dataType && dataType === selector)) {
                            targetItem = item;
                            break;
                        }
                    }
                }

                if (targetItem) {
                    // Click the item
                    targetItem.click();

                    // Get info about what was selected
                    const isActive = targetItem.classList.contains('ms-legend-item-active');
                    const text = targetItem.textContent?.trim();

                    return {
                        success: true,
                        message: `Marker type selected`,
                        selectedText: text,
                        isActive: isActive,
                        currentMarkerType: window.appState?.currentMarkerType
                    };
                }

                return {
                    success: false,
                    error: `Marker type "${selector}" not found`,
                    availableCount: items.length
                };
            }, markerTypeToSelect);

            console.log('Selection result:', JSON.stringify(selectResult, null, 2));
        }

        await browser.close();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Get the argument from command line
const args = process.argv.slice(2);
const markerTypeToSelect = args[0] || null;

// Run the command
selectMarkerType(markerTypeToSelect);