#!/usr/bin/env node
/**
 * rotate-secrets.mjs — replace exposed credentials in the live .env.
 *
 *   node scripts/rotate-secrets.mjs                 # show what would change
 *   node scripts/rotate-secrets.mjs --yes           # rotate JWT_SECRET, drop dead SES/AWS keys
 *   node scripts/rotate-secrets.mjs --yes --turn    # also rotate TURN_SECRET (update coturn too!)
 *   node scripts/rotate-secrets.mjs --yes --anchor  # also replace ANCHOR_PRIVATE_KEY with a fresh wallet
 *
 * Never prints a secret value. Always writes a 0600 backup of the old .env next
 * to it. PHI_ENCRYPTION_KEY is refused by design: src/crypto.js has no key
 * versioning, so rotating it would make existing PHI unreadable.
 *
 * Restart afterwards:  sudo systemctl restart veltruvia
 */
import { readFileSync, writeFileSync, copyFileSync, statSync, chmodSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const APP_DIR = process.env.APP_DIR || '/home/ubuntu/veltruvia/app';

function arg(name, fallback = null) {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ENV_PATH = resolve(arg('--env', join(APP_DIR, '.env')));
const CONFIRMED = process.argv.includes('--yes');
const DO_TURN = process.argv.includes('--turn');
const DO_ANCHOR = process.argv.includes('--anchor');

if (!existsSync(ENV_PATH)) {
  console.error(`[rotate] no .env at ${ENV_PATH} (pass --env <path>)`);
  process.exit(1);
}

const original = readFileSync(ENV_PATH, 'utf8');
const lines = original.split('\n');
const find = key => lines.findIndex(l => l.startsWith(key + '='));

const changes = [];
const dead = [];

// Dead credentials: SES SMTP login and the AWS key pair that backed it. Email
// now goes through Gmail (src/mail.js), so these only add exposure.
for (const key of ['SES_SMTP_USER', 'SES_SMTP_PASSWORD', 'SES_SMTP_HOST', 'SES_SMTP_PORT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
  const i = find(key);
  if (i > -1) dead.push(i);
}

const newJwt = randomBytes(32).toString('hex');
const jwtIdx = find('JWT_SECRET');
const newTurn = DO_TURN ? randomBytes(32).toString('hex') : null;
const turnIdx = find('TURN_SECRET');
const newAnchor = DO_ANCHOR ? '0x' + randomBytes(32).toString('hex') : null;
const anchorIdx = find('ANCHOR_PRIVATE_KEY');

changes.push(['JWT_SECRET', jwtIdx > -1 ? 'replaced' : 'added', '64 hex chars']);
if (DO_TURN) changes.push(['TURN_SECRET', turnIdx > -1 ? 'replaced' : 'added', '64 hex chars — update coturn static-auth-secret to match']);
if (DO_ANCHOR) changes.push(['ANCHOR_PRIVATE_KEY', anchorIdx > -1 ? 'replaced' : 'added', 'fresh secp256k1 key, no funds']);
for (const i of dead) changes.push([lines[i].split('=')[0], 'removed', 'credential no longer used']);

console.log(`[rotate] ${ENV_PATH}`);
for (const [key, action, note] of changes) console.log(`  ${key.padEnd(20)} ${action.padEnd(9)} ${note}`);
const phiIdx = find('PHI_ENCRYPTION_KEY');
console.log(`  ${'PHI_ENCRYPTION_KEY'.padEnd(20)} kept      ${phiIdx > -1 ? 'cannot rotate without key versioning' : 'not present — check the app is reading one'}`);

if (!CONFIRMED) {
  console.log('\n[rotate] dry run — nothing changed. Re-run with --yes to rotate.');
  process.exit(0);
}

const mode = statSync(ENV_PATH).mode & 0o777;
const backupPath = `${ENV_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
copyFileSync(ENV_PATH, backupPath);
chmodSync(backupPath, 0o600);

const set = (key, value) => {
  const i = find(key);
  if (i > -1) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
};

set('JWT_SECRET', newJwt);
if (newTurn) set('TURN_SECRET', newTurn);
if (newAnchor) set('ANCHOR_PRIVATE_KEY', newAnchor);
for (const i of dead.sort((a, b) => b - a)) lines.splice(i, 1);

const body = lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
writeFileSync(ENV_PATH, body, { mode: 0o600 });
chmodSync(ENV_PATH, 0o600);

console.log(`[rotate] backup: ${backupPath}`);
console.log(`[rotate] .env rewritten (mode ${mode === 0o600 ? 'was 600' : `was ${mode.toString(8)}, now 600`})`);
console.log('\n[rotate] restart to apply: sudo systemctl restart veltruvia');
console.log('[rotate] every existing session is signed out (JWT_SECRET changed).');
if (DO_TURN) console.log('[rotate] coturn: update its static-auth-secret to the new TURN_SECRET, then restart coturn.');
