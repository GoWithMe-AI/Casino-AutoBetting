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
    // Check for betting areas with multiple possible selectors
    const betAreas = document.querySelector('#leftBetTextRoot, #rightBetTextRoot, [data-testid*="player"], [data-testid*="banker"], .player-bet, .banker-bet, .bet-area');
    
    // Check for chip buttons with multiple possible selectors
    const chipButtons = document.querySelector('button[data-testid^="chip-stack-value-"], button[data-testid*="chip"], .chip-button, [class*="chip"]');
    
    // Additional checks for casino-related elements
    const casinoElements = document.querySelector('[class*="baccarat"], [class*="casino"], [class*="game"], [data-testid*="game"]');
    
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
        const bettingFrameResult = isBettingFrame();
        console.log("[BetAutomation] Activated - bettingResult:", bettingFrameResult, "isActive:", isActive, "CanProcess:", canProcessBetting());
        if (bettingFrameResult === true) {
          showIndicator();
        }
        // No error messages during activation - just activate silently
        break;
      case 'deactivateBetAutomation':
        isActive = false;
        hideIndicator();
        console.log("[BetAutomation] Deactivated - isActive:", isActive);
        break;
      case 'placeBet':
        // Only respond from frames that can process betting to prevent duplicate responses
        if (isActive && canProcessBetting()) {
          const bettingFrameResult = isBettingFrame();
          if (bettingFrameResult === true) {
            placeBet(request.platform, request.amount, request.side);
          } else if (bettingFrameResult === 'not_betting_time') {
            const betAreasPresent = !!document.querySelector('#leftBetTextRoot, #rightBetTextRoot, [data-testid*="player"], [data-testid*="banker"], .player-bet, .banker-bet, .bet-area');
            // If there are no bet areas and we're in the top window, treat this as wrong_tab for controller clarity
            if (betAreasPresent) {
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
          }
        } else {
          console.log('[BetAutomation] Ignoring placeBet command - not active or cannot process betting');
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

  // Function to simulate a more realistic click
  function simulateClick(element) {
    // Method 1: Try regular click first
    try {
      element.click();
    } catch (e) {}

    // Method 2: Dispatch mouse events
    try {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Create and dispatch mousedown event
      const mousedownEvent = new MouseEvent('mousedown', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
      });
      element.dispatchEvent(mousedownEvent);

      // Create and dispatch mouseup event
      const mouseupEvent = new MouseEvent('mouseup', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
      });
      element.dispatchEvent(mouseupEvent);

      // Create and dispatch click event
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
      });
      element.dispatchEvent(clickEvent);
    } catch (e) {}

    // Method 3: Try pointer events
    try {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const pointerdownEvent = new PointerEvent('pointerdown', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        pointerId: 1,
        pointerType: 'mouse',
      });
      element.dispatchEvent(pointerdownEvent);

      const pointerupEvent = new PointerEvent('pointerup', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        pointerId: 1,
        pointerType: 'mouse',
      });
      element.dispatchEvent(pointerupEvent);
    } catch (e) {}
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

      if (!side || !['Player', 'Banker'].includes(side)) {
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
        const chipButtons = document.querySelectorAll('button[data-testid^="chip-stack-value-"]');
        const playerArea = document.getElementById('leftBetTextRoot');
        const bankerArea = document.getElementById('rightBetTextRoot');
        
        if (chipButtons.length > 0 && (playerArea || bankerArea)) {
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

      // Check if betting is currently allowed (not in a game round)
      const bettingDisabled = document.querySelector('[class*="disabled"], [class*="betting-disabled"], [data-testid*="disabled"]');
      if (bettingDisabled) {
        chrome.runtime.sendMessage({
          type: 'betError',
          message: 'Betting is currently disabled (game in progress)',
          platform,
          amount,
          side,
          errorType: 'betting_disabled'
        });
        return;
      }

      // Step 1: Try to select the chip with the exact amount
      const chipSelector = `button[data-testid="chip-stack-value-${amount}"]`;
      let chipButton = document.querySelector(chipSelector);

      // Helper to get all available chips (enabled only)
      function getAvailableChips() {
        const chipButtons = Array.from(
          document.querySelectorAll('button[data-testid^="chip-stack-value-"]'),
        ).filter((btn) => !btn.disabled && !btn.hasAttribute('disabled'));

        // Deduplicate by chip value – keep the first encountered button for each value
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

        return Array.from(uniqueByValue.values()).sort((a, b) => b.value - a.value); // Descending
      }

      // Helper to compose amount using available chips (dynamic programming)
      function composeChips(target, chips) {
        // dp[i] will store the combination to reach amount i, or null if not possible
        const dp = Array(target + 1).fill(null);
        dp[0] = [];
        for (let i = 1; i <= target; i++) {
          for (const chip of chips) {
            if (i - chip.value >= 0 && dp[i - chip.value] !== null) {
              dp[i] = dp[i - chip.value].concat([chip.value]);
              break; // Stop at first found (any valid solution)
            }
          }
        }
        if (!dp[target]) return null;
        // Count occurrences of each chip value
        const counts = {};
        for (const v of dp[target]) counts[v] = (counts[v] || 0) + 1;
        // Map back to chip objects and counts
        return chips
          .map(chip => counts[chip.value] ? { chip, count: counts[chip.value] } : null)
          .filter(Boolean);
      }

      let chipPlan = null;
      if (!chipButton) {
        // Try to compose the amount using available chips
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
        // Log the chip composition plan
        console.log(
          `[BetAutomation] Chip plan for ${amount}:`,
          chipPlan.map(({ chip, count }) => ({ value: chip.value, count })),
        );
      }

      // Step 2: Find the bet area
      let betArea;
      if (side === 'Player') {
        betArea = document.getElementById('leftBetTextRoot');
      } else if (side === 'Banker') {
        betArea = document.getElementById('rightBetTextRoot');
      }
      if (!betArea) {
        // Try alternative selectors for bet areas
        const alternativeSelectors = {
          'Player': [
            '[data-testid="player-bet-area"]',
            '.player-bet-area',
            '.left-bet-area',
            '[data-side="player"]'
          ],
          'Banker': [
            '[data-testid="banker-bet-area"]',
            '.banker-bet-area',
            '.right-bet-area',
            '[data-side="banker"]'
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
            message: `Bet area not found for ${side}. Tried: leftBetTextRoot/rightBetTextRoot and alternative selectors`,
            platform,
            amount,
            side,
            errorType: 'bet_area_not_found',
            triedSelectors: ['leftBetTextRoot', 'rightBetTextRoot', ...selectors]
          });
          return;
        }
      }

      // Step 3: Place the bet(s)
      try {
        if (chipButton) {
          // Exact chip exists, use original logic
          console.log(`[BetAutomation] About to click chip: ${amount}`);
          
          // Check if chip is enabled
          if (chipButton.disabled || chipButton.hasAttribute('disabled')) {
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
          
          chipButton.click();
          await sleep(300);
          const clickTarget = findClickableElement(betArea, side);
          if (clickTarget) {
            simulateClick(clickTarget);
          } else {
            simulateClick(betArea);
          }
        } else if (chipPlan) {
          // Compose using multiple chips
          for (const { chip, count } of chipPlan) {
            // Check if chip is enabled
            if (chip.btn.disabled || chip.btn.hasAttribute('disabled')) {
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
            
            // Select chip once
            console.log(`[BetAutomation] Selecting chip: ${chip.value}`);
            chip.btn.click();
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
        
        // Verify bet was placed by checking for bet confirmation or error messages
        const errorMessages = document.querySelectorAll('[class*="error"], [class*="Error"], [data-testid*="error"]');
        if (errorMessages.length > 0) {
          const errorText = Array.from(errorMessages).map(el => el.textContent).join('; ');
          chrome.runtime.sendMessage({
            type: 'betError',
            message: `Bet placement failed: ${errorText}`,
            platform,
            amount,
            side,
            errorType: 'bet_placement_failed',
            errorDetails: errorText
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

  // Monitor for betting results (this would need to be customized based on the actual casino site)
  function monitorBettingResults() {
    // This is a placeholder - you would need to implement actual result detection
    // based on the specific casino platform's UI

    const observer = new MutationObserver((mutations) => {
      // Look for result notifications, win/lose indicators, etc.
      // This would be highly specific to the casino platform
    });

    // Start observing the document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
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
      const selector = 'button[data-testid="undo-button"]';
      const btn = await waitForElement(selector, 2000);

      if (!btn) {
        console.warn('Undo button not found');
        return;
      }

      // Wait until button becomes enabled
      const enabled = await waitUntilEnabled(btn, 2000);
      if (!enabled) {
        console.warn('Undo button remained disabled, cannot click');
        return;
      }

      // Click the undo button multiple times to remove all chips
      let clickCount = 0;
      const maxClicks = 20;
      
      while (clickCount < maxClicks) {
        // Check if the undo button is still enabled (meaning there are still chips to remove)
        if (btn.disabled || btn.hasAttribute('disabled')) {
          console.log(`Undo button disabled after ${clickCount} clicks - all chips removed`);
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
      
    } catch (err) {
      console.error('Error attempting to cancel bet:', err);
    }
  }

})();
