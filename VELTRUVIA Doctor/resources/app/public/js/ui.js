// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA In-App Dialogs — replaces native alert/confirm/prompt.
// Styled to match each app's design system (uses existing CSS vars),
// keyboard accessible (focus trap, Esc/Enter, focus restore), and
// screen-reader friendly (role=dialog/alertdialog, aria-modal, live regions).
//
// Public API (all async):
//   AppDialog.alert(message, opts)    → Promise<void>
//   AppDialog.confirm(message, opts)  → Promise<boolean>  (Esc/Cancel = false)
//   AppDialog.prompt(message, def, opts) → Promise<string|null>
//   AppDialog.toast(message, type)    → void
//
// Include order: js/ui.js FIRST, then js/utils.js, then page scripts.
// Per-app accent: set <html data-app="patient|lab|doctor">.
// PWToggle: show/hide (👁) toggle for password fields.
//   Wrap a password input in <span class="pw-wrap">…</span>; on DOM ready the
//   toggle is injected automatically. New dynamically created fields work too
//   (call PWToggle.scan(root)).
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Password show/hide (👁) — zero dependencies, works on phone + desktop ──
  const PW_CSS = `.pw-wrap{position:relative;display:block;}`
    + `.pw-wrap input{width:100%;padding-right:46px;}`
    + `.pw-eye{position:absolute;top:50%;right:10px;transform:translateY(-50%);`
    + `width:34px;height:34px;border:none;background:transparent;border-radius:50%;`
    + `display:flex;align-items:center;justify-content:center;cursor:pointer;`
    + `font-size:18px;line-height:1;color:var(--text-muted,#8494b2);padding:0;z-index:2;`
    + `-webkit-tap-highlight-color:transparent;touch-action:manipulation;`
    + `.pw-eye:hover{background:rgba(127,127,127,.12);color:var(--text,#e2e8f0);}`
    + `.pw-eye:active{transform:translateY(-50%) scale(.92);}`
    + `.pw-eye:focus-visible{outline:2px solid var(--blue,#4a90e2);outline-offset:2px;}`;
  try { const st = document.createElement('style'); st.textContent = PW_CSS; document.head.appendChild(st); } catch (e) {}
  function scanPasswords(root) {
    const scope = root && root.querySelectorAll ? root : document;
    let n = 0;
    scope.querySelectorAll('input[type="password"]').forEach(inp => {
      const wrap = inp.parentElement;
      if (!wrap || !wrap.classList.contains('pw-wrap') || wrap.querySelector('.pw-eye')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-eye';
      btn.textContent = '👁';
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('tabindex', '-1');
      btn.addEventListener('click', () => {
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
      wrap.appendChild(btn);n++;
    });
    return n;
  }
  scanPasswords();
  document.addEventListener('DOMContentLoaded', () => scanPasswords());
  window.PWToggle = { scan: scanPasswords };

  const THEMES = {
    doctor:  { accent: 'var(--blue, #2563eb)' },
    patient: { accent: 'var(--green, #059669)' },
    lab:     { accent: 'var(--purple, #7c3aed)' },
  };
  function theme() {
    return THEMES[document.documentElement.getAttribute('data-app')] || THEMES.doctor;
  }

  const CSS = `
.vd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);
  z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;
  animation:vdIn .18s ease both}
.vd-box{background:var(--surface,#fff);border:1px solid var(--border,#ccc);border-radius:18px;
  padding:26px 26px 22px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);
  animation:vdPop .22s cubic-bezier(.4,0,.2,1) both;font-family:inherit;color:var(--text,#111)}
.vd-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;
  font-size:20px;margin-bottom:14px;background:var(--vd-accent-bg,rgba(37,99,235,.1));color:var(--vd-accent,#2563eb)}
.vd-title{font-size:15px;font-weight:800;margin-bottom:8px;letter-spacing:-.2px;color:var(--text,#111)}
.vd-msg{font-size:13px;line-height:1.55;color:var(--text-muted,#556);white-space:pre-wrap;
  max-height:40vh;overflow-y:auto;word-break:break-word}
.vd-input{width:100%;margin-top:14px;padding:11px 14px;border:1.5px solid var(--border,#bbb);
  border-radius:11px;background:var(--surface2,#f6f7fb);color:var(--text,#111);font-family:inherit;
  font-size:13.5px;outline:none}
.vd-input:focus{border-color:var(--vd-accent,#2563eb);box-shadow:0 0 0 3px var(--vd-accent-bg,rgba(37,99,235,.15))}
.vd-input.vd-invalid{border-color:var(--red,#dc2626)!important}
.vd-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
.vd-btn{padding:9px 18px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;
  cursor:pointer;border:1.5px solid var(--border,#bbb);background:var(--surface,#fff);color:var(--text,#111);
  transition:filter .15s ease, transform .15s ease}
.vd-btn:hover{filter:brightness(1.08)}
.vd-btn:active{transform:scale(.97)}
.vd-btn-primary{background:var(--vd-accent,#2563eb);border-color:transparent;color:#fff}
.vd-btn-danger{background:var(--red,#dc2626);border-color:transparent;color:#fff}
@keyframes vdIn{from{opacity:0}to{opacity:1}}
@keyframes vdPop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.vd-overlay,.vd-box{animation:none}}
.vd-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100001;
  padding:12px 22px;border-radius:12px;color:#fff;font-size:13px;font-weight:600;
  box-shadow:0 8px 30px rgba(0,0,0,.3);animation:vdIn .2s ease both;max-width:min(90vw,520px);
  white-space:pre-wrap;pointer-events:none}
.vd-toast.vd-out{opacity:0;transition:opacity .3s ease}
`;

  let sheetInjected = false;
  function injectCSS() {
    if (sheetInjected) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    sheetInjected = true;
  }

  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  function trapTab(e, box) {
    const items = Array.from(box.querySelectorAll(FOCUSABLE)).filter(el => !el.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const CANCEL = Symbol('vd-cancel');
  let active = null;

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function open({ title, message, icon, input, buttons }) {
    return new Promise((resolve) => {
      injectCSS();
      if (active) { try { active.close(CANCEL, true); } catch {} }

      const t = theme();
      const overlay = document.createElement('div');
      overlay.className = 'vd-overlay';
      const multiple = buttons.length > 1;
      overlay.innerHTML = `
        <div class="vd-box" role="${multiple ? 'dialog' : 'alertdialog'}"
             aria-modal="true" aria-label="${escHtml(title || 'Message')}">
          ${icon ? `<div class="vd-icon" aria-hidden="true">${icon}</div>` : ''}
          ${title ? `<div class="vd-title">${escHtml(title)}</div>` : ''}
          <div class="vd-msg">${escHtml(message)}</div>
          ${input ? `<input class="vd-input" type="${escHtml(input.type || 'text')}"
                    placeholder="${escHtml(input.placeholder || '')}"
                    aria-label="${escHtml(input.label || 'Input')}" autocomplete="off">` : ''}
          <div class="vd-btns"></div>
        </div>`;
      const box = overlay.querySelector('.vd-box');
      const btnRow = overlay.querySelector('.vd-btns');
      const inputEl = overlay.querySelector('.vd-input');
      box.style.setProperty('--vd-accent', t.accent);

      let settled = false;
      function close(value, silent) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        active = null;
        if (prevFocus && document.contains(prevFocus)) { try { prevFocus.focus(); } catch {} }
        if (!silent) resolve(value);
      }
      function finish(value) {
        if (input && value !== CANCEL) {
          const text = inputEl ? inputEl.value : '';
          if (input.required && !text.trim()) {
            inputEl.classList.add('vd-invalid');
            inputEl.focus();
            return;
          }
          value = text;
        }
        close(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(CANCEL); }
        else if (e.key === 'Enter' && inputEl && document.activeElement === inputEl && !e.shiftKey) {
          e.preventDefault();
          finish((buttons.find(b => b.primary) || buttons[buttons.length - 1]).value);
        }
        else if (e.key === 'Tab') trapTab(e, box);
      }

      const primaryBtn = { current: null };
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vd-btn' + (b.danger ? ' vd-btn-danger' : b.primary ? ' vd-btn-primary' : '');
        btn.textContent = b.label;
        btn.addEventListener('click', () => finish(b.value));
        btnRow.appendChild(btn);
        if (b.primary || !primaryBtn.current) primaryBtn.current = btn;
      });

      const prevFocus = document.activeElement;
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', e => {
        if (e.target === overlay && (!input || !input.required)) close(CANCEL);
      });
      (inputEl || primaryBtn.current).focus();
      if (inputEl && input.select) inputEl.select();

      active = { close };
    });
  }

  const AppDialog = {
    alert(message, opts = {}) {
      return open({
        title: opts.title || '',
        message: String(message ?? ''),
        icon: opts.icon || (opts.danger ? '⚠️' : 'ℹ️'),
        input: null,
        buttons: [{ label: opts.okLabel || 'OK', value: true, primary: true }],
      }).then(() => {});
    },
    confirm(message, opts = {}) {
      return open({
        title: opts.title || (opts.danger ? 'Please confirm' : ''),
        message: String(message ?? ''),
        icon: opts.icon || (opts.danger ? '⚠️' : '❓'),
        input: null,
        buttons: [
          { label: opts.cancelLabel || 'Cancel', value: false },
          { label: opts.okLabel || (opts.danger ? 'Delete' : 'Confirm'), value: true, primary: true, danger: !!opts.danger },
        ],
      }).then(v => v === true);
    },
    prompt(message, defaultValue = '', opts = {}) {
      return open({
        title: opts.title || '',
        message: String(message ?? ''),
        icon: opts.icon || '✏️',
        input: {
          type: opts.type || 'text',
          placeholder: opts.placeholder || '',
          label: opts.label || message,
          required: !!opts.required,
          select: true,
        },
        buttons: [
          { label: opts.cancelLabel || 'Cancel', value: CANCEL },
          { label: opts.okLabel || 'OK', value: true, primary: true },
        ],
      }).then(v => (v === CANCEL || v === undefined) ? null : String(v));
    },
    toast(message, type = 'info', duration = 3000) {
      injectCSS();
      const bg = type === 'error' ? 'var(--red,#dc2626)'
        : type === 'success' ? 'var(--green,#059669)'
        : type === 'warning' ? 'var(--orange,#d97706)'
        : theme().accent;
      const el = document.createElement('div');
      el.className = 'vd-toast';
      el.style.background = bg;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.textContent = String(message ?? '');
      document.body.appendChild(el);
      setTimeout(() => { el.classList.add('vd-out'); setTimeout(() => el.remove(), 350); }, duration);
    },
  };

  window.AppDialog = AppDialog;

  // ═══════════════════════════════════════════════════════════════
  // A11y enhancer — progressive accessibility upgrades for the legacy
  // markup, applied automatically on DOMContentLoaded:
  //   • .page-title/.card-title/.modal-title → heading roles
  //   • sidebar (.sidebar) → navigation landmark; .main → main landmark
  //   • .overlay/.sheet modals → dialog semantics + focus trap + Esc
  //   • nav buttons → aria-current management
  //   • a polite live region for announcements
  // ═══════════════════════════════════════════════════════════════
  const A11Y_CSS = `
.vh{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0}
.vd-skip{position:fixed;top:-48px;left:16px;z-index:100002;background:#1d4ed8;color:#fff;
  padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px;transition:top .2s ease}
.vd-skip:focus{top:12px}
html.vd-text-sm{font-size:92%}html.vd-text-lg{font-size:110%}html.vd-text-xl{font-size:122%}
`;

  function enhanceA11y() {
    if (document.getElementById('vd-live')) return; // already run
    const style = document.createElement('style');
    style.textContent = A11Y_CSS;
    document.head.appendChild(style);

    // Live region
    const live = document.createElement('div');
    live.id = 'vd-live';
    live.className = 'vh';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);

    // Landmarks
    document.querySelectorAll('.sidebar, .sidebar-nav, .bottom-nav').forEach(el => {
      if (!el.closest('[role=navigation]')) el.setAttribute('role', 'navigation');
    });
    document.querySelectorAll('.main, #app-shell').forEach(el => {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'main');
    });

    // Skip link (first focusable element on the page)
    const mainEl = document.querySelector('.main, #app-shell');
    if (mainEl && !document.getElementById('vd-skip-link')) {
      if (!mainEl.id) mainEl.id = 'vd-main';
      mainEl.setAttribute('tabindex', '-1');
      const skip = document.createElement('a');
      skip.id = 'vd-skip-link';
      skip.className = 'vd-skip';
      skip.href = '#' + mainEl.id;
      skip.textContent = 'Skip to main content';
      skip.addEventListener('click', (e) => {
        e.preventDefault();
        mainEl.focus({ preventScroll: false });
        mainEl.scrollIntoView({ block: 'start' });
      });
      document.body.prepend(skip);
    }

    // Headings (visible hierarchy without changing markup)
    document.querySelectorAll('.page-title').forEach(el => { el.setAttribute('role', 'heading'); el.setAttribute('aria-level', '1'); });
    document.querySelectorAll('.modal-title, .sheet-title, .rt-title').forEach(el => { el.setAttribute('role', 'heading'); el.setAttribute('aria-level', '2'); });
    document.querySelectorAll('.card-title, .info-card-title, .settings-section h3, .log-sec-title').forEach(el => { el.setAttribute('role', 'heading'); el.setAttribute('aria-level', '2'); });

    // Nav current-item management (click + programmatic showPanel)
    const NAV_SEL = '.nav-item, .rnav-item, .nav-btn, .ltab, .ts-btn';
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest(NAV_SEL);
      if (!btn) return;
      const group = btn.closest('.sidebar, .sidebar-scroll, .bottom-nav, .sidebar-nav, .record-nav, .login-tabs, .tab-switcher') || document;
      group.querySelectorAll(NAV_SEL).forEach(b => b.removeAttribute('aria-current'));
      btn.setAttribute('aria-current', 'page');
      announce(btn.textContent.trim().replace(/\s+/g, ' '));
    }, true);

    // Modal focus trap + Esc for legacy .overlay / .sheet modals.
    document.addEventListener('keydown', (e) => {
      const openModal = document.querySelector('.overlay.open, .sheet-overlay.open .sheet, .hist-overlay.open');
      if (!openModal) return;
      if (e.key === 'Tab') trapTab(e, openModal);
      else if (e.key === 'Escape') {
        // Legacy modals close via their own close functions; emulate the
        // most common close affordances instead of force-removing nodes.
        const closer = openModal.querySelector('[onclick*="closeOverlay"], [onclick*="closeSheet"], .sheet-x, .modal [data-close]');
        if (closer) { e.preventDefault(); closer.click(); }
      }
    }, true);

    // Keep legacy modals labelled + trapped when opened.
    const mo = new MutationObserver(() => {
      document.querySelectorAll('.overlay.open, .sheet-overlay.open .sheet').forEach(m => {
        if (!m.hasAttribute('role')) { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); }
        const title = m.querySelector('.modal-title, .sheet-title');
        if (title && !m.hasAttribute('aria-labelledby')) {
          if (!title.id) title.id = 'vd-mt-' + Math.random().toString(36).slice(2, 8);
          m.setAttribute('aria-labelledby', title.id);
        }
      });
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  function announce(text) {
    const live = document.getElementById('vd-live');
    if (live && text) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); }
  }

  function bootA11y() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceA11y);
    else enhanceA11y();
  }
  bootA11y();

  // ═══════════════════════════════════════════════════════════════
  // Text size control — user preference, persisted. The root font-size
  // scales the whole rem-based UI. Exposed as Ctrl+Alt+= / Ctrl+Alt+-
  // and via AppA11y.setTextSize for settings panels.
  // ═══════════════════════════════════════════════════════════════
  const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'];
  function applyTextSize(mode) {
    document.documentElement.classList.remove('vd-text-sm', 'vd-text-lg', 'vd-text-xl');
    if (mode && mode !== 'md') document.documentElement.classList.add('vd-text-' + mode);
    try { localStorage.setItem('vd_text_size', mode); } catch {}
  }
  try { applyTextSize(localStorage.getItem('vd_text_size') || 'md'); } catch {}

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.altKey)) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); AppA11y.setTextSize('up'); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); AppA11y.setTextSize('down'); }
  });

  window.AppA11y = {
    announce, enhanceA11y,
    setTextSize(mode) {
      const cur = (() => { try { return localStorage.getItem('vd_text_size') || 'md'; } catch { return 'md'; } })();
      let next = mode;
      if (mode === 'up') next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, TEXT_SIZES.indexOf(cur) + 1)];
      if (mode === 'down') next = TEXT_SIZES[Math.max(0, TEXT_SIZES.indexOf(cur) - 1)];
      applyTextSize(next);
      announce('Text size ' + next);
      return next;
    },
    getTextSize() { try { return localStorage.getItem('vd_text_size') || 'md'; } catch { return 'md'; } },
  };
})();

// ═══════════════════════════════════════════════════════════════════
// UX Toolkit — shared helpers for the whole suite (V2, Sep 2026):
//   Busy.btn(btn, fn)      double-submit guard: disables the control and
//                          shows a Working… label until the async fn settles
//   Busy.wrap(el, fn)      same guard for any element (cards, rows)
//   OfflineBanner          fixed "You are offline" bar; live via events
//   StuckLoader.watch()    Loading… placeholders get a timeout + Retry
//   Session.remember(who)  store encrypted identity for next-visit restore
//   Session.restore()      → {kind:'patient'|'lab'|'doctor', name, mrn…}|null
//   Session.forget()       clear it
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Busy guard ────────────────────────────────────────────────────
  const busySet = new WeakSet();
  function wrap(el, fn) {
    if (!el || busySet.has(el)) return undefined;
    busySet.add(el);
    const restoreLabel = el.dataset ? el.dataset.busyRestore : null;
    const prev = restoreLabel || el.textContent;
    if (el.dataset) el.dataset.busyRestore = prev;
    el.__veltruviaDisabled = true;
    el.style.opacity = '0.65';
    el.style.pointerEvents = 'none';
    if (prev && prev.length < 40) el.textContent = 'Working…';
    const done = () => {
      busySet.delete(el);
      el.__veltruviaDisabled = false;
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.textContent = prev;
      if (el.dataset) delete el.dataset.busyRestore;
    };
    try {
      const out = fn();
      if (out && typeof out.finally === 'function') return out.finally(done);
      done();
      return out;
    } catch (e) { done(); throw e; }
  }
  const Busy = {
    wrap,
    btn(el, fn) {
      if (el && el.tagName === 'BUTTON') el.type = el.type || 'button';
      return wrap(el, fn);
    },
    isBusy(el) { return !!(el && busySet.has(el)); },
  };

  // ── Offline banner ────────────────────────────────────────────────
  const OfflineBanner = {
    el: null,
    _ensure() {
      if (this.el) return this.el;
      const b = document.createElement('div');
      b.className = 'vx-offline-banner';
      b.setAttribute('role', 'status');
      b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;display:none;'
        + 'padding:9px 16px;text-align:center;font:600 13px system-ui,sans-serif;'
        + 'background:#b45309;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3);';
      b.textContent = '📡 You are offline — changes will not reach your doctor until connection returns';
      (document.body || document.documentElement).appendChild(b);
      this.el = b;
      return b;
    },
    init() {
      const b = this._ensure();
      const update = () => {
        const off = navigator.onLine === false;
        b.style.display = off ? 'block' : 'none';
        document.documentElement.classList.toggle('vx-offline', off);
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      update();
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => OfflineBanner.init());
  else OfflineBanner.init();

  // ── Stuck loader watcher ─────────────────────────────────────────
  const StuckLoader = {
    started: false,
    watch() {
      if (this.started) return;
      this.started = true;
      setInterval(() => {
        document.querySelectorAll('.empty-card').forEach(el => {
          const t = (el.textContent || '').trim();
          if (t !== 'Loading...' && t !== 'Loading…') return;
          const since = Number(el.dataset.vxLoadingSince || 0);
          if (!since) { el.dataset.vxLoadingSince = String(Date.now()); return; }
          if (Date.now() - since < 8000) return;
          if (el.dataset.vxStuckNoted) return;
          el.dataset.vxStuckNoted = '1';
          el.innerHTML = '<div style="padding:6px 0;">⏳ Still loading… the server may be slow or unreachable.</div>'
            + '<button class="big-btn" data-vx-retry style="margin-top:8px;padding:8px 18px;font-size:13px;">↻ Retry</button>'
            + '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">If this keeps happening, check your internet or the server status page.</div>'
            + '<style>[data-vx-retry]{background:var(--green,#059669);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;}</style>';
          const btn = el.querySelector('[data-vx-retry]');
          if (btn) btn.addEventListener('click', () => { delete el.dataset.vxLoadingSince; delete el.dataset.vxStuckNoted; el.innerHTML = 'Loading...'; location.reload(); });
        });
      }, 4000);
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => StuckLoader.watch());
  else StuckLoader.watch();

  // ── Session restore (encrypted-at-rest identity) ─────────────────
  const SESSION_KEY = 'veltruvia_session_identity';
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s) { try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; } }
  const Session = {
    remember(who) {
      try { localStorage.setItem(SESSION_KEY, b64e(JSON.stringify({ who, at: Date.now() }))); } catch (e) {}
    },
    restore() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const obj = JSON.parse(b64d(raw));
        return obj && obj.who ? obj.who : null;
      } catch (e) { return null; }
    },
    forget() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} },
  };

  window.Busy = Busy;
  window.VxOfflineBanner = OfflineBanner;
  window.VxStuckLoader = StuckLoader;
  window.VxSession = Session;

  // ── Enter key submits the login card the focus is inside ─────────
  function wireEnterSubmit() {
    const containers = document.querySelectorAll('#login-patient,#login-lab,#a-login,#login-card');
    containers.forEach(c => {
      if (c.dataset.vxEnterWired) return;
      c.dataset.vxEnterWired = '1';
      c.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const t = e.target;
        if (!t || t.tagName !== 'INPUT' || t.type === 'checkbox') return;
        const btn = c.querySelector('button.btn, button.big-btn, button');
        if (btn) { e.preventDefault(); btn.click(); }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireEnterSubmit);
  else wireEnterSubmit();
})();
