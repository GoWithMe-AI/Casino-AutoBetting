#!/usr/bin/env python3
"""
Build script for Bet Automation Desktop App
Creates an executable (.exe) file using PyInstaller
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def install_pyinstaller():
    """Install PyInstaller if not already installed"""
    try:
        import PyInstaller
        print("✓ PyInstaller is already installed")
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
        print("✓ PyInstaller installed successfully")

def create_spec_file():
    """Create PyInstaller spec file"""
    spec_content = '''# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('assets', 'assets'),  # Include assets folder
        ('macro_config.json', '.'),  # Include macro config file if exists
    ],
    hiddenimports=[
        'tkinter',
        'tkinter.ttk',
        'tkinter.messagebox',
        'tkinter.simpledialog',
        'websockets',
        'websockets.client',
        'websockets.server',
        'websockets.protocol',
        'requests',
        'requests.adapters',
        'requests.auth',
        'requests.cookies',
        'requests.models',
        'requests.sessions',
        'requests.structures',
        'requests.utils',
        'urllib3',
        'urllib3.util',
        'urllib3.packages',
        'urllib3.packages.ssl_match_hostname',
        'urllib3.packages.backports.makefile',
        'certifi',
        'chardet',
        'idna',
        'numpy',
        'cv2',
        'mss',
        'pyautogui',
        'PIL',
        'PIL.Image',
        'PIL.ImageTk',
        'win32api',
        'win32con',
        'win32gui',
        'win32process',
        'win32security',
        'win32event',
        'win32file',
        'win32timezone',
        'json',
        'os',
        'threading',
        'time',
        'dataclasses',
        'enum',
        'typing',
        'asyncio',
        'ssl',
        'socket',
        'hashlib',
        'base64',
        'zlib',
        'gzip',
        'http',
        'http.client',
        'http.cookiejar',
        'http.cookies',
        'urllib',
        'urllib.parse',
        'urllib.request',
        'urllib.error',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='BetAutomation',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Set to True if you want console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico' if os.path.exists('assets/icon.ico') else None,
)
'''
    
    with open('bet_automation.spec', 'w') as f:
        f.write(spec_content)
    print("✓ Created PyInstaller spec file")

def build_executable():
    """Build the executable using PyInstaller"""
    print("Building executable...")
    
    # Use the spec file
    if os.path.exists('bet_automation.spec'):
        subprocess.check_call(['pyinstaller', 'bet_automation.spec', '--clean'])
    else:
        # Fallback to direct command with comprehensive imports
        subprocess.check_call([
            'pyinstaller',
            '--onefile',
            '--windowed',
            '--name=BetAutomation',
            '--add-data=assets;assets',

            '--hidden-import=tkinter',
            '--hidden-import=tkinter.ttk',
            '--hidden-import=tkinter.messagebox',
            '--hidden-import=tkinter.simpledialog',
            '--hidden-import=websockets',
            '--hidden-import=websockets.client',
            '--hidden-import=websockets.server',
            '--hidden-import=requests',
            '--hidden-import=requests.adapters',
            '--hidden-import=requests.auth',
            '--hidden-import=requests.cookies',
            '--hidden-import=requests.models',
            '--hidden-import=requests.sessions',
            '--hidden-import=urllib3',
            '--hidden-import=certifi',
            '--hidden-import=chardet',
            '--hidden-import=idna',
            '--hidden-import=numpy',
            '--hidden-import=cv2',
            '--hidden-import=mss',
            '--hidden-import=pyautogui',
            '--hidden-import=PIL',
            '--hidden-import=PIL.Image',
            '--hidden-import=PIL.ImageTk',
            '--hidden-import=win32api',
            '--hidden-import=win32con',
            '--hidden-import=win32gui',
            '--hidden-import=asyncio',
            '--hidden-import=ssl',
            '--hidden-import=socket',
            '--hidden-import=http.client',
            '--hidden-import=urllib.parse',
            '--collect-all=requests',
            '--collect-all=urllib3',
            '--collect-all=certifi',
            'main.py'
        ])
    
    print("✓ Executable built successfully")

def create_installer():
    """Create a simple installer using NSIS (if available)"""
    nsis_script = '''
!include "MUI2.nsh"

Name "Bet Automation"
OutFile "BetAutomation_Setup.exe"
InstallDir "$PROGRAMFILES\\BetAutomation"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
    SetOutPath "$INSTDIR"
    File "dist\\BetAutomation.exe"
    File "macro_config.json"
    
    CreateDirectory "$INSTDIR\\assets"
    SetOutPath "$INSTDIR\\assets"
    File /r "assets\\*"
    
    WriteUninstaller "$INSTDIR\\Uninstall.exe"
    
    CreateDirectory "$SMPROGRAMS\\BetAutomation"
    CreateShortCut "$SMPROGRAMS\\BetAutomation\\BetAutomation.lnk" "$INSTDIR\\BetAutomation.exe"
    CreateShortCut "$SMPROGRAMS\\BetAutomation\\Uninstall.lnk" "$INSTDIR\\Uninstall.exe"
    CreateShortCut "$DESKTOP\\BetAutomation.lnk" "$INSTDIR\\BetAutomation.exe"
    
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetAutomation" "DisplayName" "Bet Automation"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetAutomation" "UninstallString" "$INSTDIR\\Uninstall.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\\BetAutomation.exe"
    Delete "$INSTDIR\\macro_config.json"
    RMDir /r "$INSTDIR\\assets"
    Delete "$INSTDIR\\Uninstall.exe"
    RMDir "$INSTDIR"
    
    Delete "$SMPROGRAMS\\BetAutomation\\BetAutomation.lnk"
    Delete "$SMPROGRAMS\\BetAutomation\\Uninstall.lnk"
    RMDir "$SMPROGRAMS\\BetAutomation"
    Delete "$DESKTOP\\BetAutomation.lnk"
    
    DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetAutomation"
SectionEnd
'''
    
    with open('installer.nsi', 'w') as f:
        f.write(nsis_script)
    print("✓ Created NSIS installer script")

def main():
    """Main build process"""
    print("=== Bet Automation Build Process ===")
    
    # Check if we're in the right directory
    if not os.path.exists('main.py'):
        print("❌ Error: main.py not found. Please run this script from the DesktopApp directory.")
        return
    
    # Test dependencies first
    try:
        from test_dependencies import test_dependencies
        if not test_dependencies():
            print("\n❌ Build aborted due to missing dependencies.")
            print("Please install missing dependencies and try again.")
            return
    except ImportError:
        print("⚠️ Warning: Could not run dependency test. Continuing with build...")
    
    # Install PyInstaller
    install_pyinstaller()
    
    # Create spec file
    create_spec_file()
    
    # Build executable
    build_executable()
    
    # Create installer script
    create_installer()
    
    print("\n=== Build Complete ===")
    print("✓ Executable created: dist/BetAutomation.exe")
    print("✓ Installer script created: installer.nsi")
    print("\nTo create an installer:")
    print("1. Install NSIS (https://nsis.sourceforge.io/)")
    print("2. Right-click installer.nsi and select 'Compile NSIS Script'")
    print("3. This will create BetAutomation_Setup.exe")
    
    print("\nTo run the executable:")
    print("1. Go to dist/ folder")
    print("2. Run BetAutomation.exe")
    print("3. Copy macro_config.json to the same folder if you have saved configurations")

if __name__ == "__main__":
    main() 