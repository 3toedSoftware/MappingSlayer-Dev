import { chromium } from 'playwright';

async function executeSidekickCommands() {
    try {
        // Connect to existing browser
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

        // Select sign type ID.1
        console.log('\n1️⃣ Selecting sign type ID.1...');
        const selectResult = await page.evaluate(() => {
            // First, let's find what sign type controls exist
            const possibleSelectors = [
                'sign-type',           // ID
                'signType',           // ID variant
                'marker-type',        // ID
                'markerType',        // ID variant
                '[name="signType"]', // Name attribute
                '[name="markerType"]', // Name attribute
                '.marker-type-select', // Class
                '.sign-type-select'   // Class
            ];

            let selectElement = null;
            let foundSelector = null;

            for (const selector of possibleSelectors) {
                try {
                    const elem = selector.startsWith('[') || selector.startsWith('.')
                        ? document.querySelector(selector)
                        : document.getElementById(selector);
                    if (elem && (elem.tagName === 'SELECT' || elem.type === 'radio')) {
                        selectElement = elem;
                        foundSelector = selector;
                        break;
                    }
                } catch (e) {}
            }

            // Also check radio buttons for marker types
            if (!selectElement) {
                const radios = document.querySelectorAll('input[type="radio"][name*="marker"], input[type="radio"][name*="sign"]');
                if (radios.length > 0) {
                    // Find ID.1 radio
                    const id1Radio = Array.from(radios).find(r => r.value === 'ID.1');
                    if (id1Radio) {
                        id1Radio.checked = true;
                        id1Radio.dispatchEvent(new Event('change', { bubbles: true }));
                        window.appState.currentMarkerType = 'ID.1';
                        return {
                            success: true,
                            message: 'ID.1 selected via radio button',
                            method: 'radio'
                        };
                    }
                }
            }

            // Direct app state change if no UI element found
            if (!selectElement && window.appState) {
                const previousType = window.appState.currentMarkerType;
                window.appState.currentMarkerType = 'ID.1';

                // Try to update any visible UI
                const markerButtons = document.querySelectorAll('[data-marker-type]');
                markerButtons.forEach(btn => {
                    if (btn.getAttribute('data-marker-type') === 'ID.1') {
                        btn.click();
                    }
                });

                return {
                    success: true,
                    message: 'Sign type ID.1 set directly in app state',
                    previousType: previousType,
                    newType: 'ID.1',
                    method: 'direct'
                };
            }

            if (selectElement) {
                const previousValue = selectElement.value;
                selectElement.value = 'ID.1';
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                window.appState.currentMarkerType = 'ID.1';

                return {
                    success: true,
                    message: 'Sign type ID.1 selected',
                    selector: foundSelector,
                    previousValue: previousValue,
                    newValue: selectElement.value
                };
            }

            return { success: false, error: 'No sign type control found' };
        });
        console.log('   Result:', JSON.stringify(selectResult, null, 2));

        // Wait for selection to apply
        await page.waitForTimeout(1000);

        // Run automap for "PAT"
        console.log('\n2️⃣ Running automap for "PAT"...');
        const automapResult = await page.evaluate(async () => {
            // First set the search term
            const searchInput = document.getElementById('single-location-search');
            if (searchInput) {
                searchInput.value = 'PAT';
                console.log('Search term set to: PAT');
            }

            // Try using sidekick.runAutomap
            if (window.sidekick && window.sidekick.runAutomap) {
                const result = await window.sidekick.runAutomap('PAT');
                return result;
            }

            // Alternative: try direct automap function
            if (typeof window.automapSingleLocation === 'function') {
                const result = await window.automapSingleLocation();
                return { success: true, message: 'Automap executed directly', result };
            }

            // Alternative: click the automap button
            const automapBtn = document.querySelector('button[onclick*="automapSingleLocation"]');
            if (automapBtn) {
                automapBtn.click();
                return { success: true, message: 'Automap button clicked' };
            }

            return { success: false, error: 'Could not execute automap' };
        });
        console.log('   Result:', JSON.stringify(automapResult, null, 2));

        // Check the current state
        console.log('\n3️⃣ Checking current state...');
        const status = await page.evaluate(() => {
            if (window.sidekick && window.sidekick.getStatus) {
                return window.sidekick.getStatus();
            }
            return { error: 'Sidekick not available' };
        });
        console.log('   Status:', JSON.stringify(status, null, 2));

        // Get dot count to see if markers were placed
        console.log('\n4️⃣ Checking dot count...');
        const dotCount = await page.evaluate(() => {
            if (window.sidekick && window.sidekick.getDotCount) {
                return window.sidekick.getDotCount();
            }
            // Alternative: check directly
            const dots = window.getCurrentPageDots ? window.getCurrentPageDots() : null;
            if (dots) {
                return { total: dots.size, message: 'Got count directly' };
            }
            return { error: 'Could not get dot count' };
        });
        console.log('   Dot count:', JSON.stringify(dotCount, null, 2));

        console.log('\n✅ Commands completed!');

        // Use close() instead of disconnect() for CDP connections
        await browser.close();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the commands
executeSidekickCommands();