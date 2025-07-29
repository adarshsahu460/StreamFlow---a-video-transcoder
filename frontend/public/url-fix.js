/**
 * StreamFlow URL Encoding Fix
 * 
 * This script fixes the issue with hash characters in video URLs by patching
 * the VideoJS player to properly encode special characters in URLs.
 */

(function() {
  console.log('[StreamFlow] Applying URL encoding fix for video playback...');
  
  // Wait for the page to load
  window.addEventListener('DOMContentLoaded', () => {
    // Apply the fix after a short delay to ensure VideoJS is initialized
    setTimeout(applyVideoJSFix, 500);
  });

  // Function to apply the fix
  function applyVideoJSFix() {
    try {
      // If video.js is loaded on the page
      if (window.videojs) {
        // Store the original src method
        const originalSrcMethod = window.videojs.Player.prototype.src;
        
        // Override the src method to properly encode URLs
        window.videojs.Player.prototype.src = function() {
          if (arguments.length && typeof arguments[0] === 'object' && arguments[0].src) {
            // Fix the URL encoding for the source
            const originalSrc = arguments[0].src;
            console.log('[StreamFlow] Original URL:', originalSrc);
            
            // Properly encode the URL, especially handling hash characters
            arguments[0].src = encodeURI(originalSrc).replace(/#/g, '%23');
            console.log('[StreamFlow] Encoded URL:', arguments[0].src);
          }
          
          // Call the original method with the fixed arguments
          return originalSrcMethod.apply(this, arguments);
        };
        
        console.log('[StreamFlow] VideoJS URL encoding fix applied successfully');
        
        // If there's already a player on the page, fix its source
        const existingPlayers = document.querySelectorAll('.video-js');
        if (existingPlayers.length > 0) {
          console.log('[StreamFlow] Found existing video players, refreshing sources...');
          
          // Wait a bit more for the player to fully initialize
          setTimeout(() => {
            existingPlayers.forEach(player => {
              const playerInstance = window.videojs.getPlayer(player);
              if (playerInstance && playerInstance.src) {
                const currentSrc = playerInstance.currentSrc();
                if (currentSrc) {
                  console.log('[StreamFlow] Refreshing player source:', currentSrc);
                  playerInstance.src({ src: currentSrc, type: 'application/x-mpegURL' });
                  playerInstance.load();
                }
              }
            });
          }, 1000);
        }
      } else {
        console.log('[StreamFlow] VideoJS not found on this page');
      }
    } catch (error) {
      console.error('[StreamFlow] Error applying URL encoding fix:', error);
    }
  }
})();
