/**
 * Debug Configuration for Slayer Suite
 * Controls console logging levels across all apps
 */

const DebugConfig = {
    // Set to false to disable most console logging
    // Set to true for development/debugging
    VERBOSE: false,

    // Individual app debug flags
    MAPPING_SLAYER: false,
    DESIGN_SLAYER: false,
    THUMBNAIL_SLAYER: false,
    APP_BRIDGE: false,
    SAVE_MANAGER: false,
    SYNC: false,

    // Always show these regardless of verbose setting
    ALWAYS_SHOW: {
        ERRORS: true,
        WARNINGS: true,
        CRITICAL: true
    }
};

// Helper function for conditional logging
function debugLog(category, ...args) {
    if (DebugConfig.VERBOSE || DebugConfig[category]) {
        console.log(...args);
    }
}

// Helper function for always showing important messages
function logAlways(...args) {
    console.log(...args);
}

// Helper function for errors (always shown)
function logError(...args) {
    console.error(...args);
}

// Helper function for warnings (always shown)
function logWarn(...args) {
    console.warn(...args);
}

// Export for use across the suite
// Make functions globally available for browser environment
window.DebugConfig = DebugConfig;
window.debugLog = debugLog;
window.logAlways = logAlways;
window.logError = logError;
window.logWarn = logWarn;
