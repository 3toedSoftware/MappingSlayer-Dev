import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Use happy-dom for DOM testing without a real browser
        environment: 'happy-dom',

        // Global test settings
        globals: true,

        // Coverage settings (when you need it)
        coverage: {
            reporter: ['text', 'html'],
            exclude: ['node_modules/', 'tests/', 'ARCHIVED/', '*.config.js']
        },

        // Test file patterns
        include: ['tests/**/*.test.js'],

        // Files to watch
        watchExclude: ['**/node_modules/**', '**/ARCHIVED/**'],

        // Timeout for tests (5 seconds should be plenty)
        testTimeout: 5000,

        // Hook timeout
        hookTimeout: 10000
    },

    // Resolve aliases if needed
    resolve: {
        alias: {
            '@': '/src',
            '@app': '/src/app',
            '@core': '/src/core'
        }
    }
});
