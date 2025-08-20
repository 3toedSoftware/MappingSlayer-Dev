// Quick script to identify truly unused code
const fs = require('fs');
const path = require('path');

// List of potentially unused items from linting
const checkList = [
    { file: 'apps/design_slayer/ui.js', name: 'generateFontOptions', type: 'function' },
    { file: 'apps/design_slayer/ui.js', name: 'measureText', type: 'function' },
    { file: 'apps/mapping_slayer/ui.js', name: 'generateDeletionLog', type: 'function' },
    { file: 'apps/mapping_slayer/ui.js', name: 'toggleTextFieldsManager', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'createSpreadsheetRow', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'setupSpreadsheetRowHandlers', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'scrollToSpreadsheetRow', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'openEditModal', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'createSplitViewThumbnail', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'setupThumbnailEventHandlers', type: 'function' },
    { file: 'apps/thumbnail_slayer/thumbnail-ui.js', name: 'handleThumbnailClickSplitView', type: 'function' },
];

// Search for usage in all JS files
function searchForUsage(name) {
    const jsFiles = [];
    
    function findJsFiles(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                findJsFiles(fullPath);
            } else if (file.endsWith('.js') || file.endsWith('.html')) {
                jsFiles.push(fullPath);
            }
        }
    }
    
    findJsFiles('.');
    
    let usageCount = 0;
    const usageLocations = [];
    
    for (const file of jsFiles) {
        const content = fs.readFileSync(file, 'utf8');
        // Look for function calls
        const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
        const matches = content.match(regex);
        if (matches) {
            usageCount += matches.length;
            usageLocations.push(file);
        }
    }
    
    return { usageCount, usageLocations };
}

console.log('Checking for unused functions...\n');

for (const item of checkList) {
    const usage = searchForUsage(item.name);
    // Subtract 1 for the definition itself
    const actualUsage = usage.usageCount - 1;
    
    if (actualUsage <= 0) {
        console.log(`❌ ${item.name} in ${item.file}`);
        console.log(`   UNUSED - Safe to remove`);
    } else {
        console.log(`✅ ${item.name} in ${item.file}`);
        console.log(`   Used ${actualUsage} times in:`, usage.usageLocations.filter(f => !f.includes(item.file)).slice(0, 3));
    }
    console.log('');
}