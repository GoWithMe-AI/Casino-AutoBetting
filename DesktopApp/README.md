# Bet Automation Desktop App (Pragmatic Baccarat)

This Windows desktop app mirrors the Chrome extension functionality using screen recognition. It connects to the Controller, listens for bet commands, and places bets by clicking on-screen elements.

## Features (MVP)
- Login window (same credentials as Controller)
- WebSocket client to Controller (hello → assignment → register → listen for placeBet/cancelBet)
- Screen recognition via OpenCV templates:
  - Detect chip buttons (provided assets)
  - Detect Player/Banker bet areas (provided assets)
  - Detect non-betting state via lack of enabled chips (heuristic)
- Input automation with PyAutoGUI
- Sends betSuccess/betError back to Controller

## Requirements
- Windows 10
- Python 3.10+
- Main monitor hosts the browser with the game visible

## Install
```
cd DesktopApp
python -m venv .venv
. .venv\Scripts\activate
pip install -r requirements.txt
```

## Run
```
python main.py
```

## Configure
Edit `config.json`:
- `controller.ws_url`: WebSocket endpoint (e.g., ws://localhost:8080/)
- `controller.http_url`: HTTP base for login (e.g., http://localhost:3000)
- `templates`: paths and thresholds for the chip and bet area templates

## Provide Assets
Place the following template images in `assets/`:
- chips: PNGs for each value you plan to use (e.g., 1000.png, 25000.png ...)
- player_area.png
- banker_area.png
- cancel_button.png (optional for now)

Tips:
- Use 1:1 screenshots at your actual resolution/DPI.
- Transparent background preferred. Keep only the essential visual.

## Usage Flow
1) Login with Controller credentials.
2) The app connects to Controller WS and registers as PC1/PC2.
3) When a bet arrives, the app:
   - Ensures game window is foreground
   - Finds chip(s) on screen (composes amount if exact chip not present)
   - Clicks Player/Banker area accordingly
   - Reports success or detailed error
4) Cancel command clicks the undo/cancel button repeatedly (when asset provided).

## Notes
- This MVP supports Pragmatic Live Baccarat only.
- Evolution and other platforms can be added by supplying additional templates and site profiles.

## Build (optional)
Use PyInstaller to package into an EXE:
```
pyinstaller --noconsole --onefile --name BetAutomation main.py
``` 