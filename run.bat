@echo off
chcp 65001 >nul
echo ========================================
echo   Discord Team Script (Enhanced)
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Build TypeScript files
echo Building TypeScript files...
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
echo.

REM Run the script (reads config.yml automatically, no user input needed)
echo Starting script with config.yml settings...
echo.
node dist/test.js

REM Keep window open if there's an error
if errorlevel 1 (
    echo.
    echo Script ended with an error.
    pause
)
