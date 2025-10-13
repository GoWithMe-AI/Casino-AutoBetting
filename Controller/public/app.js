// Token gate
let storedToken = localStorage.getItem('accessToken');
if (!storedToken) {
  window.location.href = 'login.html';
}

function getUserFromToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1])).user;
  } catch (e) { return null; }
}

function getTokenExpiration(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
  } catch (e) { 
    return null; 
  }
}

function isTokenExpiringSoon(token, minutesBeforeExpiry = 120) {
  const expiration = getTokenExpiration(token);
  if (!expiration) return false; // If we can't read expiration, don't assume it's expiring
  
  const now = Date.now();
  const timeUntilExpiry = expiration - now;
  
  // If token is already expired, return true
  if (timeUntilExpiry <= 0) return true;
  
  const minutesUntilExpiry = timeUntilExpiry / (1000 * 60);
  
  return minutesUntilExpiry <= minutesBeforeExpiry;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (!refreshToken) {
    console.warn('No refresh token available, cannot refresh');
    return false;
  }
  
  try {
    console.log('Refreshing access token...');
    const response = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (!response.ok) {
      const data = await response.json();
      console.error('Token refresh failed:', data.message);
      
      // If refresh token is invalid or expired, force logout
      if (response.status === 401 || response.status === 403) {
        console.log('Refresh token invalid or expired, logging out...');
        forceLogout('Session expired');
        return false;
      }
      
      return false;
    }
    
    const data = await response.json();
    
    if (data.success && data.accessToken) {
      console.log('Access token refreshed successfully');
      localStorage.setItem('accessToken', data.accessToken);
      storedToken = data.accessToken; // Update the global variable
      
      if (data.licenseEndDate) {
        localStorage.setItem('licenseEndDate', data.licenseEndDate);
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return false;
  }
}

// Start token refresh monitoring
let tokenRefreshInterval = null;
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 10 * 60 * 1000; // 10 minutes cooldown between refresh attempts

function startTokenRefreshMonitoring() {
  // Check every 30 minutes (much less aggressive)
  tokenRefreshInterval = setInterval(async () => {
    const currentToken = localStorage.getItem('accessToken');
    
    if (!currentToken) {
      console.log('[TokenRefresh] No access token found, stopping monitoring');
      stopTokenRefreshMonitoring();
      return;
    }
    
    const expiration = getTokenExpiration(currentToken);
    if (!expiration) {
      console.log('[TokenRefresh] Cannot read token expiration, skipping check');
      return;
    }
    
    const minutesUntilExpiry = (expiration - Date.now()) / (1000 * 60);
    
    // Only log occasionally to reduce console spam
    if (minutesUntilExpiry <= 180) { // Less than 3 hours
      console.log(`[TokenRefresh] Token expires in ${Math.round(minutesUntilExpiry)} minutes`);
    }
    
    // Refresh if token expires within the next 2 hours AND we haven't refreshed recently
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshAttempt;
    
    if (isTokenExpiringSoon(currentToken, 120) && timeSinceLastRefresh >= REFRESH_COOLDOWN) {
      console.log('[TokenRefresh] Token expiring soon, attempting refresh...');
      lastRefreshAttempt = now;
      const refreshed = await refreshAccessToken();
      
      if (!refreshed) {
        console.warn('[TokenRefresh] Failed to refresh token');
      }
    }
  }, 30 * 60 * 1000); // Check every 30 minutes (reduced from 5 minutes)
  
  // Do an immediate check on page load (but only if token is actually expiring soon)
  setTimeout(async () => {
    const currentToken = localStorage.getItem('accessToken');
    if (!currentToken) return;
    
    const expiration = getTokenExpiration(currentToken);
    if (!expiration) {
      console.log('[TokenRefresh] Cannot read token expiration on page load');
      return;
    }
    
    const minutesUntilExpiry = (expiration - Date.now()) / (1000 * 60);
    console.log(`[TokenRefresh] Token valid for ${Math.round(minutesUntilExpiry)} minutes`);
    
    // Only refresh if token expires within 2 hours
    if (isTokenExpiringSoon(currentToken, 120)) {
      console.log('[TokenRefresh] Token expiring soon on page load, attempting refresh...');
      lastRefreshAttempt = Date.now();
      await refreshAccessToken();
    }
  }, 2000);
}

function stopTokenRefreshMonitoring() {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
}

// Force logout function (defined early so it can be used by token refresh)
function forceLogout(reason = 'Session expired') {
  console.log(`Force logout: ${reason}`);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('licenseEndDate');
  window.location.href = 'login.html';
}

// Start monitoring immediately
startTokenRefreshMonitoring();

const currentUser = getUserFromToken(storedToken);
if (!currentUser) {
  forceLogout('Invalid token');
}

// State management
const state = {
  platform: 'Pragmatic', // Fixed to Pragmatic only
  firstPC: 'PC1',
  amount: null,
  side: null,
  connectedPCs: {
    PC1: false,
    PC2: false,
  },
  // Track bet results for simultaneous betting
  currentBetResults: {
    PC1: null,
    PC2: null,
    betId: null
  },
  // Flag to track if we're currently in a bet session
  isBetSessionActive: false
};

// DOM elements
const platformSwitch = document.getElementById('platform-switch');
const swapBtn = document.getElementById('swap-btn');
const chipContainer = document.getElementById('chip-container');
const chipConfigBtn = document.getElementById('chip-config-btn');
const chipModal = document.getElementById('chip-selector-modal');
const chipCheckboxContainer = document.getElementById(
  'chip-checkbox-container',
);
const chipSaveBtn = document.getElementById('chip-save-btn');
const chipCancelBtn = document.getElementById('chip-cancel-btn');
const chipSummary = document.getElementById('chip-summary');
const playerBtn = document.getElementById('player-btn');
const bankerBtn = document.getElementById('banker-btn');
const placeBetBtn = document.getElementById('place-bet');
const logContainer = document.getElementById('log-container');
const pc1Status = document.getElementById('pc1-status');
const pc2Status = document.getElementById('pc2-status');
const pc1Item = document.getElementById('pc1-item');
const pc2Item = document.getElementById('pc2-item');
const selectedAmountDisplay = document.getElementById('selected-amount');
const cancelAllBtn = document.getElementById('cancel-all');
const logoutBtn = document.getElementById('logout-btn');
const adminBtn = document.getElementById('admin-btn');

// Visual click effect function
function addClickEffect(element) {
  const rect = element.getBoundingClientRect();
  const effect = document.createElement('div');
  effect.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: ${rect.top + rect.height / 2}px;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(0, 255, 0, 0.6);
    pointer-events: none;
    z-index: 10000;
    transform: translate(-50%, -50%);
    animation: clickEffect 0.6s ease-out forwards;
  `;
  
  if (!document.querySelector('#click-effect-styles')) {
    const style = document.createElement('style');
    style.id = 'click-effect-styles';
    style.textContent = `
      @keyframes clickEffect {
        0% {
          width: 0;
          height: 0;
          opacity: 1;
        }
        100% {
          width: 40px;
          height: 40px;
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(effect);
  
  setTimeout(() => {
    if (effect.parentNode) {
      effect.parentNode.removeChild(effect);
    }
  }, 600);
}

// Check if token is valid
function isTokenValid(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp > currentTime;
  } catch (e) {
    return false;
  }
}

// Display license information
async function displayLicenseInfo() {
  const licenseInfoEl = document.getElementById('license-info');
  const licenseStatusBar = document.getElementById('license-status-bar');
  
  // Get current token (it might have been refreshed)
  const currentToken = localStorage.getItem('accessToken');
  
  // Check token validity first
  if (!currentToken || !isTokenValid(currentToken)) {
    console.log('[License] Token is invalid or expired, attempting refresh...');
    
    // Try to refresh the token before logging out
    const refreshed = await refreshAccessToken();
    
    if (refreshed) {
      console.log('[License] Token refreshed successfully, retrying license check...');
      // Retry license check with new token
      const newToken = localStorage.getItem('accessToken');
      if (newToken && isTokenValid(newToken)) {
        storedToken = newToken; // Update global variable
        // Continue with license check below
      } else {
        // Still invalid after refresh, logout
        licenseInfoEl.innerHTML = `<span style="color: #f44336; background: rgba(244, 67, 54, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">Session Expired</span>`;
        licenseStatusBar.style.display = 'block';
        licenseStatusBar.style.backgroundColor = '#f44336';
        licenseStatusBar.style.color = 'white';
        licenseStatusBar.innerHTML = `⚠️ SESSION EXPIRED - Redirecting to login...`;
        setTimeout(() => forceLogout('Invalid token'), 1000);
        return;
      }
    } else {
      // Refresh failed, logout
      licenseInfoEl.innerHTML = `<span style="color: #f44336; background: rgba(244, 67, 54, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">Session Expired</span>`;
      licenseStatusBar.style.display = 'block';
      licenseStatusBar.style.backgroundColor = '#f44336';
      licenseStatusBar.style.color = 'white';
      licenseStatusBar.innerHTML = `⚠️ SESSION EXPIRED - Redirecting to login...`;
      setTimeout(() => forceLogout('Invalid token'), 1000);
      return;
    }
  }
  
  try {
    // Use the current token (might have been refreshed above)
    const tokenToUse = localStorage.getItem('accessToken');
    const response = await fetch('/api/user/license', {
      headers: {
        'Authorization': `Bearer ${tokenToUse}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success) {
        if (data.licenseEndDate) {
          if (data.isExpired) {
            // Show expired license prominently
            licenseInfoEl.innerHTML = `<span style="color: #f44336; background: rgba(244, 67, 54, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">License Expired: ${data.licenseEndDate}</span>`;
            licenseStatusBar.style.display = 'block';
            licenseStatusBar.style.backgroundColor = '#f44336';
            licenseStatusBar.style.color = 'white';
            licenseStatusBar.innerHTML = `⚠️ LICENSE EXPIRED (${data.licenseEndDate}) - You will be logged out automatically`;
            
            // Auto logout for expired license
            setTimeout(() => {
              alert('Your license has expired. You will be logged out automatically.');
              forceLogout('License expired');
            }, 3000);
          } else {
            // Show valid license
            licenseInfoEl.innerHTML = `<span style="color: #4caf50; background: rgba(76, 175, 80, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">License Valid: ${data.licenseEndDate}</span>`;
            licenseStatusBar.style.display = 'none';
          }
        } else {
          // Show no license
          licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">No License</span>`;
          licenseStatusBar.style.display = 'block';
          licenseStatusBar.style.backgroundColor = '#ff9800';
          licenseStatusBar.style.color = 'white';
          licenseStatusBar.innerHTML = `⚠️ NO LICENSE FOUND - You will be logged out automatically`;
          
          // Auto logout for no license
          setTimeout(() => {
            alert('No license found. You will be logged out automatically.');
            forceLogout('No license');
          }, 3000);
        }
      } else {
        licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">License Error</span>`;
        licenseStatusBar.style.display = 'block';
        licenseStatusBar.style.backgroundColor = '#ff9800';
        licenseStatusBar.style.color = 'white';
        licenseStatusBar.innerHTML = `⚠️ LICENSE ERROR - Please contact administrator`;
      }
    } else if (response.status === 401) {
      // Invalid token - logout immediately
      console.log('Invalid token detected, logging out...');
      licenseInfoEl.innerHTML = `<span style="color: #f44336; background: rgba(244, 67, 54, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">Session Expired</span>`;
      licenseStatusBar.style.display = 'block';
      licenseStatusBar.style.backgroundColor = '#f44336';
      licenseStatusBar.style.color = 'white';
      licenseStatusBar.innerHTML = `⚠️ SESSION EXPIRED - Redirecting to login...`;
      
      // Immediate logout for invalid token
      setTimeout(() => forceLogout('Invalid token'), 1000);
    } else if (response.status === 403) {
      // License issue - check if it's no license or expired
      const data = await response.json();
      if (data.noLicense) {
        licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">No License</span>`;
        licenseStatusBar.style.display = 'block';
        licenseStatusBar.style.backgroundColor = '#ff9800';
        licenseStatusBar.style.color = 'white';
        licenseStatusBar.innerHTML = `⚠️ NO LICENSE FOUND - You will be logged out automatically`;
        
        // Auto logout for no license
        setTimeout(() => {
          alert('No license found. You will be logged out automatically.');
          forceLogout('No license');
        }, 3000);
      } else {
        licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">License Error</span>`;
        licenseStatusBar.style.display = 'block';
        licenseStatusBar.style.backgroundColor = '#ff9800';
        licenseStatusBar.style.color = 'white';
        licenseStatusBar.innerHTML = `⚠️ LICENSE ERROR - Please contact administrator`;
      }
    } else {
      licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">License Error</span>`;
      licenseStatusBar.style.display = 'block';
      licenseStatusBar.style.backgroundColor = '#ff9800';
      licenseStatusBar.style.color = 'white';
      licenseStatusBar.innerHTML = `⚠️ LICENSE ERROR - Please contact administrator`;
    }
  } catch (error) {
    console.error('Error fetching license info:', error);
    
    // Check if it's a network error or server error
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      // Network error - show warning but don't logout
      licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">Network Error</span>`;
      licenseStatusBar.style.display = 'block';
      licenseStatusBar.style.backgroundColor = '#ff9800';
      licenseStatusBar.style.color = 'white';
      licenseStatusBar.innerHTML = `⚠️ NETWORK ERROR - Cannot verify license status`;
    } else {
      // Other errors - show generic error
      licenseInfoEl.innerHTML = `<span style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 0.3rem 0.6rem; border-radius: 3px;">License Error</span>`;
      licenseStatusBar.style.display = 'block';
      licenseStatusBar.style.backgroundColor = '#ff9800';
      licenseStatusBar.style.color = 'white';
      licenseStatusBar.innerHTML = `⚠️ LICENSE ERROR - Please contact administrator`;
    }
  }
}

// Initialize license display immediately
displayLicenseInfo();

// Check license periodically (every 30 minutes - reduced frequency)
setInterval(displayLicenseInfo, 30 * 60 * 1000);

// Check license every 5 minutes for expired licenses (reduced from 1 minute)
setInterval(() => {
  const licenseInfoEl = document.getElementById('license-info');
  if (!licenseInfoEl) return;
  
  const licenseText = licenseInfoEl.textContent;
  if (licenseText.includes('Expired') || licenseText.includes('No License')) {
    displayLicenseInfo(); // Re-check immediately
  }
}, 5 * 60 * 1000);

if (currentUser==='admin'){
  adminBtn.style.display='inline-block';
  adminBtn.addEventListener('click',()=>{
    window.location.href='admin.html';
  });
}

const placeBetPc1Btn = document.getElementById('place-bet-pc1');
const placeBetPc2Btn = document.getElementById('place-bet-pc2');
const betBtnRow = document.querySelector('.bet-btn-row');

// Configuration
// const WS_BASE = 'wss://quality-crappie-painfully.ngrok-free.app/ws/';
// const WS_BASE = 'ws://localhost:8080';
const WS_BASE = 'wss://www.god.bet';

// Initialize WebSocket connection for status updates
let statusWs = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectDelay = 1000; // Start with 1 second
let isConnecting = false;
let lastPingTime = Date.now();
let connectionQuality = 'good';

function connectStatusWebSocket() {
  // Prevent multiple connection attempts
  if (isConnecting || (statusWs && statusWs.readyState === WebSocket.OPEN)) {
    console.log('WebSocket already connecting or connected');
    return;
  }

  isConnecting = true;
  console.log(`Attempting WebSocket connection (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
  
  try {
    statusWs = new WebSocket(WS_BASE);
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    isConnecting = false;
    scheduleReconnect();
    return;
  }

  statusWs.onopen = () => {
    console.log('Socket open');
    isConnecting = false;
    reconnectAttempts = 0;
    reconnectDelay = 1000; // Reset delay
    connectionQuality = 'good';
    lastPingTime = Date.now();
    
    addLog('Connected to controller server', 'success');
    
    // Clear any reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Authenticate
    statusWs.send(JSON.stringify({ type: 'hello', token: storedToken }));

    // Register as a status listener
    statusWs.send(
      JSON.stringify({
        type: 'registerStatusListener',
        token: storedToken,
        user: currentUser,
      }),
    );
  };

  statusWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('onmessage', data);

    // Handle ping/pong for connection health
    if (data.type === 'ping') {
      lastPingTime = Date.now();
      if (statusWs && statusWs.readyState === WebSocket.OPEN) {
        statusWs.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }

    if (data.type === 'status') {
      updateConnectionStatus(data.connectedPCs);
    } else if (data.type === 'betError') {
      // Filter out cancel bet errors when not in an active bet session
      if (!state.isBetSessionActive && data.message && data.message.includes('Cannot cancel bet:')) {
        // Skip logging and processing cancel bet errors when not in a bet session
        console.log('[BetAutomation] Ignoring cancel bet error - no active bet session');
        return;
      }
      
      // For both PC betting time failures, always show notifications regardless of bet session state
      if (data.errorType === 'not_betting_time' || data.errorType === 'wrong_tab') {
        console.log(`[BetAutomation] Both PC betting time failure from ${data.pc} - showing notification`);
      }
      
      // Handle different error types with appropriate user-friendly messages
      let userMessage = data.message;
      let logMessage = `Bet error from ${data.pc}: ${data.message}`;
      
      // Add detailed technical information for debugging
      const errorDetails = [];
      if (data.errorType) errorDetails.push(`Type: ${data.errorType}`);
      if (data.availableChips) errorDetails.push(`Available chips: ${data.availableChips.join(', ')}`);
      if (data.triedSelectors) errorDetails.push(`Tried selectors: ${data.triedSelectors.join(', ')}`);
      if (data.chipValue) errorDetails.push(`Chip value: ${data.chipValue}`);
      
      if (errorDetails.length > 0) {
        logMessage += ` (${errorDetails.join(' | ')})`;
      }
      
      // Provide user-friendly messages for common error types
      switch (data.errorType) {
        case 'not_betting_time':
          userMessage = `${data.pc}: Not betting time - please wait for the betting phase`;
          break;
        case 'wrong_tab':
          userMessage = `${data.pc}: Wrong tab - please navigate to the casino game`;
          break;
        case 'script_inactive':
          userMessage = `${data.pc}: Script not active - please reconnect the extension`;
          break;
        case 'betting_interface_timeout':
          userMessage = `${data.pc}: Betting interface not ready - please refresh the page`;
          break;
        case 'betting_disabled':
          userMessage = `${data.pc}: Betting disabled - game in progress`;
          break;
        case 'no_chips_found':
          userMessage = `${data.pc}: No chips available - please check the game`;
          break;
        case 'chip_disabled':
          userMessage = `${data.pc}: Selected chip is disabled`;
          break;
        case 'cannot_compose_amount':
          userMessage = `${data.pc}: Cannot place this amount with available chips`;
          break;
        case 'bet_placement_failed':
          userMessage = `${data.pc}: Bet placement failed - please try again`;
          break;
        case 'insufficient_balance':
          userMessage = `${data.pc}: Insufficient balance - cannot place bet`;
          break;
        case 'bet_limit_exceeded':
          userMessage = `${data.pc}: Bet limit exceeded - amount too high or too low`;
          break;
        case 'betting_timeout':
          userMessage = `${data.pc}: Betting timeout - please try again`;
          break;
        case 'pragmatic_error':
          userMessage = `${data.pc}: Pragmatic game error - ${data.message}`;
          break;
        case 'new_platform_error':
          userMessage = `${data.pc}: Game error - ${data.message}`;
          break;
        case 'not_betting_time':
          userMessage = `${data.pc}: Not betting time - ${data.message}`;
          // Don't treat this as an error, just info
          addLog(userMessage, 'info');
          return;
        default:
          userMessage = `${data.pc}: ${data.message}`;
      }
      
      addLog(logMessage, 'error');
      
      // Track bet result for simultaneous betting (only if we're in an active bet session)
      if (state.isBetSessionActive && data.errorType !== 'cancel_bet_error') {
        // Don't treat "not_betting_time" as a real error for bet completion tracking
        if (data.errorType === 'not_betting_time') {
          // For "not_betting_time", don't mark as error - just log it
          console.log(`[BetAutomation] ${data.pc} not betting time - not counting as failure`);
          // Don't check completion for not_betting_time errors
          return;
        } else {
          state.currentBetResults[data.pc] = 'error';
        }
        // Check if both PCs have completed
        checkBetCompletion();
      }
      
      // Show a non-blocking notification with user-friendly message
      showErrorNotification(userMessage);
    } else if (data.type === 'betSuccess') {
      // Handle bet success
      addLog(`Bet success from ${data.pc}: ${formatAmount(data.amount)} on ${data.side}`, 'success');
      
      // Track bet result (only if we're in an active bet session)
      if (state.isBetSessionActive) {
        console.log(`[BetAutomation] Simultaneous betting - ${data.pc} succeeded, not showing individual notification`);
        state.currentBetResults[data.pc] = 'success';
        // Check if both PCs have completed
        checkBetCompletion();
        // Don't show individual success notifications for simultaneous betting
        // Wait for completion check to show appropriate notification
      } else {
        console.log(`[BetAutomation] Single PC betting - ${data.pc} succeeded, showing individual notification`);
        // For single PC betting, show success notification immediately
        showSuccessNotification(`${data.pc}: Bet placed successfully`);
      }
    } else if (data.type === 'betCompleted') {
      // Handle bet completion (both PCs finished)
      addLog(`Bet completed: ${data.message}`, 'info');
      
      // Don't show any completion notifications for simultaneous betting
      // Just log the completion message
    } else if (data.type === 'chipClicked') {
      // Handle chip click notification
      addLog(`${data.pc}: ${data.message}`, 'info');
    } else if (data.type === 'betAreaClicked') {
      // Handle bet area click notification
      addLog(`${data.pc}: ${data.message}`, 'info');
    } else if (data.type === 'confirmClicked') {
      // Handle confirm button click notification
      addLog(`${data.pc}: ${data.message}`, 'info');
    } else if (data.type === 'betCancelled') {
      // Handle bet cancellation notification
      addLog(`Bet cancelled on ${data.pc}: ${data.message}`, 'info');
      
      // Reset bet session if we're in an active session
      if (state.isBetSessionActive) {
        state.isBetSessionActive = false;
        state.currentBetResults = {
          PC1: null,
          PC2: null,
          betId: null
        };
        addLog('Bet session ended due to cancellation', 'info');
      }
    }
  };

  statusWs.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason);
    isConnecting = false;
    
    // Only log disconnection if it wasn't intentional
    if (event.code !== 1000) { // 1000 = normal closure
      addLog(`Disconnected from controller server (Code: ${event.code})`, 'error');
    }
    
    // Reset connection status
    updateConnectionStatus({ PC1: false, PC2: false });

    // Don't reconnect if we've exceeded max attempts
    if (reconnectAttempts >= maxReconnectAttempts) {
      addLog('Max reconnection attempts reached. Please refresh the page.', 'error');
      return;
    }

    // Schedule reconnection with exponential backoff
    scheduleReconnect();
  };

  statusWs.onerror = (error) => {
    console.error('WebSocket error:', error);
    isConnecting = false;
    connectionQuality = 'poor';
    addLog('WebSocket connection error', 'error');
  };
}

// Schedule reconnection with exponential backoff
function scheduleReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectAttempts++;
  
  // Calculate delay with exponential backoff (max 30 seconds)
  const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttempts - 1), 30000);
  
  console.log(`Scheduling reconnection in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
  
  reconnectTimeout = setTimeout(() => {
    if (reconnectAttempts <= maxReconnectAttempts) {
      addLog(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`, 'info');
      connectStatusWebSocket();
    }
  }, delay);
}

// Monitor connection quality
function monitorConnectionQuality() {
  if (statusWs && statusWs.readyState === WebSocket.OPEN) {
    const timeSinceLastPing = Date.now() - lastPingTime;
    
    // If no ping received for 30 seconds, consider connection poor
    if (timeSinceLastPing > 30000) {
      if (connectionQuality !== 'poor') {
        connectionQuality = 'poor';
        console.log('Connection quality degraded - no ping received for 30+ seconds');
        addLog('Connection quality degraded', 'warning');
      }
    } else if (timeSinceLastPing < 15000) {
      if (connectionQuality !== 'good') {
        connectionQuality = 'good';
        console.log('Connection quality improved');
      }
    }
  }
}

// Start connection quality monitoring
setInterval(monitorConnectionQuality, 5000); // Check every 5 seconds

// Update connection status
function updateConnectionStatus(connectedPCs) {
  state.connectedPCs = connectedPCs;

  // Update PC1 status
  if (connectedPCs.PC1) {
    pc1Status.textContent = 'Connected';
    pc1Status.classList.add('connected');
  } else {
    pc1Status.textContent = 'Disconnected';
    pc1Status.classList.remove('connected');
  }

  // Update PC2 status
  if (connectedPCs.PC2) {
    pc2Status.textContent = 'Connected';
    pc2Status.classList.add('connected');
  } else {
    pc2Status.textContent = 'Disconnected';
    pc2Status.classList.remove('connected');
  }

  // Update connection quality indicator
  updateConnectionQualityIndicator();

  // Update bet button state
  updateBetButton();
  updateCancelAllBtn();
}

// Update connection quality indicator
function updateConnectionQualityIndicator() {
  // Find or create connection quality indicator
  let qualityIndicator = document.getElementById('connection-quality');
  if (!qualityIndicator) {
    qualityIndicator = document.createElement('div');
    qualityIndicator.id = 'connection-quality';
    qualityIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 5px 10px;
      border-radius: 3px;
      font-size: 12px;
      z-index: 1000;
    `;
    document.body.appendChild(qualityIndicator);
  }

  if (statusWs && statusWs.readyState === WebSocket.OPEN) {
    if (connectionQuality === 'good') {
      qualityIndicator.textContent = '🟢 Connection Good';
      qualityIndicator.style.backgroundColor = '#4caf50';
      qualityIndicator.style.color = 'white';
    } else if (connectionQuality === 'poor') {
      qualityIndicator.textContent = '🟡 Connection Poor';
      qualityIndicator.style.backgroundColor = '#ff9800';
      qualityIndicator.style.color = 'white';
    }
  } else {
    qualityIndicator.textContent = '🔴 Disconnected';
    qualityIndicator.style.backgroundColor = '#f44336';
    qualityIndicator.style.color = 'white';
  }
}

// Platform switch handler (removed - only Pragmatic)
// platformSwitch.addEventListener('change', (e) => {
//   state.platform = e.target.checked ? 'Pragmatic' : 'Evolution';
//   addLog(`Platform switched to ${state.platform}`, 'info');
// });

// Swap button handler – toggles which PC is first in betting order
swapBtn.addEventListener('click', () => {
  state.firstPC = state.firstPC === 'PC1' ? 'PC2' : 'PC1';
  addLog(`Bet order swapped: ${state.firstPC} will bet first`, 'info');
  renderPcOrder();
});

function renderPcOrder() {
  const parent = swapBtn.parentNode;
  // Remove elements to reset order
  [pc1Item, pc2Item, swapBtn].forEach((el) => {
    if (el.parentNode === parent) parent.removeChild(el);
  });

  // helper to animate
  const animate = (el) => {
    el.classList.remove('swap-animate');
    // force reflow
    void el.offsetWidth;
    el.classList.add('swap-animate');
  };

  if (state.firstPC === 'PC1') {
    parent.appendChild(pc1Item);
    parent.appendChild(swapBtn);
    parent.appendChild(pc2Item);
    // reorder single PC bet buttons
    betBtnRow.appendChild(placeBetPc1Btn);
    betBtnRow.appendChild(placeBetPc2Btn);
  } else {
    parent.appendChild(pc2Item);
    parent.appendChild(swapBtn);
    parent.appendChild(pc1Item);
    // reorder buttons
    betBtnRow.appendChild(placeBetPc2Btn);
    betBtnRow.appendChild(placeBetPc1Btn);
  }

  // animate affected elements
  [pc1Item, pc2Item, placeBetPc1Btn, placeBetPc2Btn].forEach(animate);
}

// -------------------------------------------------------------
// Chip Config

const ALL_CHIPS = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 10000, 20000, 25000, 50000, 125000,
  250000, 500000, 1000000, 1250000, 2500000, 5000000, 10000000, 50000000,
];

// Check if we're on the new game page to set different default chips
const isNewGame = window.location.pathname.includes('new-game');
let selectedChips = isNewGame 
  ? [50, 100, 200, 500, 1000] // New game defaults: 50, 100, 200, 500, 1k
  : [1000, 25000, 125000, 500000, 1250000, 2500000, 5000000, 50000000]; // Pragmatic defaults

const iconAvailable = new Set([
  10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 10000, 20000, 25000, 50000, 125000,
  250000, 500000, 1000000, 1250000, 2500000, 5000000, 10000000, 50000000,
]);

const CHIP_FILL = '#FFA41B';

function generateChipDataURI(amount) {
  const label = formatAmount(amount);
  // Estimate font-size based on label length
  const len = label.length;
  const fontSize = len <= 2 ? 400 : len === 3 ? 350 : 300;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000'>
<circle cx='500' cy='500' r='499' fill='${CHIP_FILL}' />
<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' style='fill:white;font-size:${fontSize}px;font-family:Arial,sans-serif;text-shadow:0 4px 0 rgba(0,0,0,.3);'>${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderChips() {
  chipContainer.innerHTML = '';
  selectedChips.forEach((amt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.amount = amt;

    if (iconAvailable.has(amt)) {
      const img = document.createElement('img');
      img.src = `assets/chips/${amt}.svg`;
      img.alt = formatAmount(amt);
      btn.appendChild(img);
    } else {
      const img = document.createElement('img');
      img.alt = formatAmount(amt);
      img.src = generateChipDataURI(amt);
      btn.appendChild(img);
    }

    // Click handler
    btn.addEventListener('click', () => {
      // Remove selected class from all chips
      Array.from(chipContainer.children).forEach((c) =>
        c.classList.remove('selected'),
      );
      btn.classList.add('selected');
      state.amount = amt;
      selectedAmountDisplay.textContent = formatAmount(state.amount);
      addLog(`Amount selected: ${formatAmount(state.amount)}`, 'info');
      updateBetButton();
    });

    chipContainer.appendChild(btn);
  });

  // Update summary list
  chipSummary.textContent = `Selected Chips: ${selectedChips
    .map((a) => formatAmount(a))
    .join(', ')}`;
}

function openChipModal() {
  // Populate checkboxes
  chipCheckboxContainer.innerHTML = '';
  ALL_CHIPS.forEach((amt) => {
    const label = document.createElement('label');
    label.className = 'chip-checkbox-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = amt;
    checkbox.checked = selectedChips.includes(amt);

    const span = document.createElement('span');
    span.textContent = formatAmount(amt);

    // Icon
    const icon = document.createElement('img');
    icon.className = 'chip-mini';
    if (iconAvailable.has(amt)) {
      icon.src = `assets/chips/${amt}.svg`;
    } else {
      icon.src = generateChipDataURI(amt);
    }

    label.appendChild(checkbox);
    label.appendChild(icon);
    label.appendChild(span);
    chipCheckboxContainer.appendChild(label);
  });

  chipModal.classList.add('show');
}

function closeChipModal() {
  chipModal.classList.remove('show');
}

chipConfigBtn.addEventListener('click', openChipModal);
chipCancelBtn.addEventListener('click', closeChipModal);

chipSaveBtn.addEventListener('click', () => {
  // Gather selected
  const newSelected = Array.from(
    chipCheckboxContainer.querySelectorAll('input[type="checkbox"]:checked'),
  ).map((cb) => parseInt(cb.value));

  if (newSelected.length === 0) {
    alert('Please select at least one chip');
    return;
  }

  selectedChips = newSelected;
  closeChipModal();
  renderChips();
  // Reset amount if current not in new list
  if (!selectedChips.includes(state.amount)) {
    state.amount = null;
    selectedAmountDisplay.textContent = '--';
    updateBetButton();
  }
});

// Initial render
renderChips();
// -------------------------------------------------------------

// Side selection
playerBtn.addEventListener('click', () => {
  playerBtn.classList.add('selected');
  bankerBtn.classList.remove('selected');
  state.side = 'Player';
  addLog('Side selected: Player', 'info');
  updateBetButton();
});

bankerBtn.addEventListener('click', () => {
  bankerBtn.classList.add('selected');
  playerBtn.classList.remove('selected');
  state.side = 'Banker';
  addLog('Side selected: Banker', 'info');
  updateBetButton();
});

// Place bet handler
placeBetBtn.addEventListener('click', async () => {
  if (!canPlaceBet()) {
    return;
  }

  // Reset bet results for new bet and start bet session
  state.currentBetResults = {
    PC1: null,
    PC2: null,
    betId: null
  };
  state.isBetSessionActive = true;
  
  console.log('[BetAutomation] Started bet session - isBetSessionActive:', state.isBetSessionActive);
  
  // Auto-end bet session after 15 seconds to prevent it from staying active indefinitely
  setTimeout(() => {
    if (state.isBetSessionActive) {
      addLog('Bet session timed out - ending session', 'info');
      state.isBetSessionActive = false;
      state.currentBetResults = {
        PC1: null,
        PC2: null,
        betId: null
      };
    }
  }, 15000);
  
  // Also add a shorter timeout for "not_betting_time" scenarios
  setTimeout(() => {
    if (state.isBetSessionActive) {
      // Check if we have any results at all
      const hasAnyResults = state.currentBetResults.PC1 || state.currentBetResults.PC2;
      if (!hasAnyResults) {
        addLog('No bet responses received - likely not betting time', 'info');
        state.isBetSessionActive = false;
        state.currentBetResults = {
          PC1: null,
          PC2: null,
          betId: null
        };
      }
    }
  }, 5000);

  // Check if we're on the new game page and get the selected bet type
  const isNewGame = window.location.pathname.includes('new-game');
  const selectedBetType = window.selectedBetType;
  
  // Use the selected bet type if we're on new game page and a bet type is selected
  const betSide = (isNewGame && selectedBetType) ? selectedBetType : state.side;

  const betData = {
    platform: state.platform,
    pc: state.firstPC,
    amount: state.amount,
    side: betSide,
    user: currentUser,
  };

  try {
    const response = await fetch('/api/bet-both', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData),
    });

    const result = await response.json();

    if (result.success) {
      // For simultaneous betting, don't show immediate success
      // Wait for actual bet results from WebSocket
      addLog(
        `Bet commands sent to both PCs - waiting for results...`,
        'info',
      );
    } else {
      addLog(`Failed to place bet: ${result.message}`, 'error');
      // Show user-friendly notification for common errors
      if (result.message.includes('already in progress')) {
        showErrorNotification('A bet is already in progress. Please wait for it to complete.');
      } else {
        showErrorNotification(`Failed to place bet: ${result.message}`);
      }
    }
  } catch (error) {
    if (error.message.includes('Failed to fetch')) {
      addLog(`Network error placing bet: Check server connection`, 'error');
    } else {
      addLog(`Error placing bet: ${error.message}`, 'error');
    }
  }
});

// Place bet on PC1 only
placeBetPc1Btn.addEventListener('click', async () => {
  if (!canPlaceBetSingle('PC1')) return; // order does not affect single PC bets
  // Check if we're on the new game page and get the selected bet type
  const isNewGame = window.location.pathname.includes('new-game');
  const selectedBetType = window.selectedBetType;
  const betSide = (isNewGame && selectedBetType) ? selectedBetType : state.side;

  const betData = {
    platform: state.platform,
    pc: 'PC1',
    amount: state.amount,
    side: betSide,
    user: currentUser,
  };  
  try {
    const response = await fetch('/api/bet-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData),
    });
    const result = await response.json();
    if (result.success) {
      addLog(
        `Bet command sent to PC1 - ${formatAmount(state.amount)} on ${state.side}`,
        'info',
      );
    } else {
      addLog(`Failed to place bet (PC1): ${result.message}`, 'error');
    }
  } catch (error) {
    if (error.message.includes('Failed to fetch')) {
      addLog(`Network error placing bet (PC1): Check server connection`, 'error');
    } else {
      addLog(`Error placing bet (PC1): ${error.message}`, 'error');
    }
  }
});

// Place bet on PC2 only
placeBetPc2Btn.addEventListener('click', async () => {
  if (!canPlaceBetSingle('PC2')) return;
  // Check if we're on the new game page and get the selected bet type
  const isNewGame = window.location.pathname.includes('new-game');
  const selectedBetType = window.selectedBetType;
  const betSide = (isNewGame && selectedBetType) ? selectedBetType : state.side;

  const betData = {
    platform: state.platform,
    pc: 'PC2',
    amount: state.amount,
    side: betSide,
    user: currentUser,
  };
  try {
    const response = await fetch('/api/bet-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData),
    });
    const result = await response.json();
    if (result.success) {
      addLog(
        `Bet command sent to PC2 - ${formatAmount(state.amount)} on ${state.side}`,
        'info',
      );
    } else {
      addLog(`Failed to place bet (PC2): ${result.message}`, 'error');
    }
  } catch (error) {
    if (error.message.includes('Failed to fetch')) {
      addLog(`Network error placing bet (PC2): Check server connection`, 'error');
    } else {
      addLog(`Error placing bet (PC2): ${error.message}`, 'error');
    }
  }
});

function canPlaceBet() {
  // Require both PCs to be connected
  return (
    state.amount &&
    state.side &&
    state.connectedPCs.PC1 &&
    state.connectedPCs.PC2
  );
}

function canPlaceBetSingle(pc) {
  return (
    state.amount &&
    state.side &&
    state.connectedPCs[pc]
  );
}

// Update bet button state
function updateBetButton() {
  if (canPlaceBet()) {
    placeBetBtn.disabled = false;
    placeBetBtn.textContent = 'Place Bet';
  } else {
    placeBetBtn.disabled = true;

    if (!state.amount) {
      placeBetBtn.textContent = 'Select Amount';
    } else if (!state.side) {
      placeBetBtn.textContent = 'Select Side';
    } else if (!state.connectedPCs.PC1 || !state.connectedPCs.PC2) {
      placeBetBtn.textContent = 'Both PCs Must Be Connected';
    }
  }
  // Update single PC bet buttons
  placeBetPc1Btn.disabled = !canPlaceBetSingle('PC1');
  placeBetPc2Btn.disabled = !canPlaceBetSingle('PC2');
}

// Format amount for display
function formatAmount(amount) {
  if (amount >= 1000000) {
    const millions = amount / 1000000;
    // If it's a whole number, don't show decimals
    if (millions === Math.floor(millions)) {
      return `${millions}M`;
    }
    // Otherwise show one decimal place
    return `${millions.toFixed(2).replace(/\.?0+$/, '')}M`;
  } else if (amount >= 1000) {
    return `${amount / 1000}K`;
  }
  return amount.toString();
}

// Add log entry
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;

  logContainer.insertBefore(entry, logContainer.firstChild);

  // Keep only last 50 entries
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// Initialize
connectStatusWebSocket();
updateBetButton();
updateCancelAllBtn();

// Render initial PC order
renderPcOrder();

// Initialize selected amount display
selectedAmountDisplay.textContent = '--';

// Initial log
addLog('Controller initialized', 'success');
addLog('Platform: Pragmatic only', 'info');

// Cancel all bets handler
cancelAllBtn.addEventListener('click', async () => {
  // Add visual click effect
  addClickEffect(cancelAllBtn);
  
  // Reset bet session state immediately when cancel is clicked
  if (state.isBetSessionActive) {
    console.log('[BetAutomation] Cancelling active bet session');
    state.isBetSessionActive = false;
    state.currentBetResults = {
      PC1: null,
      PC2: null,
      betId: null
    };
    addLog('Bet session cancelled by user', 'info');
  }
  
  try {
    const response = await fetch('/api/cancelBetAll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: currentUser }),
    });
    const result = await response.json();
    if (result.success) {
      addLog(result.message || 'Cancel bet command sent to connected PCs', 'success');
      showSuccessNotification(result.message || 'Cancel command sent');
    } else {
      addLog(`Failed to cancel bets: ${result.message}`, 'error');
      showErrorNotification(result.message || 'Failed to cancel bets');
    }
  } catch (err) {
    addLog(`Error sending cancel: ${err.message}`, 'error');
    showErrorNotification('Error sending cancel command');
  }
});

function updateCancelAllBtn() {
  const hasConnectedPCs = state.connectedPCs.PC1 || state.connectedPCs.PC2;
  cancelAllBtn.disabled = !hasConnectedPCs;
  
  // Update button text to show which PCs are connected
  if (hasConnectedPCs) {
    const connectedPCs = [];
    if (state.connectedPCs.PC1) connectedPCs.push('PC1');
    if (state.connectedPCs.PC2) connectedPCs.push('PC2');
    cancelAllBtn.textContent = `Cancel All (${connectedPCs.join(', ')})`;
  } else {
    cancelAllBtn.textContent = 'Cancel All (No PCs Connected)';
  }
}

// Check if both PCs have completed their bet attempts and show summary
function checkBetCompletion() {
  const pc1Result = state.currentBetResults.PC1;
  const pc2Result = state.currentBetResults.PC2;
  
  // Only show summary if both PCs have completed
  if (pc1Result && pc2Result) {
    // Check both PCs status and show appropriate notification
    if (pc1Result === 'success' && pc2Result === 'success') {
      addLog('Bet completion summary: Both PCs successfully placed bets', 'success');
      showSuccessNotification('Both PCs successfully placed bets');
    } else if (pc1Result === 'success' && pc2Result === 'error') {
      addLog('Bet completion summary: PC1 succeeded, PC2 failed', 'error');
      showErrorNotification('PC1 succeeded, PC2 failed - check individual errors above');
    } else if (pc1Result === 'error' && pc2Result === 'success') {
      addLog('Bet completion summary: PC1 failed, PC2 succeeded', 'error');
      showErrorNotification('PC1 failed, PC2 succeeded - check individual errors above');
    } else if (pc1Result === 'error' && pc2Result === 'error') {
      addLog('Bet completion summary: Both PCs failed to place bets', 'error');
      showErrorNotification('Both PCs failed to place bets - check individual errors above');
    }
    
    // Reset bet results and end bet session
    state.currentBetResults = {
      PC1: null,
      PC2: null,
      betId: null
    };
    state.isBetSessionActive = false;
    console.log('[BetAutomation] Ended bet session - isBetSessionActive:', state.isBetSessionActive);
  }
}

logoutBtn.addEventListener('click', () => {
  stopTokenRefreshMonitoring(); // Stop token refresh monitoring
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('licenseEndDate');
  window.location.href = 'login.html';
});

// Error notification system
function showErrorNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'error-notification';
  notification.innerHTML = `
    <div class="error-notification-content">
      <span class="error-icon">⚠️</span>
      <span class="error-message">${message}</span>
      <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);
}

// Success notification system
function showSuccessNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'success-notification';
  notification.innerHTML = `
    <div class="success-notification-content">
      <span class="success-icon">✅</span>
      <span class="success-message">${message}</span>
      <button class="success-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds (shorter for success)
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}
