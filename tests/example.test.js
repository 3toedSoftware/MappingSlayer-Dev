/**
 * Example test file - Copy this when you need to test something
 *
 * To run tests:
 *   npm test           - Run all tests once
 *   npm run test:watch - Watch mode
 *   npm run test:ui    - Interactive UI
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Example test structure - delete this when you write real tests
describe('Example Test Suite', () => {
    // Setup before each test
    beforeEach(() => {
        // Reset state, mock data, etc.
    });

    // Cleanup after each test
    afterEach(() => {
        // Clean up DOM, restore mocks, etc.
    });

    it('should pass this example test', () => {
        expect(1 + 1).toBe(2);
    });

    it('should work with async code', async () => {
        const result = await Promise.resolve('success');
        expect(result).toBe('success');
    });
});

// Example: Testing a function from your code
// import { calculateMarkerPosition } from '../src/app/map-controller.js';
//
// describe('Marker Calculations', () => {
//     it('should calculate correct position', () => {
//         const result = calculateMarkerPosition(100, 200);
//         expect(result).toEqual({ x: 100, y: 200 });
//     });
// });

// Example: Testing DOM manipulation
// describe('UI Functions', () => {
//     it('should create button element', () => {
//         document.body.innerHTML = '<div id="test"></div>';
//         const button = document.createElement('button');
//         button.textContent = 'Test';
//         document.getElementById('test').appendChild(button);
//
//         expect(document.querySelector('button')).toBeTruthy();
//         expect(document.querySelector('button').textContent).toBe('Test');
//     });
// });

// Example: Testing with mocks
// import { vi } from 'vitest';
//
// describe('Save Functionality', () => {
//     it('should call save with correct data', () => {
//         const saveMock = vi.fn();
//         const data = { test: 'data' };
//
//         saveMock(data);
//
//         expect(saveMock).toHaveBeenCalledWith(data);
//         expect(saveMock).toHaveBeenCalledTimes(1);
//     });
// });
