// flag-config.js - Customizable flag system for Mapping Slayer

// Available symbols/emojis for flag indicators
export const FLAG_SYMBOLS = [
    { symbol: '', label: 'None', value: null },
    { symbol: '⭐', label: 'Star', value: 'star' },
    { symbol: '❗', label: 'Exclamation', value: 'exclamation' },
    { symbol: '❓', label: 'Question', value: 'question' },
    { symbol: '✓', label: 'Check', value: 'check' },
    { symbol: '✗', label: 'X Mark', value: 'x' },
    { symbol: '⚠️', label: 'Warning', value: 'warning' },
    { symbol: '🔒', label: 'Lock', value: 'lock' },
    { symbol: '🔑', label: 'Key', value: 'key' },
    { symbol: '🚩', label: 'Flag', value: 'flag' },
    { symbol: '📍', label: 'Pin', value: 'pin' },
    { symbol: '🔴', label: 'Red Circle', value: 'red-circle' },
    { symbol: '🟡', label: 'Yellow Circle', value: 'yellow-circle' },
    { symbol: '🟢', label: 'Green Circle', value: 'green-circle' },
    { symbol: '🔵', label: 'Blue Circle', value: 'blue-circle' },
    { symbol: '⬆️', label: 'Up Arrow', value: 'up-arrow' },
    { symbol: '⬇️', label: 'Down Arrow', value: 'down-arrow' },
    { symbol: '➡️', label: 'Right Arrow', value: 'right-arrow' },
    { symbol: '⬅️', label: 'Left Arrow', value: 'left-arrow' },
    { symbol: '🔧', label: 'Wrench', value: 'wrench' },
    { symbol: '⚡', label: 'Lightning', value: 'lightning' },
    { symbol: '💡', label: 'Light Bulb', value: 'bulb' },
    { symbol: '📌', label: 'Pushpin', value: 'pushpin' },
    { symbol: '🎯', label: 'Target', value: 'target' },
    { symbol: '🏁', label: 'Checkered Flag', value: 'checkered' }
];

// Flag positions
export const FLAG_POSITIONS = {
    TOP_LEFT: 'topLeft',
    TOP_RIGHT: 'topRight',
    BOTTOM_LEFT: 'bottomLeft',
    BOTTOM_RIGHT: 'bottomRight'
};

// Default flag configuration for a marker type
export function getDefaultFlagConfig() {
    return {
        [FLAG_POSITIONS.TOP_LEFT]: {
            name: 'Flag 1',
            symbol: null,
            enabled: true
        },
        [FLAG_POSITIONS.TOP_RIGHT]: {
            name: 'Flag 2',
            symbol: null,
            enabled: true
        },
        [FLAG_POSITIONS.BOTTOM_LEFT]: {
            name: 'Flag 3',
            symbol: null,
            enabled: true
        },
        [FLAG_POSITIONS.BOTTOM_RIGHT]: {
            name: 'Flag 4',
            symbol: null,
            enabled: true
        }
    };
}

// Get the next symbol in the cycle for a given position
export function getNextSymbol(currentSymbol) {
    const currentIndex = FLAG_SYMBOLS.findIndex(s => s.value === currentSymbol);
    const nextIndex = (currentIndex + 1) % FLAG_SYMBOLS.length;
    return FLAG_SYMBOLS[nextIndex].value;
}

// Get the previous symbol in the cycle
export function getPreviousSymbol(currentSymbol) {
    const currentIndex = FLAG_SYMBOLS.findIndex(s => s.value === currentSymbol);
    const prevIndex = currentIndex <= 0 ? FLAG_SYMBOLS.length - 1 : currentIndex - 1;
    return FLAG_SYMBOLS[prevIndex].value;
}

// Get symbol display info
export function getSymbolInfo(symbolValue) {
    return FLAG_SYMBOLS.find(s => s.value === symbolValue) || FLAG_SYMBOLS[0];
}

// Initialize flag values for a dot (now stores boolean values)
export function initializeDotFlags() {
    return {
        [FLAG_POSITIONS.TOP_LEFT]: false,
        [FLAG_POSITIONS.TOP_RIGHT]: false,
        [FLAG_POSITIONS.BOTTOM_LEFT]: false,
        [FLAG_POSITIONS.BOTTOM_RIGHT]: false
    };
}

// Migrate old dot properties to new flag system
export function migrateDotToFlags(dot) {
    if (!dot.flags) {
        dot.flags = initializeDotFlags();

        // Migration no longer needed - vinylBacker and isCodeRequired have been removed
        // Installed is kept as a separate property, not migrated to flags
    }
    return dot;
}
