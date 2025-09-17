#!/usr/bin/env python3
"""
Fix build script for Bet Automation
Rebuilds the executable with proper dependency inclusion
"""

import os
import sys
import subprocess
import shutil

def clean_build():
    """Clean previous build artifacts"""
    print("Cleaning previous build artifacts...")
    
    dirs_to_clean = ['build', 'dist', '__pycache__']
    files_to_clean = ['*.spec']
    
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
            print(f"✓ Removed {dir_name}/")
    
    for pattern in files_to_clean:
        for file in os.listdir('.'):
            if file.endswith('.spec'):
                os.remove(file)
                print(f"✓ Removed {file}")



def rebuild_executable():
    """Rebuild the executable with proper dependencies"""
    print("Rebuilding executable with comprehensive dependencies...")
    
    # Build command without config file (hardcoded addresses)
    cmd = [
        'pyinstaller',
        '--onefile',
        '--windowed',
        '--name=BetAutomation',
        '--add-data=assets;assets',
    ]
    
    # Add all hidden imports
    cmd.extend([
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
        '--collect-all=websockets',
        'main.py'
    ])
    
    try:
        subprocess.check_call(cmd)
        print("✓ Executable rebuilt successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error rebuilding executable: {e}")
        return False

def main():
    """Main fix process"""
    print("=== Bet Automation Build Fix ===")
    print("This will rebuild the executable with proper dependencies")
    print()
    
    # Check if we're in the right directory
    if not os.path.exists('main.py'):
        print("❌ Error: main.py not found. Please run this script from the DesktopApp directory.")
        return
    
    # Step 1: Clean previous build
    clean_build()
    
    # Step 2: Rebuild executable
    if rebuild_executable():
        print("\n=== Build Complete ===")
        print("✅ Executable built successfully!")
        print("📁 New executable: dist/BetAutomation.exe")
        print("\nTo test:")
        print("1. Go to dist/ folder")
        print("2. Run BetAutomation.exe")
    else:
        print("\n❌ Build failed. Please check the error messages above.")

if __name__ == "__main__":
    main() 