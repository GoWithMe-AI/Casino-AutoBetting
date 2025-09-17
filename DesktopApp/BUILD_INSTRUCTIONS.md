# Building Bet Automation Executable

This guide will help you create an executable (.exe) file and installer for the Bet Automation application.

## Prerequisites

1. **Python 3.8+** installed on your system
2. **All dependencies** installed (run `pip install -r requirements.txt`)
3. **Windows OS** (for .exe creation)

## Method 1: Quick Build (Recommended)

### Step 1: Run the Build Script
```bash
# Navigate to DesktopApp directory
cd DesktopApp

# Run the automated build script
python build_exe.py
```

Or simply double-click `build.bat` for a GUI-friendly approach.

### Step 2: Find Your Executable
After successful build, you'll find:
- **Executable**: `dist/BetAutomation.exe`
- **Installer Script**: `installer.nsi`

## Method 2: Manual PyInstaller Build

### Step 1: Install PyInstaller
```bash
pip install pyinstaller
```

### Step 2: Build Executable
```bash
# Navigate to DesktopApp directory
cd DesktopApp

# Build single executable
pyinstaller --onefile --windowed --name=BetAutomation --add-data="assets;assets" main.py
```

### Step 3: Advanced Build with Custom Spec
```bash
# Create spec file first
pyi-makespec --onefile --windowed --name=BetAutomation main.py

# Edit the spec file to add data files and hidden imports
# Then build using spec
pyinstaller BetAutomation.spec
```

## Method 3: Create Installer

### Option A: Using NSIS (Professional)

1. **Install NSIS**: Download from https://nsis.sourceforge.io/
2. **Compile Installer**: Right-click `installer.nsi` → "Compile NSIS Script"
3. **Result**: `BetAutomation_Setup.exe`

### Option B: Using Inno Setup

1. **Install Inno Setup**: Download from https://jrsoftware.org/isinfo.php
2. **Create Script**: Use the provided `installer.iss` file
3. **Compile**: Run Inno Setup Compiler

### Option C: Simple ZIP Distribution

1. **Create ZIP**: Package `dist/BetAutomation.exe` + `assets/` folder
2. **Include Config**: Add `macro_config.json` if you have saved settings
3. **Distribute**: Share the ZIP file

## Build Options

### Console vs Windowed
- **Windowed** (default): No console window - use `--windowed`
- **Console**: Shows console for debugging - use `--console`

### Single File vs Directory
- **Single File**: One .exe file - use `--onefile`
- **Directory**: Multiple files - use `--onedir`

### Optimization
- **UPX Compression**: Smaller file size - use `--upx-dir=path/to/upx`
- **Debug Info**: Include debug info - use `--debug=all`

## Troubleshooting

### Common Issues

1. **Missing Dependencies**
   ```bash
   # Reinstall all dependencies
   pip install -r requirements.txt
   ```

2. **Large File Size**
   ```bash
   # Use UPX compression
   pyinstaller --onefile --upx-dir=path/to/upx main.py
   ```

3. **Missing Assets**
   ```bash
   # Ensure assets are included
   pyinstaller --add-data="assets;assets" main.py
   ```

4. **Import Errors**
   ```bash
   # Add hidden imports
   pyinstaller --hidden-import=module_name main.py
   ```

### File Size Optimization

1. **Exclude Unused Modules**
   ```bash
   pyinstaller --exclude-module=unused_module main.py
   ```

2. **Use Virtual Environment**
   ```bash
   # Create clean environment
   python -m venv build_env
   build_env\Scripts\activate
   pip install -r requirements.txt
   pyinstaller main.py
   ```

## Distribution

### What to Include
- `BetAutomation.exe` (main executable)
- `assets/` folder (images and resources)
- `macro_config.json` (if you have saved configurations)
- `README.txt` (usage instructions)

### What NOT to Include
- Python source files (.py)
- Virtual environment folders
- Build artifacts (dist/, build/, *.spec)
- Development files

## Testing

### Before Distribution
1. **Test on Clean Machine**: Install on computer without Python
2. **Test All Features**: Ensure all functionality works
3. **Test Config Loading**: Verify saved configurations load correctly
4. **Test Assets**: Ensure all images and resources display properly

### Common Test Scenarios
- Login functionality
- Position configuration
- Bet placement
- Configuration saving/loading
- Multi-monitor support

## Advanced Configuration

### Custom Icon
```bash
pyinstaller --icon=assets/icon.ico main.py
```

### Version Information
Create `version_info.txt`:
```
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=(1, 0, 0, 0),
    prodvers=(1, 0, 0, 0),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        u'040904B0',
        [StringStruct(u'CompanyName', u'Your Company'),
         StringStruct(u'FileDescription', u'Bet Automation Tool'),
         StringStruct(u'FileVersion', u'1.0.0'),
         StringStruct(u'InternalName', u'BetAutomation'),
         StringStruct(u'LegalCopyright', u'Copyright (c) 2024'),
         StringStruct(u'OriginalFilename', u'BetAutomation.exe'),
         StringStruct(u'ProductName', u'Bet Automation'),
         StringStruct(u'ProductVersion', u'1.0.0')])
    ]),
    VarFileInfo([VarStruct(u'Translation', [1033, 1200])])
  ]
)
```

Then use:
```bash
pyinstaller --version-file=version_info.txt main.py
```

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all dependencies are installed
3. Test with a clean virtual environment
4. Check PyInstaller documentation: https://pyinstaller.org/

## Notes

- The executable will be larger than the source code due to included Python runtime
- First run may be slower as files are extracted
- Antivirus software may flag the executable (false positive)
- Consider code signing for professional distribution 