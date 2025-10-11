// Iframe detector script - injected into main pages to detect iframes
(function() {
  console.log('[IframeDetector] Starting iframe detection');
  
  // Function to detect and report iframes
  function detectIframes() {
    const iframes = document.querySelectorAll('iframe');
    console.log(`[IframeDetector] Found ${iframes.length} iframes`);
    
    iframes.forEach((iframe, index) => {
      try {
        const src = iframe.src || iframe.getAttribute('src');
        const id = iframe.id || `iframe-${index}`;
        
        console.log(`[IframeDetector] Iframe ${index}:`, {
          id: id,
          src: src,
          width: iframe.offsetWidth,
          height: iframe.offsetHeight,
          visible: iframe.offsetWidth > 0 && iframe.offsetHeight > 0
        });
        
        // Check if this looks like a casino game iframe
        if (src && (
          src.includes('pragmatic') || 
          src.includes('casino') || 
          src.includes('game') ||
          src.includes('baccarat') ||
          src.includes('live')
        )) {
          console.log(`[IframeDetector] Casino game iframe detected: ${src}`);
          
          // Report to background script
          try {
            chrome.runtime.sendMessage({
              type: 'casinoIframeDetected',
              iframeId: id,
              src: src,
              timestamp: Date.now()
            });
          } catch (err) {
            console.log('[IframeDetector] Failed to report iframe:', err?.message);
          }
        }
      } catch (err) {
        console.log(`[IframeDetector] Error checking iframe ${index}:`, err?.message);
      }
    });
  }
  
  // Run detection immediately
  detectIframes();
  
  // Run detection periodically to catch dynamically loaded iframes (much less frequent)
  setInterval(detectIframes, 30000); // Every 30 seconds instead of 3
  
  // Watch for DOM changes that might add new iframes
  const observer = new MutationObserver((mutations) => {
    let hasNewIframe = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && (node.tagName === 'IFRAME' || node.querySelector('iframe'))) {
          hasNewIframe = true;
        }
      });
    });
    
    if (hasNewIframe) {
      console.log('[IframeDetector] New iframe detected, re-scanning');
      setTimeout(detectIframes, 5000); // Wait longer for iframe to load
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('[IframeDetector] Iframe detection started');
})();
