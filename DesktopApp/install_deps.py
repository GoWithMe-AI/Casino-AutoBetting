#!/usr/bin/env python3
"""
Install missing dependencies for Bet Automation
"""

import subprocess
import sys

def install_missing_deps():
    """Install missing dependencies"""
    print("=== Installing Missing Dependencies ===")
    
    # Install all dependencies
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✓ All dependencies installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing dependencies: {e}")
        return False

if __name__ == "__main__":
    install_missing_deps() 