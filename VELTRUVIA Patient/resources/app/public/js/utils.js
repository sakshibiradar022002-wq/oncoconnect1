// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA Shared Frontend Utilities
// Used by all HTML pages (index, patient, lab, admin)
// ═══════════════════════════════════════════════════════════════════

// ── XSS Protection ────────────────────────────────────────────────
/** Escape HTML entities to prevent XSS */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape for use in HTML attributes */
function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}

// ── API Helpers ───────────────────────────────────────────────────
/** Make an authenticated API call */
async function api(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(path, options);

  if (res.status === 401) {
    // Session expired — redirect to login
    if (typeof showLogin === 'function') showLogin();
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

// ── Date/Time Formatting ──────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return dateStr; }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Number Formatting ─────────────────────────────────────────────
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

function formatPercent(n, decimals = 0) {
  return `${(n || 0).toFixed(decimals)}%`;
}

// ── DOM Helpers ───────────────────────────────────────────────────
function $(selector) { return document.querySelector(selector); }
function $$(selector) { return document.querySelectorAll(selector); }

function show(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = ''; }
function hide(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = 'none'; }
function toggle(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = el.style.display === 'none' ? '' : 'none'; }

function setText(el, text) {
  if (typeof el === 'string') el = $(el);
  if (el) el.textContent = text;
}

function setHTML(el, html) {
  if (typeof el === 'string') el = $(el);
  if (el) el.innerHTML = html;
}

// ── Toast Notifications ───────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 10000;
    padding: 12px 20px; border-radius: 8px; color: #fff;
    font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
    background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : type === 'warning' ? '#d97706' : '#2563eb'};
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, duration);
  setTimeout(() => toast.remove(), duration + 300);
}

// ── Confirmation Dialog ───────────────────────────────────────────
function confirm2(message) {
  return new Promise(resolve => resolve(window.confirm(message)));
}

// ── Debounce ──────────────────────────────────────────────────────
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── Local QR encoding (VUtils.localQr) ───────────────────────
// Renders any text/URL as a data-URL QR image using the vendored
// qrcode-generator lib (js/vendor/qrcode-generator.js). Never contacts a
// remote QR service — that would leak the address (or a 2FA secret!) to a
// third party. Safe on every portal; CSP-clean (data: imgSrc is allowed).
function localQr(text, opts) {
  opts = opts || {};
  var img = new Image();
  img.alt = opts.alt || 'QR code';
  var render = function () {
    try {
      var qr = window.qrcode(0, opts.ecc || 'M');
      qr.addData(String(text));
      qr.make();
      img.src = qr.createDataURL(opts.cellSize || 4, opts.margin == null ? 2 : opts.margin);
      if (opts.width) { img.width = opts.width; img.height = opts.width; }
    } catch (e) {
      img.src = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"><text x="4" y="20" font-size="11">QR unavailable</text></svg>');
    }
  };
  if (window.qrcode) { render(); return img; }
  var s = document.createElement('script');
  s.src = 'js/vendor/qrcode-generator.js';
  s.onload = render;
  s.onerror = render; // render() still draws the fallback tile
  document.head.appendChild(s);
  return img;
}

// ── In-app report / print viewer ─────────────────────────────────
// Reports (Welcome Card, clinical report, prescription, patient summary)
// used to open via window.open + document.write. The Electron shells deny
// window.open and route it to the system browser — the patient saw a blank
// tab “open in a different app” — and the Android WebView has no popups at
// all. This overlay renders the document INSIDE the app in a same-origin
// iframe (srcdoc), so it works identically in the desktop software, the
// browser, and the phone app. Print uses the iframe's own print(), which
// gives the normal print / Save-as-PDF dialog on desktop.
function _vxReportOverlay(title, docHtml, opts){
  opts = opts || {};
  const _e = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ov = document.createElement('div');
  ov.className = 'vx-report-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10060;background:rgba(3,9,22,.74);display:flex;flex-direction:column;font-family:inherit;';
  ov.innerHTML =
    '<div class="vx-rpt-bar" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0d1526;border-bottom:1px solid #223052;flex:0 0 auto;">' +
      '<strong style="color:#e8eefc;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _e(title) + '</strong>' +
      '<button data-r="print" style="padding:8px 14px;border-radius:9px;border:1px solid rgba(74,144,226,.45);background:rgba(74,144,226,.14);color:#9cc3f5;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;">🖨 Print / Save PDF</button>' +
      '<button data-r="close" style="padding:8px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#cdd7ea;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;">✕ Close</button>' +
    '</div>' +
    '<div style="flex:1;overflow:hidden;display:flex;">' +
      '<iframe class="vx-rpt-frame" style="flex:1;border:0;background:#dfe4ec;" title="' + _e(title) + '"></iframe>' +
    '</div>';
  document.body.appendChild(ov);
  const frame = ov.querySelector('iframe');
  frame.srcdoc = docHtml;
  const close = () => ov.remove();
  let loaded = false;
  const doPrint = () => {
    if (!loaded) return; // load listener prints once the document is ready
    try {
      const w = frame.contentWindow;
      w.focus();
      if (typeof w.print !== 'function') throw new Error('no-print');
      w.print();
    } catch (err) {
      if (window.AppDialog) {
        AppDialog.alert('Printing is not available on this device.\n\nThe document is shown above — open VELTRUVIA on a computer and tap Print there to save it as a PDF.');
      } else {
        window.alert('Printing is not available on this device. The document is shown above.');
      }
    }
  };
  ov.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-r]');
    if (!b) return;
    if (b.dataset.r === 'close') close();
    if (b.dataset.r === 'print') doPrint();
  });
  ov.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  // Post-process the document once it renders (page numbers on .page divs —
  // replaces the old inline <script> inside document.write, which a CSP would
  // block inside a srcdoc iframe).
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const pages = doc.querySelectorAll('.page');
      pages.forEach((p, i) => {
        let el = p.querySelector('.page-num');
        if (!el) { el = doc.createElement('div'); el.className = 'page-num'; p.appendChild(el); }
        el.textContent = 'Page ' + (i + 1) + ' of ' + pages.length;
      });
      if (pages.length) {
        const s = doc.createElement('style');
        s.textContent = '.page::after{content:none !important;}';
        doc.head.appendChild(s);
      }
      if (opts.onReady) opts.onReady();
      loaded = true;
      if (opts.autoPrint || opts.printWhenReady) setTimeout(doPrint, 250);
    } catch (err) { /* cross-origin safety net — never breaks the viewer */ }
  });
  return { close, print: doPrint, overlay: ov };
}

// ── Export all to window ──────────────────────────────────────────
if (typeof window !== 'undefined') {
  Object.assign(window, {
    esc, escAttr, api, formatDate, formatDateTime, formatTime, timeAgo,
    formatCurrency, formatNumber, formatPercent,
    $, $$, show, hide, toggle, setText, setHTML,
    showToast, confirm2, debounce, localQr, _vxReportOverlay,
  });
}
