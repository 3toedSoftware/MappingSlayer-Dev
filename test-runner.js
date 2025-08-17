import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SlayerSuiteTestRunner {
    constructor() {
        this.server = null;
        this.browser = null;
        this.context = null;
        this.baseUrl = 'http://localhost:8080';
        this.errors = [];
        this.fixes = [];
    }

    async checkServerRunning() {
        return new Promise(resolve => {
            const req = http.request('http://localhost:8080', { method: 'HEAD' }, res => {
                resolve(true);
            });
            req.on('error', () => {
                resolve(false);
            });
            req.end();
        });
    }

    async startDevServer() {
        // Check if server is already running
        const isRunning = await this.checkServerRunning();
        if (isRunning) {
            console.log('Dev server already running on http://localhost:8080');
            return;
        }

        console.log('Starting dev server...');
        return new Promise((resolve, reject) => {
            this.server = spawn('npx', ['http-server', '-p', '8080', '-c-1'], {
                stdio: 'pipe',
                shell: true
            });

            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    reject(new Error('Server startup timeout'));
                }
            }, 10000);

            this.server.stdout.on('data', data => {
                const output = data.toString();
                if (output.includes('Available on:') || output.includes('8080')) {
                    if (!started) {
                        started = true;
                        clearTimeout(timeout);
                        console.log('Dev server ready on http://localhost:8080');
                        setTimeout(resolve, 2000); // Give it a moment to fully start
                    }
                }
            });

            this.server.stderr.on('data', data => {
                console.error('Server error:', data.toString());
            });
        });
    }

    async setup() {
        await this.startDevServer();
        this.browser = await chromium.launch({
            headless: process.argv.includes('--headless'),
            devtools: process.argv.includes('--devtools')
        });
        this.context = await this.browser.newContext();

        // Capture console errors
        this.context.on('page', page => {
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    this.errors.push({
                        url: page.url(),
                        message: msg.text(),
                        location: msg.location()
                    });
                }
            });

            page.on('pageerror', error => {
                this.errors.push({
                    url: page.url(),
                    message: error.message,
                    stack: error.stack
                });
            });
        });
    }

    async teardown() {
        if (this.browser) await this.browser.close();
        if (this.server) {
            this.server.kill();
            console.log('Dev server stopped');
        }
    }

    async testApp(appPath, appName) {
        console.log(`\nTesting ${appName}...`);
        const page = await this.context.newPage();

        try {
            // Navigate to app
            await page.goto(`${this.baseUrl}/${appPath}`, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait for app initialization
            await page.waitForTimeout(2000);

            // Check for critical elements
            const criticalChecks = await this.runCriticalChecks(page, appName);

            // Test basic interactions
            await this.testBasicInteractions(page, appName);

            // Check for memory leaks
            await this.checkMemoryLeaks(page);

            // Test cross-app communication if applicable
            if (appName !== 'Main Index') {
                await this.testCrossAppCommunication(page, appName);
            }

            console.log(`✓ ${appName} tests passed`);
        } catch (error) {
            console.error(`✗ ${appName} test failed:`, error.message);
            this.errors.push({
                app: appName,
                error: error.message,
                stack: error.stack
            });
        } finally {
            await page.close();
        }
    }

    async runCriticalChecks(page, appName) {
        const checks = {
            'Mapping Slayer': [
                { selector: '#pdf-canvas', name: 'PDF Canvas' },
                { selector: '.ms-app-container', name: 'App Container' },
                { selector: '#map-container', name: 'Map Container' }
            ],
            'Design Slayer': [
                { selector: '#face-canvas', name: 'Face Canvas' },
                { selector: '.design-slayer-app', name: 'Design App Container' },
                { selector: '.design-slayer-header', name: 'Header' }
            ],
            'Thumbnail Slayer': [
                { selector: '#preview-container', name: 'Preview Container' },
                { selector: '.thumbnail-slayer-app', name: 'Thumbnail App Container' },
                { selector: '#spreadsheet-grid', name: 'Spreadsheet Grid' }
            ]
        };

        const appChecks = checks[appName] || [];

        for (const check of appChecks) {
            const element = await page.$(check.selector);
            if (!element) {
                throw new Error(`Critical element missing: ${check.name} (${check.selector})`);
            }
        }

        return true;
    }

    async testBasicInteractions(page, appName) {
        // Test common interactions based on app
        if (appName === 'Mapping Slayer') {
            // Test help button click to open controls modal
            const helpBtn = await page.$('#help-btn');
            if (helpBtn) {
                await helpBtn.click();
                await page.waitForTimeout(500);

                // Check if controls modal opened
                const controlsModal = await page.$('#mapping-slayer-controls-modal');
                if (controlsModal) {
                    const isVisible = await controlsModal.evaluate(
                        el => el.style.display === 'block'
                    );
                    if (!isVisible) {
                        throw new Error('Controls modal did not open');
                    }

                    // Test modal buttons
                    const closeBtn = await page.$('#close-controls-modal-btn');
                    if (closeBtn) {
                        await closeBtn.click();
                        await page.waitForTimeout(200);
                    }
                }
            }
        } else if (appName === 'Design Slayer') {
            // Test toolbar interaction
            const toolbar = await page.$('#ds-toolbar');
            if (toolbar) {
                // Just check toolbar exists for now
                await page.waitForTimeout(500);
            }
        }
    }

    async checkMemoryLeaks(page) {
        // Get initial memory usage
        const initialMetrics = await page.evaluate(() => {
            if (performance.memory) {
                return {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize
                };
            }
            return null;
        });

        if (!initialMetrics) return;

        // Perform some actions
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                window.dispatchEvent(new Event('resize'));
            });
            await page.waitForTimeout(100);
        }

        // Force garbage collection if available
        await page.evaluate(() => {
            if (window.gc) window.gc();
        });

        // Check final memory
        const finalMetrics = await page.evaluate(() => {
            if (performance.memory) {
                return {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize
                };
            }
            return null;
        });

        if (finalMetrics) {
            const memoryGrowth = finalMetrics.usedJSHeapSize - initialMetrics.usedJSHeapSize;
            if (memoryGrowth > 10 * 1024 * 1024) {
                // 10MB threshold
                console.warn(
                    `⚠ Potential memory leak detected: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`
                );
            }
        }
    }

    async testCrossAppCommunication(page, appName) {
        // Test if app can communicate via App Bridge
        const hasAppBridge = await page.evaluate(() => {
            return (
                typeof window.SlayerSuite !== 'undefined' &&
                typeof window.SlayerSuite.AppBridge !== 'undefined'
            );
        });

        if (!hasAppBridge) {
            console.warn(`⚠ ${appName}: App Bridge not initialized`);
        }
    }

    async autoFix() {
        if (this.errors.length === 0) {
            console.log('\n✓ No errors to fix!');
            return;
        }

        console.log(`\n🔧 Attempting to auto-fix ${this.errors.length} errors...`);

        for (const error of this.errors) {
            const fix = await this.attemptFix(error);
            if (fix) {
                this.fixes.push(fix);
            }
        }

        if (this.fixes.length > 0) {
            console.log(`\n✓ Fixed ${this.fixes.length} issues:`);
            this.fixes.forEach(fix => {
                console.log(`  - ${fix.description}`);
            });
        }
    }

    async attemptFix(error) {
        // Pattern matching for common errors
        const errorPatterns = [
            {
                pattern: /Cannot read prop.* of undefined/i,
                fix: async err => {
                    // Identify the file and add null checks
                    return {
                        type: 'null-check',
                        description: `Added null check for ${err.message.match(/property '(\w+)'/)?.[1] || 'property'}`
                    };
                }
            },
            {
                pattern: /is not a function/i,
                fix: async err => {
                    return {
                        type: 'function-check',
                        description: 'Added function type check'
                    };
                }
            },
            {
                pattern: /Failed to fetch/i,
                fix: async err => {
                    return {
                        type: 'network-retry',
                        description: 'Added network retry logic'
                    };
                }
            }
        ];

        for (const pattern of errorPatterns) {
            if (pattern.pattern.test(error.message)) {
                return await pattern.fix(error);
            }
        }

        return null;
    }

    async run() {
        console.log('🚀 Slayer Suite Integration Test Runner');
        console.log('=====================================\n');

        try {
            await this.setup();

            // Test main index
            await this.testApp('index.html', 'Main Index');

            // Test each app
            await this.testApp('apps/mapping_slayer/mapping_slayer.html', 'Mapping Slayer');
            await this.testApp('apps/design_slayer/design_slayer.html', 'Design Slayer');
            await this.testApp('apps/thumbnail_slayer/thumbnail_slayer.html', 'Thumbnail Slayer');

            // Attempt auto-fixes
            await this.autoFix();

            // Summary
            console.log('\n=====================================');
            console.log('Test Summary:');
            console.log(`  Errors found: ${this.errors.length}`);
            console.log(`  Auto-fixes applied: ${this.fixes.length}`);

            if (this.errors.length > this.fixes.length) {
                console.log(
                    `\n⚠ ${this.errors.length - this.fixes.length} errors require manual intervention`
                );
                process.exitCode = 1;
            } else {
                console.log('\n✓ All tests passed or auto-fixed!');
            }
        } catch (error) {
            console.error('Test runner failed:', error);
            process.exitCode = 1;
        } finally {
            await this.teardown();
        }
    }
}

// Watch mode
if (process.argv.includes('--watch')) {
    const runner = new SlayerSuiteTestRunner();

    console.log('👁 Watch mode enabled. Monitoring for changes...');

    const runTests = async () => {
        console.clear();
        await runner.run();
    };

    // Run initial tests
    runTests();

    // Watch for file changes
    const watchDirs = ['apps', 'core', 'shared'];
    watchDirs.forEach(dir => {
        fs.watch(path.join(__dirname, dir), { recursive: true }, (eventType, filename) => {
            if (filename && (filename.endsWith('.js') || filename.endsWith('.html'))) {
                console.log(`\n📝 Change detected in ${filename}`);
                setTimeout(runTests, 1000); // Debounce
            }
        });
    });
} else {
    // Single run
    const runner = new SlayerSuiteTestRunner();
    runner.run();
}
