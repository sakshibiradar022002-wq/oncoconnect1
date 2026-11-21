#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Canonical-bundle guard
// ═══════════════════════════════════════════════════════════════════
// "VELTRUVIA Server/resources/app" is the only place to edit banner,
// src/, electron/ or public/. The Doctor, Patient and Lab bundles are
// generated mirrors (npm run sync-bundles). Editing a mirror directly
// either diverges silently or is overwritten on the next sync.
//
//   node scripts/guard-canonical.mjs --staged   # pre-commit hook
//   node scripts/guard-canonical.mjs --all      # whole worktree (CI)
//
// Exit 1 lists the offending files and the one-line fix.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SERVER = 'VELTRUVIA Server/resources/app';
const CLIENTS = ['VELTRUVIA Doctor', 'VELTRUVIA Patient', 'VELTRUVIA Lab'];
const TREES = ['src', 'electron', 'public'];
const MODE = process.argv.includes('--all') ? 'all' : 'staged';

// Machine-local binary mirror — never synced, never a drift signal.
const isMirrorLocal = p => p.startsWith('public/downloads/');
const clientRel = path => {
  const m = path.match(/^VELTRUVIA (?:Doctor|Patient|Lab)\/resources\/app\/(src|electron|public)\/(.+)$/);
  if (!m || isMirrorLocal(`${m[1]}/${m[2]}`)) return null;
  return `${m[1]}/${m[2]}`;
};

const violations = [];

function git(args, encoding = 'utf8') {
  const r = spawnSync('git', args, { encoding, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

if (MODE === 'staged') {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  const staged = (out || '').split('\0').filter(Boolean);
  for (const path of staged) {
    const rel = clientRel(path);
    if (!rel) continue;
    const serverBlob = git(['show', `:${SERVER}/${rel}`], 'buffer');
    const clientBlob = git(['show', `:${path}`], 'buffer');
    if (!serverBlob) violations.push({ path, reason: 'no canonical counterpart exists' });
    else if (!clientBlob || !serverBlob.equals(clientBlob)) violations.push({ path, reason: 'differs from canonical copy' });
  }
} else {
  for (const client of CLIENTS) {
    for (const tree of TREES) {
      const base = `${client}/resources/app/${tree}`;
      if (!existsSync(base)) continue;
      const walk = dir => {
        let entries = [];
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const p = `${dir}/${e.name}`;
          const rel = p.slice(`${client}/resources/app/`.length);
          if (isMirrorLocal(rel)) continue;
          if (e.isDirectory()) { walk(p); continue; }
          const canonical = `${SERVER}/${rel}`;
          if (!existsSync(canonical)) { violations.push({ path: p, reason: 'no canonical counterpart exists' }); continue; }
          try {
            if (!readFileSync(p).equals(readFileSync(canonical))) violations.push({ path: p, reason: 'differs from canonical copy' });
          } catch { violations.push({ path: p, reason: 'unreadable' }); }
        }
      };
      walk(base);
    }
  }
}

if (violations.length === 0) {
  console.log(`✅ Canonical bundle guard: ${MODE === 'staged' ? 'staged changes' : 'worktree'} clean`);
  process.exit(0);
}

console.error(`\n❌ Canonical bundle guard: ${violations.length} file(s) edited outside the canonical bundle\n`);
for (const v of violations.slice(0, 40)) console.error(`   ${v.path} — ${v.reason}`);
if (violations.length > 40) console.error(`   … and ${violations.length - 40} more`);
console.error('\nFix: edit "VELTRUVIA Server/resources/app/<src|electron|public>/…" only, then run:');
console.error('   npm run sync-bundles && npm run check\n');
process.exit(1);
