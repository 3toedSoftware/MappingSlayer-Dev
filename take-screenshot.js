import { chromium } from 'playwright';

async function takeScreenshot(filename) {
    try {
        console.log('📸 Connecting to take screenshot...');
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const page = browser.contexts()[0].pages()[0];

        const screenshotPath = filename || `screenshot-${Date.now()}.png`;

        await page.screenshot({
            path: screenshotPath,
            fullPage: false  // Just viewport, not entire scrollable area
        });

        console.log(`✅ Screenshot saved as: ${screenshotPath}`);
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

const filename = process.argv[2];
takeScreenshot(filename);