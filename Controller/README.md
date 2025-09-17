# Bet Automation Controller

This is the controller application for the automated betting system. It provides a web interface to control betting operations on connected PCs.

## Features

- Real-time WebSocket connection to Chrome extensions
- Platform: Pragmatic only
- PC selection (PC1/PC2)
- Amount selection (1K, 25K, 50K, 100K)
- Side selection (Player/Banker)
- Automatic opposite betting on successful bets
- Activity logging

## Installation

1. Install Node.js (version 14 or higher)
2. Navigate to the Controller directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Running the Controller

1. Start the server:
   ```bash
   npm start
   ```
2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## How It Works

1. The controller runs a WebSocket server on port 8080
2. Chrome extensions connect to this WebSocket server
3. When you place a bet through the controller:
   - The command is sent to the selected PC's extension
   - The extension performs the bet on the casino website
   - On success, it sends a confirmation back
   - The controller automatically triggers the opposite bet on the other PC

## Configuration

- HTTP Server Port: 3000
- WebSocket Port: 8080

To change these ports, edit the `server.js` file.

## Troubleshooting

- Make sure both PC extensions are connected before placing bets
- Check the browser console for any errors
- Ensure the WebSocket port (8080) is not blocked by firewall
