@echo off
title DEBUG BEAST - Slayer Suite Automated Debugger
color 0A
echo.
echo     🐛 DEBUG BEAST - Slayer Suite Automated Debugger
echo     ================================================
echo.
echo     Welcome to your automated debugging companion!
echo     This will test your Slayer Suite automatically.
echo.

REM Check if Node.js is installed
echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo     ❌ Node.js is not installed or not in PATH
    echo     Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo     ✅ Node.js found

REM Check if package.json exists
echo [2/5] Checking project files...
if not exist package.json (
    color 0C
    echo     ❌ package.json not found
    echo     Make sure you're running this from the correct directory
    pause
    exit /b 1
)
echo     ✅ Project files found

REM Install dependencies if node_modules doesn't exist
echo [3/5] Checking dependencies...
if not exist node_modules (
    echo     📦 Installing Playwright and dependencies...
    echo     This may take a moment on first run...
    npm install --silent
    if %errorlevel% neq 0 (
        color 0C
        echo     ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo     ✅ Dependencies installed
) else (
    echo     ✅ Dependencies ready
)

REM Check if browsers are installed
echo [4/5] Checking browser engines...
if not exist "%LOCALAPPDATA%\ms-playwright\chromium-*" (
    echo     📦 Installing Playwright browsers...
    echo     This only happens once and may take a few minutes...
    npx playwright install chromium --silent
    if %errorlevel% neq 0 (
        color 0C
        echo     ❌ Failed to install browser engines
        pause
        exit /b 1
    )
    echo     ✅ Browser engines installed
) else (
    echo     ✅ Browser engines ready
)

echo [5/5] Ready to debug!
echo.
echo     🌐 Make sure your Slayer Suite is running at:
echo        http://127.0.0.1:8000
echo.
echo     🔍 This will:
echo        • Open a browser automatically
echo        • Run comprehensive debugging tests  
echo        • Take screenshots
echo        • Generate detailed reports
echo        • Test app switching functionality
echo.
set /p "ready=Press Enter to start debugging (or Ctrl+C to cancel)..."

color 0E
echo.
echo     🚀 Starting DEBUG BEAST automation...
echo.

REM Run the debugging script
node automated-debug.js

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo     🎉 SUCCESS! Debugging completed successfully!
    echo.
    echo     📊 Your reports are ready:
    echo        • debug-reports\ folder - Detailed analysis
    echo        • debug-screenshots\ folder - Visual evidence
    echo.
    echo     📖 Check AUTOMATED-DEBUGGING-GUIDE.md for help
    echo.
) else (
    color 0C
    echo.
    echo     ❌ DEBUG BEAST encountered an error!
    echo     Check the console output above for details.
    echo.
)

echo     Press any key to exit...
pause >nul