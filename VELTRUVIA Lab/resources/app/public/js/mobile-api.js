// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA Mobile API bridge (Patient & Lab Android/iOS apps)
//
// Inside the Capacitor WebView the app's UI is served from the app bundle
// itself (origin https://localhost), so the page scripts' relative
// fetch('/api/…') and WebSocket calls would hit the local WebView, not
// the VELTRUVIA Server. This shim — loaded BEFORE every other script —
// redirects all traffic to the configured server and attaches the
// Bearer token issued at login (cookie auth doesn't survive the
// cross-origin WebView reliably; tokens do).
//
// In a normal browser or the Electron desktop apps window.Capacitor is
// undefined and this file does nothing at all.
//
// Storage keys (deliberately NOT cc_* — those belong to SecureStore):
//   veltruvia_server_url   e.g. https://emr.yourclinic.com
//   veltruvia_auth_token   JWT from the last successful login
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var URL_KEY = 'veltruvia_server_url';
  var TOKEN_KEY = 'veltruvia_auth_token';

  // Baked at APK build time via <meta name="veltruvia-api-base"> in the
  // entry HTML (CSP-safe — no inline script). Empty in the web/desktop UI.
  var META_BASE = '';
  try {
    var m = document.querySelector('meta[name="veltruvia-api-base"]');
    if (m) META_BASE = String(m.getAttribute('content') || '').trim();
  } catch (e) {}

  var state = {
    base: META_BASE,                               // baked at build, overridable in Settings
    token: null,
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function normalizeBase(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u.replace(/\/+$/, '');
  }

  if (IS_NATIVE) {
    state.base = normalizeBase(lsGet(URL_KEY)) || state.base;
    state.token = lsGet(TOKEN_KEY) || '';
  }

  function apiUrl(u) {
    // Rewrite app-relative API and page URLs onto the server base.
    if (!state.base) return u;
    if (/^\/(api|health)\b/.test(u)) return state.base + u;
    return u;
  }

  function httpBase() { return state.base; }

  // ── fetch wrapper ────────────────────────────────────────────────
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (!IS_NATIVE) return origFetch(input, init);

    try {
      if (typeof input === 'string' || input instanceof URL) {
        var rewritten = apiUrl(String(input));
        init = init || {};
        var headers = new Headers(init.headers || (init.body && { 'Content-Type': 'application/json' }) || {});
        if (rewritten.indexOf(state.base + '/api/') === 0) {
          headers.set('X-Veltruvia-Native', '1');   // server gates token issuance on this
          if (state.token) headers.set('Authorization', 'Bearer ' + state.token);
        }
        init.headers = headers;
        // Cookies can't be relied on cross-origin from the WebView — the
        // Bearer token above carries the session instead.
        init.credentials = 'omit';
        input = rewritten;
      }
    } catch (e) { /* fall through to original fetch */ }
    return origFetch(input, init).then(function (res) {
      try { captureLogin(res); } catch (e) {}
      return res;
    });
  };

  // Login endpoints return { token } — store it for subsequent calls.
  var LOGIN_PATHS = /\/api\/(sync\/(store-login|patient-login|lab-login|lab-store-login)|auth\/login)$/;
  function captureLogin(res) {
    if (!IS_NATIVE) return;
    var url = res && res.url || '';
    if (!res.ok || !LOGIN_PATHS.test(url.split('?')[0])) return;
    res.clone().json().then(function (data) {
      if (data && data.token) {
        state.token = data.token;
        lsSet(TOKEN_KEY, data.token);
        console.log('[mobile] session token saved');
      }
    }).catch(function () {});
  }

  // A 401 from the API means the stored token is expired/revoked — drop it
  // so the next login re-issues a fresh one.
  window.addEventListener('veltruvia:unauthorized', function () {
    state.token = '';
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  });

  // ── WebSocket wrapper (telehealth signaling) ─────────────────────
  var OrigWS = window.WebSocket;
  function PatchedWS(url, protocols) {
    try {
      if (IS_NATIVE && state.base && typeof url === 'string' && /\/ws\/telehealth/.test(url)) {
        var server = new URL(state.base);
        var target = new URL(url);
        target.protocol = server.protocol === 'https:' ? 'wss:' : 'ws:';
        target.host = server.host;
        url = target.toString();
      }
    } catch (e) {}
    return protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
  }
  PatchedWS.prototype = OrigWS.prototype;
  PatchedWS.CONNECTING = OrigWS.CONNECTING;
  PatchedWS.OPEN = OrigWS.OPEN;
  PatchedWS.CLOSING = OrigWS.CLOSING;
  PatchedWS.CLOSED = OrigWS.CLOSED;
  window.WebSocket = PatchedWS;

  // ── Settings screen (native builds only) ─────────────────────────
  if (IS_NATIVE) {
    function applyServerUrl(next) {
      if (next !== state.base) {
        state.base = next;
        if (next) lsSet(URL_KEY, next); else { try { localStorage.removeItem(URL_KEY); } catch (e) {} }
        window.location.reload();
        return;
      }
      window.alert('Server address unchanged: ' + (state.base || 'same-origin (none set)'));
    }

    function showSettings() {
      // Native builds: offer camera QR pairing when the scanner is present —
      // scan the “Connect a phone” QR on the server's download page and the
      // address fills itself in. No typing, no transcription errors.
      if (window.QRPairing && window.QRPairing.scanInto) {
        var useScan = window.confirm(
          'VELTRUVIA Server address\n\n' +
          'OK    = Scan the QR code on the server\'s download page\n' +
          'Cancel = Type the address manually');
        if (useScan) {
          window.QRPairing.scanInto().then(function (text) {
            if (!text) return; // cancelled
            var next = normalizeBase(text);
            if (!next) {
              window.alert('That QR is not a VELTRUVIA server address.\nUse the QR shown on the server\'s download page.');
              return;
            }
            applyServerUrl(next);
          });
          return;
        }
      }
      var typed = normalizeBase(window.prompt(
        'VELTRUVIA Server address\n(e.g. https://emr.yourclinic.com)', state.base || ''));
      if (typed === null) return;
      applyServerUrl(typed);
    }

    function injectUI() {
      var btn = document.createElement('button');
      btn.id = 'veltruvia-mobile-settings';
      btn.setAttribute('aria-label', 'Server settings');
      btn.textContent = '⚙';
      btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99999;width:40px;height:40px;'
        + 'border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(15,23,41,.85);'
        + 'color:#e2e8f0;font-size:19px;line-height:1;opacity:.55;backdrop-filter:blur(4px);';
      btn.addEventListener('click', showSettings);
      (document.body || document.documentElement).appendChild(btn);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectUI);
    } else {
      setTimeout(injectUI, 0);
    }
  }

  // Debug/visibility hook for the native shell and diagnostics.
  window.VeltruviaMobile = {
    get apiBase() { return state.base; },
    get hasToken() { return !!state.token; },
    setServerUrl: function (u) {
      state.base = normalizeBase(u);
      if (state.base) lsSet(URL_KEY, state.base);
      else { try { localStorage.removeItem(URL_KEY); } catch (e) {} }
      return state.base;
    },
  };
})();
