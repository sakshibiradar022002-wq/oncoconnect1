// Database adapter. Three backends behind one tiny async interface:
//
//   - libsql (@libsql/client)  — used when TURSO_DATABASE_URL is set. Points
//     at a Turso cloud database (free tier, no disk needed on the host) or a
//     local file via a file: URL.
//   - better-sqlite3           — local file, fast native binding.
//   - node:sqlite              — local file, zero build step (Node >= 22).
//
// The interface every backend exposes:
//   db.prepare(sql) -> { run(...args), get(...args), all(...args) }  (async)
//   db.exec(sql), db.pragma(str)                                     (async)
//
// All methods return promises so the same route code works against both the
// in-process SQLite files and the remote Turso HTTP API.

import { readFileSync, writeFileSync, statSync, openSync, closeSync, writeSync, unlinkSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let impl = null;

// ── Advisory single-writer lock ────────────────────────────────────
// The sql.js backend keeps the whole database in RAM and snapshots it to
// disk every few seconds — two processes doing that to the same file
// silently clobber each other (Server exe vs Doctor exe). A lock file
// created with O_EXCL (atomic) lets exactly one process claim read-write
// access; everyone else opens READ-ONLY and follows disk changes.
// acquire uses a UNIQUE temp file + rename (atomic takeover, no
// unlink-then-create race), and the content `<pid> <bootId>` defeats pid reuse.
const bootId = randomBytes(8).toString('hex');

// Corrupt-file boot guard: quarantine + backup-restore (see repair.js).
import { repairCorruptDb } from './repair.js';

function tryAcquireWriterLock(dbPath) {
  const lockPath = dbPath + '.lock';
  const tmpPath = `${lockPath}.${process.pid}.${bootId}.tmp`;
  const claim = () => {
    try {
      const fd = openSync(tmpPath, 'wx');          // atomic create-if-not-exists
      writeSync(fd, `${process.pid} ${bootId}`);
      closeSync(fd);
    } catch {
      return false;                                // lost the temp-file race
    }
    try {
      renameSync(tmpPath, lockPath);               // atomic takeover
    } catch {
      try { unlinkSync(tmpPath); } catch {}
      return false;                                // someone else owns the lock
    }
    return true;
  };

  if (!existsSync(lockPath)) return claim();       // fast path: no lock yet

  // Stale-holder check: reclaim ONLY on definitive proof the holder is gone
  // (kill(pid,0) throwing ESRCH). Any other probe error (EPERM, unreadable
  // lock, fs race) means "assume alive" — a wrong reclaim let a second
  // process overwrite the file while the owner was still running.
  try {
    const [pidStr, bid] = readFileSync(lockPath, 'utf-8').trim().split(/\s+/);
    const pid = parseInt(pidStr, 10);
    if (pid === process.pid && bid === bootId) return true;    // already ours
    if (!pid || !Number.isFinite(pid)) return false;            // unreadable → defer
    try {
      process.kill(pid, 0);
      return false;                                             // holder alive
    } catch (err) {
      if (err && err.code !== 'ESRCH') return false;            // not provably dead
      // ESRCH → holder is gone; the unique rename decides any reclaim race.
      for (let i = 0; i < 5; i++) if (claim()) return true;
      return false;
    }
  } catch { return false; }
}

function releaseWriterLock(dbPath) {
  const lockPath = dbPath + '.lock';
  try {
    const [pidStr, bid] = readFileSync(lockPath, 'utf-8').trim().split(/\s+/);
    if (parseInt(pidStr, 10) === process.pid && bid === bootId) unlinkSync(lockPath);
  } catch {}
}

// Re-check ownership before every disk write: if we were presumed dead and
// another process reclaimed, stop writing immediately.
function stillOwnsWriterLock(dbPath) {
  try {
    const [pidStr, bid] = readFileSync(dbPath + '.lock', 'utf-8').trim().split(/\s+/);
    return parseInt(pidStr, 10) === process.pid && bid === bootId;
  } catch { return false; }
}

// ── Corrupt-file boot guard ───────────────────────────────────────
// SQLite files start with the 16-byte magic "SQLite format 3\0". A file
// missing it cannot be a database (zeroed by a torn write, truncated,
// wrong file) — and opening it either crashes boot (sql.js: "file is not
// a database") or silently starts EMPTY (better-sqlite3). Observed twice
// in production (2026-09-18/19). Before any backend touches the file:
// quarantine the corrupt file beside the DB, then restore the newest
// valid backup from <dbDir>/backups (the automated-backup layout).

export async function openDatabase(path) {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  if (tursoUrl) {
    const { createClient } = await import('@libsql/client');
    const client = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
    impl = 'libsql';
    return wrapLibsql(client, tursoUrl);
  }

  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.warn('[db] No TURSO_DATABASE_URL set on serverless host — using in-memory database (data will not persist)');
  }

  // Boot guard: never let a corrupt file crash boot or start silently empty.
  repairCorruptDb(path);

  // Single-writer enforcement is backend-INDEPENDENT. Acquiring the lock
  // only inside the sql.js fallback meant any Node with node:sqlite (>= 22 —
  // and production runs 24.x) skipped the lock entirely, so a second process
  // could open the same file read-write: exactly the double-writer that
  // corrupted production. Whoever wins the lock writes; everyone else opens
  // READ-ONLY.
  const lockApplicable = !!path && path !== ':memory:';
  const canWrite = lockApplicable ? tryAcquireWriterLock(path) : true;
  const readOnly = !canWrite;
  if (readOnly) {
    console.warn(`[db] ${path} is owned by another VELTRUVIA process (pid in ${path}.lock) — opening READ-ONLY.`);
  }

  // Try better-sqlite3 first.
  try {
    const mod = await import('better-sqlite3');
    const db = new mod.default(path, readOnly ? { readonly: true } : undefined);
    impl = readOnly ? 'better-sqlite3 (read-only)' : 'better-sqlite3';
    return wrapSync(db, (s) => db.pragma(s), path, canWrite);
  } catch {
    // Try node:sqlite (Node >= 22)
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path, readOnly ? { readOnly: true } : undefined);
      impl = readOnly ? 'node:sqlite (read-only)' : 'node:sqlite';
      return wrapSync(db, (s) => db.exec(`PRAGMA ${s};`), path, canWrite);
    } catch {
      // Fall back to sql.js (WASM-based, no native build needed)
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const fs = await import('node:fs');
      let db;
      // canWrite was already decided above (lock acquired before backend
      // selection) — sql.js is the last-resort backend of the same decision.
      if (path === ':memory:') {
        db = new SQL.Database();
      } else {
        try {
          const buffer = fs.readFileSync(path);
          db = new SQL.Database(buffer);
        } catch {
          db = new SQL.Database();
        }
      }
      if (!canWrite) {
        console.warn(`[db] ${path} is owned by another VELTRUVIA process (pid in ${path}.lock) — opening READ-ONLY.`);
        console.warn('[db] Start the central Server first, or close this app: it will display data but not save changes.');
      }
      impl = canWrite ? 'sql.js' : 'sql.js (read-only)';
      // 4th arg = readOnly — the INVERSE of canWrite (inverting these made
      // the lock owner silently never flush — caught by hardening.test.mjs).
      return wrapSqlJs(SQL, db, path, !canWrite);
    }
  }
}

export function activeImpl() { return impl; }

// Promisify a synchronous sqlite handle (both share prepare/exec).
function wrapSync(db, pragma, dbPath, canWrite = true) {
  return {
    async exec(sql) { db.exec(sql); },
    async pragma(str) { pragma(str); },
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        async run(...args) { return stmt.run(...args); },
        async get(...args) { return stmt.get(...args); },
        async all(...args) { return stmt.all(...args); },
      };
    },
    close() {
      try { db.close(); } catch {}
      // Only the lock owner releases it; a read-only opener must never
      // delete the writer's lock file.
      if (canWrite) releaseWriterLock(dbPath);
    },
    flush() {},
    name: dbPath,
  };
}

function wrapSqlJs(SQL, initialDb, dbPath, readOnly = false) {
  // Use a reference object so we can swap the db pointer on reload
  const ref = { db: initialDb };
  let lastMtime = 0;
  try { lastMtime = statSync(dbPath).mtimeMs; } catch {}

  const save = () => {
    if (readOnly) return;                      // readers never write the file
    if (!stillOwnsWriterLock(dbPath)) {        // ownership stolen (we were
      console.warn('[db] writer lock lost — flushing disabled to avoid clobbering the new owner');
      return;                                  //  presumed dead): stop writing
    }
    // ATOMIC snapshot: export → validate → write temp → rename over the DB.
    // A plain writeFileSync(dbPath, …) truncated mid-write (process killed,
    // power loss) leaves a ZEROED file behind — observed twice in production
    // (2026-09-18/19) as "file is not a database" on next boot. rename() on
    // the same volume is atomic, so the on-disk file is always either the
    // previous complete snapshot or the new one — never a torn write.
    let tmpPath = '';
    try {
      const data = Buffer.from(ref.db.export());
      // Validate the export re-opens as SQLite before it is allowed to
      // replace the last good snapshot. Cheap (header + master-table probe).
      const probe = new SQL.Database(data);
      const check = probe.exec("SELECT count(*) FROM sqlite_master");
      probe.close();
      if (!check.length) throw new Error('export failed sqlite_master probe');
      tmpPath = `${dbPath}.save-${process.pid}-${bootId}.tmp`;
      writeFileSync(tmpPath, data);
      // Windows: rename onto a file another process holds open throws —
      // caught below, the last good snapshot stays in place. POSIX: atomic.
      renameSync(tmpPath, dbPath);
      tmpPath = '';
      lastMtime = Date.now();
    } catch (e) {
      console.error('[db] snapshot failed (on-disk DB untouched):', e && e.message);
      if (tmpPath) { try { unlinkSync(tmpPath); } catch {} }
    }
  };

  // Reload from disk if another process wrote to it. Poison guard: never
  // swap in a file that lacks the core schema — that would silently wipe
  // every table out of RAM (observed as "no such table: sessions").
  const reloadIfChanged = () => {
    try {
      const st = statSync(dbPath);
      if (st.mtimeMs > lastMtime + 100) {
        const buf = readFileSync(dbPath);
        // Torn-write guard: a zeroed/truncated file can never be adopted.
        // SQLite files start with the 16-byte magic "SQLite format 3\0".
        if (buf.length < 100 || !buf.subarray(0, 16).equals(Buffer.from('SQLite format 3\x00', 'latin1'))) {
          console.warn('[db] on-disk database is corrupt (bad header) — keeping in-memory state (no reload)');
          lastMtime = st.mtimeMs;      // don't re-log every tick
          return;
        }
        const newDb = new SQL.Database(buf);
        const probe = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kv_store','users') LIMIT 2");
        if (!probe.length || probe[0].values.length < 2) {
          console.warn('[db] on-disk database failed schema check — keeping in-memory state (no reload)');
          newDb.close();
          lastMtime = st.mtimeMs;      // don't re-log every tick
          return;
        }
        ref.db.close();
        ref.db = newDb;
        lastMtime = st.mtimeMs;
      }
    } catch {}
  };

  // Writers snapshot the full DB to disk every 5 s and also follow external
  // reloads; READ-ONLY instances only follow the file the writer publishes.
  const intervalId = readOnly ? setInterval(reloadIfChanged, 5000) : setInterval(save, 5000);
  const reloadId = readOnly ? null : setInterval(reloadIfChanged, 2000);

  process.on('exit', save);
  process.on('SIGINT', () => { save(); process.exit(); });

  return {
    async exec(sql) {
      ref.db.exec(sql);
    },
    async pragma(str) {
      try { ref.db.run(`PRAGMA ${str}`); } catch {}
    },
    prepare(sql) {
      return {
        async run(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          ref.db.run(sql, params);
          return { changes: ref.db.getRowsModified() };
        },
        async get(...args) {
          // Reload from disk before reads to see other apps' writes
          reloadIfChanged();
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const stmt = ref.db.prepare(sql);
          try {
            stmt.bind(params);
            if (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((c, i) => row[c] = vals[i]);
              return row;
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        async all(...args) {
          // Reload from disk before reads to see other apps' writes
          reloadIfChanged();
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const stmt = ref.db.prepare(sql);
          try {
            stmt.bind(params);
            const rows = [];
            while (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((c, i) => row[c] = vals[i]);
              rows.push(row);
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
      };
    },
    close() {
      clearInterval(intervalId);
      if (reloadId) clearInterval(reloadId);
      save();
      if (!readOnly) releaseWriterLock(dbPath);
      ref.db.close();
    },
    flush() { save(); },
    name: dbPath,
    get readOnly() { return readOnly; },
  };
}

function wrapLibsql(client, url) {
  return {
    async exec(sql) {
      const script = sql.split('\n').filter(l => !/^\s*PRAGMA\b/i.test(l)).join('\n');
      await client.executeMultiple(script);
    },
    async pragma() { /* not applicable to a remote database */ },
    prepare(sql) {
      return {
        async run(...args) {
          const r = await client.execute({ sql, args });
          return { changes: r.rowsAffected };
        },
        async get(...args) {
          const r = await client.execute({ sql, args });
          return r.rows[0] ? { ...r.rows[0] } : undefined;
        },
        async all(...args) {
          const r = await client.execute({ sql, args });
          return r.rows.map(row => ({ ...row }));
        },
      };
    },
    close() { /* libsql client has no close method */ },
    name: url,
    get readOnly() { return false; },
  };
}
