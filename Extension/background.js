// Background service worker for Bet Automation Extension

// const WS_URL = 'wss://www.god.bet';
const WS_URL = 'ws://localhost:8080/';
// const WS_URL = 'wss://quality-crappie-painfully.ngrok-free.app';

let accessToken = null;
let slotOccupied = false; // flag to stop auto reconnect when both slots taken

function ensureTokenAndConnect() {
  chrome.storage.local.get(['accessToken'], (res) => {
    accessToken = res.accessToken || null;
    if (!accessToken) {
      // stay disconnected until user logs in via popup
      updateIcon(false);
      return;
    }
    connectWebSocket();
  });
}

let ws = null;
let reconnectInterval = null;
let pcName = null; // Will be assigned by server (PC1 or PC2)
let isConnected = false;
let isConnecting = false;
let watchdog = null;
let watchdogInterval = null;
let lastServerMsg = Date.now();
const WATCHDOG_INTERVAL = 15000; // 15 seconds

function autoLogout(reason = 'Invalid token') {
  try {
    console.warn('Auto-logout triggered:', reason);
    // Disconnect and deactivate everywhere
    disconnect();
    // Clear access token
    chrome.storage.local.remove('accessToken');
    // Reset flags and icon
    slotOccupied = false;
    updateIcon(false);
    // Inform popup so it switches to login UI
    chrome.runtime.sendMessage({ type: 'autoLogout', reason }).catch(() => {});
  } catch (e) {
    console.error('autoLogout error:', e);
  }
}

// Helper: broadcast a runtime message to all tabs (best-effort)
async function broadcastToAllTabs(msg) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  } catch (err) {
    console.error('broadcastToAllTabs error', err);
  }
}

function notifyPopup(connected){
  chrome.runtime.sendMessage({type:'statusUpdate', connected});
}

// Update extension icon based on connection status
function updateIcon(connected) {
  const iconPath = connected
    ? 'icons/recording.png'
    : 'icons/not-recording.png';
  chrome.action.setIcon({ path: iconPath });
}

// Reload content scripts in all tabs
async function reloadContentScripts() {
  try {
    // Get all tabs
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      // Skip chrome:// and other special URLs
      if (
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        try {
          // Remove existing content script if any
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => {
              // Remove any existing indicators
              const existingIndicator = document.querySelector(
                '[data-bet-automation-indicator]',
              );
              if (existingIndicator) {
                existingIndicator.remove();
              }
            },
          });

          // Inject content script into all frames
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content.js'],
          });

          console.log(`Reloaded content script in tab: ${tab.title}`);
        } catch (err) {
          console.log(
            `Failed to reload content script in tab ${tab.id}:`,
            err.message,
          );
        }
      }
    }
  } catch (error) {
    console.error('Error reloading content scripts:', error);
  }
}

// Disconnect from WebSocket
async function disconnect() {
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  isConnected = false;
  isConnecting = false;
  pcName = null;
  updateIcon(false);

  // Stop iframe monitoring
  stopIframeMonitoring();

  // Inform content scripts to deactivate
  await broadcastToAllTabs({ type: 'deactivateBetAutomation' });

  // Clear stored PC name
  chrome.storage.local.remove('pcName');
  if (slotOccupied) {
    notifyPopup(false);
  }
}

// Initialize WebSocket connection
function connectWebSocket() {
  if (isConnecting || isConnected || slotOccupied) {
    return;
  }

  isConnecting = true;
  ws = new WebSocket(WS_URL);

  ws.onopen = async () => {
    console.log('Connected to controller server');
    clearInterval(reconnectInterval);
    reconnectInterval = null;
    isConnected = true;
    isConnecting = false;

    // Start iframe monitoring
    startIframeMonitoring();

    // Reload content scripts in all tabs
    await reloadContentScripts();

    // Tell content scripts to activate
    await broadcastToAllTabs({ type: 'activateBetAutomation' });

    // Authenticate first
    ws.send(JSON.stringify({ type: 'hello', token: accessToken }));

    // Request PC assignment from server
    ws.send(
      JSON.stringify({
        type: 'requestAssignment',
      }),
    );

    // Update icon to recording.png (connected)
    updateIcon(true);

    notifyPopup(true);

    lastServerMsg = Date.now();
    startWatchdog();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);

    // heartbeat
    if (data.type === 'ping') {
      lastServerMsg = Date.now();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }
    lastServerMsg = Date.now();

    if (data.type === 'assignment') {
      // Server assigned us a PC name (PC1 or PC2)
      pcName = data.pc;
      chrome.storage.local.set({ pcName: pcName });

      // Register with the assigned PC name
      ws.send(
        JSON.stringify({
          type: 'register',
          pc: pcName,
        }),
      );

      console.log(`This extension is assigned as: ${pcName}`);
    } else if (data.type === 'checkBettingTime') {
      // ===== BOTH PC BETTING - Betting time check first =====
      console.log('[Background] Both PC betting time check command received:', data);
      
      // Send to all tabs that have the extension injected
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: 'checkBettingTime',
                bettingType: 'both' // Mark as both PC betting
              })
              .catch((err) => {
                console.log(`Failed to send both PC betting time check to tab ${tab.id}:`, err?.message);
                // Try to reinject content script and retry
                chrome.scripting
                  .executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    files: ['content.js'],
                  })
                  .then(() => {
                    // Retry sending the message after a short delay
                    setTimeout(() => {
                      chrome.tabs.sendMessage(tab.id, {
                        type: 'checkBettingTime',
                        bettingType: 'both'
                      }).catch(() => {
                        console.log(`Still failed to send betting time check to tab ${tab.id} after reinjection`);
                      });
                    }, 100);
                  })
                  .catch((reinjectErr) => {
                    console.log(`Failed to reinject into tab ${tab.id}:`, reinjectErr?.message);
                  });
              });
          }
        });
      });
    } else if (data.type === 'placeBet') {
      // ===== SINGLE PC BETTING - Direct bet placement =====
      console.log('[Background] Single PC bet command received:', data);
      
      // Send to all tabs that have the extension injected
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: 'placeBet',
                platform: data.platform,
                amount: data.amount,
                side: data.side,
                bettingType: 'single' // Mark as single PC betting
              })
              .catch((err) => {
                console.log(`Failed to send single PC bet to tab ${tab.id}:`, err?.message);
                // Try to reinject content script and retry
                chrome.scripting
                  .executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    files: ['content.js'],
                  })
                  .then(() => {
                    // Retry sending the message after a short delay
                    setTimeout(() => {
                      chrome.tabs.sendMessage(tab.id, {
                        type: 'placeBet',
                        platform: data.platform,
                        amount: data.amount,
                        side: data.side,
                        bettingType: 'single'
                      }).catch(() => {
                        console.log(`Still failed to send to tab ${tab.id} after reinjection`);
                      });
                    }, 100);
                  })
                  .catch((reinjectErr) => {
                    console.log(`Failed to reinject into tab ${tab.id}:`, reinjectErr?.message);
                  });
              });
          }
        });
      });
    } else if (data.type === 'cancelBet') {
      // Send cancel command to all tabs
      console.log('[Background] Cancel bet command received:', data);
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'cancelBet',
              platform: data.platform,
              amount: data.amount,
              side: data.side,
            }).catch((err) => {
              console.log(`Failed to send cancel message to tab ${tab.id}:`, err?.message);
            });
          }
        });
      });
    } else if (data.type === 'error') {
      console.error('Server error:', data.message);
      if (data.message && /invalid token/i.test(data.message)) {
        autoLogout('Invalid token from server');
        return;
      }
      if (data.message && data.message.includes('Both PC slots')) {
        slotOccupied = true;
        // show chrome notification
        if (chrome.notifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/not-recording.png',
            title: 'Bet Automation',
            message: 'Both PC slots are occupied. Connection closed.',
          });
        }
      }
      disconnect();
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from controller server');
    const wasConnected = isConnected;
    isConnected = false;
    isConnecting = false;
    pcName = null;

    // Update icon to not-recording.png (disconnected)
    updateIcon(false);

    // Broadcast deactivation (fire-and-forget)
    broadcastToAllTabs({ type: 'deactivateBetAutomation' });

    // Clear stored PC name
    chrome.storage.local.remove('pcName');

    // Only attempt to reconnect if we were connected and didn't manually disconnect
    if (wasConnected && !reconnectInterval && !slotOccupied) {
      reconnectInterval = setInterval(() => {
        console.log('Connection lost, attempting to reconnect...');
        connectWebSocket();
      }, 3000);
    }
    notifyPopup(false);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    isConnecting = false;
  };
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'bettingTimeCheck') {
    // Forward betting time check result to controller
    if (ws && ws.readyState === WebSocket.OPEN && pcName) {
      ws.send(
        JSON.stringify({
          type: 'bettingTimeCheck',
          pc: pcName,
          result: request.result,
          message: request.message,
          errorType: request.errorType || null,
        }),
      );
    }
  } else if (request.type === 'betSuccess') {
    // Forward success message to controller
    if (ws && ws.readyState === WebSocket.OPEN && pcName) {
      ws.send(
        JSON.stringify({
          type: 'betSuccess',
          pc: pcName,
          platform: request.platform,
          amount: request.amount,
          side: request.side,
        }),
      );
    }
  } else if (request.type === 'betError') {
    // Forward error message to controller with enhanced details
    if (ws && ws.readyState === WebSocket.OPEN && pcName) {
      const errorType = request.errorType || 'unknown';
      
      // Only send error messages if we're actually connected and have a PC name
      console.log(`[BetAutomation] Sending bet error: ${errorType}`);
      ws.send(
        JSON.stringify({
          type: 'betError',
          pc: pcName,
          message: request.message,
          platform: request.platform,
          amount: request.amount,
          side: request.side,
          errorType: errorType,
          errorDetails: request.errorDetails || null,
          availableChips: request.availableChips || null,
          triedSelectors: request.triedSelectors || null,
          chipValue: request.chipValue || null,
          timestamp: request.timestamp || new Date().toISOString()
        }),
      );
    } else {
      console.log(`[BetAutomation] Ignoring bet error - not connected or no PC name. WS: ${!!ws}, PC: ${pcName}`);
    }
  } else if (request.type === 'getConnectionStatus') {
    sendResponse({
      connected: isConnected,
      pcName: pcName,
    });
    return true; // Keep message channel open for async response
  }
});

// Handle extension icon click - toggle connection
chrome.action.onClicked.addListener(() => {
  if (isConnected) {
    // Disconnect when icon is clicked while connected
    console.log('Icon clicked - disconnecting from server...');
    disconnect();
  } else {
    // Connect when icon is clicked while disconnected
    console.log('Icon clicked - connecting to server...');
    ensureTokenAndConnect();
  }
});

// Initialize icon and attempt connection
updateIcon(false);
ensureTokenAndConnect();

function startWatchdog() {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    if (isConnected && Date.now() - lastServerMsg > WATCHDOG_INTERVAL) {
      console.warn('Watchdog: No ping from server, closing socket');
      if (ws) ws.close();
    }
  }, WATCHDOG_INTERVAL);
}

// Enhanced iframe detection and injection
let injectedTabs = new Set(); // Track which tabs have been injected
let iframeCheckInterval = null;

// Inject content script into any tab that finishes loading while connected
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isConnected) return;
  if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    injectIntoAllFrames(tabId);
  }
});

// Enhanced injection function that handles iframes
async function injectIntoAllFrames(tabId) {
  try {
    // Only inject iframe detector if not already injected for this tab
    if (!injectedTabs.has(tabId)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          files: ['iframe-detector.js']
        });
        console.log(`Injected iframe detector into main frame of tab ${tabId}`);
      } catch (err) {
        console.log('Failed to inject iframe detector:', err?.message);
      }
    }
    
    // Inject content script into all frames (including iframes)
    await chrome.scripting.executeScript({ 
      target: { tabId, allFrames: true }, 
      files: ['content.js'] 
    });
    
    // Mark this tab as injected
    injectedTabs.add(tabId);
    
    // Send activation message to all frames
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'activateBetAutomation' });
    } catch (err) {
      // If sending to main frame fails, try sending to specific frames
      console.log('Main frame message failed, trying frame-specific injection');
    }
    
    console.log(`Successfully injected into tab ${tabId} (all frames)`);
  } catch (err) {
    console.log('Failed injecting content script:', err?.message || err);
  }
}

// Monitor for new iframes and inject content script
function startIframeMonitoring() {
  if (iframeCheckInterval) return;
  
  iframeCheckInterval = setInterval(async () => {
    if (!isConnected) return;
    
    try {
      // Get all tabs
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        if (!tab.url || !tab.url.startsWith('http')) continue;
        
        // Check if this tab needs injection
        if (!injectedTabs.has(tab.id)) {
          console.log(`Detected new tab ${tab.id}, injecting content script`);
          await injectIntoAllFrames(tab.id);
        }
        
        // Check for iframes within this tab
        try {
          const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
          for (const frame of frames) {
            if (frame.frameId !== 0 && frame.url && frame.url.startsWith('http')) {
              // This is an iframe, ensure content script is injected
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id, frameIds: [frame.frameId] },
                  files: ['content.js']
                });
                console.log(`Injected into iframe ${frame.frameId} in tab ${tab.id}`);
              } catch (err) {
                console.log(`Failed to inject into iframe ${frame.frameId}:`, err?.message);
              }
            }
          }
        } catch (err) {
          console.log(`Failed to check frames for tab ${tab.id}:`, err?.message);
        }
      }
    } catch (err) {
      console.log('Iframe monitoring error:', err?.message || err);
    }
   }, 15000); // Check every 15 seconds - much less aggressive
}

// Stop iframe monitoring
function stopIframeMonitoring() {
  if (iframeCheckInterval) {
    clearInterval(iframeCheckInterval);
    iframeCheckInterval = null;
  }
  injectedTabs.clear();
}

// Listen for navigation events to catch iframe loads
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!isConnected) return;
  if (details.frameId === 0) return; // Skip main frame, handled by tabs.onUpdated
  
  // This is an iframe navigation
  console.log(`Iframe navigation completed: ${details.url} in tab ${details.tabId}`);
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      files: ['content.js']
    });
    
    // Send activation message to this specific frame
    try {
      await chrome.tabs.sendMessage(details.tabId, { 
        type: 'activateBetAutomation',
        frameId: details.frameId 
      });
    } catch (err) {
      console.log('Failed to send activation to iframe:', err?.message);
    }
    
    console.log(`Successfully injected into iframe ${details.frameId}`);
  } catch (err) {
    console.log('Failed injecting into iframe:', err?.message || err);
  }
});

// Handle frame status reports from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'frameStatus') {
    console.log(`Frame status from tab ${sender.tab?.id}:`, {
      isIframe: msg.isIframe,
      url: msg.url,
      hasBettingUI: msg.hasBettingUI
    });
    
    // If this is an iframe with betting UI, ensure it's properly activated
    if (msg.isIframe && msg.hasBettingUI && isConnected) {
      console.log('Iframe with betting UI detected, ensuring activation');
      try {
        chrome.tabs.sendMessage(sender.tab.id, { 
          type: 'activateBetAutomation',
          frameId: sender.frameId 
        });
      } catch (err) {
        console.log('Failed to activate iframe:', err?.message);
      }
    }
  }
  
  if (msg.type === 'casinoIframeDetected') {
    console.log(`Casino iframe detected in tab ${sender.tab?.id}:`, {
      iframeId: msg.iframeId,
      src: msg.src
    });
    
    // Only force injection if we haven't already injected recently for this tab
    if (isConnected && !injectedTabs.has(sender.tab.id)) {
      console.log('Forcing injection into iframes due to casino iframe detection');
      setTimeout(() => {
        injectIntoAllFrames(sender.tab.id);
      }, 2000); // Wait a bit for iframe to load
    } else {
      console.log('Skipping injection - already injected or not connected');
    }
  }
});

// listen for popup requests
chrome.runtime.onMessage.addListener((msg)=>{
  if(msg.type==='tokenUpdated'){
    ensureTokenAndConnect();
  }
  if(msg.type==='logout'){
    disconnect();
    accessToken=null;
    updateIcon(false);
    slotOccupied=false;
    notifyPopup(false);
  }
  if(msg.type==='getConnectionStatus'){
    sendResponse({connected:isConnected});
    return true; // keep channel
  }
  if(msg.type==='connectReq'){
    ensureTokenAndConnect();
  }
  if(msg.type==='disconnectReq'){
    disconnect();
  }
});

// reset slotOccupied flag when user tries to connect via popup
chrome.runtime.onMessage.addListener((m)=>{
  if(m.type==='connectReq'){slotOccupied=false;}
});
