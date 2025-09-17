# Bet Automation - Macro Interface

This desktop application now supports a modern macro-like interface for position-based betting automation. Users can manually select positions for betting areas and chips instead of relying on image recognition.

## Features

### 🎯 Position-Based Betting
- **Manual Position Selection**: Click to select exact positions for Player bet area, Banker bet area, and cancel button
- **Custom Chip Management**: Add unlimited custom chip amounts with their positions
- **Settings Persistence**: All positions are automatically saved and restored

### 🔄 Dual Mode Support
- **Macro Mode**: Uses saved positions for fast, reliable clicking
- **Image Recognition Mode**: Traditional template matching (fallback option)

### 🎨 Modern Interface
- Clean, intuitive UI with visual feedback
- Real-time status updates
- Easy configuration management

## Getting Started

### 1. Launch the Application
```bash
cd DesktopApp
python start.py
```

**Or launch directly:**
```bash
cd DesktopApp
python main.py
```

**Note:** The `start.py` script checks for missing assets and provides guidance before launching.

### 2. Login
- Enter your username and password
- Select your preferred monitor
- Choose "Macro (Position-based)" mode

### 3. Configure Positions
1. Click "Configure Positions" button
2. A configuration window will open
3. For each area, click "Select Position" then click on the screen where you want to place it:
   - **Player Bet Area**: Click where you want to place Player bets
   - **Banker Bet Area**: Click where you want to place Banker bets
   - **Cancel Button**: Click the cancel button location
   - **Chips**: Add custom chip amounts and their positions

### 4. Add Custom Chips
- Click "+ Add Custom Chip" to add new chip amounts
- Enter the chip amount when prompted
- Click on the screen where that chip appears
- Repeat for all chip amounts you want to use

### 5. Save Configuration
- Click "Save Configuration" when all positions are set
- The app will remember your settings for future use

## Usage

### Placing Bets
Once configured, the app will automatically:
1. Click the appropriate chip(s) to reach the desired amount
2. Click the selected bet area (Player or Banker)
3. Handle chip composition for amounts not available as single chips

### Testing
- Use "Test Chip Click" to verify your chip positions
- Enter any chip amount to test clicking

### Switching Modes
- Toggle between "Macro" and "Image Recognition" modes
- Macro mode uses saved positions (faster, more reliable)
- Image Recognition mode uses template matching (fallback)

## Configuration Files

### macro_config.json
Automatically created and managed by the application:
```json
{
  "positions": {
    "player_area": {"x": 100, "y": 200, "width": 50, "height": 50, "name": ""},
    "banker_area": {"x": 300, "y": 200, "width": 50, "height": 50, "name": ""},
    "cancel_button": {"x": 500, "y": 400, "width": 50, "height": 50, "name": ""}
  },
  "chips": [
    {"amount": 1000, "position": {"x": 50, "y": 500, "width": 50, "height": 50, "name": "chip_1000"}},
    {"amount": 25000, "position": {"x": 120, "y": 500, "width": 50, "height": 50, "name": "chip_25000"}}
  ]
}
```

## Advantages of Macro Mode

### Speed
- No image processing delays
- Instant position lookup
- Faster bet placement

### Reliability
- No dependency on screen resolution changes
- Works regardless of game UI updates
- Consistent performance

### Flexibility
- Support for any chip amounts
- Easy to add new positions
- Works with any game layout

## Troubleshooting

### Missing Asset Files
If you see errors about missing asset files:
1. Run `python check_assets.py` to see what's missing
2. Add the missing files to the assets/ directory
3. Or use the macro interface which doesn't require these files
4. Use `python start.py` for guided startup

### Position Not Working
1. Reconfigure positions if game layout changes
2. Ensure you're on the correct monitor
3. Check that positions are within screen bounds

### Chip Not Found
1. Add the missing chip amount in configuration
2. Verify the chip position is correct
3. Test individual chip clicks

### Configuration Issues
1. Delete `macro_config.json` to reset
2. Reconfigure all positions
3. Ensure all required areas are set

### Application Won't Start
1. Check Python version (3.8+ required)
2. Install requirements: `pip install -r requirements.txt`
3. Run setup: `python setup.py`
4. Use startup script: `python start.py`

## Tips for Best Results

1. **Precise Positioning**: Click exactly on the center of each area
2. **Complete Configuration**: Set all required positions before using
3. **Test First**: Use the test function to verify positions
4. **Monitor Selection**: Ensure you're on the correct monitor
5. **Game State**: Make sure you're on the betting screen when configuring

## Technical Details

### Architecture
- **MacroInterface**: Handles position selection and storage
- **MacroBaccarat**: Implements betting logic using saved positions
- **Position Management**: Automatic saving/loading of configurations
- **Dual Mode Support**: Seamless switching between macro and image recognition

### Performance
- Position lookup: O(1) for exact matches
- Chip composition: Dynamic programming algorithm
- Configuration persistence: JSON-based storage

This macro interface provides a modern, reliable alternative to image recognition while maintaining compatibility with the existing system. 