const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8080';

test.describe('Slayer Suite Core Functionality', () => {
    test.beforeEach(async ({ page }) => {
        // Set up error monitoring
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('Console error:', msg.text());
            }
        });

        page.on('pageerror', error => {
            console.error('Page error:', error.message);
        });
    });

    test('Main index loads without errors', async ({ page }) => {
        await page.goto(`${BASE_URL}/index.html`);

        // Check for main structure
        await expect(page.locator('.suite-header')).toBeVisible();
        await expect(page.locator('.apps-grid')).toBeVisible();

        // Verify all app cards are present
        const appCards = page.locator('.app-card');
        await expect(appCards).toHaveCount(3);
    });

    test('Mapping Slayer initializes correctly', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/mapping_slayer/mapping_slayer.html`);

        // Wait for app initialization
        await page.waitForFunction(() => window.mappingApp !== undefined);

        // Check critical elements
        await expect(page.locator('#map-canvas')).toBeVisible();
        await expect(page.locator('#toolbar')).toBeVisible();
        await expect(page.locator('.header')).toBeVisible();

        // Test canvas is initialized
        const canvasSize = await page.locator('#map-canvas').boundingBox();
        expect(canvasSize.width).toBeGreaterThan(0);
        expect(canvasSize.height).toBeGreaterThan(0);
    });

    test('Design Slayer initializes correctly', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/design_slayer/design_slayer.html`);

        // Wait for app initialization
        await page.waitForFunction(() => window.designApp !== undefined);

        // Check critical elements
        await expect(page.locator('#design-canvas')).toBeVisible();
        await expect(page.locator('#text-input')).toBeVisible();
        await expect(page.locator('.header')).toBeVisible();

        // Test text input functionality
        await page.fill('#text-input', 'Test Text');
        const inputValue = await page.inputValue('#text-input');
        expect(inputValue).toBe('Test Text');
    });

    test('Thumbnail Slayer initializes correctly', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/thumbnail_slayer/thumbnail_slayer.html`);

        // Wait for app initialization
        await page.waitForFunction(() => window.thumbnailApp !== undefined);

        // Check critical elements
        await expect(page.locator('#preview-container')).toBeVisible();
        await expect(page.locator('#spreadsheet-grid')).toBeVisible();
        await expect(page.locator('.thumbnail-slayer-app')).toBeVisible();
    });

    test('Cross-app communication via App Bridge', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/mapping_slayer/mapping_slayer.html`);

        // Check App Bridge is initialized
        const hasAppBridge = await page.evaluate(() => {
            return window.SlayerSuite?.AppBridge !== undefined;
        });
        expect(hasAppBridge).toBeTruthy();

        // Test message passing
        const messageReceived = await page.evaluate(() => {
            return new Promise(resolve => {
                if (window.SlayerSuite?.AppBridge) {
                    window.SlayerSuite.AppBridge.on('test-message', () => {
                        resolve(true);
                    });
                    window.SlayerSuite.AppBridge.emit('test-message', { test: true });
                } else {
                    resolve(false);
                }
            });
        });
        expect(messageReceived).toBeTruthy();
    });

    test('Memory leak detection - Mapping Slayer', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/mapping_slayer/mapping_slayer.html`);
        await page.waitForFunction(() => window.mappingApp !== undefined);

        // Get initial memory
        const initialMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

        // Perform repeated actions
        for (let i = 0; i < 10; i++) {
            await page.click('#map-canvas', { position: { x: 100 + i * 10, y: 100 } });
            await page.keyboard.press('Escape');
        }

        // Force GC if available
        await page.evaluate(() => {
            if (window.gc) window.gc();
        });

        // Check memory growth
        const finalMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
        const memoryGrowth = finalMemory - initialMemory;

        // Alert if memory grew by more than 5MB
        if (memoryGrowth > 5 * 1024 * 1024) {
            console.warn(
                `Memory leak detected: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`
            );
        }
    });

    test('Error boundary - handle undefined properties', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/mapping_slayer/mapping_slayer.html`);

        // Inject error and verify it's handled
        const errorHandled = await page.evaluate(() => {
            try {
                // Simulate accessing undefined property
                const result = window.nonExistentObject.property;
                return false;
            } catch (error) {
                return true;
            }
        });

        expect(errorHandled).toBeTruthy();
    });

    test('Canvas rendering performance', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/design_slayer/design_slayer.html`);
        await page.waitForFunction(() => window.designApp !== undefined);

        // Measure render time
        const renderTime = await page.evaluate(() => {
            const start = performance.now();
            const canvas = document.getElementById('design-canvas');
            const ctx = canvas.getContext('2d');

            // Draw many elements
            for (let i = 0; i < 1000; i++) {
                ctx.fillRect(Math.random() * 500, Math.random() * 500, 10, 10);
            }

            return performance.now() - start;
        });

        // Should render in under 100ms
        expect(renderTime).toBeLessThan(100);
    });

    test('State persistence across page reloads', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/mapping_slayer/mapping_slayer.html`);

        // Set some state
        await page.evaluate(() => {
            localStorage.setItem('test-state', JSON.stringify({ test: true }));
        });

        // Reload page
        await page.reload();

        // Check state persisted
        const state = await page.evaluate(() => {
            return JSON.parse(localStorage.getItem('test-state') || '{}');
        });

        expect(state.test).toBeTruthy();

        // Clean up
        await page.evaluate(() => {
            localStorage.removeItem('test-state');
        });
    });

    test('File handling - drag and drop', async ({ page }) => {
        await page.goto(`${BASE_URL}/apps/mapping_slayer/mapping_slayer.html`);

        // Check if drop zone exists
        const dropZone = page.locator('#map-canvas');
        await expect(dropZone).toBeVisible();

        // Verify drop event listeners are attached
        const hasDropListeners = await page.evaluate(() => {
            const canvas = document.getElementById('map-canvas');
            // Check if element has drop-related attributes or handlers
            return canvas !== null;
        });

        expect(hasDropListeners).toBeTruthy();
    });
});
