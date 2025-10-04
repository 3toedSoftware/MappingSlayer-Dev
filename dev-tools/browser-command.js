import { chromium } from 'playwright';

async function connectAndExecute(command) {
    try {
        console.log('🔌 Connecting to Chrome on port 9222...');
        const browser = await chromium.connectOverCDP('http://localhost:9222');

        const contexts = browser.contexts();
        if (contexts.length === 0) {
            console.error('❌ No browser contexts found');
            process.exit(1);
        }

        const pages = contexts[0].pages();
        let page = null;

        // Find Mapping Slayer page
        for (const p of pages) {
            const url = await p.url();
            if (url.includes('mapping_slayer.html')) {
                page = p;
                break;
            }
        }

        if (!page && pages.length > 0) {
            page = pages[0];
        }

        if (!page) {
            console.error('❌ No pages found');
            process.exit(1);
        }

        // Execute command
        if (command === 'snapshot' || !command) {
            const title = await page.title();
            const url = await page.url();

            // Get visible elements
            const snapshot = await page.evaluate(() => {
                const getElementInfo = (el) => {
                    const rect = el.getBoundingClientRect();
                    return {
                        tag: el.tagName.toLowerCase(),
                        id: el.id,
                        className: el.className,
                        text: el.textContent?.substring(0, 50),
                        visible: rect.width > 0 && rect.height > 0
                    };
                };

                // Get important elements
                const result = {
                    dots: document.querySelectorAll('.location-dot').length,
                    modalOpen: null,
                    buttons: [],
                    inputs: []
                };

                // Check for modals
                const modals = document.querySelectorAll('.ms-modal, .modal, [role="dialog"]');
                modals.forEach(m => {
                    if (m.style.display !== 'none' && m.offsetWidth > 0) {
                        result.modalOpen = m.id || m.className;
                    }
                });

                // Get visible buttons
                document.querySelectorAll('button:not([style*="display: none"])').forEach(btn => {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        result.buttons.push({
                            text: btn.textContent?.trim(),
                            id: btn.id
                        });
                    }
                });

                // Get visible inputs
                document.querySelectorAll('input:not([type="hidden"]):not([style*="display: none"])').forEach(input => {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        result.inputs.push({
                            type: input.type,
                            id: input.id,
                            value: input.value?.substring(0, 20)
                        });
                    }
                });

                return result;
            });

            console.log('\n📄 PAGE SNAPSHOT:');
            console.log(`URL: ${url}`);
            console.log(`Title: ${title}`);
            console.log(`\nVISIBLE ELEMENTS:`);
            console.log(`- Location dots: ${snapshot.dots}`);
            console.log(`- Modal open: ${snapshot.modalOpen || 'None'}`);
            console.log(`- Buttons: ${snapshot.buttons.length} visible`);
            if (snapshot.buttons.length > 0 && snapshot.buttons.length <= 10) {
                snapshot.buttons.forEach(b => console.log(`  • ${b.text} ${b.id ? `(#${b.id})` : ''}`));
            }
            console.log(`- Input fields: ${snapshot.inputs.length} visible`);
            if (snapshot.inputs.length > 0 && snapshot.inputs.length <= 10) {
                snapshot.inputs.forEach(i => console.log(`  • ${i.type} ${i.id ? `(#${i.id})` : ''} = "${i.value}"`));
            }
        }
        else if (command.startsWith('eval:')) {
            const code = command.substring(5);
            const result = await page.evaluate(code);
            console.log('EVAL RESULT:', result);
        }
        else if (command.startsWith('click:')) {
            const selector = command.substring(6);
            await page.click(selector);
            console.log(`✅ Clicked: ${selector}`);
        }
        else {
            console.log('Unknown command. Available: snapshot, eval:code, click:selector');
        }

        browser.disconnect();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Get command from argument or default to snapshot
const command = process.argv[2] || 'snapshot';
connectAndExecute(command);