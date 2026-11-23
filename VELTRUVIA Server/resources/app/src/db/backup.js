// ── Automated database backups (shared) ────────────────────────────
// Used by src/server.js (standalone node) AND electron/main-server.js /
// main-doctor.js (packaged exes, which never import server.js).
// Default ON every 6 h; BACKUP_INTERVAL_MS=0 disables, or set a custom ms.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db, flushDb } from './index.js';

const DB_BACKUP_DIR = path.join(path.dirname(config.dbPath || '.'), 'backups');
let started = false;

function liveDbPath() {
  const p = config.dbPath;
  if (!p || p === ':memory:' || !fs.existsSync(p)) return null;
  return p;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'latin1');

/** A snapshot is only usable if it starts with the 16-byte SQLite magic.
 *  A zeroed/truncated/torn file passes a size check but restores nothing
 *  (the 2026-10-13 drill found exactly that), so validate the header. */
export function isValidSqlite(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size < 100) return false;
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      return head.equals(SQLITE_MAGIC);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** flushDb() first: under sql.js the in-memory DB is only consistent on disk
 *  after a flush, and the copy must not catch a half-written file. */
function copySnapshot(dbPath, target) {
  flushDb();
  fs.copyFileSync(dbPath, target);
  try { fs.copyFileSync(dbPath + '-wal', target + '-wal'); } catch {}
  try { fs.copyFileSync(dbPath + '-shm', target + '-shm'); } catch {}
  if (!isValidSqlite(target)) {
    try { fs.unlinkSync(target); } catch {}      // never leave a bad snapshot behind
    throw new Error('backup snapshot was not written or is not a valid SQLite file');
  }
}

/** Keep the newest 30 `veltruvia-*.db` snapshots (with their sidecars). */
function pruneBackups() {
  const backups = fs.readdirSync(DB_BACKUP_DIR)
    .filter(f => f.startsWith('veltruvia-') && f.endsWith('.db'))
    .sort()
    .reverse();
  while (backups.length > 30) {
    const old = backups.pop();
    try { fs.unlinkSync(path.join(DB_BACKUP_DIR, old)); } catch {}
    try { fs.unlinkSync(path.join(DB_BACKUP_DIR, old + '-wal')); } catch {}
    try { fs.unlinkSync(path.join(DB_BACKUP_DIR, old + '-shm')); } catch {}
  }
  return backups.length + 1;
}

export async function backupDatabase() {
  try {
    const dbPath = liveDbPath();
    if (!dbPath) return;

    fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
    flushDb(); // checkpoint any in-memory state first

    const backupPath = path.join(DB_BACKUP_DIR, `veltruvia-${stamp()}.db`);
    // v2.6.2: copyFileSync on a live WAL-mode DB can land mid-write and
    // produce a corrupt snapshot (restore drill 2026-10-13 found
    // "wrong # of entries in idx_users_email" in a copied backup while the
    // live DB passed quick_check). VACUUM INTO writes a fully consistent,
    // self-contained snapshot through SQLite itself — no WAL/shm sidecar
    // needed and always restorable. Uses the app's own open connection so it
    // works whatever driver db/index.js loaded (node:sqlite / sql.js).
    //
    // db.exec() is async in the adapter, so a synchronous try/catch never sees
    // the rejection: 2.6.8 shipped that way, VACUUM INTO rejects under sql.js
    // (no real filesystem), the copy fallback was skipped, and the success
    // line still printed — no periodic snapshot was ever written. Await it and
    // only trust the snapshot if the file exists with a valid SQLite header.
    let snapshot = false;
    try {
      await db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      snapshot = isValidSqlite(backupPath);
      if (!snapshot) console.error('[backup] VACUUM INTO wrote no valid SQLite file, falling back to file copy');
    } catch (e) {
      console.error('[backup] VACUUM INTO failed, falling back to file copy:', e.message);
    }
    if (!snapshot) copySnapshot(dbPath, backupPath);

    const total = pruneBackups();
    console.log(`[backup] Database backed up to ${backupPath} (${total} total)`);
  } catch (err) {
    console.error('[backup] Failed:', err.message);
  }
}

/** Synchronous snapshot for shutdown, where a pending promise may never settle. */
export function backupDatabaseSync() {
  try {
    const dbPath = liveDbPath();
    if (!dbPath) return null;
    fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
    const target = path.join(DB_BACKUP_DIR, `veltruvia-exit-${stamp()}.db`);
    copySnapshot(dbPath, target);
    pruneBackups();
    console.log(`[backup] Final snapshot on shutdown: ${target}`);
    return target;
  } catch (err) {
    console.error('[backup] Shutdown snapshot failed:', err.message);
    return null;
  }
}

export function startBackups() {
  if (started) return;               // singleton — Server + Doctor may both call
  const interval = parseInt(process.env.BACKUP_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10);
  if (!(interval > 0)) {
    console.log('[backup] Automated backups disabled (BACKUP_INTERVAL_MS=0)');
    return;
  }
  started = true;
  const run = () => {
    backupDatabase().catch((err) => console.error('[backup] Failed:', err?.message || err));
  };
  setTimeout(run, 30 * 1000);          // first backup shortly after boot
  setInterval(run, interval);
  console.log(`[backup] Automated backups every ${interval / 1000}s → ${DB_BACKUP_DIR}`);
}
