import { chromium } from 'playwright';

async function testSidekick() {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const page = browser.contexts()[0].pages()[0];

        // Just try to use sidekick.selectMarkerType directly
        const result = await page.evaluate(() => {
            return window.sidekick.selectMarkerType('ID.2');
        });

        console.log('Result:', JSON.stringify(result, null, 2));

        await browser.close();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testSidekick();