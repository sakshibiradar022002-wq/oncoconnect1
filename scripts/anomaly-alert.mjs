#!/usr/bin/env node
/**
 * anomaly-alert.mjs — run the audit scan and report its verdict to a
 * dead-man's switch, so a finding is announced instead of only logged.
 *
 * audit-anomaly.mjs signals through its exit code, and a cron line whose only
 * other output is a redirect to a file never tells anybody. This wrapper runs
 * the same scan unchanged and then pings a Healthchecks.io-style check URL: a
 * clean scan pings the check, a non-zero scan pings /fail. If the host stops
 * running the scan at all the pings stop, so a dead VM is caught by the same
 * mechanism — which a local log file can never do.
 *
 *   # create a free check at https://healthchecks.io (period 15 minutes,
 *   # grace 30 — see "Announcing the result" in PENTEST-SCOPE.md §6)
 *   ANOMALY_CHECK_URL=https://hc-ping.com/<uuid> \
 *     node scripts/anomaly-alert.mjs --strict --stale-hours 24
 *
 *   node scripts/anomaly-alert.mjs --print-cron     # crontab line to paste
 *
 * Exit: the scan's own code (0 quiet · 1 critical · 2 warnings with --strict),
 * so the wrapper is transparent to anything already reading it. A ping that
 * cannot be sent is reported on stderr and never rewrites that verdict — the
 * missing pings are themselves the alert.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = process.env.APP_DIR || '/home/ubuntu/veltruvia/app';
const SCAN = join(dirname(fileURLToPath(import.meta.url)), 'audit-anomaly.mjs');

const arg = (name, fallback = null) => {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);

const DB_PATH = resolve(arg('--db', process.env.DB_PATH || join(APP_DIR, 'chemocure.db')));
const PING_RAW = (arg('--ping', process.env.ANOMALY_CHECK_URL || '') || '').trim();
const TIMEOUT = Number(arg('--timeout', 10000));

// Same rules as uptime-heartbeat.mjs: a placeholder pings nothing, so it must
// never read as "monitored". Healthchecks UUIDs are 8-4-4-4-12 hex and a wrong
// one 404s silently. Loopback http is allowed only so the tests can run against
// a local server; anything else must be https.
const PLACEHOLDER = /(<|>|your-real|your-uuid|replace|changeme|xxxx|example\.(com|org|net)|hc-ping\.com\/?$)/i;
const HEALTHCHECKS = /(^|\.)(healthchecks\.io|hc-ping\.com|hchk\.io)$/i;
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/i;
function pingUrlValid(u) {
  if (!u || PLACEHOLDER.test(u)) return false;
  let parsed;
  try { parsed = new URL(u); } catch { return false; }
  const local = LOOPBACK.test(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return false;
  if (HEALTHCHECKS.test(parsed.hostname)) {
    const id = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }
  return true;
}
const PING = pingUrlValid(PING_RAW) ? PING_RAW : '';

// Everything except the wrapper's own flags is the scan's, untouched.
const scanArgs = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--print-cron') continue;
  if (a === '--ping' || a === '--timeout') { i++; continue; }
  if (a.startsWith('--ping=') || a.startsWith('--timeout=')) continue;
  scanArgs.push(a);
}

if (flag('--print-cron')) {
  console.log(`*/15 * * * * cd ${process.cwd()} && ANOMALY_CHECK_URL=https://hc-ping.com/<uuid> ${process.execPath} scripts/anomaly-alert.mjs --db ${DB_PATH} --strict --stale-hours 24 >> /home/ubuntu/veltruvia-anomaly.log 2>&1`);
  process.exit(0);
}

if (PING_RAW && !PING) {
  console.error(`⚠  ANOMALY_CHECK_URL is not a usable check URL (${PING_RAW}) — ignoring it. No external alert would fire.`);
} else if (!PING) {
  console.error('⚠  no ANOMALY_CHECK_URL set — the scan result reaches only stdout and the exit code.');
}

async function ping(path = '') {
  if (!PING) return null;
  try {
    const res = await fetch(PING.replace(/\/+$/, '') + path, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'user-agent': 'VELTRUVIA-anomaly-alert/1.0' },
    });
    return res.ok;
  } catch { return false; /* must not mask the scan result */ }
}

const scan = spawnSync(process.execPath, [SCAN, ...scanArgs], { stdio: 'inherit' });
// A signal means the scan never reached a verdict; that is a failure, not quiet.
const code = scan.status === null ? 1 : scan.status;

if (code === 0) {
  const sent = await ping();
  if (sent === false) console.error('[anomaly-alert] ❌ clean scan, but the heartbeat ping failed to send');
  else if (sent === true) console.log('[anomaly-alert] ✅ heartbeat sent');
} else {
  const reported = await ping('/fail');
  if (reported === false) console.error('[anomaly-alert] ❌ finding raised, but the /fail ping could not be sent');
  else if (reported === true) console.log('[anomaly-alert] ⚠️  /fail sent — the external check should alert');
  console.error(`[anomaly-alert] exit ${code}${scan.signal ? ` (scan killed by ${scan.signal})` : ''}`);
}

process.exit(code);
