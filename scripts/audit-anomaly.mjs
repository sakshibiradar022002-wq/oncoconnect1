#!/usr/bin/env node
/**
 * audit-anomaly.mjs — read-only anomaly scan over the audit_log table.
 *
 * Closes S6 ("no automated anomaly alerting on the audit stream"). It opens the
 * database read-only and reports behaviour that usually means a compromised or
 * misused account. Nothing is written to the database; the only output is the
 * report file (gitignored) and the exit code, so cron can alert on it.
 *
 *   node scripts/audit-anomaly.mjs
 *   node scripts/audit-anomaly.mjs --window 6 --json reports/anomaly/latest.json
 *   node scripts/audit-anomaly.mjs --db /home/ubuntu/veltruvia/app/chemocure.db
 *   node scripts/audit-anomaly.mjs --ignore-ip 208.72.218.131   # test/pentest source
 *   node scripts/audit-anomaly.mjs --strict                     # warnings also exit 2
 *   node scripts/audit-anomaly.mjs --print-cron                 # print the crontab line
 *
 * Exit: 0 quiet · 1 critical · 2 warnings, only when --strict is passed. A
 * cron entry must pass --strict, otherwise a warning-only scan (bulk reads,
 * off-hours writes, audit silence) exits 0 and never alerts.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const APP_DIR = process.env.APP_DIR || '/home/ubuntu/veltruvia/app';
const arg = (name, fallback = null) => {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);

const DB_PATH = resolve(arg('--db', process.env.DB_PATH || join(APP_DIR, 'chemocure.db')));
const WINDOW_HOURS = Number(arg('--window', 24));
const JSON_OUT = arg('--json', 'reports/anomaly/latest.json');
const OFFSITE_HOURS = Number(arg('--off-hours', 8));   // UTC 22:00–06:00

// Scanner/test IPs whose failed logins are expected. Without this every
// pentest run would page the operator.
const IGNORE_IPS = new Set(
  [arg('--ignore-ip'), process.env.ANOMALY_IGNORE_IPS]
    .filter(Boolean).join(',').split(',').map(s => s.trim()).filter(Boolean)
);

const FAIL_BURST = Number(arg('--fail-burst', 10));
const TARGET_BULK = Number(arg('--bulk-targets', 100));
const STALE_HOURS = Number(arg('--stale-hours', 6));

// Printed from the repo root so the path cron needs is absolute. The scanner
// allowlist only appears when the environment already carries one — it is
// site-specific, and a placeholder in a live crontab would mute nothing while
// looking like it does. --stale-hours 24 because a clinic is closed overnight
// and the 6h default would fire every night on an idle-but-healthy service.
if (flag('--print-cron')) {
  const ignore = process.env.ANOMALY_IGNORE_IPS ? `ANOMALY_IGNORE_IPS=${process.env.ANOMALY_IGNORE_IPS} ` : '';
  console.log(`*/15 * * * * cd ${process.cwd()} && ${ignore}${process.execPath} scripts/audit-anomaly.mjs --db ${DB_PATH} --strict --stale-hours 24 >> /home/ubuntu/veltruvia-anomaly.log 2>&1`);
  process.exit(0);
}

if (!existsSync(DB_PATH)) {
  console.error(`[anomaly] database not found: ${DB_PATH} (pass --db/DB_PATH, or set APP_DIR)`);
  process.exit(1);
}

async function open(path) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(path, { readOnly: true });
  } catch { /* older Node — use the app's driver */ }
  const { createRequire } = await import('node:module');
  const req = createRequire(join(APP_DIR, 'package.json'));
  return new (req('better-sqlite3'))(path, { readonly: true });
}

const db = await open(DB_PATH);
const since = new Date(Date.now() - WINDOW_HOURS * 3600e3).toISOString();
const rows = db.prepare(
  'SELECT actor_id, actor_role, action, target_id, ip, created_at FROM audit_log'
).all();

const when = row => {
  const t = Date.parse(row.created_at);
  return Number.isNaN(t) ? 0 : t;
};
// created_at is ISO-8601 in src/db/index.js; fall back to a lexical compare.
const inWindow = row => {
  const t = when(row);
  return t ? t >= Date.parse(since) : String(row.created_at) >= since;
};
const recent = rows.filter(inWindow).sort((a, b) => when(a) - when(b));
const ignored = IGNORE_IPS.size ? recent.filter(r => r.ip && IGNORE_IPS.has(r.ip)) : [];
// Only the IP-based rules honour the allowlist; actor rules still run so a
// real account used from a test IP is never hidden.
const forIpRules = recent.filter(r => !(r.ip && IGNORE_IPS.has(r.ip)));

const findings = [];
const finding = (id, severity, title, detail, evidence = []) =>
  findings.push({ id, severity, title, detail, evidence });

const isFail = r => /fail/i.test(r.action) && /login|auth/i.test(r.action);
const isSuccess = r => /login|auth/i.test(r.action) && /(ok|success|granted|complete)/i.test(r.action);
const isPrivilegedWrite = r =>
  /(user|team|role|admin|consent|breach)/i.test(r.action) && /(create|update|delete|revoke|grant|change|approve|deactivate|role)/i.test(r.action);
const isRead = r => /(view|read|list|get|export|fetch|pull)/i.test(r.action);
const hourUtc = r => new Date(when(r)).getUTCHours();
const isOffHours = r => { const hh = hourUtc(r); return hh >= 22 || hh < 6; };
const summarize = list => list.slice(0, 5).map(r => `${r.created_at} ${r.action}${r.ip ? ' from ' + r.ip : ''}`);

// 1. Failed-login bursts, grouped by IP then actor.
for (const [keyType, key] of [['ip', r => r.ip], ['actor', r => r.actor_id]]) {
  const groups = new Map();
  for (const r of forIpRules.filter(isFail)) {
    if (!key(r)) continue;
    const list = groups.get(key(r)) || [];
    list.push(r);
    groups.set(key(r), list);
  }
  for (const [value, list] of groups) {
    if (list.length >= FAIL_BURST) {
      finding('fail-burst', list.length >= FAIL_BURST * 3 ? 'critical' : 'warn',
        `${list.length} failed logins for ${keyType} ${value} in ${WINDOW_HOURS}h`,
        'Credential stuffing or a stale device retrying a saved password.',
        summarize(list));
    }
  }
}

// 2. Successful login from an IP that had failures — likely guessing worked.
const failsByIp = new Map();
for (const r of forIpRules.filter(isFail)) {
  if (r.ip) failsByIp.set(r.ip, (failsByIp.get(r.ip) || 0) + 1);
}
for (const r of forIpRules.filter(isSuccess)) {
  const fails = failsByIp.get(r.ip) || 0;
  if (fails >= Math.max(5, Math.floor(FAIL_BURST / 2))) {
    finding('success-after-fails', 'critical',
      `login succeeded from ${r.ip} after ${fails} failures`,
      'Possible successful password guess — confirm with the account owner and rotate credentials.',
      [`${r.created_at} ${r.action} actor=${r.actor_id || '?'}`]);
  }
}

// 3. Bulk record access by one actor (exfiltration / IDOR probing).
const targets = new Map();
for (const r of recent.filter(isRead)) {
  if (!r.actor_id || !r.target_id) continue;
  const set = targets.get(r.actor_id) || new Set();
  set.add(r.target_id);
  targets.set(r.actor_id, set);
}
for (const [actor, set] of targets) {
  if (set.size >= TARGET_BULK) {
    finding('bulk-access', set.size >= TARGET_BULK * 5 ? 'critical' : 'warn',
      `${actor} touched ${set.size} distinct records in ${WINDOW_HOURS}h`,
      'Confirm the bulk read was a legitimate export/report.',
      [`${set.size} target ids`]);
  }
}

// 4. Privileged writes outside working hours.
const offHours = recent.filter(r => isPrivilegedWrite(r) && isOffHours(r));
if (offHours.length) {
  finding('off-hours', 'warn',
    `${offHours.length} privileged change(s) outside 06:00–22:00 UTC`,
    'Off-hours admin activity — confirm the operator and change ticket.',
    summarize(offHours));
}

// 5. Sensitive operations that should always be visible in the report.
const sensitive = recent.filter(r =>
  /(password|secret|key|totp|2fa|mfa|revoke|deactivate|delete|export|wipe|breach)/i.test(r.action));
if (sensitive.length) {
  finding('sensitive-ops', 'info',
    `${sensitive.length} sensitive operation(s) in ${WINDOW_HOURS}h`,
    'Review that each one was authorised.',
    summarize(sensitive));
}

// 6. Logging may have stopped: no rows at all in the window.
const newest = rows.reduce((max, r) => Math.max(max, when(r)), 0);
const ageHours = newest ? (Date.now() - newest) / 3600e3 : Infinity;
if (!recent.length) {
  finding('audit-silence', 'warn',
    `no audit rows in the last ${WINDOW_HOURS}h`,
    'Either the clinic is idle or audit logging is broken — check the app and the DB path.',
    [`newest row: ${newest ? new Date(newest).toISOString() : 'none'}`]);
} else if (ageHours > STALE_HOURS) {
  finding('audit-stale', 'warn',
    `newest audit row is ${ageHours.toFixed(1)}h old`,
    `Expected traffic within ${STALE_HOURS}h; verify the service is recording.`,
    [`newest row: ${new Date(newest).toISOString()}`]);
}

db.close();

// ── Report ─────────────────────────────────────────────────────────
const order = { critical: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
const icon = { critical: '❌', warn: '⚠️ ', info: 'ℹ️ ' };

console.log(`[anomaly] ${DB_PATH} · window ${WINDOW_HOURS}h · ${recent.length}/${rows.length} rows`);
if (ignored.length) console.log(`[anomaly] ignored ${ignored.length} row(s) from ${[...IGNORE_IPS].join(', ')}`);
if (!findings.length) console.log('[anomaly] no anomalies found');
for (const f of findings) {
  console.log(`${icon[f.severity]} ${f.title}`);
  console.log(`   ${f.detail}`);
  for (const line of f.evidence) console.log(`   · ${line}`);
}

const report = {
  at: new Date().toISOString(),
  database: DB_PATH,
  windowHours: WINDOW_HOURS,
  rowsTotal: rows.length,
  rowsInWindow: recent.length,
  ignoredIps: [...IGNORE_IPS],
  rowsIgnored: ignored.length,
  counts: {
    critical: findings.filter(f => f.severity === 'critical').length,
    warn: findings.filter(f => f.severity === 'warn').length,
    info: findings.filter(f => f.severity === 'info').length,
  },
  findings,
};
try {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`[anomaly] report → ${JSON_OUT}`);
} catch (err) { console.log(`[anomaly] could not write ${JSON_OUT}: ${err.message}`); }

if (report.counts.critical) process.exit(1);
if (report.counts.warn && flag('--strict')) process.exit(2);
process.exit(0);
