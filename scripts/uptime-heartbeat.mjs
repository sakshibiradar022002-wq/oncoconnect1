#!/usr/bin/env node
/**
 * uptime-heartbeat.mjs — external uptime monitor without a SaaS dependency.
 *
 * Closes O2's "single monitor on one PC" gap with a dead-man's switch: cron on
 * the VM (or any always-on host) calls this every 5 minutes. It checks
 * /health?deep=1 and pings a Healthchecks.io-style check URL. If the VM dies,
 * the pings stop and the external service alerts — so the alert does not depend
 * on the machine it is watching.
 *
 *   # create a free check at https://healthchecks.io and use its ping URL
 *   HEARTBEAT_URL=https://hc-ping.com/<uuid> node scripts/uptime-heartbeat.mjs
 *
 *   node scripts/uptime-heartbeat.mjs --url https://veltruvia.duckdns.org/health?deep=1
 *   node scripts/uptime-heartbeat.mjs --print-cron        # cron line to paste
 *
 * Exit: 0 healthy (and pinged) · 1 unhealthy (pinged /fail) · 2 check skipped.
 */
const arg = (name, fallback = null) => {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);

const TARGET = arg('--url', process.env.UPTIME_URL || 'https://veltruvia.duckdns.org/health?deep=1');
const PING_RAW = (arg('--ping', process.env.HEARTBEAT_URL || '') || '').trim();

// A placeholder URL pings nothing, so it must never read as "monitored".
const PLACEHOLDER = /(<|>|your-real|your-uuid|replace|changeme|xxxx|example\.(com|org|net)|hc-ping\.com\/?$)/i;
const HEALTHCHECKS = /(^|\.)(healthchecks\.io|hc-ping\.com|hchk\.io)$/i;
function pingUrlValid(u) {
  if (!u || PLACEHOLDER.test(u)) return false;
  let parsed;
  try { parsed = new URL(u); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  // Healthchecks UUIDs are 8-4-4-4-12 hex; a wrong one silently 404s.
  if (HEALTHCHECKS.test(parsed.hostname)) {
    const id = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }
  return true;
}
const PING = pingUrlValid(PING_RAW) ? PING_RAW : '';
if (PING_RAW && !PING) {
  console.error(`⚠  HEARTBEAT_URL is not a usable check URL (${PING_RAW}) — ignoring it. No external alert would fire.`);
}
const TIMEOUT = Number(arg('--timeout', 15000));
const MAX_LATENCY = Number(arg('--max-latency', 5000));

if (flag('--print-cron')) {
  console.log('*/5 * * * * cd /home/ubuntu/veltruvia-repo && HEARTBEAT_URL=https://hc-ping.com/<uuid> /usr/bin/node scripts/uptime-heartbeat.mjs >> /var/log/veltruvia-heartbeat.log 2>&1');
  process.exit(0);
}

async function ping(path = '') {
  if (!PING) return null;
  try {
    const res = await fetch(PING.replace(/\/+$/, '') + path, { signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch { return false; /* must not mask the health result */ }
}

const started = Date.now();
let failure = null;
let body = null;
try {
  const res = await fetch(TARGET, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'VELTRUVIA-heartbeat/1.0' } });
  const text = await res.text();
  try { body = JSON.parse(text); } catch { /* non-JSON health is still a signal */ }
  if (res.status !== 200) failure = `HTTP ${res.status}`;
  else if (body && body.ok === false) failure = 'health payload reports ok=false';
  else if (body && /down|error|unhealthy|fail/i.test(String(body.status || ''))) failure = `health status ${body.status}`;
  else if (body && body.db === false) failure = 'database check failed';
} catch (err) {
  failure = err.name === 'TimeoutError' ? `timed out after ${TIMEOUT}ms` : err.message;
}

const latency = Date.now() - started;
if (!failure && latency > MAX_LATENCY) failure = `slow response (${latency}ms > ${MAX_LATENCY}ms)`;

if (failure) {
  const reported = await ping('/fail');
  console.error(`❌ ${TARGET} — ${failure}${reported === false ? ' (heartbeat FAILED to send)' : ''}`);
  process.exit(1);
}

const sent = await ping();
const version = body && (body.version || body.build) ? ` version ${body.version || body.build}` : '';
const pingNote = sent === true ? ' · heartbeat sent'
  : sent === false ? ' · heartbeat FAILED'
  : ' · no HEARTBEAT_URL set, check only';
console.log(`✅ ${TARGET} healthy in ${latency}ms${version}${pingNote}`);
process.exit(0);
