// VELTRUVIA sync client — mirrors the cc_* localStorage keys to the server.
//
// The apps read/write localStorage synchronously; this layer makes that data
// durable and cross-device without touching the app code:
//   1. login pulls the account's keyspace from the server into localStorage
//   2. every localStorage write to a cc_* key is queued and pushed (debounced)
// If the server is unreachable, the apps keep working local-only, exactly as
// before — pushes retry on the next write.
(function () {
  'use strict';

  var API = '/api/sync';
  var META_KEY = 'cc__sync_meta'; // per-key server timestamps, excluded from sync
  var DIRTY_KEY = 'cc__sync_dirty'; // persisted dirty queue — survives reload/killed app

  var state = {
    mode: null,        // 'doctor' | 'patient' | 'lab' | null (local-only)
    online: false,
    dirty: loadDirty(), // seeded from persisted queue — survives reload/killed app
    timer: null,
    pushing: false,
  };

  function pushUrl() {
    if (state.mode === 'patient') return API + '/patient';
    if (state.mode === 'lab') return API + '/lab';
    return API;
  }

  function meta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }

  async function req(method, url, body) {
    var res = await fetch(url, {
      method: method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error(data.error || res.statusText);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Server wins only where its copy is newer than what we last synced.
  // Values go through SecureStore (encrypted-at-rest) when available.
  function mergeKeys(keys) {
    var m = meta();
    var applied = 0;
    var SS = window.SecureStore;
    for (var k in (keys || {})) {
      var entry = keys[k];
      if (!m[k] || entry.ts > m[k]) {
        try {
          if (SS) SS.set(k, entry.v);
          else localStorage.setItem('cc_' + k, JSON.stringify(entry.v));
          applied++;
        } catch (e) {}
        m[k] = entry.ts;
      }
    }
    saveMeta(m);
    return applied;
  }

  function collectAllLocal() {
    var out = {};
    var SS = window.SecureStore;
    if (SS) {
      var names = SS.names();
      for (var i = 0; i < names.length; i++) {
        var v = SS.peek(names[i]);
        if (v !== undefined && v !== null) out[names[i]] = v;
      }
      return out;
    }
    for (var j = 0; j < localStorage.length; j++) {
      var k = localStorage.key(j);
      if (!k || k.indexOf('cc_') !== 0 || k === META_KEY) continue;
      try { out[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    }
    return out;
  }

  // Raw value reader used by the push paths: reads through SecureStore's
  // cache so encrypted entries work. undefined = unknown → skip.
  function rawValue(name) {
    var SS = window.SecureStore;
    if (SS) {
      var v = SS.peek(name);
      return v === undefined ? undefined : (v === null ? null : v);
    }
    var raw = null;
    try { raw = localStorage.getItem('cc_' + name); } catch (e) {}
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function loadDirty() {
    try { return new Set(JSON.parse(localStorage.getItem(DIRTY_KEY)) || []); } catch (e) { return new Set(); }
  }
  function saveDirty() {
    try { localStorage.setItem(DIRTY_KEY, JSON.stringify(Array.from(state.dirty))); } catch (e) {}
  }

  function schedulePush() {
    if (!state.online) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(pushDirty, 1500);
  }

  async function pushDirty() {
    if (!state.online || state.pushing || state.dirty.size === 0) return;
    var keys = Array.from(state.dirty);
    state.dirty.clear();
    saveDirty();
    var changes = {};
    keys.forEach(function (k) {
      var v = rawValue(k);
      if (v === undefined) return; // unknown (never cached) — don't clobber server
      changes[k] = v;
    });
    state.pushing = true;
    try {
      await req('PUT', pushUrl(), { changes: changes });
      var m = meta();
      var now = new Date().toISOString();
      keys.forEach(function (k) { if (changes[k] === null) delete m[k]; else m[k] = now; });
      saveMeta(m);
    } catch (e) {
      keys.forEach(function (k) { state.dirty.add(k); }); // retry on next trigger
      saveDirty();
      if (e.status === 401) { state.online = false; state.authLost = true; } // session expired → local-only
    } finally {
      state.pushing = false;
    }
    if (state.dirty.size) schedulePush();
  }

  // After a successful login, flush anything queued while offline or while a
  // previous session had expired (401) — e.g. a symptom logged in airplane
  // mode that never reached the server. Server-owned values already merged via
  // mergeKeys() win through the per-key timestamps, so this cannot clobber
  // fresher server data.
  function flushPendingLocal() {
    var keys = Array.from(loadDirty());
    for (var i = 0; i < keys.length; i++) state.dirty.add(keys[i]);
    if (!state.dirty.size) return;
    var changes = {};
    state.dirty.forEach(function (k) {
      var v = rawValue(k);
      if (v === undefined) return;
      changes[k] = v;
    });
    if (!Object.keys(changes).length) { state.dirty.clear(); saveDirty(); return; }
    req('PUT', pushUrl(), { changes: changes }).then(function () {
      var m = meta();
      var now = new Date().toISOString();
      Object.keys(changes).forEach(function (k) { if (changes[k] === null) delete m[k]; else m[k] = now; });
      saveMeta(m);
      state.dirty.clear();
      saveDirty();
    }).catch(function (e) {
      Object.keys(changes).forEach(function (k) { state.dirty.add(k); });
      saveDirty();
      if (e.status === 401) { state.online = false; state.authLost = true; }
    });
  }

  // Intercept every localStorage write so app code needs no changes.
  var origSet = Storage.prototype.setItem;
  var origDel = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === window.localStorage && typeof k === 'string' && k.indexOf('cc_') === 0 && k !== META_KEY && k !== DIRTY_KEY && k.indexOf('ccenc_') !== 0 && k.indexOf('cc__') !== 0) {
      state.dirty.add(k.slice(3));
      saveDirty();
      schedulePush();
    }
  };
  Storage.prototype.removeItem = function (k) {
    origDel.call(this, k);
    if (this === window.localStorage && typeof k === 'string' && k.indexOf('cc_') === 0 && k !== META_KEY && k !== DIRTY_KEY && k.indexOf('ccenc_') !== 0 && k.indexOf('cc__') !== 0) {
      state.dirty.add(k.slice(3));
      saveDirty();
      schedulePush();
    }
  };
  // SecureStore path: encrypted writes land on ccenc_* keys, so listen to
  // its write events instead of the raw storage interception.
  window.addEventListener('secure-store:write', function (e) {
    if (!e.detail || typeof e.detail.name !== 'string') return;
    if (state.mode) { state.dirty.add(e.detail.name); saveDirty(); schedulePush(); }
  });

  // Patient/lab portals: poll for new server data (e.g. a task assigned by
  // the doctor after login) and refresh the task list when something changed.
  setInterval(function () {
    if (!state.online || !state.mode) return;
    var pullUrl = state.mode === 'patient' ? API + '/patient' : state.mode === 'lab' ? API + '/lab' : API;
    req('GET', pullUrl).then(function (d) {
      var applied = mergeKeys(d.keys);
      if (!applied) return;
      if (state.mode === 'lab' && typeof window.refreshLabTasks === 'function') {
        try { window.refreshLabTasks(); } catch (e) {}
      }
      if (state.mode === 'doctor' && typeof window.refreshDoctorNotifs === 'function') {
        try { window.refreshDoctorNotifs(); } catch (e) {}
      }
    }).catch(function () {});
  }, 45000);

  // Offline queue: dirty keys previously waited for the NEXT localStorage
  // write before retrying. Now they also flush when connectivity returns,
  // when the tab becomes visible again, and on a slow heartbeat — so a
  // symptom logged in a dead zone syncs as soon as the network is back.
  window.addEventListener('online', function () {
    if (state.mode && !state.authLost) { state.online = true; schedulePush(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) schedulePush();
  });
  setInterval(function () {
    // Heartbeat retry — also revives a session marked offline by a transient
    // network error (fetch throws even when navigator.onLine is true).
    // A 401 (revoked session) is NOT retried: that needs a fresh login.
    if (state.mode && !state.authLost && state.dirty.size) { state.online = true; schedulePush(); }
  }, 30000);

  // Flush pending changes when the tab closes.
  window.addEventListener('pagehide', function () {
    if (!state.online || state.dirty.size === 0) return;
    saveDirty();
    var changes = {};
    state.dirty.forEach(function (k) {
      var v = rawValue(k);
      if (v === undefined) return;
      changes[k] = v;
    });
    try {
      fetch(pushUrl(), {
        method: 'PUT',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: changes }),
      });
    } catch (e) {}
  });

  async function enablePush() { /* push disabled — no service worker */ }

  // ── Login hook: the apps' own login forms use raw fetch (not CCSync),
  // so watch for successful logins and flush anything queued offline/expired.
  // Mode comes from the endpoint that succeeded — no guessing needed.
  (function hookLogins() {
    var origFetch = window.fetch;
    if (!origFetch) return;
    var LOGIN_RE = /\/api\/(sync\/(store-login|patient-login|lab-login|lab-store-login)|auth\/login)$/;
    window.fetch = function (input, init) {
      var p = origFetch.apply(this, arguments);
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method === 'POST' && LOGIN_RE.test(url)) {
          p.then(function (res) {
            if (!res || !res.ok) return;
            if (/patient-login|store-login/.test(url)) state.mode = 'patient';
            else if (/lab/.test(url)) state.mode = 'lab';
            else state.mode = 'doctor';
            state.authLost = false;
            state.online = true;
            setTimeout(function () {
              var ld = loadDirty(); // merge anything persisted from a prior session
              for (var it of ld) state.dirty.add(it);
              if (state.dirty.size) { saveDirty(); pushDirty(); }
            }, 400); // after the app stores its post-login keys
          }).catch(function () {});
        }
      } catch (e) {}
      return p;
    };
  })();

  // ── Self-bootstrapping recovery sweeper ───────────────────────────
  // The engine is standalone (no app code calls it), so on page open it must
  // revive itself: if anything is queued and a valid session exists (Bearer
  // token in native apps, session cookie in web/Electron), go online and
  // flush — this is what rescues data saved offline right before the app was
  // killed, or queued during a session expiry. No queued keys → zero network
  // requests (normal online usage is unaffected).
  function nativeToken() {
    try { return localStorage.getItem('veltruvia_auth_token') || ''; } catch (e) { return ''; }
  }
  function detectMode() {
    // Only affects which PUT endpoint the flush uses. Lab devices are
    // recognized first because they also hold pat_* task keys.
    try {
      if (localStorage.getItem('cc_current_lab') || (window.SecureStore && window.SecureStore.peek && window.SecureStore.peek('current_lab') !== undefined)) return 'lab';
      if (window.SecureStore && window.SecureStore.names) {
        var names = window.SecureStore.names();
        for (var i = 0; i < names.length; i++) if (names[i].indexOf('pat_') === 0) return 'patient';
      }
      for (var j = 0; j < localStorage.length; j++) {
        var k = localStorage.key(j);
        if (k && k.indexOf('cc_pat_') === 0) return 'patient';
      }
    } catch (e) {}
    return 'doctor';
  }
  function probeAuthHeaders() {
    var t = nativeToken();
    return t ? { 'Authorization': 'Bearer ' + t } : undefined;
  }
  async function tryRecovery() {
    if (state.mode && state.online) return;          // engine already live
    var queued = loadDirty();
    if (!queued.size) { state.dirty = queued; return; } // nothing to rescue
    for (var it of queued) state.dirty.add(it);      // belt & braces merge
    saveDirty();
    var probeUrl = API + (detectMode() === 'doctor' ? '' : detectMode() === 'patient' ? '/patient' : '/lab');
    try {
      await req('GET', probeUrl);                    // 200 → session alive
      state.mode = detectMode();
      state.authLost = false;
      state.online = true;
      pushDirty();                                   // flush the rescue queue
    } catch (e) {
      // 401 (session expired) or offline → queue stays persisted; the next
      // real login flushes it via flushPendingLocal().
    }
  }
  window.addEventListener('online', function () {
    if (state.mode && !state.authLost) { state.online = true; schedulePush(); }
    else { tryRecovery(); }
  });
  setTimeout(function () { tryRecovery(); }, 2500); // after boot, never blocks UI

  window.CCSync = {
    get online() { return state.online; },
    get mode() { return state.mode; },

    // Doctor: authenticate on the server, pull the account keyspace, then
    // upload any local-only keys (first device migrating its prototype data).
    doctorLogin: async function (email, password) {
      try {
        await req('POST', '/api/auth/login', { email: email, password: password });
      } catch (e) {
        // Account has TOTP 2FA enabled — ask for the authenticator code and retry.
        if (e.status === 401 && /totp/i.test(e.message || '')) {
          var code = await AppDialog.prompt('\ud83d\udd10 Two-factor authentication is enabled.\nEnter the 6-digit code from your authenticator app:');
          if (!code) throw e;
          await req('POST', '/api/auth/login', { email: email, password: password, totpCode: code.trim() });
        } else { throw e; }
      }
      state.mode = 'doctor';
      state.authLost = false;
      state.online = true;
      enablePush();
      var pulled = await req('GET', API);
      mergeKeys(pulled.keys);
      flushPendingLocal(); // keys queued while offline/expired, incl. newer-than-server copies
      var local = collectAllLocal();
      var missing = {};
      var n = 0;
      for (var k in local) if (!(k in pulled.keys)) { missing[k] = local[k]; n++; }
      if (n) { try { await req('PUT', API, { changes: missing }); } catch (e) {} }
      return true;
    },

    doctorRegister: async function (info) {
      try {
        await req('POST', '/api/auth/register', {
          name: info.name, email: info.email, password: info.password,
          specialty: info.specialty || undefined, institution: info.institution || undefined,
        });
      } catch (e) {
        if (e.status !== 409) throw e; // already registered on another device is fine
      }
    },

    // Patient: authenticate against the synced records and pull own keys.
    patientLogin: async function (mrn, password) {
      var data = await req('POST', API + '/patient-login', { mrn: mrn, password: password });
      state.mode = 'patient';
      state.authLost = false;
      state.online = true;
      enablePush();
      mergeKeys(data.keys);
      flushPendingLocal();
      return true;
    },

    // Lab technician: authenticate against the synced lab account and pull
    // the lab's tasks, submissions, and sanitized patient list.
    labLogin: async function (username, password) {
      var data = await req('POST', API + '/lab-login', { username: username, password: password });
      state.mode = 'lab';
      state.authLost = false;
      state.online = true;
      enablePush();
      mergeKeys(data.keys);
      flushPendingLocal();
      return true;
    },

    // Revoke the server session (fire-and-forget; local logout proceeds regardless).
    // The dirty queue is intentionally KEPT: data saved offline must survive
    // logout and reach the server after the next login.
    logout: function () {
      var wasOnline = state.online;
      state.mode = null;
      state.online = false;
      state.authLost = false;
      saveDirty();
      if (wasOnline) { try { req('POST', '/api/auth/logout').catch(function () {}); } catch (e) {} }
    },
  };
})();
