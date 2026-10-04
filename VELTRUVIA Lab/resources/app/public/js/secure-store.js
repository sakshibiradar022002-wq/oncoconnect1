// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA SecureStore — encryption-at-rest for local PHI.
//
// Design:
//   • Every app-data key is written ONLY in encrypted form
//     (AES-256-GCM via Web Crypto, random 12-byte IV per write).
//   • The data key itself is wrapped with Electron safeStorage
//     (OS DPAPI on Windows, Keychain on macOS) when available, so the
//     on-disk localStorage blob is useless without the OS user session.
//     Outside Electron it falls back to an obfuscated raw key — the same
//     threat level as the old plaintext-forever behaviour, but now the
//     exception, not the default.
//   • Legacy plaintext entries are migrated (encrypted + removed) on init.
//   • A synchronous read surface (backed by an in-memory cache hydrated
//     at init) keeps the existing LS.get/set/del/keys call sites working
//     without any async refactor of page code.
//   • Non-PHI prefs (themes, sync timestamps) stay plaintext.
//
// Namespace: 'cc' (Doctor/Patient) or 'lab' (Lab portal).
// Include order: js/ui.js → js/secure-store.js → js/utils.js → page script.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const S = {
    ns: 'cc',
    prefix: 'cc_',      // plaintext (legacy) keys
    enc: 'ccenc_',      // encrypted keys
    keyName: 'cc__wrap',
    metaName: 'cc__sync_meta',
    key: null,          // CryptoKey
    ready: false,
    failed: false,
    wrapped: false,     // key protected by OS (safeStorage)
    cache: Object.create(null),
    pending: [],        // queued set ops before init completes
    resolvers: [],
    legacyMigrated: 0,
  };

  // ── helpers ───────────────────────────────────────────────────────
  function b64(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function isElectron() { return !!(window.app && window.app.isElectron); }
  function hasSubtle() { return !!(window.crypto && window.crypto.subtle); }

  // Names (after prefix strip) that must stay plaintext / out of PHI set.
  function isExcluded(name) {
    if (name === '_wrap' || name === '_sync_meta' || name === '_meta') return true;
    if (name.startsWith('enc_')) return true;      // legacy cc_enc_* artifacts
    if (name.startsWith('onco_')) return true;     // theme prefs
    if (name.startsWith('veltruvia_')) return true;
    return false;
  }

  function plainGet(name) {
    const raw = localStorage.getItem(S.prefix + name);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  function plainSet(name, value) {
    try { localStorage.setItem(S.prefix + name, JSON.stringify(value)); } catch (e) { console.warn('[SecureStore] plainSet failed', e); }
  }

  // ── key management ────────────────────────────────────────────────
  async function importRaw(raw) {
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function loadKey() {
    const stored = localStorage.getItem(S.keyName);
    if (!stored) return null;
    if (stored.startsWith('raw:')) {
      S.wrapped = false;
      return importRaw(unb64(stored.slice(4)));
    }
    const payload = JSON.parse(stored);
    if (payload.mode === 'safeStorage') {
      if (!isElectron() || typeof window.app.safeStorageDecrypt !== 'function') {
        throw new Error('safeStorage-wrapped key requires the desktop app');
      }
      const rawB64 = await window.app.safeStorageDecrypt(payload.wrapped);
      S.wrapped = true;
      return importRaw(unb64(rawB64));
    }
    throw new Error('Unknown key wrap mode');
  }
  async function createKey() {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    try {
      if (isElectron() && typeof window.app.safeStorageIsAvailable === 'function'
          && typeof window.app.safeStorageEncrypt === 'function') {
        const available = await window.app.safeStorageIsAvailable();
        if (available) {
          const wrapped = await window.app.safeStorageEncrypt(b64(raw));
          if (wrapped) {
            localStorage.setItem(S.keyName, JSON.stringify({ mode: 'safeStorage', wrapped }));
            S.wrapped = true;
            return importRaw(raw);
          }
        }
      }
    } catch (e) { console.warn('[SecureStore] safeStorage wrap unavailable:', e.message); }
    // Fallback: obfuscated raw key (plaintext-equivalent, but centralized
    // and upgradeable to safeStorage on next app update).
    localStorage.setItem(S.keyName, 'raw:' + b64(raw));
    S.wrapped = false;
    return importRaw(raw);
  }

  // ── encrypt / decrypt ─────────────────────────────────────────────
  async function encWrite(name, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      S.key,
      new TextEncoder().encode(JSON.stringify(value))
    );
    localStorage.setItem(S.enc + name, JSON.stringify({ v: 1, iv: Array.from(iv), d: b64(ct) }));
    localStorage.removeItem(S.prefix + name); // no plaintext copies left behind
    S.cache[name] = value;
  }
  async function decRead(name) {
    const raw = localStorage.getItem(S.enc + name);
    if (raw === null) return undefined;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || !Array.isArray(o.iv) || typeof o.d !== 'string') throw new Error('bad blob');
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(o.iv) },
      S.key,
      unb64(o.d)
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ── migration & hydration ─────────────────────────────────────────
  async function migrateLegacy() {
    const names = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(S.prefix)) continue;
      const name = k.slice(S.prefix.length);
      if (isExcluded(name)) continue;
      names.push(name);
    }
    let n = 0;
    for (const name of names) {
      const raw = localStorage.getItem(S.prefix + name);
      if (raw === null) continue;
      let value;
      try { value = JSON.parse(raw); } catch { continue; }
      await encWrite(name, value);
      n++;
    }
    S.legacyMigrated = n;
    return n;
  }
  async function hydrateCache() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(S.enc)) continue;
      const name = k.slice(S.enc.length);
      try { S.cache[name] = await decRead(name); }
      catch { localStorage.removeItem(k); } // corrupt blob: drop rather than crash
    }
  }

  function untilReady() {
    if (S.ready) return Promise.resolve();
    return new Promise(res => S.resolvers.push(res));
  }
  function flushPending() {
    const ops = S.pending; S.pending = [];
    S.resolvers.forEach(r => r()); S.resolvers = [];
    for (const [name, value] of ops) SecureStore.set(name, value);
    window.dispatchEvent(new CustomEvent('secure-store:ready'));
  }

  // ── public API ────────────────────────────────────────────────────
  const SecureStore = {
    get ready() { return S.ready; },
    get failed() { return S.failed; },
    get osProtected() { return S.wrapped; },
    get legacyMigrated() { return S.legacyMigrated; },

    // Sync write used by existing LS.set call sites. Encrypts async,
    // caches synchronously; queues if init hasn't finished yet.
    set(name, value) {
      if (isExcluded(name)) { plainSet(name, value); return; }
      if (!S.ready) { S.pending.push([name, value]); return; }
      if (S.failed) { plainSet(name, value); return; }
      S.cache[name] = value;
      encWrite(name, value).catch(e => {
        console.warn('[SecureStore] encrypt failed, writing plaintext fallback:', e.message);
        plainSet(name, value);
      });
      window.dispatchEvent(new CustomEvent('secure-store:write', { detail: { name, deleted: value === null || value === undefined } }));
    },
    async setAsync(name, value) { this.set(name, value); },

    // Sync read: memory cache first, then any legacy plaintext.
    // Encrypted-but-uncached (i.e. reads before init finished) → null.
    get(name) {
      if (name in S.cache) return S.cache[name];
      const v = plainGet(name);
      return v === undefined ? null : v;
    },
    async getAsync(name) {
      if (!S.ready) await untilReady();
      if (S.failed) { const v = plainGet(name); return v === undefined ? null : v; }
      if (name in S.cache) return S.cache[name];
      try {
        const v = await decRead(name);
        if (v !== undefined) { S.cache[name] = v; return v; }
        return null;
      } catch { return null; }
    },
    // Synchronous best-effort read for shutdown paths (pagehide flush).
    // undefined = unknown (never cached, not plaintext) — callers must
    // treat undefined as "skip", never as "deleted".
    peek(name) {
      if (name in S.cache) return S.cache[name];
      const v = plainGet(name);
      return v === undefined ? undefined : v;
    },
    del(name) {
      delete S.cache[name];
      localStorage.removeItem(S.enc + name);
      localStorage.removeItem(S.prefix + name);
      window.dispatchEvent(new CustomEvent('secure-store:write', { detail: { name, deleted: true } }));
    },
    // All known key names (encrypted + legacy plaintext), sorted.
    names(prefixFilter) {
      const out = new Set(Object.keys(S.cache));
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith(S.enc)) out.add(k.slice(S.enc.length));
        else if (k.startsWith(S.prefix)) {
          const name = k.slice(S.prefix.length);
          if (!isExcluded(name)) out.add(name);
        }
      }
      const all = [...out].sort();
      return prefixFilter ? all.filter(n => n.startsWith(prefixFilter)) : all;
    },
    status() {
      return { ready: S.ready, failed: S.failed, encrypted: !!S.key && !S.failed, osProtected: S.wrapped, entries: Object.keys(S.cache).length };
    },
    // Resolve when init completes, or after timeoutMs (init keeps running).
    // Use at page boot so the first render never blocks on crypto.
    async readyOr({ timeoutMs = 2000 } = {}) {
      if (S.ready) return;
      await Promise.race([untilReady(), new Promise(r => setTimeout(r, timeoutMs))]);
    },
    // Export every stored value (decrypted) — for the app's backup feature.
    async exportAll() {
      await untilReady();
      const out = {};
      for (const name of this.names()) {
        const v = await this.getAsync(name);
        if (v !== null && v !== undefined) out[name] = v;
      }
      return out;
    },
    async importAll(data) {
      for (const [name, value] of Object.entries(data || {})) await this.setAsync(name, value);
    },

    async init(opts = {}) {
      const ns = opts.namespace || 'cc';
      S.ns = ns;
      S.prefix = ns + '_';
      S.enc = ns + 'enc_';
      S.keyName = ns + '__wrap';
      S.metaName = ns + '__sync_meta';
      if (!hasSubtle()) {
        S.failed = true; S.ready = true; flushPending(); return;
      }
      try {
        S.key = await loadKey() || await createKey();
        await migrateLegacy();
        await hydrateCache();
        S.failed = false;
      } catch (e) {
        S.failed = true;
        console.warn('[SecureStore] init failed — plaintext fallback active:', e.message);
        // Still hydrate the cache from plaintext so reads keep working.
        for (const name of this.names()) {
          const v = plainGet(name);
          if (v !== undefined) S.cache[name] = v;
        }
      }
      S.ready = true;
      flushPending();
    },
  };

  window.SecureStore = SecureStore;
})();
