const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Load users
const USERS_FILE = path.join(__dirname, 'users.json');
let USERS = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2), 'utf8');
}

function authAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Missing token' });
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload || payload.user !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  req.authUser = payload.user;
  next();
}

const JWT_SECRET = process.env.JWT_SECRET || 'INSECURE_DEV_SECRET_CHANGE_ME';

function generateAccessToken(user) {
  return jwt.sign({ user }, JWT_SECRET, { expiresIn: '1h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Route for new game
app.get('/new-game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'new-game.html'));
});

// Redirect root to login page to avoid loading controller without auth
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Create HTTP server first
const server = require('http').createServer(app);

// WebSocket server attached to HTTP server for Railway compatibility
// Both HTTP and WebSocket run on the same port for Railway deployment
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();
const assignedPCs = new Set(); // Track which PC names are assigned
const statusListeners = new Set(); // Track connections that want status updates
const adminConnections = new Set(); // Track admin WebSocket connections
const HEARTBEAT_INTERVAL = 30000; // 30 seconds - more tolerant

// New: room structure per user
const rooms = new Map(); // user -> {clients,map}

function getRoom(user) {
  if (!rooms.has(user)) {
    rooms.set(user, {
      clients: new Map(), // clientId -> clientData
      assignedPCs: new Set(),
      statusListeners: new Set(),
    });
  }
  return rooms.get(user);
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  // Generate unique client ID
  const clientId = Date.now().toString();

  let room = null;
  let clientUser = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);

      // Auth gate: expect first message type hello with token
      if (!clientUser) {
        if (data.type !== 'hello' && data.type !== 'admin_hello') {
          ws.close();
          return;
        }
        
        if (!data.token) {
          ws.close();
          return;
        }
        
        const payload = verifyToken(data.token);
        if (!payload) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
          ws.close();
          return;
        }
        
        // Handle admin connections
        if (data.type === 'admin_hello' && payload.user === 'admin') {
          adminConnections.add(ws);
          console.log('Admin WebSocket connected');
          ws.send(JSON.stringify({ type: 'admin_connected' }));
          return;
        }
        
        // Check license status
        const userRecord = USERS[payload.user];
        if (userRecord) {
          const currentDate = new Date().toISOString().split('T')[0];
          
          // Check if user has no license
          if (!userRecord.licenseEndDate) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'No license found. Please contact administrator to purchase a license.',
              noLicense: true 
            }));
            ws.close();
            return;
          }
          
          // Check if license is expired
          if (currentDate > userRecord.licenseEndDate) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'License expired. Please contact administrator to renew your license.',
              licenseExpired: true 
            }));
            ws.close();
            return;
          }
        }
        
        clientUser = payload.user;
        room = getRoom(clientUser);
        
        // Broadcast user login status change to admin
        broadcastUserStatusChange(clientUser, true);
        
        // proceed; do not process further this initial hello
        return;
      }

      // Handle pong from client for heartbeat
      if (data.type === 'pong') {
        if (room && room.clients.has(clientId)) {
          room.clients.get(clientId).isAlive = true;
        }
        return; // no further processing
      }

      // Handle status listener registration
      if (data.type === 'registerStatusListener') {
        if (!room) return;
        room.statusListeners.add(ws);
        console.log('Registered status listener');
        // Send current status immediately
        sendStatusToClientRoom(ws, room);
      }

      // Handle PC assignment request
      if (data.type === 'requestAssignment') {
        let assignedPC = null;

        // Assign PC1 if available, otherwise PC2 within room
        if (!room.assignedPCs.has('PC1')) {
          assignedPC = 'PC1';
        } else if (!room.assignedPCs.has('PC2')) {
          assignedPC = 'PC2';
        } else {
          // Both PCs are taken
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Both PC slots are occupied' + JSON.stringify(room),
            }),
          );
          ws.close();
          return;
        }

        // Mark PC as assigned; store on ws in case registration never arrives
        room.assignedPCs.add(assignedPC);
        ws.tempAssignedPC = assignedPC;

        // Send assignment to client
        ws.send(
          JSON.stringify({
            type: 'assignment',
            pc: assignedPC,
          }),
        );

        console.log(`Assigned ${assignedPC} to client ${clientId}`);
        broadcastStatus(room);
      }

      // Handle client registration
      if (data.type === 'register') {
        room.clients.set(clientId, {
          ws: ws,
          pc: data.pc,
          id: clientId,
          isAlive: true,
        });

        ws.send(
          JSON.stringify({
            type: 'registered',
            clientId: clientId,
            pc: data.pc,
          }),
        );

        console.log(`${data.pc} registered`);
        broadcastStatus(room);
        // registration complete; clear provisional flag
        delete ws.tempAssignedPC;
      }

      // Handle bet error
      if (data.type === 'betError') {
        console.log(`Bet error from ${data.pc}:`, data.message);
        console.log('Error details:', {
          errorType: data.errorType,
          errorDetails: data.errorDetails,
          availableChips: data.availableChips,
          triedSelectors: data.triedSelectors,
          chipValue: data.chipValue,
          timestamp: data.timestamp
        });

        // Broadcast error to all status listeners
        room.statusListeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(
              JSON.stringify({
                type: 'betError',
                pc: data.pc,
                message: data.message,
                platform: data.platform,
                amount: data.amount,
                side: data.side,
                errorType: data.errorType,
                errorDetails: data.errorDetails,
                availableChips: data.availableChips,
                triedSelectors: data.triedSelectors,
                chipValue: data.chipValue,
                timestamp: data.timestamp
              }),
            );
          }
        });

        // Handle bet failure for simultaneous betting
        const activeBet = activeBets.get(room.id);
        if (activeBet) {
          // Mark this PC as failed
          activeBet[data.pc] = { status: 'failed', error: data.message, errorType: data.errorType };
          
          // Cancel the opposite PC's bet if it's still pending
          const oppositePC = data.pc === 'PC1' ? 'PC2' : 'PC1';
          if (activeBet[oppositePC] && activeBet[oppositePC].status === 'pending') {
            console.log(`Cancelling bet on ${oppositePC} due to failure on ${data.pc}`);
            sendCancelBet(oppositePC, data.platform, data.amount, activeBet[oppositePC].side, room);
            activeBet[oppositePC] = { status: 'cancelled', reason: `Cancelled due to failure on ${data.pc}` };
          }
          
          // Clean up the bet tracking after a short delay
          setTimeout(() => {
            activeBets.delete(room.id);
            accumulatedBets.delete(room.id);
            console.log(`Cleaned up bet tracking and accumulated bets for room ${room.id}`);
          }, 5000);
        } else {
          // For single PC bets, don't automatically cancel the opposite PC
          // This prevents the cascade of error messages
          console.log(`Single PC bet failed on ${data.pc} - not cancelling opposite PC`);
        }
      }

      // Handle chip clicked
      if (data.type === 'chipClicked') {
        console.log(`Chip clicked on ${data.pc}: ${data.message}`);
        
        // Broadcast chip click to status listeners
        room.statusListeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(
              JSON.stringify({
                type: 'chipClicked',
                pc: data.pc,
                message: data.message,
                platform: data.platform,
                amount: data.amount,
                side: data.side,
                timestamp: new Date().toISOString()
              })
            );
          }
        });
      }

      // Handle bet area clicked
      if (data.type === 'betAreaClicked') {
        console.log(`Bet area clicked on ${data.pc}: ${data.message}`);
        
        // Broadcast bet area click to status listeners
        room.statusListeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(
              JSON.stringify({
                type: 'betAreaClicked',
                pc: data.pc,
                message: data.message,
                platform: data.platform,
                amount: data.amount,
                side: data.side,
                timestamp: new Date().toISOString()
              })
            );
          }
        });
      }


      // Handle confirm button clicked
      if (data.type === 'confirmClicked') {
        console.log(`Confirm button clicked on ${data.pc}: ${data.message}`);
        
        // Broadcast confirm click to status listeners
        room.statusListeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(
              JSON.stringify({
                type: 'confirmClicked',
                pc: data.pc,
                message: data.message,
                platform: data.platform,
                amount: data.amount,
                side: data.side,
                timestamp: new Date().toISOString()
              })
            );
          }
        });
      }

      // Handle betting time check response
      if (data.type === 'bettingTimeCheck') {
        console.log(`Betting time check from ${data.pc}:`, data);
        
        // Store the betting time check result for this PC
        if (!room.bettingTimeChecks) {
          room.bettingTimeChecks = {};
        }
        room.bettingTimeChecks[data.pc] = {
          result: data.result,
          message: data.message,
          errorType: data.errorType,
          timestamp: Date.now()
        };
        
        // Broadcast betting time check result to status listeners
        room.statusListeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(
              JSON.stringify({
                type: 'bettingTimeCheck',
                pc: data.pc,
                result: data.result,
                message: data.message,
                errorType: data.errorType,
                timestamp: new Date().toISOString()
              })
            );
          }
        });

        // ===== BOTH PC BETTING TIME CHECK HANDLER =====
        if (room.pendingSimultaneousBet) {
          const pendingBet = room.pendingSimultaneousBet;
          
          // Check if we have responses from both PCs
          const pc1Result = room.bettingTimeChecks?.PC1;
          const pc2Result = room.bettingTimeChecks?.PC2;
          
          if (pc1Result && pc2Result) {
            console.log(`Both PC bet ${pendingBet.betId}: Both betting time checks received`);
            
            if (pc1Result.result === true && pc2Result.result === true) {
              // Both PCs are ready, proceed with both PC betting
              console.log(`Both PC bet ${pendingBet.betId}: Both PCs ready, proceeding with bets`);
              
              // Reset accumulated bets for this room to prevent duplicates
              accumulatedBets.set(room.id, {
                PC1: { totalAmount: 0, side: null },
                PC2: { totalAmount: 0, side: null }
              });
              
              const accumulated = accumulatedBets.get(room.id);
              
              // Set amounts and sides for this specific bet (not accumulated)
              accumulated.PC1.totalAmount = (pendingBet.selectedPC === 'PC1') ? pendingBet.amount : 0;
              accumulated.PC1.side = (pendingBet.selectedPC === 'PC1') ? pendingBet.normalizedSide : null;
              
              accumulated.PC2.totalAmount = (pendingBet.selectedPC === 'PC2') ? pendingBet.amount : 0;
              accumulated.PC2.side = (pendingBet.selectedPC === 'PC2') ? pendingBet.normalizedSide : null;
              
              // For the opposite PC, set the amount and opposite side
              accumulated[pendingBet.oppositePC].totalAmount = pendingBet.amount;
              accumulated[pendingBet.oppositePC].side = pendingBet.oppositeSide;
              
              console.log(`Accumulated amounts: PC1=${accumulated.PC1.totalAmount} (${accumulated.PC1.side}), PC2=${accumulated.PC2.totalAmount} (${accumulated.PC2.side})`);
              
              // Track the bet state
              const betState = {
                betId: pendingBet.betId,
                PC1: { status: 'pending', startTime: Date.now(), side: accumulated.PC1.side, totalAmount: accumulated.PC1.totalAmount },
                PC2: { status: 'pending', startTime: Date.now(), side: accumulated.PC2.side, totalAmount: accumulated.PC2.totalAmount },
                platform: pendingBet.platform,
                amount: pendingBet.amount,
                originalSide: pendingBet.normalizedSide,
                oppositeSide: pendingBet.oppositeSide,
              };
              
              activeBets.set(room.id, betState);
              console.log(`Started tracking both PC bet ${pendingBet.betId} for room ${room.id}`);

              // Send accumulated amounts to both PCs
              const sendBetToPC = (targetPC, targetSide, targetAmount) => {
                room.clients.forEach((client) => {
                  if (client.pc === targetPC && client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(
                      JSON.stringify({
                        type: 'placeBet',
                        platform: pendingBet.platform,
                        amount: targetAmount,
                        side: targetSide,
                      })
                    );
                  }
                });
              };

              sendBetToPC(pendingBet.selectedPC, pendingBet.normalizedSide, accumulated[pendingBet.selectedPC].totalAmount);
              sendBetToPC(pendingBet.oppositePC, pendingBet.oppositeSide, accumulated[pendingBet.oppositePC].totalAmount);

              // Set up timeout to handle unresponsive PCs
              const timeoutDuration = 10000; // 10 seconds
              setTimeout(() => {
                const currentBet = activeBets.get(room.id);
                if (currentBet && currentBet.betId === pendingBet.betId) {
                  // Check for any PCs that are still pending
                  if (currentBet.PC1.status === 'pending') {
                    console.log(`PC1 timed out for both PC bet ${pendingBet.betId}, cancelling PC2 if still pending`);
                    currentBet.PC1 = { status: 'timeout', reason: 'No response within timeout period' };
                    if (currentBet.PC2.status === 'pending') {
                      sendCancelBet('PC2', pendingBet.platform, pendingBet.amount, currentBet.PC2.side, room);
                      currentBet.PC2 = { status: 'cancelled', reason: 'Cancelled due to PC1 timeout' };
                    }
                  }
                  if (currentBet.PC2.status === 'pending') {
                    console.log(`PC2 timed out for both PC bet ${pendingBet.betId}, cancelling PC1 if still pending`);
                    currentBet.PC2 = { status: 'timeout', reason: 'No response within timeout period' };
                    if (currentBet.PC1.status === 'pending') {
                      sendCancelBet('PC1', pendingBet.platform, pendingBet.amount, currentBet.PC1.side, room);
                      currentBet.PC1 = { status: 'cancelled', reason: 'Cancelled due to PC2 timeout' };
                    }
                  }
                  
                  // Clean up after timeout
                  setTimeout(() => {
                    activeBets.delete(room.id);
                    accumulatedBets.delete(room.id);
                    console.log(`Cleaned up timed out both PC bet tracking and accumulated bets for room ${room.id}`);
                  }, 2000);
                }
              }, timeoutDuration);
              
            } else {
              // One or both PCs are not ready, send error messages
              console.log(`Both PC bet ${pendingBet.betId}: Not all PCs ready`);
              
              if (pc1Result.result !== true) {
                room.statusListeners.forEach((listener) => {
                  if (listener.readyState === WebSocket.OPEN) {
                    listener.send(
                      JSON.stringify({
                        type: 'betError',
                        pc: 'PC1',
                        message: pc1Result.message,
                        platform: pendingBet.platform,
                        amount: pendingBet.amount,
                        side: pendingBet.normalizedSide,
                        errorType: pc1Result.errorType,
                        timestamp: new Date().toISOString()
                      })
                    );
                  }
                });
              }
              
              if (pc2Result.result !== true) {
                room.statusListeners.forEach((listener) => {
                  if (listener.readyState === WebSocket.OPEN) {
                    listener.send(
                      JSON.stringify({
                        type: 'betError',
                        pc: 'PC2',
                        message: pc2Result.message,
                        platform: pendingBet.platform,
                        amount: pendingBet.amount,
                        side: pendingBet.oppositeSide,
                        errorType: pc2Result.errorType,
                        timestamp: new Date().toISOString()
                      })
                    );
                  }
                });
              }
            }
            
            // Clean up pending bet and betting time checks
            delete room.pendingSimultaneousBet;
            delete room.bettingTimeChecks;
          }
        }
      }

      // Handle bet success
      if (data.type === 'betSuccess') {
        console.log(`Bet success from ${data.pc}:`, data);
        
        // Broadcast bet success to all status listeners
        room.statusListeners.forEach((listener) => {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(
              JSON.stringify({
                type: 'betSuccess',
                pc: data.pc,
                message: `Bet placed successfully on ${data.pc}`,
                platform: data.platform,
                amount: data.amount,
                side: data.side,
                timestamp: new Date().toISOString()
              })
            );
          }
        });
        
        // Handle bet success for simultaneous betting
        const activeBet = activeBets.get(room.id);
        if (activeBet) {
          // Mark this PC as successful
          activeBet[data.pc] = { status: 'success', timestamp: Date.now() };
          
          // Check if both PCs have completed
          const pc1Status = activeBet.PC1.status;
          const pc2Status = activeBet.PC2.status;
          
          if (pc1Status !== 'pending' && pc2Status !== 'pending') {
            // Both PCs have completed (success or failure)
            if (pc1Status === 'success' && pc2Status === 'success') {
              console.log(`Both PCs successfully placed bets for ${activeBet.betId}`);
              
              // Broadcast completion to status listeners
              room.statusListeners.forEach((listener) => {
                if (listener.readyState === WebSocket.OPEN) {
                  listener.send(
                    JSON.stringify({
                      type: 'betCompleted',
                      message: 'Both PCs successfully placed bets',
                      betId: activeBet.betId,
                      timestamp: new Date().toISOString()
                    })
                  );
                }
              });
            } else {
              console.log(`Bet completed with mixed results: PC1=${pc1Status}, PC2=${pc2Status}`);
              
              // Broadcast mixed results to status listeners
              room.statusListeners.forEach((listener) => {
                if (listener.readyState === WebSocket.OPEN) {
                  listener.send(
                    JSON.stringify({
                      type: 'betCompleted',
                      message: `Bet completed with mixed results: PC1=${pc1Status}, PC2=${pc2Status}`,
                      betId: activeBet.betId,
                      timestamp: new Date().toISOString()
                    })
                  );
                }
              });
            }
            
            // Clean up the bet tracking
            activeBets.delete(room.id);
            // Reset accumulated bets for this room
            accumulatedBets.delete(room.id);
            console.log(`Cleaned up bet tracking and accumulated bets for room ${room.id}`);
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');

    // Remove from admin connections if present
    if (adminConnections.has(ws)) {
      adminConnections.delete(ws);
      console.log('Admin WebSocket disconnected');
      return;
    }

    // Remove from status listeners if present
    if (room) room.statusListeners.delete(ws);

    // Find and remove the client
    if (room) {
      for (const [id, client] of room.clients.entries()) {
        if (client.ws === ws) {
          // Free up the PC assignment
          if (client.pc) {
            room.assignedPCs.delete(client.pc);
            console.log(`Freed up ${client.pc}`);
          }
          room.clients.delete(id);
          break;
        }
      }
      // handle provisional assigned pc that never registered
      if (ws.tempAssignedPC) {
        room.assignedPCs.delete(ws.tempAssignedPC);
      }
      
      // Check if user is now offline and broadcast status change
      if (room.clients.size === 0) {
        broadcastUserStatusChange(clientUser, false);
      }
    }
    broadcastStatus(room);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Send status to a specific client
function sendStatusToClientRoom(ws, room) {
  if (!room) return;
  const status = {
    PC1: false,
    PC2: false,
  };

  room.clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      status[client.pc] = true;
    }
  });

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'status',
        connectedPCs: status,
      }),
    );
  }
}

// Broadcast connected PCs status to all listeners
function broadcastStatus(room) {
  if (!room) return;
  const status = {
    PC1: false,
    PC2: false,
  };

  room.clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      status[client.pc] = true;
    }
  });

  console.log('Broadcasting status:', status);

  // Send status to all registered status listeners
  room.statusListeners.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'status',
          connectedPCs: status,
        }),
      );
    }
  });

  // Also send to all PC clients for backward compatibility
  room.clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          type: 'status',
          connectedPCs: status,
        }),
      );
    }
  });
}

// Broadcast user status changes to admin connections
function broadcastUserStatusChange(username, isOnline) {
  const message = JSON.stringify({
    type: 'user_status_update',
    username: username,
    isOnline: isOnline
  });
  
  adminConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Ping loop to ensure connections are alive - more tolerant
setInterval(() => {
  rooms.forEach((room, user) => {
    room.clients.forEach((client, id) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;

      // More tolerant heartbeat - only terminate if missed multiple times
      if (client.isAlive === false) {
        // Give it one more chance before terminating
        if (!client.missedHeartbeats) {
          client.missedHeartbeats = 1;
          console.log(`First heartbeat missed from ${client.pc}, giving another chance`);
        } else {
          console.log(`Multiple heartbeats missed from ${client.pc}, terminating connection`);
          client.ws.terminate();
          room.clients.delete(id);
          room.assignedPCs.delete(client.pc);
          broadcastStatus(room);
          return;
        }
      } else {
        // Reset missed heartbeats counter on successful pong
        client.missedHeartbeats = 0;
      }

      client.isAlive = false; // will be set true on pong
      try {
        client.ws.send(JSON.stringify({ type: 'ping' }));
      } catch (err) {
        console.error('Failed to send ping', err);
        // Don't immediately terminate on send error, let the connection close naturally
      }
    });
  });
}, HEARTBEAT_INTERVAL);

// Track active bets for each room
const activeBets = new Map(); // roomId -> { betId, PC1: { status, startTime }, PC2: { status, startTime } }

// Track accumulated bet amounts for each PC in each room
const accumulatedBets = new Map(); // roomId -> { PC1: { totalAmount, side }, PC2: { totalAmount, side } }


// ===== SINGLE PC BETTING API =====
app.post('/api/bet-single', (req, res) => {
  const { platform, pc, amount, side, user } = req.body;

  console.log('Single PC bet request:', { platform, pc, amount, side });

  const room = getRoom(user);
  
  // Check if PC is connected
  const isConnected = Array.from(room.clients.values()).some(client => client.pc === pc && client.ws.readyState === WebSocket.OPEN);
  
  if (!isConnected) {
    return res.status(404).json({ success: false, message: `${pc} is not connected` });
  }

  // Send bet directly to the selected PC (original behavior)
  const normalizedSide = (side === 'player' || side === 'Player') ? 'Player' : 'Banker';
  
  let sentCount = 0;
  room.clients.forEach((client) => {
    if (client.pc === pc && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          type: 'placeBet',
          platform,
          amount: amount,
          side: normalizedSide,
        }),
      );
      sentCount += 1;
    }
  });

  if (sentCount === 1) {
    res.json({ success: true, message: `Bet command sent to ${pc}` });
  } else {
    res.status(404).json({ success: false, message: `${pc} is not connected` });
  }
});

// ===== BOTH PC BETTING API =====
app.post('/api/bet-both', (req, res) => {
  const { platform, pc, amount, side, user } = req.body;

  console.log('Both PC bet request:', { platform, pc, amount, side });

  const room = getRoom(user);
  const oppositePC = pc === 'PC1' ? 'PC2' : 'PC1';
  const oppositeSide = (side === 'player' || side === 'Player') ? 'Banker' : 'Player';
  const normalizedSide = (side === 'player' || side === 'Player') ? 'Player' : 'Banker';
  
  console.log(`Both PC betting: ${pc} will bet on ${normalizedSide}, ${oppositePC} will bet on ${oppositeSide}`);
  
  // Check if both PCs are connected
  const pc1Connected = Array.from(room.clients.values()).some(client => client.pc === 'PC1' && client.ws.readyState === WebSocket.OPEN);
  const pc2Connected = Array.from(room.clients.values()).some(client => client.pc === 'PC2' && client.ws.readyState === WebSocket.OPEN);
  
  if (!pc1Connected || !pc2Connected) {
    return res.status(404).json({ success: false, message: 'One or both PCs are not connected' });
  }

  // Check if there's already a pending simultaneous bet for this user
  if (room.pendingSimultaneousBet) {
    return res.status(409).json({ success: false, message: 'A bet is already in progress. Please wait for it to complete.' });
  }

  // Helper to send betting time check to a specific PC
  const sendBettingTimeCheck = (targetPC) => {
    let sent = false;
    room.clients.forEach((client) => {
      if (client.pc === targetPC && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(
          JSON.stringify({
            type: 'checkBettingTime'
          })
        );
        sent = true;
        console.log(`Betting time check sent to ${targetPC}`);
      }
    });
    return sent;
  };

  // Send betting time checks to both PCs
  const pc1CheckSent = sendBettingTimeCheck('PC1');
  const pc2CheckSent = sendBettingTimeCheck('PC2');
  
  if (pc1CheckSent && pc2CheckSent) {
    // Store the pending simultaneous bet
    const betId = `${user}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    room.pendingSimultaneousBet = {
      betId,
      selectedPC: pc,
      oppositePC,
      platform,
      amount,
      normalizedSide,
      oppositeSide,
      timestamp: Date.now()
    };
    
    // Set timeout for betting time checks
    setTimeout(() => {
      if (room.pendingSimultaneousBet && room.pendingSimultaneousBet.betId === betId) {
        console.log(`Both PC bet ${betId} timed out waiting for betting time checks`);
        delete room.pendingSimultaneousBet;
        delete room.bettingTimeChecks;
      }
    }, 5000); // 5 second timeout for betting time checks
    
    res.json({ success: true, message: 'Checking betting time for both PCs...', betId });
  } else {
    res.status(404).json({ success: false, message: 'Could not send betting time checks to both PCs' });
  }
});

// ===== LEGACY API (for backward compatibility) =====
app.post('/api/bet', (req, res) => {
  const { platform, pc, amount, side, single = false, user } = req.body;

  if (single) {
    // Redirect to single PC API
    req.body = { platform, pc, amount, side, user };
    return app._router.handle({ ...req, url: '/api/bet-single', method: 'POST' }, res);
  } else {
    // Redirect to both PC API
    req.body = { platform, pc, amount, side, user };
    return app._router.handle({ ...req, url: '/api/bet-both', method: 'POST' }, res);
  }
});

// Utility: cancel bet on a specific PC
function sendCancelBet(targetPC, platform = '', amount = null, side = '', room) {
  let sent = false;
  room.clients.forEach((client) => {
    if (client.pc === targetPC && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          type: 'cancelBet',
          platform,
          amount,
          side,
        }),
      );
      sent = true;
      console.log(`Cancel bet command sent to ${targetPC}`);
    }
  });
  
  if (!sent) {
    console.log(`Could not send cancel bet command to ${targetPC} - not connected`);
  }
  
  return sent;
}


// API endpoint to get connection status
app.get('/api/status', (req, res) => {
  const status = {
    PC1: false,
    PC2: false,
  };

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      status[client.pc] = true;
    }
  });

  res.json(status);
});

// API endpoint to send cancel to connected PCs only
app.post('/api/cancelBetAll', (req, res) => {
  const { user } = req.body;
  let cancelledCount = 0;
  
  if (user) {
    const room = getRoom(user);
    
    // Clean up any active bet tracking for this user
    const activeBet = activeBets.get(room.id);
    if (activeBet) {
      console.log(`Cancelling active bet ${activeBet.betId} for user ${user}`);
      
      // Mark all pending bets as cancelled
      if (activeBet.PC1 && activeBet.PC1.status === 'pending') {
        activeBet.PC1 = { status: 'cancelled', reason: 'User cancelled via cancel button' };
      }
      if (activeBet.PC2 && activeBet.PC2.status === 'pending') {
        activeBet.PC2 = { status: 'cancelled', reason: 'User cancelled via cancel button' };
      }
      
      // Clean up the active bet tracking immediately
      activeBets.delete(room.id);
      // Reset accumulated bets for this user
      accumulatedBets.delete(room.id);
      console.log(`Cleaned up active bet tracking and accumulated bets for user ${user}`);
    }
    
    // Send cancel commands to all connected PCs
    room.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (sendCancelBet(client.pc, '', null, '', room)) {
          cancelledCount++;
        }
      }
    });
  } else {
    // no user specified: broadcast to every room (admin scenario)
    rooms.forEach((room) => {
      // Clean up active bets for all rooms
      const activeBet = activeBets.get(room.id);
      if (activeBet) {
        console.log(`Admin cancelling active bet ${activeBet.betId}`);
        activeBets.delete(room.id);
      }
      
      room.clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          if (sendCancelBet(client.pc, '', null, '', room)) {
            cancelledCount++;
          }
        }
      });
    });
  }
  
  if (cancelledCount > 0) {
    res.json({ success: true, message: `Cancel command sent to ${cancelledCount} connected PC(s)` });
  } else {
    res.json({ success: false, message: 'No connected PCs to cancel bets on' });
  }
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const userRecord = USERS[username];
  if (!userRecord) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  if (!bcrypt.compareSync(password, userRecord.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  
  // Check license status
  const licenseEndDate = userRecord.licenseEndDate;
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Check if user has no license
  if (!licenseEndDate) {
    return res.status(403).json({ 
      success: false, 
      message: 'No license found. Please contact administrator to purchase a license.',
      noLicense: true 
    });
  }
  
  // Check if license is expired
  if (currentDate > licenseEndDate) {
    return res.status(403).json({ 
      success: false, 
      message: 'License expired. Please contact administrator to renew your license.',
      licenseExpired: true 
    });
  }
  
  const token = generateAccessToken(username);
  return res.json({ 
    success: true, 
    token,
    licenseEndDate: licenseEndDate || null
  });
});

// ---------------- Admin APIs ----------------
// Get all users with license info (admin only)
app.get('/api/users', authAdmin, (req, res) => {
  const usersWithLicense = Object.keys(USERS).map(username => {
    const user = USERS[username];
    const currentDate = new Date().toISOString().split('T')[0];
    const licenseEndDate = user.licenseEndDate;
    const isExpired = licenseEndDate && currentDate > licenseEndDate;
    
    // Check if user is currently online (has active WebSocket connections)
    const room = getRoom(username);
    const isOnline = room && room.clients.size > 0;
    
    return {
      username,
      licenseEndDate: licenseEndDate || 'No License',
      isExpired,
      status: isExpired ? 'Expired' : (licenseEndDate ? 'Active' : 'No License'),
      isOnline: isOnline,
      loginStatus: isOnline ? 'Online' : 'Offline'
    };
  });
  res.json(usersWithLicense);
});

// Add new user
app.post('/api/users', authAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  if (USERS[username]) {
    return res.status(409).json({ success: false, message: 'User already exists' });
  }
  USERS[username] = { 
    passwordHash: bcrypt.hashSync(password, 10),
    licenseEndDate: null // New users start without license
  };
  saveUsers();
  return res.json({ success: true });
});

// Delete user (cannot delete admin)
app.delete('/api/users/:username', authAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin user' });
  if (!USERS[username]) return res.status(404).json({ success: false, message: 'User not found' });
  delete USERS[username];
  saveUsers();
  return res.json({ success: true });
});

// Update admin password
app.put('/api/users/admin', authAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required' });
  USERS['admin'] = { 
    passwordHash: bcrypt.hashSync(password, 10),
    licenseEndDate: USERS['admin'].licenseEndDate // Preserve existing license
  };
  saveUsers();
  return res.json({ success: true });
});

// Extend user license
app.put('/api/users/:username/license', authAdmin, (req, res) => {
  const { username } = req.params;
  const { months } = req.body;
  
  if (!USERS[username]) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  
  if (!months || isNaN(months) || months <= 0) {
    return res.status(400).json({ success: false, message: 'Valid number of months required' });
  }
  
  // Calculate new end date
  const currentDate = new Date();
  const newEndDate = new Date(currentDate);
  newEndDate.setMonth(newEndDate.getMonth() + parseInt(months));
  
  // If user already has a license, extend from the current end date
  if (USERS[username].licenseEndDate) {
    const currentEndDate = new Date(USERS[username].licenseEndDate);
    if (currentEndDate > currentDate) {
      // License is still active, extend from current end date
      newEndDate.setTime(currentEndDate.getTime());
      newEndDate.setMonth(newEndDate.getMonth() + parseInt(months));
    }
  }
  
  USERS[username].licenseEndDate = newEndDate.toISOString().split('T')[0];
  saveUsers();
  
  return res.json({ 
    success: true, 
    message: `License extended by ${months} month(s)`,
    newEndDate: USERS[username].licenseEndDate
  });
});

// Get current user's license info
app.get('/api/user/license', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Missing token' });
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  
  const username = payload.user;
  const userRecord = USERS[username];
  
  if (!userRecord) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  
  const currentDate = new Date().toISOString().split('T')[0];
  const licenseEndDate = userRecord.licenseEndDate;
  
  // Check if user has no license
  if (!licenseEndDate) {
    return res.status(403).json({
      success: false,
      message: 'No license found. Please contact administrator to purchase a license.',
      noLicense: true
    });
  }
  
  const isExpired = currentDate > licenseEndDate;
  
  return res.json({
    success: true,
    licenseEndDate: licenseEndDate,
    isExpired,
    status: isExpired ? 'Expired' : 'Active'
  });
});

// Export all user data (including password hashes) for backup - Admin only
app.get('/api/export-users', authAdmin, (req, res) => {
  res.json({
    success: true,
    users: USERS,
    exportTime: new Date().toISOString(),
    totalUsers: Object.keys(USERS).length,
    exportedBy: req.authUser
  });
});

// Start server with both HTTP and WebSocket on the same port
server.listen(PORT, () => {
  console.log(`Controller server running on port ${PORT}`);
  console.log(`WebSocket server running on same port ${PORT}`);
});
