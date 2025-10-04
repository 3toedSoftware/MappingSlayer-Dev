const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log('🔌 Connecting to Chrome on port 9222...');
        const browser = await puppeteer.connect({
            browserURL: 'http://localhost:9222',
            defaultViewport: null
        });

        const pages = await browser.pages();
        const page = pages[0];
        console.log('✅ Connected to page');

        // Click SIGN PREVIEW button
        console.log('\n1️⃣ Clicking SIGN PREVIEW button...');
        const signPreviewBtn = await page.$('#signPreviewBtn');
        if (signPreviewBtn) {
            await signPreviewBtn.click();
            console.log('   ✅ SIGN PREVIEW clicked');
            await page.waitForTimeout(500);
        } else {
            console.log('   ❌ SIGN PREVIEW button not found');
        }

        // Click GALLERY button
        console.log('\n2️⃣ Clicking GALLERY button...');
        const galleryBtn = await page.$('#galleryBtn');
        if (galleryBtn) {
            await galleryBtn.click();
            console.log('   ✅ GALLERY clicked');
            await page.waitForTimeout(500);
        } else {
            console.log('   ❌ GALLERY button not found');
        }

        console.log('\n✨ Done! Both buttons have been clicked.');
        console.log('👀 Watch the screen to see the result!');

        // Keep connection alive to observe
        console.log('\nKeeping connection alive... Press Ctrl+C to exit');

    } catch (error) {
        console.error('Error:', error.message);
    }
})();