/**
 * Portal Isolator — Intercepts HTML responses from the remote server and
 * injects isolation code BEFORE the page renders.
 *
 * This is the key fix: instead of relying on JS hiding (which runs too late),
 * we rewrite the HTML at the network level to strip cross-portal content.
 */

/**
 * Install the portal isolator on a BrowserWindow's session.
 * @param {Electron.BrowserWindow} win
 * @param {string} portal - 'doctor' | 'patient' | 'lab'
 */
export function installPortalIsolator(win, portal) {
  const session = win.webContents.session;

  session.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const contentType = (details.responseHeaders['content-type'] || []).join(' ');
      const isHTML =
        contentType.includes('text/html') ||
        contentType.includes('application/xhtml');

      if (!isHTML) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }

      // Fetch the original HTML, inject our isolation code, and return it
      fetch(details.url)
        .then((r) => {
          const enc = (details.responseHeaders['content-encoding'] || []).join('');
          if (enc === 'gzip') return r.arrayBuffer().then((b) => zlib.gunzipSync(Buffer.from(b)).toString('utf-8'));
          if (enc === 'br')   return r.arrayBuffer().then((b) => zlib.brotliDecompressSync(Buffer.from(b)).toString('utf-8'));
          if (enc === 'deflate') return r.arrayBuffer().then((b) => zlib.inflateSync(Buffer.from(b)).toString('utf-8'));
          return r.text();
        })
        .then((html) => {
          const modified = injectIsolation(html, portal);
          // Remove content-encoding since we're sending uncompressed
          const headers = { ...details.responseHeaders };
          delete headers['content-encoding'];
          delete headers['content-length'];
          callback({ responseHeaders: headers, body: Buffer.from(modified, 'utf-8') });
        })
        .catch((err) => {
          console.error('[portal-isolator] fetch error:', err.message);
          callback({ responseHeaders: details.responseHeaders });
        });
    }
  );
}

/**
 * Inject portal isolation code into HTML.
 * This adds a <style> block and a <script> block right after <body>
 * that hide ALL cross-portal content BEFORE any page script runs.
 */
function injectIsolation(html, portal) {
  const isolateCSS = getIsolationCSS(portal);
  const isolateJS = getIsolationJS(portal);

  const injectPoint = '<body';
  const idx = html.indexOf(injectPoint);
  if (idx === -1) return html; // Can't find <body> — return as-is

  const closeIdx = html.indexOf('>', idx);
  if (closeIdx === -1) return html;

  const injection = `
<!-- ═══ PORTAL ISOLATION (injected by Electron) ═══ -->
<style id="portal-isolation-css">${isolateCSS}</style>
<script id="portal-isolation-js">
${isolateJS}
</script>
`;

  return html.slice(0, closeIdx + 1) + injection + html.slice(closeIdx + 1);
}

/**
 * CSS to hide cross-portal elements. Runs BEFORE any page script.
 */
function getIsolationCSS(portal) {
  const common = `
    /* Hide ALL portal switchers/navigation */
    #portal-switcher, #portal-links,
    a[href="/patient.html"], a[href="/lab.html"], a[href="/admin.html"],
    a[href$="patient.html"]:not([data-portal="patient"]),
    a[href$="lab.html"]:not([data-portal="lab"]) {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
    }
    /* Hide lab tab on patient login */
    .ltab[data-portal="lab"],
    .ltab:nth-child(2) { display: none !important; }
    /* Hide lab login card on patient page */
    #login-lab { display: none !important; }
  `;

  if (portal === 'doctor') {
    return common + `
      /* DOCTOR: only show doctor content */
      #login-patient, #login-lab,
      [data-portal="patient"], [data-portal="lab"],
      .screen-symptoms, .screen-medications, .screen-appointments,
      #screen-symptoms, #screen-medications, #screen-appointments {
        display: none !important;
      }
      /* Hide lab-specific elements in settings */
      .settings-portal-links,
      [onclick*="lab"], [onclick*="patient"],
      [href*="lab.html"], [href*="patient.html"] {
        display: none !important;
      }
    `;
  }

  if (portal === 'patient') {
    return common + `
      /* PATIENT: only show patient login */
      #login-lab,
      .ltab:nth-child(2),
      [data-portal="lab"],
      .screen-lab, .screen-upload, #screen-lab, #screen-upload,
      .settings-portal-links,
      [onclick*="lab"], [href*="lab.html"] {
        display: none !important;
      }
      /* Force patient tab active */
      .ltab:nth-child(1) { display: inline-flex !important; opacity: 1 !important; }
      #login-patient { display: block !important; }
    `;
  }

  if (portal === 'lab') {
    return common + `
      /* LAB: only show lab content */
      #login-patient,
      [data-portal="patient"],
      .screen-symptoms, .screen-medications, .screen-appointments,
      #screen-symptoms, #screen-medications, #screen-appointments {
        display: none !important;
      }
      /* Hide cross-portal links on lab login page */
      a[href="/patient.html"], a[href="/"],
      .auth-card a[href*="patient"], .auth-card a[href*="doctor"] {
        display: none !important;
      }
      /* Hide the "Patient Portal · Doctor Software" links on lab login */
      .auth-card div:last-child a {
        display: none !important;
      }
    `;
  }

  return common;
}

/**
 * JavaScript to enforce isolation (runs before page scripts).
 * This MutationObserver catches dynamically added elements.
 */
function getIsolationJS(portal) {
  return `
(function() {
  // Block cross-portal navigation
  var blocked = [];
  ${portal === 'doctor' ? "blocked = ['/patient.html', '/lab.html', '/admin.html'];" : ''}
  ${portal === 'patient' ? "blocked = ['/lab.html', '/', '/admin.html'];" : ''}
  ${portal === 'lab' ? "blocked = ['/patient.html', '/', '/index.html', '/admin.html'];" : ''}

  // Intercept location changes
  var origAssign = window.location.assign;
  var origReplace = window.location.replace;
  if (origAssign) window.location.assign = function(u) {
    try {
      var url = new URL(u, location.origin);
      if (blocked.indexOf(url.pathname) !== -1) {
        console.warn('[isolation] Blocked navigation to', u);
        return;
      }
    } catch(e) {}
    return origAssign.call(window.location, u);
  };
  if (origReplace) window.location.replace = function(u) {
    try {
      var url = new URL(u, location.origin);
      if (blocked.indexOf(url.pathname) !== -1) {
        console.warn('[isolation] Blocked navigation to', u);
        return;
      }
    } catch(e) {}
    return origReplace.call(window.location, u);
  };

  window.addEventListener('beforeunload', function(e) {
    for (var i = 0; i < blocked.length; i++) {
      if (location.pathname === blocked[i]) {
        e.preventDefault();
        e.returnValue = '';
        return false;
      }
    }
  });

  // MutationObserver to strip cross-portal elements as they appear
  function stripCrossPortal(root) {
    if (!root || !root.querySelectorAll) return;
    var selectors = [
      'a[href="/patient.html"]', 'a[href="/lab.html"]', 'a[href="/admin.html"]',
      '#portal-switcher', '#portal-links',
      '.ltab:nth-child(2)', '#login-lab',
      '.settings-portal-links',
      '[onclick*="lab.html"]', '[onclick*="patient.html"]'
    ];
    ${portal === 'doctor' ? `
    selectors.push('#login-patient', '#login-lab', '[data-portal="patient"]', '[data-portal="lab"]');
    ` : ''}
    ${portal === 'patient' ? `
    selectors.push('#login-lab', '.ltab:nth-child(2)');
    ` : ''}
    ${portal === 'lab' ? `
    selectors.push('#login-patient', 'a[href="/patient.html"]', 'a[href="/"]');
    ` : ''}
    selectors.forEach(function(sel) {
      try {
        root.querySelectorAll(sel).forEach(function(el) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.height = '0';
          el.style.overflow = 'hidden';
          el.removeAttribute('href');
          el.onclick = null;
        });
      } catch(e) {}
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      stripCrossPortal(document.body);
      // Watch for dynamically added content
      var obs = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          m.addedNodes.forEach(function(n) {
            if (n.nodeType === 1) stripCrossPortal(n);
          });
        });
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    stripCrossPortal(document.body);
    var obs = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.nodeType === 1) stripCrossPortal(n);
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Set document title
  ${portal === 'doctor' ? "document.title = 'OncoConnect Doctor';" : ''}
  ${portal === 'patient' ? "document.title = 'OncoConnect Patient';" : ''}
  ${portal === 'lab' ? "document.title = 'OncoConnect Lab';" : ''}
})();
`;
}
