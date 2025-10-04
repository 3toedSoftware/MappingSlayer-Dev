import { chromium } from 'playwright';

(async () => {
    try {
        // Connect to the existing Chrome instance with debugging enabled
        console.log('Connecting to Chrome on port 9222...');
        const browser = await chromium.connectOverCDP('http://localhost:9222');

        console.log('Connected! Getting browser contexts...');
        const contexts = browser.contexts();
        console.log(`Found ${contexts.length} context(s)`);

        if (contexts.length > 0) {
            const defaultContext = contexts[0];
            const pages = defaultContext.pages();
            console.log(`Found ${pages.length} page(s)`);

            if (pages.length > 0) {
                const page = pages[0];
                console.log('Current URL:', await page.url());
                console.log('Page title:', await page.title());

                // Now we can interact with the page
                // For example, let's check if the plus button exists
                const plusButton = await page.$('#template-add-btn');
                if (plusButton) {
                    console.log('Found template add button!');
                    // We could click it: await plusButton.click();
                }
            }
        }

        console.log('\nSuccessfully connected to your browser!');
        console.log('Keeping connection open for interaction...');

        // Keep the script running
        await new Promise(() => {}); // This will keep running until you Ctrl+C

    } catch (error) {
        console.error('Error connecting to browser:', error.message);
        console.error('\nMake sure Chrome is running with:');
        console.error('start chrome --remote-debugging-port=9222 --user-data-dir="C:\\temp\\chrome-debug-profile"');
    }
})();