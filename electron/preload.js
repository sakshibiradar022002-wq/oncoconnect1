// OncoConnect Desktop — preload script
// Exposes safe APIs to the renderer process via contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getDBPath: () => ipcRenderer.invoke('app:getDBPath'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isElectron: true,
});

// ── Standalone Portal Isolation ──────────────────────────────────
// In standalone mode, prevent the user from navigating to other portal pages.
// This runs in every renderer as a safety net — the HTML pages also hide
// cross-portal elements, but this catches anything that slips through.
(function() {
  try {
    const params = new URLSearchParams(window.location.search);
    const standalone = params.get('standalone');
    if (standalone !== '1') return; // not standalone — do nothing

    // Detect which portal we're in from the page URL or title
    const currentPath = window.location.pathname;

    // Map of OTHER portal paths that this app should NOT navigate to
    const blockedPaths = [];
    if (currentPath === '/patient.html' || currentPath === '/') {
      // If we're in patient or doctor, don't allow lab
      blockedPaths.push('/lab.html');
    }
    if (currentPath === '/patient.html') {
      // Patient app should not go to doctor either
      blockedPaths.push('/', '/index.html');
    }
    if (currentPath === '/lab.html') {
      // Lab app should not go to doctor or patient
      blockedPaths.push('/', '/index.html', '/patient.html');
    }
    if (currentPath === '/' || currentPath === '/index.html') {
      // Doctor app should not go to patient or lab
      blockedPaths.push('/patient.html', '/lab.html');
    }

    if (blockedPaths.length === 0) return;

    // Intercept navigation events
    window.addEventListener('beforeunload', function(e) {
      try {
        const loc = window.location;
        for (const bp of blockedPaths) {
          if (loc.pathname === bp) {
            e.preventDefault();
            e.returnValue = '';
            return false;
          }
        }
      } catch(err) {}
    });

    // Override window.location assign/replace to block cross-portal navigation
    const origAssign = window.location.assign;
    const origReplace = window.location.replace;
    if (origAssign) {
      window.location.assign = function(url) {
        try {
          const u = new URL(url, window.location.origin);
          for (const bp of blockedPaths) {
            if (u.pathname === bp) {
              console.warn('[standalone] Blocked navigation to', url);
              return;
            }
          }
        } catch(e) {}
        return origAssign.call(window.location, url);
      };
    }
    if (origReplace) {
      window.location.replace = function(url) {
        try {
          const u = new URL(url, window.location.origin);
          for (const bp of blockedPaths) {
            if (u.pathname === bp) {
              console.warn('[standalone] Blocked navigation to', url);
              return;
            }
          }
        } catch(e) {}
        return origReplace.call(window.location, url);
      };
    }
  } catch(e) {
    // Silently fail — this is a best-effort guard
  }
})();
