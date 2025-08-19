// Test script for checking SAVE button state
// Paste this into the browser console to check the current state

console.log('=== SAVE Button State Check ===');

// Check SaveManager
if (window.saveManager) {
    console.log('✅ SaveManager found');
    console.log('  File Handle:', window.saveManager.fileHandle ? 'YES ✅' : 'NO ❌');
    if (window.saveManager.fileHandle) {
        console.log('    Type:', window.saveManager.fileHandle.constructor.name);
    }
    console.log('  Has Unsaved Changes:', window.saveManager.hasUnsavedChanges ? 'YES ⚠️' : 'NO ✅');
    console.log('  Project Name:', window.saveManager.projectName);
} else {
    console.log('❌ SaveManager NOT found');
}

// Check buttons
const saveBtn = document.getElementById('save-project-btn');
const saveAsBtn = document.getElementById('save-as-project-btn');

if (saveBtn) {
    console.log('SAVE Button:', saveBtn.disabled ? 'DISABLED ❌' : 'ENABLED ✅');
} else {
    console.log('❌ SAVE button not found in DOM');
}

if (saveAsBtn) {
    console.log('SAVE AS Button:', saveAsBtn.disabled ? 'DISABLED ❌' : 'ENABLED ✅');
} else {
    console.log('❌ SAVE AS button not found in DOM');
}

// Check appBridge
if (window.appBridge) {
    console.log('✅ AppBridge available');
} else {
    console.log('❌ AppBridge NOT available');
}

console.log('=== End State Check ===');

// Test function to simulate a change
window.testDirtyState = function() {
    console.log('🔧 Simulating dirty state...');
    if (window.appBridge) {
        window.appBridge.broadcast('project:dirty');
        console.log('✅ Broadcast project:dirty event');
    } else {
        console.log('❌ Cannot broadcast - appBridge not available');
    }
};

console.log('💡 TIP: Run testDirtyState() to simulate a change');