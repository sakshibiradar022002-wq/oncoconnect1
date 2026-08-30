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
(function() {
  try {
    const params = new URLSearchParams(window.location.search);
    const standalone = params.get('standalone');
    if (standalone !== '1') return;

    const currentPath = window.location.pathname;
    const blockedPaths = [];

    if (currentPath === '/patient.html' || currentPath === '/') {
      blockedPaths.push('/lab.html');
    }
    if (currentPath === '/patient.html') {
      blockedPaths.push('/', '/index.html');
    }
    if (currentPath === '/lab.html') {
      blockedPaths.push('/', '/index.html', '/patient.html');
    }
    if (currentPath === '/' || currentPath === '/index.html') {
      blockedPaths.push('/patient.html', '/lab.html');
    }

    if (blockedPaths.length === 0) return;

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
  } catch(e) {}
})();
