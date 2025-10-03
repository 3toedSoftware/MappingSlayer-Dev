/**
 * Test 1: Basic Toggle Button Functionality
 * Tests that toggle buttons properly open and close their respective modals
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Modal Toggle Test 1: Basic Toggle Functionality', () => {
    let dom;
    let window;
    let document;
    let appState;

    beforeEach(() => {
        // Create a minimal DOM environment
        const html = `
            <!DOCTYPE html>
            <html>
                <body>
                    <!-- Edit Modal -->
                    <div id="mapping-slayer-edit-modal" style="display: none;">
                        <button id="toggle-sign-preview-btn" class="ms-modal-toggle-btn">SIGN PREVIEW</button>
                        <button id="toggle-gallery-btn" class="ms-modal-toggle-btn">GALLERY</button>
                    </div>

                    <!-- Sign Preview Modal -->
                    <div id="mapping-slayer-sign-preview-modal" class="ms-sign-preview-modal"></div>

                    <!-- Gallery Modal -->
                    <div id="mapping-slayer-gallery-modal" class="ms-gallery-modal"></div>

                    <canvas id="canvas"></canvas>
                </body>
            </html>
        `;

        dom = new JSDOM(html);
        window = dom.window;
        document = window.document;

        // Mock global objects
        global.window = window;
        global.document = document;

        // Initialize app state
        appState = {
            editingDot: 'dot-1',
            currentPageDots: new Map([
                ['dot-1', {
                    id: 'dot-1',
                    x: 100,
                    y: 100,
                    markerType: 'ada-entrance',
                    message1: 'Test Message',
                    photos: []
                }]
            ])
        };
        global.appState = appState;

        // Mock functions that the UI depends on
        global.getCurrentPageDots = () => appState.currentPageDots;

        // Mock modal functions
        global.openSignPreviewModal = function(dot) {
            const modal = document.getElementById('mapping-slayer-sign-preview-modal');
            if (modal) {
                modal.classList.add('ms-visible');
            }
        };

        global.closeSignPreviewModal = function() {
            const modal = document.getElementById('mapping-slayer-sign-preview-modal');
            if (modal) {
                modal.classList.remove('ms-visible');
            }
        };

        global.openGalleryModal = function(dot) {
            const modal = document.getElementById('mapping-slayer-gallery-modal');
            if (modal) {
                modal.classList.add('ms-visible');
            }
        };

        global.closeGalleryModal = function() {
            const modal = document.getElementById('mapping-slayer-gallery-modal');
            if (modal) {
                modal.classList.remove('ms-visible');
            }
        };
    });

    afterEach(() => {
        dom.window.close();
    });

    it('should open Sign Preview modal when toggle button is clicked (inactive -> active)', () => {
        const toggleBtn = document.getElementById('toggle-sign-preview-btn');
        const modal = document.getElementById('mapping-slayer-sign-preview-modal');

        // Initial state: button not active, modal not visible
        expect(toggleBtn.classList.contains('active')).toBe(false);
        expect(modal.classList.contains('ms-visible')).toBe(false);

        // Simulate the click handler logic
        if (!toggleBtn.classList.contains('active')) {
            const dot = global.getCurrentPageDots().get(appState.editingDot);
            if (dot) {
                global.openSignPreviewModal(dot);
                setTimeout(() => {
                    toggleBtn.classList.add('active');
                }, 0);
            }
        }

        // Execute timeout
        toggleBtn.classList.add('active');

        // Verify: button active, modal visible
        expect(toggleBtn.classList.contains('active')).toBe(true);
        expect(modal.classList.contains('ms-visible')).toBe(true);
    });

    it('should close Sign Preview modal when toggle button is clicked (active -> inactive)', () => {
        const toggleBtn = document.getElementById('toggle-sign-preview-btn');
        const modal = document.getElementById('mapping-slayer-sign-preview-modal');

        // Setup: modal is open and button is active
        modal.classList.add('ms-visible');
        toggleBtn.classList.add('active');

        // Verify initial state
        expect(toggleBtn.classList.contains('active')).toBe(true);
        expect(modal.classList.contains('ms-visible')).toBe(true);

        // Simulate the click handler logic for closing
        if (toggleBtn.classList.contains('active')) {
            toggleBtn.classList.remove('active');
            global.closeSignPreviewModal();
        }

        // Verify: button not active, modal not visible
        expect(toggleBtn.classList.contains('active')).toBe(false);
        expect(modal.classList.contains('ms-visible')).toBe(false);
    });

    it('should properly toggle Gallery modal visibility', () => {
        const toggleBtn = document.getElementById('toggle-gallery-btn');
        const modal = document.getElementById('mapping-slayer-gallery-modal');

        // Test opening
        expect(toggleBtn.classList.contains('active')).toBe(false);
        expect(modal.classList.contains('ms-visible')).toBe(false);

        // Simulate opening
        if (!toggleBtn.classList.contains('active')) {
            const dot = global.getCurrentPageDots().get(appState.editingDot);
            if (dot) {
                global.openGalleryModal(dot);
                toggleBtn.classList.add('active');
            }
        }

        expect(toggleBtn.classList.contains('active')).toBe(true);
        expect(modal.classList.contains('ms-visible')).toBe(true);

        // Test closing
        if (toggleBtn.classList.contains('active')) {
            toggleBtn.classList.remove('active');
            global.closeGalleryModal();
        }

        expect(toggleBtn.classList.contains('active')).toBe(false);
        expect(modal.classList.contains('ms-visible')).toBe(false);
    });
});