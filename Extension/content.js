// Content script for Bet Automation Extension

(function () {

  // Prevent duplicate evaluation
  if (window.__BET_AUTOMATION_LOADED__) {
    console.log('Bet Automation script already loaded in this frame');
    return;
  }
  window.__BET_AUTOMATION_LOADED__ = true;

  // Activation state toggled by background script
  let isActive = false;

  // Helper – check if this frame actually contains the betting UI
  function isBettingFrame() {
    // Check for betting areas with multiple possible selectors (Pragmatic + New Platform)
    const pragmaticBetAreas = document.querySelector('#leftBetTextRoot, #rightBetTextRoot, [data-testid*="player"], [data-testid*="banker"], .player-bet, .banker-bet, .bet-area');
    const newPlatformBetAreas = document.querySelector('#betBoxPlayer, #betBoxBanker, #betBoxTie, .zone_bet_player, .zone_bet_banker, .zone_bet_tie');
    const betAreas = pragmaticBetAreas || newPlatformBetAreas;
    
    // Check for chip buttons with multiple possible selectors (Pragmatic + New Platform)
    const pragmaticChips = document.querySelector('button[data-testid^="chip-stack-value-"], button[data-testid*="chip"], .chip-button, [class*="chip"]');
    const newPlatformChips = document.querySelector('#chips .chips3d, .list_select_chips3d .chips3d, .chips3d-20, .chips3d-50, .chips3d-100, .chips3d-200, .chips3d-500');
    const chipButtons = pragmaticChips || newPlatformChips;
    
    // Additional checks for casino-related elements
    const casinoElements = document.querySelector('[class*="baccarat"], [class*="casino"], [class*="game"], [data-testid*="game"], .zone_bet, .main_bottom');
    
    // Debug logging for troubleshooting
    if (window.location.href.includes('casino') || window.location.href.includes('game') || window.location.href.includes('baccarat')) {
      console.log('[BetAutomation] Frame check - betAreas:', !!betAreas, 'chipButtons:', !!chipButtons, 'casinoElements:', !!casinoElements, 'URL:', window.location.href);
    }
    
    // Both betting areas and chip buttons exist - we're in betting frame and it's betting time
    if (betAreas && chipButtons) {
      return true;
    }
    
    // Only betting areas exist - we're on the right tab but not betting time
    if (betAreas && !chipButtons) {
      return 'not_betting_time';
    }
    
    // Casino elements exist but no betting areas - might be in game but not betting phase
    if (casinoElements && !betAreas) {
      return 'not_betting_time';
    }
    
    // Neither exist - we're in a different tab
    if (!betAreas && !chipButtons && !casinoElements) {
      return 'wrong_tab';
    }
    
    // Only chip buttons exist (unlikely but possible)
    if (!betAreas && chipButtons) {
      return 'wrong_tab';
    }
    
    return false;
  }

  // Visual indicator helpers
  function hideIndicator() {
    const el = document.querySelector('[data-bet-automation-indicator]');
    if (el) el.remove();
  }

  function showIndicator() {
    hideIndicator();
    const indicator = document.createElement('div');
    indicator.setAttribute('data-bet-automation-indicator', 'true');
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 9999;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    indicator.textContent = 'Bet Automation Active';
    document.body.appendChild(indicator);
  }

  // Helper function to check if this frame can process betting commands
  function canProcessBetting() {
    const bettingFrameResult = isBettingFrame();

    // Betting frame can always process
    if (bettingFrameResult === true) {
      return true;
    }

    // Allow not_betting_time only if this frame actually has bet areas (i.e., game frame)
    if (bettingFrameResult === 'not_betting_time') {
      const betAreasPresent = !!document.querySelector('#leftBetTextRoot, #rightBetTextRoot, [data-testid*="player"], [data-testid*="banker"], .player-bet, .banker-bet, .bet-area');
      if (betAreasPresent) {
        return true;
      }
    }

    // Otherwise, don't process (no betting elements or not the right frame)
    return false;
  }

  // Track the last error sent to prevent duplicates
  let lastErrorSent = null;
  let lastErrorTime = 0;

  // Helper function to safely send error messages (only when properly connected)
  function sendBetError(errorData) {
    // Only send error messages if we're active and can process betting
    if (isActive && canProcessBetting()) {
      const currentTime = Date.now();
      
      // Create a unique key for this error to prevent duplicates
      // Include timestamp to make it more unique for rapid successive calls
      const errorKey = `${errorData.errorType}_${errorData.platform}_${errorData.amount}_${errorData.side}_${Math.floor(currentTime / 1000)}`;
      
      // Only send if this is a different error or enough time has passed since the last error
      if (lastErrorSent !== errorKey || (currentTime - lastErrorTime) > 3000) {
        lastErrorSent = errorKey;
        lastErrorTime = currentTime;
        console.log(`[BetAutomation] Sending error: ${errorData.errorType || 'unknown'}`);
        chrome.runtime.sendMessage({
          type: 'betError',
          ...errorData
        });
      } else {
        console.log(`[BetAutomation] Ignoring duplicate error (too soon): ${errorData.errorType || 'unknown'}`);
      }
    } else {
      console.log(`[BetAutomation] Ignoring error message - not active or cannot process betting. Active: ${isActive}, CanProcess: ${canProcessBetting()}, ErrorType: ${errorData.errorType || 'unknown'}`);
    }
  }

  // Listen for bet commands from background script
  chrome.runtime.onMessage.addListener((request) => {
    switch (request.type) {
      case 'activateBetAutomation':
        // Always mark active on activation; processing remains gated by canProcessBetting()
        isActive = true;
        const activateBettingFrameResult = isBettingFrame();
        console.log("[BetAutomation] Activated - bettingResult:", activateBettingFrameResult, "isActive:", isActive, "CanProcess:", canProcessBetting());
        if (activateBettingFrameResult === true) {
          showIndicator();
        }
        // No error messages during activation - just activate silently
        break;
      case 'deactivateBetAutomation':
        isActive = false;
        hideIndicator();
        console.log("[BetAutomation] Deactivated - isActive:", isActive);
        break;
      case 'checkBettingTime':
        // ===== BOTH PC BETTING - Betting time check first =====
        console.log('[Content] Both PC betting time check received:', request);
        
        if (isActive && canProcessBetting()) {
          const checkBettingFrameResult = isBettingFrame();
          if (checkBettingFrameResult === true) {
            // We're in betting frame and it's betting time
            const isPragmatic = document.querySelector('button[data-testid^="chip-stack-value-"]') !== null;
            const isNewPlatform = document.querySelector('#chips .chips3d') !== null;
            const bettingTimeResult = checkBettingTime(isPragmatic, isNewPlatform);
            
            if (bettingTimeResult === true) {
              console.log('[Content] Both PC betting time confirmed');
              chrome.runtime.sendMessage({
                type: 'bettingTimeCheck',
                result: true,
                message: 'Betting time confirmed for both PC betting'
              });
            } else {
              console.log('[Content] Both PC betting time not available:', bettingTimeResult);
              chrome.runtime.sendMessage({
                type: 'bettingTimeCheck',
                result: false,
                message: bettingTimeResult,
                errorType: 'not_betting_time'
              });
            }
          } else if (checkBettingFrameResult === 'not_betting_time') {
            console.log('[Content] Both PC betting - not betting time');
            chrome.runtime.sendMessage({
              type: 'bettingTimeCheck',
              result: false,
              message: 'You are on the right tab but it is not betting time. Please wait for the betting phase.',
              errorType: 'not_betting_time'
            });
          } else if (checkBettingFrameResult === 'wrong_tab') {
            console.log('[Content] Both PC betting - wrong tab');
            chrome.runtime.sendMessage({
              type: 'bettingTimeCheck',
              result: false,
              message: 'You are not on the betting tab. Please navigate to the casino game.',
              errorType: 'wrong_tab'
            });
          }
        } else {
          console.log('[Content] Both PC betting time check ignored - not active or cannot process betting');
        }
        break;
      case 'placeBet':
        // ===== SINGLE PC BETTING - Direct bet placement =====
        console.log('[Content] Single PC bet command received:', request);
        
        // Only respond from frames that can process betting to prevent duplicate responses
        if (isActive && canProcessBetting()) {
          const bettingFrameResult = isBettingFrame();
          if (bettingFrameResult === true) {
            console.log('[Content] Single PC betting - placing bet directly');
            placeBet(request.platform, request.amount, request.side);
          } else if (bettingFrameResult === 'not_betting_time') {
            const betAreasPresent = !!document.querySelector('#leftBetTextRoot, #rightBetTextRoot, [data-testid*="player"], [data-testid*="banker"], .player-bet, .banker-bet, .bet-area');
            // If there are no bet areas and we're in the top window, treat this as wrong_tab for controller clarity
            if (betAreasPresent) {
              console.log('[Content] Single PC betting - not betting time');
              sendBetError({
                message: 'Cannot place bet: You are on the right tab but it is not betting time. Please wait for the betting phase.',
                platform: request.platform,
                amount: request.amount,
                side: request.side,
                errorType: 'not_betting_time'
              });
            } // if no bet areas in this frame, ignore; another frame or controller timeout will handle
          } else if (bettingFrameResult === 'wrong_tab') {
            // Do not emit wrong_tab from content script; controller/background handles site-not-found via timeout
            console.log('[Content] Single PC betting - wrong tab (ignored)');
          }
        } else {
          console.log('[Content] Single PC bet ignored - not active or cannot process betting');
        }
        break;
      case 'cancelBet':
        // Only respond from frames that can process betting to prevent duplicate responses
        if (isActive && canProcessBetting()) {
          console.log('[BetAutomation] Processing cancelBet command in betting frame');
          const bettingFrameResult = isBettingFrame();
          if (bettingFrameResult === true) {
            cancelBet();
          } else if (bettingFrameResult === 'not_betting_time') {
            const betAreasPresent = !!document.querySelector('#leftBetTextRoot, #rightBetTextRoot, [data-testid*="player"], [data-testid*="banker"], .player-bet, .banker-bet, .bet-area');
            if (betAreasPresent) {
              sendBetError({
                message: 'Cannot cancel bet: You are on the right tab but it is not betting time.',
                errorType: 'not_betting_time'
              });
            } // else ignore; controller/background handles via timeout
          } else if (bettingFrameResult === 'wrong_tab') {
            // Do not emit wrong_tab from content script
          }
        } else {
          console.log('[BetAutomation] Ignoring cancelBet command - not active or not main frame');
        }
        break;
      default:
        break;
    }
  });

  // Function to add visual click effect
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
    
    // Add CSS animation if not already added
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
    
    // Remove effect after animation
    setTimeout(() => {
      if (effect.parentNode) {
        effect.parentNode.removeChild(effect);
      }
    }, 600);
  }

  // Function to simulate a more realistic click with visual effect
  function simulateClick(element) {
    console.log(`[BetAutomation] Simulating click on element:`, element);
    
    // Add visual click effect
    addClickEffect(element);
    
    // Method 1: Try regular click first
    try {
      console.log(`[BetAutomation] Method 1: Direct click()`);
      element.click();
    } catch (e) {
      console.log(`[BetAutomation] Method 1 failed:`, e);
    }
    
    // Method 2: Dispatch mouse events with more realistic timing and human-like behavior
    try {
      const rect = element.getBoundingClientRect();
      // Add slight randomness to click position to simulate human behavior
      const centerX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 4;
      const centerY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 4;

      console.log(`[BetAutomation] Method 2: Mouse events at (${centerX}, ${centerY})`);

      // Simulate human-like mouse movement before clicking
      const moveEvent = new MouseEvent('mousemove', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        button: -1,
        buttons: 0
      });
      element.dispatchEvent(moveEvent);

      // Small delay to simulate human reaction time
      setTimeout(() => {
        // Create and dispatch mousedown event with human-like properties
        const mousedownEvent = new MouseEvent('mousedown', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
          screenX: centerX + window.screenX,
          screenY: centerY + window.screenY,
          button: 0,
          buttons: 1,
          detail: 1,
          isTrusted: true
        });
        element.dispatchEvent(mousedownEvent);

        // Human-like delay between mousedown and mouseup
        setTimeout(() => {
          // Create and dispatch mouseup event
          const mouseupEvent = new MouseEvent('mouseup', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
            screenX: centerX + window.screenX,
            screenY: centerY + window.screenY,
            button: 0,
            buttons: 0,
            detail: 1,
            isTrusted: true
          });
          element.dispatchEvent(mouseupEvent);

          // Small delay before click event
          setTimeout(() => {
            // Create and dispatch click event
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX + window.screenX,
              screenY: centerY + window.screenY,
              button: 0,
              buttons: 0,
              detail: 1,
              isTrusted: true
            });
            element.dispatchEvent(clickEvent);
          }, 5);
        }, 50 + Math.random() * 30); // Random delay between 50-80ms
      }, 10 + Math.random() * 20); // Random delay between 10-30ms
    } catch (e) {
      console.log(`[BetAutomation] Method 2 failed:`, e);
    }

    // Method 3: Try pointer events with human-like behavior
    try {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 4;
      const centerY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 4;

      console.log(`[BetAutomation] Method 3: Pointer events at (${centerX}, ${centerY})`);

      // Simulate pointer movement
      const pointerMoveEvent = new PointerEvent('pointermove', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        pointerId: 1,
        pointerType: 'mouse',
        button: -1,
        buttons: 0,
        isTrusted: true
      });
      element.dispatchEvent(pointerMoveEvent);

      setTimeout(() => {
        const pointerdownEvent = new PointerEvent('pointerdown', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
          screenX: centerX + window.screenX,
          screenY: centerY + window.screenY,
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          isTrusted: true
        });
        element.dispatchEvent(pointerdownEvent);

        setTimeout(() => {
          const pointerupEvent = new PointerEvent('pointerup', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
            screenX: centerX + window.screenX,
            screenY: centerY + window.screenY,
            pointerId: 1,
            pointerType: 'mouse',
            button: 0,
            buttons: 0,
            isTrusted: true
          });
          element.dispatchEvent(pointerupEvent);
        }, 50 + Math.random() * 30);
      }, 10 + Math.random() * 20);
    } catch (e) {
      console.log(`[BetAutomation] Method 3 failed:`, e);
    }
    
    // Method 4: Try focus and enter key (for some interactive elements)
    try {
      console.log(`[BetAutomation] Method 4: Focus and Enter key`);
      element.focus();
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        isTrusted: true
      });
      element.dispatchEvent(enterEvent);
    } catch (e) {
      console.log(`[BetAutomation] Method 4 failed:`, e);
    }
    
    // Method 5: Try triggering game-specific event handlers
    try {
      console.log(`[BetAutomation] Method 5: Game-specific events`);
      
      // Try to trigger any custom event handlers the game might be listening for
      const customEvents = ['bet', 'chip', 'select', 'choose', 'pick', 'place'];
      
      customEvents.forEach(eventName => {
        const customEvent = new CustomEvent(eventName, {
          bubbles: true,
          cancelable: true,
          detail: { amount: element.dataset.amount || element.textContent }
        });
        element.dispatchEvent(customEvent);
      });
      
      // Try to trigger touch events (some games use touch handlers)
      const touchStartEvent = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [{
          clientX: element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2,
          clientY: element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2,
          identifier: 1
        }]
      });
      element.dispatchEvent(touchStartEvent);
      
      setTimeout(() => {
        const touchEndEvent = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [{
            clientX: element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2,
            clientY: element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2,
            identifier: 1
          }]
        });
        element.dispatchEvent(touchEndEvent);
      }, 50);
      
    } catch (e) {
      console.log(`[BetAutomation] Method 5 failed:`, e);
    }
    
    // Method 6: Try to trigger game's internal functions directly
    try {
      console.log(`[BetAutomation] Method 6: Direct function calls`);
      
      // Try to find and call game's internal betting functions
      const gameFunctions = [
        'selectChip', 'chooseChip', 'pickChip', 'placeBet', 'bet',
        'onChipClick', 'chipClick', 'selectAmount', 'chooseAmount'
      ];
      
      // Check if any of these functions exist in the global scope
      gameFunctions.forEach(funcName => {
        if (typeof window[funcName] === 'function') {
          console.log(`[BetAutomation] Found game function: ${funcName}`);
          try {
            // Try to call the function with the element or amount
            const amount = element.dataset.amount || element.textContent || element.getAttribute('value');
            if (amount) {
              window[funcName](parseInt(amount), element);
            } else {
              window[funcName](element);
            }
          } catch (e) {
            console.log(`[BetAutomation] Function ${funcName} call failed:`, e);
          }
        }
      });
      
      // Try to trigger any event listeners attached to the element
      if (element._listeners) {
        console.log(`[BetAutomation] Found element listeners:`, element._listeners);
        // This is a fallback - most modern frameworks don't expose listeners this way
      }
      
    } catch (e) {
      console.log(`[BetAutomation] Method 6 failed:`, e);
    }
  }

  // Function to find clickable element within betting area
  function findClickableElement(rootElement, side) {
    // Try different selectors based on the HTML structure
    const selectors = [
      '#leftBetText', // The text div inside
      '.so_sy', // The content wrapper
      '.so_sw', // Inner wrapper
      'svg', // The SVG element
      '.so_sr', // The SVG container
    ];

    // If it's the root element itself
    if (rootElement) {
      // Check if any child element is more suitable for clicking
      for (const selector of selectors) {
        const child = rootElement.querySelector(selector);
        if (child) {
          return child;
        }
      }
      // Return the root element if no better option found
      return rootElement;
    }
    return null;
  }

  // Function to check if it's betting time
  function checkBettingTime(isPragmatic, isNewPlatform) {
    if (isPragmatic) {
      // Pragmatic platform - minimal validation to avoid breaking existing logic
      // Only check for obvious betting disabled states
      const bettingDisabled = document.querySelector('[class*="betting-disabled"], [data-testid*="betting-disabled"]');
      if (bettingDisabled) {
        return 'Betting is disabled - game in progress';
      }
      
      // For Pragmatic, let the game handle betting validation
      // Don't interfere with existing working logic
      return true; // Always allow betting on Pragmatic
    } else if (isNewPlatform) {
      // New platform - strict betting time validation
      const bettingDisabled = document.querySelector('[class*="betting-disabled"], [class*="game-in-progress"], [id*="betting-disabled"], [id*="game-in-progress"]');
      if (bettingDisabled) {
        return 'Betting is disabled - game in progress';
      }
      
       // Check for countdown timers - updated for actual HTML structure
       const countdown = document.querySelector('#countdown, #countdownTime, [id*="countdown"], [class*="countdown"]');
       if (countdown) {
         console.log(`[BetAutomation] Found countdown element:`, countdown);
         
         // Look for the countdown time specifically in the nested structure
         const countdownTime = document.querySelector('#countdownTime p');
         if (countdownTime) {
           const countdownText = (countdownTime.textContent || countdownTime.innerText || '').trim();
           console.log(`[BetAutomation] Countdown text: "${countdownText}"`);
           
           // Check if countdown contains a valid number
           const countdownNumber = parseInt(countdownText);
           
           // If it's not a number or is NaN, it's not betting time
           if (isNaN(countdownNumber) || countdownText === '' || countdownText === null) {
             return 'Not betting time - countdown not showing valid number';
           }
           
           // If countdown is 0 or negative, betting time has ended
           if (countdownNumber <= 0) {
             return 'Betting time has ended - countdown reached 0';
           }
           
           // If countdown is very low (1-3 seconds), warn but allow betting
           if (countdownNumber <= 3) {
             console.log(`[BetAutomation] Warning: Countdown is very low (${countdownNumber} seconds)`);
           }
           
           console.log(`[BetAutomation] Betting time confirmed - countdown: ${countdownNumber} seconds`);
         } else {
           console.log(`[BetAutomation] CountdownTime p element not found`);
           return 'Not betting time - countdown element not found';
         }
       } else {
         console.log(`[BetAutomation] No countdown element found`);
         return 'Not betting time - no countdown element found';
       }
      
      // Check if chips are disabled
      const disabledChips = document.querySelectorAll('#chips .chips3d.disabled, .list_select_chips3d .chips3d.disabled');
      if (disabledChips.length > 0) {
        return 'Chips are disabled - not betting time';
      }
      
      // Check for betting phase indicators
      const bettingPhase = document.querySelector('[class*="betting-phase"], [class*="place-bet"], [id*="betting-phase"]');
      if (!bettingPhase) {
        // Look for game phase indicators that might indicate non-betting time
        const gamePhase = document.querySelector('[class*="game-phase"], [class*="result-phase"], [class*="dealing-phase"]');
        if (gamePhase) {
          return 'Not betting time - game is in progress or showing results';
        }
      }
      
      return true; // Betting time confirmed
    }
    
    return 'Unknown platform - cannot determine betting time';
  }

  // Function to check for betting errors after bet placement
  function checkForBettingErrors() {
    // Common error selectors for both platforms
    const errorSelectors = [
      // General error messages
      '[class*="error"]',
      '[class*="Error"]',
      '[data-testid*="error"]',
      '[class*="alert"]',
      '[class*="warning"]',
      '[class*="message"]',
      '[class*="notification"]',
      
      // Specific error types
      '[class*="balance"]',
      '[class*="insufficient"]',
      '[class*="funds"]',
      '[class*="limit"]',
      '[class*="maximum"]',
      '[class*="minimum"]',
      '[class*="betting-disabled"]',
      '[class*="game-in-progress"]',
      
      // Toast/notification messages
      '.toast',
      '.notification',
      '.alert',
      '.message',
      '.popup',
      '.modal'
    ];
    
    // Check for error messages
    for (const selector of errorSelectors) {
      const errorElements = document.querySelectorAll(selector);
      for (const element of errorElements) {
        const text = (element.textContent || element.innerText || '').trim();
        if (text && text.length > 0 && text.length < 200) { // Reasonable error message length
          // Check if it's actually an error message (not just any text)
          const lowerText = text.toLowerCase();
          
          // Common error keywords
          const errorKeywords = [
            'balance', 'insufficient', 'funds', 'not enough', 'low balance',
            'limit', 'maximum', 'minimum', 'exceeded', 'too high', 'too low',
            'disabled', 'not available', 'betting closed', 'game in progress',
            'error', 'failed', 'invalid', 'rejected', 'denied', 'blocked',
            'timeout', 'expired', 'ended', 'finished', 'complete'
          ];
          
          const hasErrorKeyword = errorKeywords.some(keyword => lowerText.includes(keyword));
          
          if (hasErrorKeyword) {
            console.log(`[BetAutomation] Found error message: "${text}"`);
            
            // Categorize the error type
            let errorType = 'betting_error';
            if (lowerText.includes('balance') || lowerText.includes('insufficient') || lowerText.includes('funds')) {
              errorType = 'insufficient_balance';
            } else if (lowerText.includes('limit') || lowerText.includes('maximum') || lowerText.includes('minimum')) {
              errorType = 'bet_limit_exceeded';
            } else if (lowerText.includes('disabled') || lowerText.includes('not available')) {
              errorType = 'betting_disabled';
            } else if (lowerText.includes('timeout') || lowerText.includes('expired')) {
              errorType = 'betting_timeout';
            }
            
            return {
              hasError: true,
              message: text,
              errorType: errorType,
              details: {
                selector: selector,
                element: element.tagName,
                className: element.className
              }
            };
          }
        }
      }
    }
    
    // Check for specific platform error indicators
    const isPragmatic = document.querySelector('button[data-testid^="chip-stack-value-"]') !== null;
    const isNewPlatform = document.querySelector('#chips .chips3d') !== null;
    
    if (isPragmatic) {
      // Pragmatic-specific error checks
      const pragmaticErrors = document.querySelectorAll('[data-testid*="error"], [class*="error-message"]');
      for (const error of pragmaticErrors) {
        const text = (error.textContent || error.innerText || '').trim();
        if (text) {
          return {
            hasError: true,
            message: text,
            errorType: 'pragmatic_error',
            details: { platform: 'pragmatic' }
          };
        }
      }
    } else if (isNewPlatform) {
      // New platform-specific error checks
      const newPlatformErrors = document.querySelectorAll('[class*="error"], [id*="error"], .alert, .message');
      for (const error of newPlatformErrors) {
        const text = (error.textContent || error.innerText || '').trim();
        if (text && text.length > 0 && text.length < 200) {
          const lowerText = text.toLowerCase();
          if (lowerText.includes('error') || lowerText.includes('failed') || lowerText.includes('invalid')) {
            return {
              hasError: true,
              message: text,
              errorType: 'new_platform_error',
              details: { platform: 'new_platform' }
            };
          }
        }
      }
    }
    
    return { hasError: false };
  }

  // Function to place a bet
  async function placeBet(platform, amount, side) {
    try {
      // Ensure script active and correct frame
      if (!isActive) {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: 'Script not active',
          platform,
          amount,
          side,
          errorType: 'script_inactive'
        });
        return;
      }

      const bettingFrameResult = isBettingFrame();
      if (bettingFrameResult !== true) {
        let errorMessage = 'Not in betting frame';
        let errorType = 'not_betting_frame';
        
        if (bettingFrameResult === 'not_betting_time') {
          errorMessage = 'You are on the right tab but it is not betting time. Please wait for the betting phase.';
          errorType = 'not_betting_time';
        } else if (bettingFrameResult === 'wrong_tab') {
          errorMessage = 'You are not on the betting tab. Please navigate to the casino game.';
          errorType = 'wrong_tab';
        }
        
        chrome.runtime.sendMessage({
          type: 'betError',
          message: errorMessage,
          platform,
          amount,
          side,
          errorType: errorType
        });
        return;
      }

      // Validate inputs
      if (!amount || amount <= 0) {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: `Invalid bet amount: ${amount}`,
          platform,
          amount,
          side,
          errorType: 'invalid_amount'
        });
        return;
      }

      if (!side || !['Player', 'Banker', 'player-pair', 'perfect-pair', 'big', 'small', 'any-pair', 'banker-pair'].includes(side)) {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: `Invalid bet side: ${side}`,
          platform,
          amount,
          side,
          errorType: 'invalid_side'
        });
        return;
      }

      // Short initial wait to ensure page is ready
      await sleep(150);

      // Check if we're in a betting state (wait for betting interface to load)
      const maxWaitTime = 5000; // 5 seconds
      const startTime = Date.now();
      let bettingInterfaceReady = false;
      
      while (Date.now() - startTime < maxWaitTime) {
        // Check for both Pragmatic and new platform elements
        const pragmaticChips = document.querySelectorAll('button[data-testid^="chip-stack-value-"]');
        const newPlatformChips = document.querySelectorAll('#chips .chips3d, .list_select_chips3d .chips3d');
        const pragmaticPlayerArea = document.getElementById('leftBetTextRoot');
        const pragmaticBankerArea = document.getElementById('rightBetTextRoot');
        const newPlatformPlayerArea = document.getElementById('betBoxPlayer');
        const newPlatformBankerArea = document.getElementById('betBoxBanker');
        
        if ((pragmaticChips.length > 0 && (pragmaticPlayerArea || pragmaticBankerArea)) ||
            (newPlatformChips.length > 0 && (newPlatformPlayerArea || newPlatformBankerArea))) {
          bettingInterfaceReady = true;
          break;
        }
        
        await sleep(200);
      }
      
      if (!bettingInterfaceReady) {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: 'Betting interface not ready after 5 seconds',
          platform,
          amount,
          side,
          errorType: 'betting_interface_timeout'
        });
        return;
      }

      // Detect platform type first
      const isPragmatic = document.querySelector('button[data-testid^="chip-stack-value-"]') !== null;
      const isNewPlatform = document.querySelector('#chips .chips3d') !== null;

      console.log(`[BetAutomation] Platform detection - Pragmatic: ${isPragmatic}, New Platform: ${isNewPlatform}`);
      console.log(`[BetAutomation] Betting side: ${side}, Amount: ${amount}`);

      // Check if it's actually betting time
      const bettingTimeResult = checkBettingTime(isPragmatic, isNewPlatform);
      console.log(`[BetAutomation] Betting time check result: ${bettingTimeResult}`);
      
      if (bettingTimeResult !== true) {
        console.log(`[BetAutomation] Not betting time: ${bettingTimeResult}`);
        chrome.runtime.sendMessage({
          type: 'betError',
          message: bettingTimeResult,
          platform,
          amount,
          side,
          errorType: 'not_betting_time'
        });
        return;
      }
      
      console.log('[BetAutomation] Betting time confirmed - proceeding with bet attempt');

      console.log(`[BetAutomation] Platform detected - Pragmatic: ${isPragmatic}, New Platform: ${isNewPlatform}`);

      // Step 1: Handle chip selection based on platform
      let chipButton = null;
      let chipPlan = null;

      if (isPragmatic) {
        // Pragmatic platform logic - try exact match first (preserves existing behavior)
        const chipSelector = `button[data-testid="chip-stack-value-${amount}"]`;
        chipButton = document.querySelector(chipSelector);
        
        console.log(`[BetAutomation] Looking for Pragmatic chip ${amount}, found:`, !!chipButton);

        // Helper to get all available chips (Pragmatic)
        function getAvailableChips() {
          const chipButtons = Array.from(
            document.querySelectorAll('button[data-testid^="chip-stack-value-"]'),
          ).filter((btn) => !btn.disabled && !btn.hasAttribute('disabled'));

          const uniqueByValue = new Map();
          for (const btn of chipButtons) {
            const match = btn
              .getAttribute('data-testid')
              .match(/chip-stack-value-(\d+)/);
            if (match) {
              const value = parseInt(match[1], 10);
              if (!uniqueByValue.has(value)) {
                uniqueByValue.set(value, { value, btn });
              }
            }
          }

          return Array.from(uniqueByValue.values()).sort((a, b) => b.value - a.value);
        }

        if (!chipButton) {
          console.log(`[BetAutomation] Exact chip ${amount} not found, trying composition...`);
          const availableChips = getAvailableChips();
          
          if (availableChips.length === 0) {
            chrome.runtime.sendMessage({
              type: 'betError',
              message: 'No chip buttons found on the page',
              platform,
              amount,
              side,
              errorType: 'no_chips_found'
            });
            return;
          }
          
          console.log(`[BetAutomation] Available chips:`, availableChips.map(c => c.value));
          chipPlan = composeChips(amount, availableChips);
          if (!chipPlan) {
            const availableValues = availableChips.map(chip => formatAmount(chip.value)).join(', ');
            chrome.runtime.sendMessage({
              type: 'betError',
              message: `Cannot compose amount ${formatAmount(amount)} with available chips: ${availableValues}`,
              platform,
              amount,
              side,
              errorType: 'cannot_compose_amount',
              availableChips: availableChips.map(chip => chip.value)
            });
            return;
          }
        }
      } else if (isNewPlatform) {
         // New platform logic - try exact match first
         // Handle different chip formats: 1000 -> chips3d-1k, 500 -> chips3d-500, etc.
         let chipSelector;
         if (amount >= 1000) {
           // Convert 1000 to 1k, 2000 to 2k, etc.
           const kAmount = `${Math.floor(amount / 1000)}k`;
           chipSelector = `.chips3d-${kAmount}`;
         } else {
           chipSelector = `.chips3d-${amount}`;
         }
        
        chipButton = document.querySelector(chipSelector);
        
        console.log(`[BetAutomation] Looking for new platform chip ${amount} (selector: ${chipSelector}), found:`, !!chipButton);

        // Helper to get all available chips (New Platform)
        function getAvailableChips() {
          const chipButtons = Array.from(
            document.querySelectorAll('#chips .chips3d, .list_select_chips3d .chips3d'),
          ).filter((btn) => !btn.classList.contains('disabled'));

          const uniqueByValue = new Map();
          for (const btn of chipButtons) {
            // Match both formats: chips3d-500 and chips3d-1k
            const match = btn.className.match(/chips3d-(\d+)(k)?/);
            if (match) {
              let value;
              if (match[2] === 'k') {
                // Handle k format: 1k = 1000, 2k = 2000, etc.
                value = parseInt(match[1], 10) * 1000;
              } else {
                // Handle regular format: 500, 200, etc.
                value = parseInt(match[1], 10);
              }
              
              if (!uniqueByValue.has(value)) {
                uniqueByValue.set(value, { value, btn });
              }
            }
          }

          return Array.from(uniqueByValue.values()).sort((a, b) => b.value - a.value);
        }

        if (!chipButton) {
          console.log(`[BetAutomation] Exact chip ${amount} not found, trying composition...`);
          const availableChips = getAvailableChips();
          
          if (availableChips.length === 0) {
            chrome.runtime.sendMessage({
              type: 'betError',
              message: 'No chip buttons found on the page',
              platform,
              amount,
              side,
              errorType: 'no_chips_found'
            });
            return;
          }
          
          console.log(`[BetAutomation] Available chips:`, availableChips.map(c => c.value));
          chipPlan = composeChips(amount, availableChips);
          if (!chipPlan) {
            const availableValues = availableChips.map(chip => formatAmount(chip.value)).join(', ');
            chrome.runtime.sendMessage({
              type: 'betError',
              message: `Cannot compose amount ${formatAmount(amount)} with available chips: ${availableValues}`,
              platform,
              amount,
              side,
              errorType: 'cannot_compose_amount',
              availableChips: availableChips.map(chip => chip.value)
            });
            return;
          }
        }
      } else {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: 'Unsupported platform - neither Pragmatic nor new platform detected',
          platform,
          amount,
          side,
          errorType: 'unsupported_platform'
        });
        return;
      }

      // Helper to compose amount using available chips (dynamic programming)
      function composeChips(target, chips) {
        const dp = Array(target + 1).fill(null);
        dp[0] = [];
        for (let i = 1; i <= target; i++) {
          for (const chip of chips) {
            if (i - chip.value >= 0 && dp[i - chip.value] !== null) {
              dp[i] = dp[i - chip.value].concat([chip.value]);
              break;
            }
          }
        }
        if (!dp[target]) return null;
        const counts = {};
        for (const v of dp[target]) counts[v] = (counts[v] || 0) + 1;
        return chips
          .map(chip => counts[chip.value] ? { chip, count: counts[chip.value] } : null)
          .filter(Boolean);
      }

       // Step 2: Find the bet area based on platform
       let betArea;
       if (isPragmatic) {
         // Pragmatic platform bet areas
         if (side === 'Player') {
           betArea = document.getElementById('leftBetTextRoot');
         } else if (side === 'Banker') {
           betArea = document.getElementById('rightBetTextRoot');
         }
       } else if (isNewPlatform) {
         // New platform bet areas - handle additional betting options
         if (side === 'Player') {
           betArea = document.getElementById('betBoxPlayer');
         } else if (side === 'Banker') {
           betArea = document.getElementById('betBoxBanker');
         } else if (side === 'player-pair') {
           betArea = document.getElementById('betBoxPlayerPair');
         } else if (side === 'perfect-pair') {
           betArea = document.getElementById('betBoxPhoenix');
         } else if (side === 'big') {
           betArea = document.getElementById('betBoxBig');
         } else if (side === 'small') {
           betArea = document.getElementById('betBoxSmall');
         } else if (side === 'any-pair') {
           betArea = document.getElementById('betBoxTurtle');
         } else if (side === 'banker-pair') {
           betArea = document.getElementById('betBoxBankerPair');
         }
       }

      if (!betArea) {
        // Try alternative selectors for bet areas
        const alternativeSelectors = {
          'Player': [
            '[data-testid="player-bet-area"]',
            '.player-bet-area',
            '.left-bet-area',
            '[data-side="player"]',
            '.zone_bet_player'
          ],
          'Banker': [
            '[data-testid="banker-bet-area"]',
            '.banker-bet-area',
            '.right-bet-area',
            '[data-side="banker"]',
            '.zone_bet_banker'
          ]
        };
        
        const selectors = alternativeSelectors[side] || [];
        for (const selector of selectors) {
          betArea = document.querySelector(selector);
          if (betArea) break;
        }
        
        if (!betArea) {
          chrome.runtime.sendMessage({
            type: 'betError',
            message: `Bet area not found for ${side}. Tried platform-specific and alternative selectors`,
            platform,
            amount,
            side,
            errorType: 'bet_area_not_found',
            triedSelectors: ['leftBetTextRoot', 'rightBetTextRoot', 'betBoxPlayer', 'betBoxBanker', ...selectors]
          });
          return;
        }
      }

      // Step 3: Place the bet(s)
      try {
        if (chipButton) {
          // Exact chip exists, use original logic
          console.log(`[BetAutomation] About to click chip: ${amount}`);
          console.log(`[BetAutomation] Chip element:`, chipButton);
          console.log(`[BetAutomation] Chip classes:`, chipButton.className);
          console.log(`[BetAutomation] Chip attributes:`, chipButton.attributes);
          
          // Check if chip is enabled (different logic for different platforms)
          let isDisabled = false;
          if (isPragmatic) {
            isDisabled = chipButton.disabled || chipButton.hasAttribute('disabled');
          } else if (isNewPlatform) {
            isDisabled = chipButton.classList.contains('disabled') || chipButton.hasAttribute('disabled');
          }
          
          console.log(`[BetAutomation] Chip disabled status:`, isDisabled);
          
          if (isDisabled) {
            chrome.runtime.sendMessage({
              type: 'betError',
              message: `Chip ${formatAmount(amount)} is disabled`,
              platform,
              amount,
              side,
              errorType: 'chip_disabled'
            });
            return;
          }
          
          // Click chip with visual effect
          console.log(`[BetAutomation] Clicking chip: ${amount}`);
          simulateClick(chipButton);
          
          // Send chip click notification
          chrome.runtime.sendMessage({
            type: 'chipClicked',
            platform: platform,
            amount: amount,
            side: side,
            message: `Chip ${formatAmount(amount)} clicked`
          });
          
          await sleep(300);
          
          // Click bet area with visual effect
          console.log(`[BetAutomation] Bet area element:`, betArea);
          console.log(`[BetAutomation] Bet area classes:`, betArea.className);
          console.log(`[BetAutomation] Bet area attributes:`, betArea.attributes);
          
          const clickTarget = findClickableElement(betArea, side);
          if (clickTarget) {
            console.log(`[BetAutomation] Clicking bet area: ${side}`);
            console.log(`[BetAutomation] Click target:`, clickTarget);
            simulateClick(clickTarget);
          } else {
            console.log(`[BetAutomation] Clicking bet area (fallback): ${side}`);
            simulateClick(betArea);
          }
          
          // Send bet area click notification
          chrome.runtime.sendMessage({
            type: 'betAreaClicked',
            platform: platform,
            amount: amount,
            side: side,
            message: `Bet area ${side} clicked`
          });
        } else if (chipPlan) {
          // Compose using multiple chips
          for (const { chip, count } of chipPlan) {
            // Check if chip is enabled (different logic for different platforms)
            let isDisabled = false;
            if (isPragmatic) {
              isDisabled = chip.btn.disabled || chip.btn.hasAttribute('disabled');
            } else if (isNewPlatform) {
              isDisabled = chip.btn.classList.contains('disabled') || chip.btn.hasAttribute('disabled');
            }
            
            if (isDisabled) {
              chrome.runtime.sendMessage({
                type: 'betError',
                message: `Chip ${formatAmount(chip.value)} is disabled`,
                platform,
                amount,
                side,
                errorType: 'chip_disabled',
                chipValue: chip.value
              });
              return;
            }
            
            // Select chip once with visual effect
            console.log(`[BetAutomation] Selecting chip: ${chip.value}`);
            simulateClick(chip.btn);
            await sleep(300); // Allow UI to register selected chip

            const clickTarget = findClickableElement(betArea, side);
            for (let i = 0; i < count; i++) {
              console.log(
                `[BetAutomation] Placing chip ${chip.value} - click ${i + 1}/${count}`,
              );
              if (clickTarget) {
                simulateClick(clickTarget);
              } else {
                simulateClick(betArea);
              }
              await sleep(150); // Wait for bet to register
            }
          }
        } else {
          chrome.runtime.sendMessage({
            type: 'betError',
            message: 'No chip button or chip plan available',
            platform,
            amount,
            side,
            errorType: 'no_chip_available'
          });
          return;
        }

        // Wait for bet to be placed
        await sleep(300);
        
        // Step 4: Click the confirm button to finalize the bet (ONLY for new platform - Pragmatic doesn't need this)
        if (isNewPlatform) {
          console.log('[BetAutomation] Looking for confirm button (new platform only)...');
          
          // Find confirm button for new platform only
          let confirmButton = document.querySelector('#confirm, .btn_confirm, button[class*="confirm"], [id*="confirm"]');
          
          // Try alternative selectors if primary ones don't work
          if (!confirmButton) {
            const alternativeSelectors = [
              'button[class*="confirm"]',
              '.btn_confirm',
              '#confirm',
              '[id*="confirm"]',
              '[class*="confirm"]'
            ];
            
            for (const selector of alternativeSelectors) {
              confirmButton = document.querySelector(selector);
              if (confirmButton) {
                console.log(`[BetAutomation] Found confirm button with selector: ${selector}`);
                break;
              }
            }
          }
          
          if (confirmButton) {
            // Check if confirm button is enabled
            const isConfirmDisabled = confirmButton.disabled || 
                                    confirmButton.hasAttribute('disabled') || 
                                    confirmButton.classList.contains('disabled');
            
            if (isConfirmDisabled) {
              console.log('[BetAutomation] Confirm button is disabled, waiting for it to become enabled...');
              // Wait for confirm button to become enabled
              const maxWaitTime = 3000; // 3 seconds
              const startTime = Date.now();
              
              while (Date.now() - startTime < maxWaitTime) {
                const stillDisabled = confirmButton.disabled || 
                                    confirmButton.hasAttribute('disabled') || 
                                    confirmButton.classList.contains('disabled');
                if (!stillDisabled) {
                  break;
                }
                await sleep(100);
              }
              
              // Check again after waiting
              const stillDisabledAfterWait = confirmButton.disabled || 
                                           confirmButton.hasAttribute('disabled') || 
                                           confirmButton.classList.contains('disabled');
              
              if (stillDisabledAfterWait) {
                console.log('[BetAutomation] Confirm button still disabled after waiting - checking reason...');
                
                // Check if it's still betting time
                const bettingTimeResult = checkBettingTime(isPragmatic, isNewPlatform);
                if (bettingTimeResult !== true) {
                  console.log(`[BetAutomation] Confirm disabled because: ${bettingTimeResult}`);
                  chrome.runtime.sendMessage({
                    type: 'betError',
                    message: `Confirm button disabled: ${bettingTimeResult}`,
                    platform,
                    amount,
                    side,
                    errorType: 'not_betting_time'
                  });
                  return;
                } else {
                  // It's betting time but confirm is still disabled - likely insufficient balance
                  console.log('[BetAutomation] Confirm disabled during betting time - likely insufficient balance');
                  chrome.runtime.sendMessage({
                    type: 'betError',
                    message: 'Insufficient balance - cannot place bet',
                    platform,
                    amount,
                    side,
                    errorType: 'insufficient_balance'
                  });
                  return;
                }
              }
            }
            
            // Click the confirm button with visual effect
            console.log('[BetAutomation] Clicking confirm button...');
            simulateClick(confirmButton);
            
            // Send confirm button click notification
            chrome.runtime.sendMessage({
              type: 'confirmClicked',
              platform: platform,
              amount: amount,
              side: side,
              message: 'Confirm button clicked'
            });
            
            await sleep(500); // Wait for confirmation to process
          } else {
            console.warn('[BetAutomation] Confirm button not found on new platform - bet may not be finalized');
          }
        } else if (isPragmatic) {
          console.log('[BetAutomation] Pragmatic platform - no confirm button needed (bets are placed immediately)');
        }
        
        // Verify bet was placed by checking for bet confirmation or error messages
        await sleep(1000); // Wait a bit longer for error messages to appear
        
        // Check for various types of error messages
        const errorResult = checkForBettingErrors();
        if (errorResult.hasError) {
          console.log(`[BetAutomation] Betting error detected: ${errorResult.message}`);
          chrome.runtime.sendMessage({
            type: 'betError',
            message: errorResult.message,
            platform,
            amount,
            side,
            errorType: errorResult.errorType,
            errorDetails: errorResult.details
          });
          return;
        }
        
      } catch (betError) {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: `Error during bet placement: ${betError.message}`,
          platform,
          amount,
          side,
          errorType: 'bet_placement_error',
          errorDetails: betError.stack
        });
        return;
      }

      // Send success message back to background script
      chrome.runtime.sendMessage({
        type: 'betSuccess',
        platform: platform,
        amount: amount,
        side: side,
      });

      console.log('Bet placed successfully');
    } catch (error) {
      console.error('Error placing bet:', error);
      // Send detailed error back to background script
      chrome.runtime.sendMessage({
        type: 'betError',
        message: `Unexpected error placing bet: ${error.message}`,
        platform: platform,
        amount: amount,
        side: side,
        errorType: 'unexpected_error',
        errorDetails: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Helper function to format amount for display
  function formatAmount(amount) {
    if (amount >= 1000000) {
      const millions = amount / 1000000;
      if (millions === Math.floor(millions)) {
        return `${millions}M`;
      }
      return `${millions.toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${amount / 1000}K`;
    }
    return amount.toString();
  }

  // Helper function to sleep
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Wait for element helper
  async function waitForElement(selector, timeout = 2000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(interval);
    }
    return null;
  }

  // Wait until a button becomes enabled (not disabled attribute)
  async function waitUntilEnabled(element, timeout = 2000, interval = 50) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!element.disabled && !element.hasAttribute('disabled')) {
        return true;
      }
      await sleep(interval);
    }
    return false;
  }

  // Monitor for betting results (placeholder for future enhancements)
  function monitorBettingResults() {
    console.log('[BetAutomation] Betting result monitoring initialized');
    // This is a placeholder for future result monitoring features
    // The game itself handles balance updates when bets are placed
  }

  // Initialize monitoring when the page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorBettingResults);
  } else {
    monitorBettingResults();
  }

  // indicator-handling moved to showIndicator / hideIndicator and only when active

  // Function to cancel the last bet (best effort - selectors may need adjustment)
  async function cancelBet() {
    try {
      // Detect platform type
      const isPragmatic = document.querySelector('button[data-testid^="chip-stack-value-"]') !== null;
      const isNewPlatform = document.querySelector('#chips .chips3d') !== null;
      
      let btn = null;
      
      if (isPragmatic) {
        // Pragmatic platform - use undo button
        const selector = 'button[data-testid="undo-button"]';
        btn = await waitForElement(selector, 2000);
        
        if (!btn) {
          console.warn('Pragmatic undo button not found');
          return;
        }
        
        // Wait until button becomes enabled
        const enabled = await waitUntilEnabled(btn, 2000);
        if (!enabled) {
          console.warn('Pragmatic undo button remained disabled, cannot click');
          return;
        }
        
        // Click the undo button multiple times to remove all chips
        let clickCount = 0;
        const maxClicks = 20;
        
        while (clickCount < maxClicks) {
          // Check if the undo button is still enabled (meaning there are still chips to remove)
          if (btn.disabled || btn.hasAttribute('disabled')) {
            console.log(`Pragmatic undo button disabled after ${clickCount} clicks - all chips removed`);
            break;
          }
          
          simulateClick(btn);
          clickCount++;
          
          // Wait a bit between clicks to allow the UI to update
          await sleep(300);
        }
        
        if (clickCount >= maxClicks) {
          console.log(`Reached maximum clicks (${maxClicks}) - stopping undo operations`);
        } else if (clickCount > 0) {
          console.log(`Successfully cancelled bet with ${clickCount} undo clicks`);
        }
        
      } else if (isNewPlatform) {
        // New platform - use cancel button
        const selector = '#cancel, .btn_cancel, button[id*="cancel"], button[class*="cancel"]';
        btn = await waitForElement(selector, 2000);
        
        if (!btn) {
          console.warn('New platform cancel button not found');
          return;
        }
        
        // Wait until button becomes enabled
        const enabled = await waitUntilEnabled(btn, 2000);
        if (!enabled) {
          console.warn('New platform cancel button remained disabled, cannot click');
          return;
        }
        
        // Click the cancel button with visual effect
        console.log('[BetAutomation] Clicking cancel button...');
        simulateClick(btn);
        
        // Send cancel button click notification
        chrome.runtime.sendMessage({
          type: 'cancelClicked',
          message: 'Cancel button clicked'
        });
        
        console.log('Successfully cancelled bet with cancel button');
        
      } else {
        console.warn('Unknown platform - cannot determine cancel button');
        return;
      }
      
    } catch (err) {
      console.error('Error attempting to cancel bet:', err);
    }
  }

})();
