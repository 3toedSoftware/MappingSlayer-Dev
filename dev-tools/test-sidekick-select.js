import { chromium } from 'playwright';

async function testSidekickSelect() {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const page = browser.contexts()[0].pages()[0];

        console.log('Reloading page to get updated Sidekick code...');
        await page.reload();
        await page.waitForTimeout(2000); // Wait for page to fully load

        console.log('Testing new sidekick.selectMarkerType() method...\n');

        // Test selecting ID.2
        const result = await page.evaluate(() => {
            if (window.sidekick && window.sidekick.selectMarkerType) {
                return window.sidekick.selectMarkerType('ID.2');
            }
            return { error: 'sidekick.selectMarkerType not found' };
        });

        console.log('Result:', JSON.stringify(result, null, 2));

        await browser.close();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testSidekickSelect();