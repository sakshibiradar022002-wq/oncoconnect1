#!/usr/bin/env node
// Installs the tracked git hooks (.githooks/) with one command:
//   npm run hooks:install
// Hooks are per-clone config, so every checkout runs this once.

import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = args => spawnSync('git', args, { encoding: 'utf8' });

const inside = run(['rev-parse', '--is-inside-work-tree']);
if (inside.status !== 0) {
  console.error('❌ Not a git worktree — run this from the repo root.');
  process.exit(1);
}

const config = run(['config', 'core.hooksPath', '.githooks']);
if (config.status !== 0) {
  console.error('❌ Could not set core.hooksPath:', (config.stderr || '').trim());
  process.exit(1);
}

if (existsSync('.githooks')) {
  for (const hook of readdirSync('.githooks')) {
    try { chmodSync(`.githooks/${hook}`, 0o755); } catch { /* Windows: mode is advisory */ }
  }
}

console.log('✅ Git hooks installed: core.hooksPath → .githooks');
console.log('   pre-commit → canonical bundle guard (node scripts/guard-canonical.mjs --staged)');
