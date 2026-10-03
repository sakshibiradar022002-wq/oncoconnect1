// ═══════════════════════════════════════════════════════════════════
// Encrypted JSON file stores — ONE implementation for all of them.
//
// The shared stores (patient-store, logs-store, messages-store,
// appointments-store, availability-store, telehealth-rooms/signals) held
// PHI as PLAINTEXT JSON on disk while the SQL side was AES-256-GCM
// encrypted. This helper gives every store the same AES-256-GCM
// protection (PHI master key, authenticated encryption, single envelope).
//
//   • read()  → parsed object ({} when absent/corrupt) — transparently
//     migrates the legacy plaintext file on first read.
//   • write() → atomic temp-file + rename, whole file encrypted.
//     Integrity is guaranteed by GCM; a tampered/garbled file is treated
//     as empty (logged loudly) rather than crashing the server.
//
// Encrypted files are <name>.enc.json; the legacy plaintext files
// (patient-store.json, telehealth-rooms.json, …) are only read during
// migration and never written again.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encryptPHI, decryptPHI } from '../crypto.js';

const DATA_DIR = dirname(process.env.DB_PATH || './chemocure.db');
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

export function encryptedStorePath(name) {
  return join(DATA_DIR, name.endsWith('.enc.json') ? name : name.replace(/\.json$/, '') + '.enc.json');
}

function legacyPath(name) {
  // Historic filenames: patient-store.json / telehealth-rooms.json / …
  return join(DATA_DIR, name.endsWith('.json') ? name : name + '.json');
}

export function createEncryptedStore(name, { label = name } = {}) {
  const encPath = encryptedStorePath(name);
  const oldPath = legacyPath(name);
  try { mkdirSync(dirname(encPath), { recursive: true }); } catch {}

  function readLegacyIfAny() {
    try {
      if (!existsSync(oldPath)) return null;
      return JSON.parse(readFileSync(oldPath, 'utf-8'));
    } catch { return null; }
  }

  function read() {
    // 1) Encrypted store (the current truth)
    try {
      if (existsSync(encPath)) {
        const blob = readFileSync(encPath, 'utf-8');
        const data = decryptPHI(blob);
        if (data && typeof data === 'object') return data;
        // null = GCM auth failure (tampered/wrong key) — treat as empty,
        // never crash the whole server over one store file.
        console.error(`[${label}] encrypted store failed integrity check — starting empty (a backup may exist below)`);
      }
    } catch (e) {
      console.error(`[${label}] encrypted store unreadable:`, e.message);
    }
    // 2) One-time migration from the legacy plaintext file
    const legacy = readLegacyIfAny();
    if (legacy && typeof legacy === 'object') {
      console.log(`[${label}] migrating legacy plaintext store → encrypted`);
      try { write(legacy); } catch { /* next write() will retry */ }
      return legacy;
    }
    return {};
  }

  function write(data) {
    try {
      const tmp = encPath + '.tmp';
      writeFileSync(tmp, encryptPHI(data), 'utf-8');
      renameSync(tmp, encPath); // atomic on same filesystem
      // Best-effort cleanup of the legacy plaintext file once migrated.
      try { if (existsSync(oldPath)) unlinkSync(oldPath); } catch {}
      return true;
    } catch (e) {
      console.error(`[${label}] write failed:`, e.message);
      return false;
    }
  }

  return { read, write, path: encPath };
}
