# Bet Automation Chrome Extension

This Chrome extension connects to the Bet Automation Controller and executes betting commands on casino websites.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `Extension` directory
5. The extension should now appear with a "not-recording" icon

## How It Works

### Connection Toggle

1. **Click to Connect**: Click the extension icon (not-recording.png) to connect
2. **Icon Changes**: Icon changes to recording.png when connected
3. **Click to Disconnect**: Click the icon again to disconnect
4. **Icon Reverts**: Icon changes back to not-recording.png

### Automatic PC Assignment

- **First connection** → Automatically assigned as **PC1**
- **Second connection** → Automatically assigned as **PC2**
- **Third connection** → Rejected (only 2 PCs supported)

### Betting Flow

1. The extension maintains a WebSocket connection to the controller
2. When a bet command is received, it:
   - Clicks the appropriate chip amount button
   - Clicks the betting area (Player or Banker)
   - Reports success back to the controller
3. On successful bet, the controller automatically triggers the opposite bet on the other PC

## Icons

- `icons/not-recording.png` - Shown when disconnected (click to connect)
- `icons/recording.png` - Shown when connected (click to disconnect)

## Supported Elements

The extension looks for these elements on the casino website:

- Chip buttons: `button[data-testid="chip-stack-value-{amount}"]`
- Player bet area: `#leftBetTextRoot`
- Banker bet area: `#rightBetTextRoot`

## Troubleshooting

- Open Chrome DevTools (F12) and check the Console for connection status
- Make sure the controller server is running on `ws://localhost:8080`
- Verify the betting elements exist on the casino page
- If connection is lost, the extension will auto-reconnect
- To manually disconnect, click the recording icon

## Security Note

This extension requires broad permissions to work on casino websites. Only use it on trusted sites and ensure you understand the risks of automated betting.
