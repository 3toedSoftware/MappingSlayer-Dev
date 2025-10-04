import { chromium } from 'playwright';
import readline from 'readline';

let browser = null;
let page = null;

async function connectToBrowser() {
    try {
        console.log('🔌 Connecting to Chrome on port 9222...');
        browser = await chromium.connectOverCDP('http://localhost:9222');

        const contexts = browser.contexts();
        console.log(`✅ Connected! Found ${contexts.length} browser context(s)`);

        if (contexts.length === 0) {
            console.error('❌ No browser contexts found');
            return false;
        }

        const defaultContext = contexts[0];
        const pages = defaultContext.pages();

        // Find Mapping Slayer page
        for (const p of pages) {
            const url = await p.url();
            if (url.includes('mapping_slayer.html')) {
                page = p;
                console.log(`🎯 Found Mapping Slayer: ${url}`);
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

        // Set up console monitoring
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'error') {
                console.log(`🔴 Console Error: ${text}`);
            }
        });

        return true;
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        return false;
    }
}

async function executeCommand(command) {
    if (!page) {
        return { error: 'Not connected to browser' };
    }

    try {
        // Parse command type
        if (command.startsWith('eval:')) {
            // Execute JavaScript in browser context
            const code = command.substring(5).trim();
            const result = await page.evaluate(code);
            return { type: 'eval', result };
        }
        else if (command.startsWith('snapshot')) {
            // Get page snapshot
            const title = await page.title();
            const url = await page.url();
            const content = await page.content();

            // Get visible text
            const visibleText = await page.evaluate(() => {
                return document.body.innerText || '';
            });

            return {
                type: 'snapshot',
                url,
                title,
                contentLength: content.length,
                visibleText: visibleText.substring(0, 500) + '...'
            };
        }
        else if (command.startsWith('click:')) {
            // Click an element
            const selector = command.substring(6).trim();
            await page.click(selector);
            return { type: 'action', action: 'click', selector };
        }
        else if (command.startsWith('type:')) {
            // Type into an element
            const parts = command.substring(5).trim().split('|');
            if (parts.length !== 2) {
                return { error: 'Usage: type:selector|text' };
            }
            await page.fill(parts[0], parts[1]);
            return { type: 'action', action: 'type', selector: parts[0], text: parts[1] };
        }
        else if (command.startsWith('find:')) {
            // Find elements
            const selector = command.substring(5).trim();
            const elements = await page.$$(selector);
            const elementInfo = [];

            for (const el of elements.slice(0, 5)) { // Limit to 5
                const text = await el.innerText().catch(() => '');
                const isVisible = await el.isVisible().catch(() => false);
                elementInfo.push({ text: text.substring(0, 100), isVisible });
            }

            return {
                type: 'query',
                selector,
                count: elements.length,
                elements: elementInfo
            };
        }
        else if (command === 'help') {
            return {
                type: 'help',
                commands: [
                    'snapshot - Get current page state',
                    'eval:code - Execute JavaScript in page',
                    'click:selector - Click an element',
                    'type:selector|text - Type into element',
                    'find:selector - Find elements',
                    'help - Show this help'
                ]
            };
        }
        else {
            return { error: `Unknown command: ${command}` };
        }
    } catch (error) {
        return { error: error.message };
    }
}

// Main execution
(async () => {
    const connected = await connectToBrowser();
    if (!connected) {
        process.exit(1);
    }

    console.log('\n🎮 INTERACTIVE MODE READY');
    console.log('Type commands or "help" for options');
    console.log('=' .repeat(50));

    // Set up readline interface for stdin/stdout
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'browser> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const command = line.trim();

        if (command === 'exit' || command === 'quit') {
            console.log('👋 Goodbye!');
            rl.close();
            process.exit(0);
        }

        const result = await executeCommand(command);
        console.log(JSON.stringify(result, null, 2));

        rl.prompt();
    });

    rl.on('close', () => {
        console.log('\n👋 Connection closed');
        process.exit(0);
    });
})();