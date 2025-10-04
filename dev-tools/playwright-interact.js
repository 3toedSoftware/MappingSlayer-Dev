import { chromium } from 'playwright';

async function interact(action) {
    try {
        console.log('🔌 Connecting to Chrome on port 9222...');
        const browser = await chromium.connectOverCDP('http://localhost:9222');

        const contexts = browser.contexts();
        if (contexts.length === 0) {
            console.error('❌ No browser contexts found');
            return;
        }

        const page = contexts[0].pages()[0];
        console.log(`📋 Connected to: ${await page.title()}`);

        if (action === 'find-dots') {
            // Try multiple selectors for dots
            const selectors = [
                '.location-dot',
                '[class*="dot"]',
                '[id*="dot"]',
                'circle',
                '[data-location]',
                'div[style*="position: absolute"]'
            ];

            for (const selector of selectors) {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    console.log(`Found ${elements.length} elements with selector: ${selector}`);

                    // Get details of first few
                    for (let i = 0; i < Math.min(3, elements.length); i++) {
                        const box = await elements[i].boundingBox();
                        const text = await elements[i].textContent().catch(() => '');
                        const className = await elements[i].getAttribute('class').catch(() => '');
                        const id = await elements[i].getAttribute('id').catch(() => '');

                        console.log(`  Element ${i}: ${className || id || 'no-class'}`);
                        console.log(`    Text: ${text}`);
                        if (box) {
                            console.log(`    Position: x=${box.x}, y=${box.y}`);
                        }
                    }
                }
            }

            // Check for canvas
            const canvas = await page.$('canvas');
            if (canvas) {
                const box = await canvas.boundingBox();
                console.log(`\n📊 Canvas found at x=${box.x}, y=${box.y}, size=${box.width}x${box.height}`);
            }

        } else if (action.startsWith('right-click:')) {
            const coords = action.substring(12).split(',');
            const x = parseInt(coords[0]);
            const y = parseInt(coords[1]);

            console.log(`Right-clicking at position (${x}, ${y})...`);
            await page.mouse.click(x, y, { button: 'right' });
            console.log('✅ Right-click performed');

            // Wait a moment for context menu
            await page.waitForTimeout(500);

            // Check if context menu appeared
            const menu = await page.$('.context-menu, .ms-context-menu, [role="menu"]');
            if (menu) {
                console.log('📋 Context menu appeared');
            }

        } else if (action === 'list-all') {
            // Get all visible text elements
            const visibleElements = await page.evaluate(() => {
                const result = [];
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            if (node.nodeValue && node.nodeValue.trim()) {
                                const parent = node.parentElement;
                                const rect = parent.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    return NodeFilter.FILTER_ACCEPT;
                                }
                            }
                            return NodeFilter.FILTER_SKIP;
                        }
                    }
                );

                let node;
                while (node = walker.nextNode()) {
                    const text = node.nodeValue.trim();
                    if (text && text.length < 20) { // Short text likely to be labels
                        const parent = node.parentElement;
                        const rect = parent.getBoundingClientRect();
                        result.push({
                            text: text,
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            tag: parent.tagName
                        });
                    }
                }
                return result;
            });

            // Look for "0001"
            const dot = visibleElements.find(el => el.text === '0001' || el.text.includes('0001'));
            if (dot) {
                console.log(`\n🎯 Found "0001" at position (${dot.x}, ${dot.y}) in ${dot.tag}`);
                console.log('Use command: right-click:' + dot.x + ',' + dot.y);
            }

            console.log(`\nFound ${visibleElements.length} text elements`);
            visibleElements.slice(0, 10).forEach(el => {
                console.log(`  "${el.text}" at (${el.x}, ${el.y})`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

const action = process.argv[2] || 'find-dots';
interact(action);