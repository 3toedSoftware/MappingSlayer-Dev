#!/usr/bin/env node

/**
 * Claude Code Toolbelt Display
 * Shows all available tools and services when starting CC
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execPromise = util.promisify(exec);

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

async function checkNodeProcesses() {
    try {
        const { stdout } = await execPromise('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
        const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
        return lines.length;
    } catch {
        return 0;
    }
}

async function checkPort(port) {
    try {
        const { stdout } = await execPromise(`netstat -an | findstr :${port}`);
        return stdout.includes('LISTENING');
    } catch {
        return false;
    }
}

async function checkMCPServers() {
    const configPath = path.join(process.cwd(), '.claude', 'claude.json');
    const servers = [];

    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.mcpServers) {
                for (const [name, server] of Object.entries(config.mcpServers)) {
                    servers.push({
                        name,
                        command: server.command || 'N/A',
                        status: '✅ Configured'
                    });
                }
            }
        }
    } catch (e) {
    // Silent fail
    }

    return servers;
}

async function getPermissionsCount() {
    const settingsPath = path.join(process.cwd(), '.claude', 'settings.local.json');
    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            return settings.permissions?.allow?.length || 0;
        }
    } catch {
        return 0;
    }

    return 0;
}

async function displayToolbelt() {
    console.clear();

    console.log(colors.cyan + colors.bright + `
╔══════════════════════════════════════════════════════════════╗
║                  🚀 CLAUDE CODE TOOLBELT                     ║
║                    Mapping Slayer Edition                    ║
╚══════════════════════════════════════════════════════════════╝` + colors.reset);

    console.log(colors.yellow + '\n📦 CORE TOOLS:' + colors.reset);
    console.log('  ✅ File Operations (Read, Write, Edit, MultiEdit)');
    console.log('  ✅ Search Tools (Grep, Glob, WebSearch)');
    console.log('  ✅ Bash Terminal (Background processes supported)');
    console.log('  ✅ Git Operations (commit, branch, push)');
    console.log('  ✅ Web Tools (WebFetch, WebSearch)');
    console.log('  ✅ Todo Management (TodoWrite)');
    console.log('  ✅ Notebook Editor (Jupyter support)');

    // Check MCP Servers
    const mcpServers = await checkMCPServers();
    console.log(colors.magenta + '\n🔌 MCP SERVERS:' + colors.reset);
    if (mcpServers.length > 0) {
        mcpServers.forEach(server => {
            console.log(`  ${server.status} ${colors.bright}${server.name}${colors.reset}`);
            if (server.name === 'playwright') {
                console.log('     └─ Browser automation, screenshots, testing');
            } else if (server.name === 'chrome-devtools') {
                console.log('     └─ Console access, debugging, DOM inspection');
            }
        });
    } else {
        console.log('  ℹ️  No local MCP config found (check global ~/.claude/claude.json)');
        console.log(colors.dim + '  Note: MCP servers configured globally still work!' + colors.reset);
    }

    // Check Playwright specific tools
    console.log(colors.blue + '\n🎭 PLAYWRIGHT TOOLS:' + colors.reset);
    console.log('  ✅ Navigate & Screenshots');
    console.log('  ✅ Click, Type & Form Filling');
    console.log('  ✅ Drag & Drop Operations');
    console.log('  ✅ Network & Console Monitoring');
    console.log('  ✅ Multi-tab & Dialog Handling');
    console.log('  ✅ JavaScript Execution');

    // Check running services
    console.log(colors.green + '\n⚡ SERVICES:' + colors.reset);

    const nodeCount = await checkNodeProcesses();
    const port8080 = await checkPort(8080);
    const port9222 = await checkPort(9222);
    const port8000 = await checkPort(8000);

    console.log(`  ${nodeCount > 0 ? '🟢' : '⚫'} Node processes: ${nodeCount} running`);
    console.log(`  ${port8080 ? '🟢' : '⚫'} Dev server (8080): ${port8080 ? 'Active' : 'Not running'}`);
    console.log(`  ${port9222 ? '🟢' : '⚫'} Chrome DevTools (9222): ${port9222 ? 'Active' : 'Not running'}`);
    console.log(`  ${port8000 ? '🟢' : '⚫'} Alt server (8000): ${port8000 ? 'Active' : 'Not running'}`);

    // Check permissions
    const permCount = await getPermissionsCount();
    console.log(colors.cyan + '\n🔐 PERMISSIONS:' + colors.reset);
    console.log(`  ✅ ${permCount} auto-approved tool patterns`);
    console.log('  ✅ Playwright MCP fully authorized');
    console.log('  ✅ Web domains: docs.anthropic.com, github.com, MDN, etc.');

    // Project specific features
    console.log(colors.yellow + '\n🎯 MAPPING SLAYER FEATURES:' + colors.reset);
    console.log('  ✅ Sidekick AI Interface (window.sidekick)');
    console.log('  ✅ LibLouis Braille Translator');
    console.log('  ✅ PDF Processing & OCR (Tesseract)');
    console.log('  ✅ Canvas Rendering (Three.js)');
    console.log('  ✅ Automated Testing Suite');

    // Quick commands
    console.log(colors.bright + '\n⚡ QUICK COMMANDS:' + colors.reset);
    console.log(colors.dim + '  npm run dev          - Start dev server');
    console.log('  npm test             - Run test suite');
    console.log('  npm run lint         - Check code quality');
    console.log('  node show-toolbelt   - Show this display' + colors.reset);

    // Display info
    console.log(colors.dim + '\n📋 DISPLAY INFO:' + colors.reset);
    console.log(colors.dim + '  • Dynamic: MCP servers, permissions, running services');
    console.log('  • Hardcoded: Core tools, Playwright tools, MS features');
    console.log('  • To discover new tools: Ask "What new tools are available?"' + colors.reset);

    console.log(colors.green + colors.bright + '\n✨ Ready to code!' + colors.reset);
    console.log(colors.dim + '─'.repeat(64) + colors.reset + '\n');
}

// Run the display
displayToolbelt().catch(console.error);