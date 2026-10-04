// ═════════════════════════════════════════════════════════════════════
// VELTRUVIA download page — version badge, QR codes, PWA install,
// checksums table. External file: the CSP is `script-src 'self'` and no
// inline scripts or event handlers are allowed anywhere.
//
// All QR rendering is local (vendored qrcode-generator.js):
// used by the 2FA setup page) renders the QR images — no extra dependency.
// ═════════════════════════════════════════════════════════════════════
(function () {
  'use strict';  // ── Version badge ────────────────────────────────────────────────
  // Two lines: the RUNNING server's version (/health, same-origin, CSP-safe),
  // and — only if a GitHub Release exists — the latest published one.
  (async () => {
    const el = document.getElementById('ver-badge');
    if (!el) return;
    let text = '';
    try {
      const h = await fetch('/health').then(r => r.json());
      if (h.version) text = 'This server: v' + h.version;
    } catch (e) { /* not served by VELTRUVIA Server — skip local line */ }
    try {
      const r = await fetch('https://api.github.com/repos/videju/veltruvia/releases/latest', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.tag_name) text = 'Latest release: ' + j.tag_name;
      }
    } catch (e) { /* offline / no release yet — server version stays */ }
    if (text) { el.textContent = text; el.hidden = false; }
  })();

  // ── QR codes for the APK cards ────────────────────────────────────
  document.querySelectorAll('[data-qr]').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = document.getElementById(btn.getAttribute('data-qr'));
      if (!wrap) return;
      const img = wrap.querySelector('img[data-url]');
      if (img && !img.src) {
        drawLocalQr(img, img.getAttribute('data-url'));
      }
      wrap.hidden = !wrap.hidden;
    });
  });

  // ── PWA install (beforeinstallprompt) ─────────────────────────────
  const banner = document.getElementById('pwa-banner');
  const installBtn = document.getElementById('pwa-install');
  const iosHint = document.getElementById('pwa-ios-hint');
  const chromeHint = document.getElementById('pwa-chrome-hint');
  let deferredPrompt = null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (!isStandalone) {
    if (isIOS && iosHint) { iosHint.hidden = false; if (banner) banner.hidden = false; }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (chromeHint) chromeHint.hidden = false;
      if (installBtn) installBtn.hidden = false;
      if (banner) banner.hidden = false;
    });
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (e) { /* dismissed */ }
        deferredPrompt = null;
        installBtn.hidden = true;
      });
    }
  }

  // ── Checksums table from SHA256SUMS.txt ───────────────────────────
  fetch('/downloads/SHA256SUMS.txt')
    .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
    .then(text => {
      const rows = document.getElementById('sha-rows');
      const box = document.getElementById('checksums');
      if (!rows || !box) return;
      const files = [];
      for (const line of text.split('\n')) {
        const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
        if (m) files.push({ hash: m[1], name: m[2].trim() });
      }
      if (!files.length) return;
      for (const f of files) {
        const tr = document.createElement('tr');
        const tdN = document.createElement('td');
        tdN.textContent = f.name;
        const tdH = document.createElement('td');
        tdH.className = 'sha';
        tdH.textContent = f.hash.slice(0, 16) + '…' + f.hash.slice(-8);
        tdH.title = f.hash;
        tr.appendChild(tdN);
        tr.appendChild(tdH);
        rows.appendChild(tr);
      }
      box.hidden = false;
    })
    .catch(() => { /* no checksums file served — section stays hidden */ });
})();

// ── Connect-a-phone pairing QR ──────────────────────────
// Encodes THIS server's address (window.location.origin) so a phone on
// the same Wi-Fi opens this page by scanning — installs an APK from it,
// then pastes the same address into the app's ⚙ screen. No typing.
(function () {
  'use strict';
  var card = document.getElementById('connect-card');
  if (!card) return;
  var origin = window.location.origin;
  if (!origin || origin === 'null' || /^file:/i.test(origin)) return; // opened from disk — nothing to point at
  var img = document.getElementById('connect-qr-img');
  var addr = document.getElementById('connect-address');
  if (addr) addr.textContent = origin;
  if (img) {
    drawLocalQr(img, origin);
  }
  card.hidden = false;

  // Encrypted-LAN hint: when the server's HTTPS sidecar answers, say so.
  if (/^http:/.test(origin) && navigator.onLine !== false) {
    try {
      var httpsUrl = origin.replace(/^http:/, 'https:').replace(/:\d+$/, '') + ':3001/health';
      fetch(httpsUrl, { mode: 'cors', signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined })
        .then(function (r) {
          if (r.ok) {
            var hint = document.getElementById('connect-tls-hint');
            if (hint) hint.hidden = false;
          }
        })
        .catch(function () { /* plain-HTTP LAN only — hint stays hidden */ });
    } catch (e) {}
  }
  var btn = document.getElementById('copy-address');
  if (btn && addr) btn.addEventListener('click', function () {
    var done = function () { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = 'Copy'; }, 2000); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(origin).then(done, function () { done(); });
    } else {
      // Plain-HTTP LAN page: clipboard API is unavailable — select instead
      var range = document.createRange(); range.selectNodeContents(addr);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      btn.textContent = 'Press Ctrl+C'; setTimeout(function () { btn.textContent = 'Copy'; }, 2500);
    }
  });
})();

// ── Local QR encoding ───────────────────────────────────
// Never calls a remote QR service — the page would leak the server's
// address to a third party on every load. Encodes with the vendored
// qrcode-generator lib (local file, CSP-safe).
function drawLocalQr(img, text) {
  var hide = function () {
    var wrap = img.closest('.connect-qr');
    if (wrap) wrap.style.display = 'none';
  };
  var render = function () {
    try {
      var qr = window.qrcode(0, 'M'); // 0 = auto version
      qr.addData(text);
      qr.make();
      img.src = qr.createDataURL(4, 0);
      img.alt = 'QR code — ' + text;
    } catch (e) { hide(); }
  };
  if (window.qrcode) { render(); return; }
  var s = document.createElement('script');
  s.src = 'js/vendor/qrcode-generator.js';
  s.onload = render;
  s.onerror = hide;
  document.head.appendChild(s);
}
