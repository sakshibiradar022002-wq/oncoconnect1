// OncoConnect Mobile — API configuration
// This script runs before patient.html and sets up the API endpoint

(function() {
  // Detect platform and set appropriate API base URL
  const isNative = window.location.protocol === 'capacitor:' || 
                   window.location.protocol === 'https:' && window.location.hostname === 'localhost';
  
  // Default API URLs
  const CONFIG = {
    // Remote server (Vercel deployment)
    remote: 'https://oncoconnect1.vercel.app',
    // Local development server
    local: 'http://10.0.2.2:3000', // Android emulator
    // iOS simulator
    ios: 'http://localhost:3000',
  };

  // Determine which URL to use
  let apiBase = '';
  
  if (isNative) {
    // Running in Capacitor — use remote server by default
    // Change this to CONFIG.local for local development
    apiBase = CONFIG.remote;
  } else {
    // Running in browser — use relative URLs
    apiBase = '';
  }

  // Override the api() function to use the configured base URL
  window.__API_BASE = apiBase;
  
  // Patch fetch to add base URL
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      url = apiBase + url;
    }
    return originalFetch.call(this, url, options);
  };

  console.log('[mobile] API base URL:', apiBase || '(relative)');
})();
