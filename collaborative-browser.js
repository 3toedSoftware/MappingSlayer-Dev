import { chromium } from 'playwright';

let browser = null;
let page = null;

async function connectToBrowser() {
    try {
        console.log('🔌 Connecting to Chrome on port 9222...');
        browser = await chromium.connectOverCDP('http://localhost:9222');

        const contexts = browser.contexts();
        console.log(`✅ Connected! Found ${contexts.length} browser context(s)`);

        if (contexts.length === 0) {
            console.error('❌ No browser contexts found. Make sure a page is open.');
            return false;
        }

        const defaultContext = contexts[0];
        const pages = defaultContext.pages();
        console.log(`📄 Found ${pages.length} page(s)`);

        // Find the Mapping Slayer page
        page = null;
        for (const p of pages) {
            const url = await p.url();
            if (url.includes('mapping_slayer.html')) {
                page = p;
                console.log(`🎯 Found Mapping Slayer page: ${url}`);
                break;
            }
        }

        if (!page && pages.length > 0) {
            page = pages[0];
            console.log(`📍 Using first page: ${await page.url()}`);
        }

        if (!page) {
            console.error('❌ No pages found');
            return false;
        }

        console.log(`📋 Page title: ${await page.title()}`);
        return true;
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('\n📝 Make sure Chrome is running with:');
        console.error('start chrome --remote-debugging-port=9222 --user-data-dir="C:\\temp\\chrome-debug-profile" "http://localhost:8080/src/app/mapping_slayer.html"');
        return false;
    }
}

async function testCollaboration() {
    if (!page) {
        console.error('❌ Not connected to browser');
        return;
    }

    console.log('\n🧪 COLLABORATION TEST');
    console.log('=' .repeat(50));

    // Test 1: Check current state
    console.log('\n1️⃣ Checking current page state...');
    const templateModal = await page.$('#mapping-slayer-template-modal');
    if (templateModal) {
        const isVisible = await templateModal.isVisible();
        console.log(`   Template modal visible: ${isVisible}`);
    }

    // Test 2: Read console logs
    console.log('\n2️⃣ Setting up console monitoring...');
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`   🔴 Console Error: ${msg.text()}`);
        }
    });
    console.log('   ✅ Console monitoring active');

    // Test 3: Check if button is clickable
    console.log('\n3️⃣ Checking template button...');
    const addBtn = await page.$('#template-add-btn');
    if (addBtn) {
        const isEnabled = await addBtn.isEnabled();
        const isVisible = await addBtn.isVisible();
        console.log(`   Button found: ✅`);
        console.log(`   Button visible: ${isVisible}`);
        console.log(`   Button enabled: ${isEnabled}`);

        // Test 4: User interaction test
        console.log('\n4️⃣ USER INTERACTION TEST:');
        console.log('   👆 Please click the green + button in the Sign Template modal');
        console.log('   Waiting for file dialog...');

        // Listen for file chooser
        page.once('filechooser', async fileChooser => {
            console.log('   ✅ File dialog detected! User click worked!');
            console.log(`   Dialog accepts: ${fileChooser.isMultiple() ? 'multiple files' : 'single file'}`);
            // Cancel the dialog
            await fileChooser.setFiles([]);
            console.log('   Dialog cancelled');

            // Test 5: Playwright click test
            setTimeout(async () => {
                console.log('\n5️⃣ PLAYWRIGHT INTERACTION TEST:');
                console.log('   🤖 Playwright will click the button in 3 seconds...');
                await new Promise(resolve => setTimeout(resolve, 3000));

                page.once('filechooser', async fc => {
                    console.log('   ✅ File dialog triggered by Playwright!');
                    await fc.setFiles([]);
                    console.log('   Dialog cancelled');

                    console.log('\n' + '=' .repeat(50));
                    console.log('✅ COLLABORATION TEST COMPLETE!');
                    console.log('Both user and Playwright can interact with the page!');
                });

                await addBtn.click();
            }, 1000);
        });

    } else {
        console.log('   ❌ Template button not found');
    }
}

async function monitorPage() {
    if (!page) return;

    console.log('\n👀 MONITORING MODE ACTIVE');
    console.log('Page activity will be logged here...');

    // Monitor console
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') {
            console.log(`🔴 ERROR: ${text}`);
        } else if (type === 'warning') {
            console.log(`🟡 WARNING: ${text}`);
        }
    });

    // Monitor dialogs
    page.on('dialog', async dialog => {
        console.log(`💬 Dialog: ${dialog.type()} - ${dialog.message()}`);
    });

    // Monitor navigation
    page.on('load', () => {
        console.log('📄 Page loaded/reloaded');
    });

    // Keep running
    await new Promise(() => {});
}

// Main execution
(async () => {
    const connected = await connectToBrowser();
    if (!connected) {
        process.exit(1);
    }

    console.log('\n🎮 COMMANDS:');
    console.log('This script will run a collaboration test');
    console.log('Follow the prompts to test user interaction');

    await testCollaboration();

    // After test, continue monitoring
    await monitorPage();
})();