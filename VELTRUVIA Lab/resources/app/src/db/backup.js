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

export function backupDatabase() {
  try {
    const dbPath = config.dbPath;
    if (!dbPath || dbPath === ':memory:' || !fs.existsSync(dbPath)) return;

    fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
    flushDb(); // checkpoint any in-memory state first

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(DB_BACKUP_DIR, `veltruvia-${timestamp}.db`);
    // v2.6.2: copyFileSync on a live WAL-mode DB can land mid-write and
    // produce a corrupt snapshot (restore drill 2026-10-13 found
    // "wrong # of entries in idx_users_email" in a copied backup while the
    // live DB passed quick_check). VACUUM INTO writes a fully consistent,
    // self-contained snapshot through SQLite itself — no WAL/shm sidecar
    // needed and always restorable. Uses the app's own open connection so it
    // works whatever driver db/index.js loaded (node:sqlite / sql.js).
    try {
      db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    } catch (e) {
      console.error('[backup] VACUUM INTO failed, falling back to file copy:', e.message);
      fs.copyFileSync(dbPath, backupPath);
      try { fs.copyFileSync(dbPath + '-wal', backupPath + '-wal'); } catch {}
      try { fs.copyFileSync(dbPath + '-shm', backupPath + '-shm'); } catch {}
    }

    // Prune old backups (keep last 30)
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
    console.log(`[backup] Database backed up to ${backupPath} (${backups.length + 1} total)`);
  } catch (err) {
    console.error('[backup] Failed:', err.message);
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
  setTimeout(backupDatabase, 30 * 1000);          // first backup shortly after boot
  setInterval(backupDatabase, interval);
  console.log(`[backup] Automated backups every ${interval / 1000}s → ${DB_BACKUP_DIR}`);
}
