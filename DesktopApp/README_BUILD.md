# Building Bet Automation Executable

## Quick Start

1. **Navigate to DesktopApp folder**
2. **Double-click `build.bat`**
3. **Wait for completion** (5-10 minutes)
4. **Find your executable**: `dist/BetAutomation.exe`

## What build.bat does:

1. ✅ **Installs dependencies** from requirements.txt
2. ✅ **Tests all dependencies** are available
3. ✅ **Builds executable** with PyInstaller
4. ✅ **Creates single .exe file** (no Python required)

## Files Created:

- **`dist/BetAutomation.exe`** - Main executable
- **`installer.nsi`** - NSIS installer script (optional)

## Configuration:

- **Server addresses are hardcoded** - No config.json needed
- **HTTP URL**: `http://localhost:3000`
- **WebSocket URL**: `ws://localhost:8080`
- **macro_config.json** - Created automatically for position settings

## Troubleshooting:

**If build fails:**
- Check Python is installed and in PATH
- Run as Administrator if permission errors
- Check internet connection for package downloads

**If executable doesn't work:**
- Test on clean machine without Python
- Check antivirus isn't blocking it
- Ensure assets folder is included

## Manual Build (if needed):

```bash
pip install -r requirements.txt
python test_dependencies.py
python fix_build.py
``` 