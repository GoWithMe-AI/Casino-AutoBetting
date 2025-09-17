@echo off
echo === Bet Automation Build Process ===
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if we're in the right directory
if not exist "main.py" (
    echo Error: main.py not found. Please run this script from the DesktopApp directory.
    pause
    exit /b 1
)

echo Step 1: Installing dependencies...
pip install -r requirements.txt

if errorlevel 1 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Step 2: Testing dependencies...
python test_dependencies.py

if errorlevel 1 (
    echo Error: Some dependencies are missing
    pause
    exit /b 1
)

echo.
echo Step 3: Building executable...
python fix_build.py

echo.
echo Build process completed!
echo Check the dist/ folder for your executable.
pause 