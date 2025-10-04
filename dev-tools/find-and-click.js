import { chromium } from 'playwright';

async function findAndClick(locationNumber) {
    try {
        console.log(`🔍 Looking for dot ${locationNumber}...`);
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const page = browser.contexts()[0].pages()[0];

        // First use find to highlight it
        await page.evaluate((num) => {
            const findInput = document.querySelector('#find-input');
            if (findInput) {
                findInput.value = num;
                findInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, locationNumber);

        // Wait a moment for highlight
        await page.waitForTimeout(100);

        // Find the highlighted element or the span with this text
        const element = await page.$(`span:has-text("${locationNumber}")`);

        if (element) {
            const box = await element.boundingBox();
            if (box) {
                console.log(`📍 Found at (${box.x}, ${box.y})`);
                console.log(`🖱️ Right-clicking...`);
                await page.mouse.click(box.x + 5, box.y + 5, { button: 'right' });
                console.log(`✅ Done!`);
            }
        } else {
            console.log('❌ Could not find element');
        }

        // Properly exit
        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

const locationNumber = process.argv[2] || '0001';
findAndClick(locationNumber);