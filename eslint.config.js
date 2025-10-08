import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    prettierConfig,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                Blob: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                FormData: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                EventSource: 'readonly',
                WebSocket: 'readonly',
                ResizeObserver: 'readonly',
                IntersectionObserver: 'readonly',
                MutationObserver: 'readonly',
                Image: 'readonly',
                Audio: 'readonly',
                Worker: 'readonly',
                SharedWorker: 'readonly',
                ServiceWorker: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly',
                screen: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly',
                getComputedStyle: 'readonly',
                matchMedia: 'readonly',
                requestIdleCallback: 'readonly',
                cancelIdleCallback: 'readonly',
                crypto: 'readonly',
                performance: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                CustomEvent: 'readonly',
                MouseEvent: 'readonly',
                KeyboardEvent: 'readonly',
                TouchEvent: 'readonly',
                DragEvent: 'readonly',
                Event: 'readonly',
                HTMLElement: 'readonly',
                HTMLCanvasElement: 'readonly',
                CanvasRenderingContext2D: 'readonly',
                WebGLRenderingContext: 'readonly',
                WebGL2RenderingContext: 'readonly',
                jsPDF: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                EventTarget: 'readonly',
                indexedDB: 'readonly',
                CompressionStream: 'readonly',
                DecompressionStream: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_'
                }
            ],
            'no-console': 'off',
            'no-debugger': 'warn',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-empty': 'warn',
            'no-extra-semi': 'error',
            'no-irregular-whitespace': 'error',
            'no-duplicate-case': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-dupe-class-members': 'error',
            'no-constant-condition': 'warn',
            'no-redeclare': 'error',
            'no-case-declarations': 'warn',
            'prefer-const': 'warn',
            'no-var': 'warn',
            eqeqeq: ['warn', 'smart'],
            curly: ['warn', 'multi-line'],
            'brace-style': ['warn', '1tbs', { allowSingleLine: true }],
            'comma-dangle': ['warn', 'never'],
            quotes: ['warn', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            indent: ['warn', 4, { SwitchCase: 1 }],
            'no-trailing-spaces': 'warn',
            'comma-spacing': ['warn', { before: false, after: true }],
            'key-spacing': ['warn', { beforeColon: false, afterColon: true }],
            'space-before-blocks': 'warn',
            'space-infix-ops': 'warn',
            'arrow-spacing': 'warn',
            'no-multiple-empty-lines': ['warn', { max: 2 }]
        }
    },
    // Web Worker specific configuration
    {
        files: ['**/*worker*.js', '**/worker/*.js', '**/workers/*.js'],
        languageOptions: {
            globals: {
                self: 'readonly',
                importScripts: 'readonly',
                postMessage: 'readonly',
                onmessage: 'writable',
                close: 'readonly',
                caches: 'readonly',
                clients: 'readonly',
                registration: 'readonly',
                skipWaiting: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly'
            }
        }
    },
    // Library-specific globals
    {
        files: ['**/braille-*.js', '**/liblouis/**/*.js'],
        languageOptions: {
            globals: {
                liblouis: 'readonly',
                Module: 'writable',
                self: 'readonly'
            }
        },
        rules: {
            'no-var': 'off',
            'no-redeclare': 'off',
            'prefer-const': 'off'
        }
    },
    // Pako library files
    {
        files: ['**/*save*.js', '**/*worker*.js'],
        languageOptions: {
            globals: {
                pako: 'readonly'
            }
        }
    },
    // Node.js test files
    {
        files: ['tests/**/*.js', 'test-*.js', '*.test.js', '*.spec.js'],
        languageOptions: {
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                global: 'readonly'
            }
        }
    },
    // Three.js and other libraries
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                THREE: 'readonly',
                SVG: 'readonly',
                opentype: 'readonly',
                dat: 'readonly'
            }
        }
    },
    // Disable some rules for third-party libraries
    {
        files: ['**/lib/**/*.js', '**/libs/**/*.js', '**/vendor/**/*.js'],
        rules: {
            'no-var': 'off',
            'prefer-const': 'off',
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'no-redeclare': 'off',
            eqeqeq: 'off',
            'no-prototype-builtins': 'off'
        }
    },
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'build/**',
            '*.min.js',
            'vendor/**',
            'libs/**',
            'third-party/**',
            'backup/**',
            'temp/**',
            'sign-template-maker/lib/**'
        ]
    }
];
