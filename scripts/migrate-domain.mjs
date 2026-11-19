#!/usr/bin/env node
// migrate-domain.mjs — one-command domain switch for a VELTRUVIA VM.
//
// Does, in order:
//   1. Cloudflare: A record for the new hostname -> this server's public IP
//   2. SES: create/confirm the domain identity, read its DKIM tokens,
//      publish the three DKIM CNAMEs, set the MAIL FROM subdomain and
//      publish its MX + SPF records
//   3. Cloudflare: DMARC record (and optional apex SPF)
//   4. Caddy: add a site block for the hostname, validate, reload
//   5. .env: SMTP_FROM, PUBLIC_BASE_URL, VELTRUVIA_DOMAIN
//   6. Wait for SES to report the identity verified
//
// Runs ON the VM (Caddy and .env live there). Needs root only for the
// Caddyfile write/reload; everything else is HTTPS API calls.
//
//   sudo node scripts/migrate-domain.mjs veltruvia.com
//   sudo node scripts/migrate-domain.mjs emr.veltruvia.com --zone veltruvia.com
//
//   --dry-run   print every planned change, make none of them
//
// Required env:
//   CLOUDFLARE_API_TOKEN   Zone:Read + DNS:Edit on the zone
//   AWS_ACCESS_KEY_ID      IAM user with ses:CreateEmailIdentity,
//   AWS_SECRET_ACCESS_KEY  ses:GetEmailIdentity, ses:PutEmailIdentityMailFromAttributes
// Optional env:
//   AWS_SESSION_TOKEN, SES_REGION (default AWS_REGION or ap-south-1)
//
// Idempotent: records are upserted, an existing SES identity is reused, an
// existing Caddy block for the same host is replaced, .env keys are updated
// in place with a timestamped backup. Safe to re-run after a failure.

import { parseArgs } from 'node:util';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// ── args ─────────────────────────────────────────────────────────────
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    zone:           { type: 'string' },
    ip:             { type: 'string' },
    'mail-from':    { type: 'string' },
    region:         { type: 'string' },
    caddyfile:      { type: 'string', default: '/etc/caddy/Caddyfile' },
    'env-file':     { type: 'string' },
    'app-dir':      { type: 'string', default: process.env.APP_DIR || '/home/ubuntu/veltruvia/app' },
    'from-address': { type: 'string' },
    'dmarc-policy': { type: 'string', default: 'quarantine' },
    'root-spf':     { type: 'boolean', default: false },
    proxied:        { type: 'boolean', default: false },
    'skip-caddy':   { type: 'boolean', default: false },
    'skip-cloudflare': { type: 'boolean', default: false },
    'skip-ses':     { type: 'boolean', default: false },
    'skip-env':     { type: 'boolean', default: false },
    'restart-service': { type: 'boolean', default: false },
    'dry-run':      { type: 'boolean', default: false },
    help:           { type: 'boolean', short: 'h', default: false },
  },
});

const HOSTNAME = positionals[0];
const DRY = opt['dry-run'];

function die(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}
function log(msg) { console.log(`  · ${msg}`); }
function done(msg) { console.log(`  ✓ ${msg}`); }
function section(msg) { console.log(`\n── ${msg}`); }

if (opt.help || !HOSTNAME) {
  console.log(`
Usage: migrate-domain.mjs <hostname> [options]

  --zone <apex>          Cloudflare zone (auto-detected from the hostname)
  --ip <address>         A-record target (default: this host's public IPv4)
  --mail-from <sub>      MAIL FROM subdomain (default: mail.<zone>)
  --region <r>           SES region (default: SES_REGION / AWS_REGION / ap-south-1)
  --from-address <addr>  envelope From (default: no-reply@<zone>)
  --caddyfile <path>     default /etc/caddy/Caddyfile
  --env-file <path>      default <app-dir>/.env
  --dmarc-policy <p>     none|quarantine|reject (default quarantine)
  --root-spf             also publish an apex SPF record for the zone
  --proxied              create the A record proxied through Cloudflare
  --skip-cloudflare --skip-caddy --skip-ses --skip-env --restart-service
  --dry-run              print the plan, change nothing

Env: CLOUDFLARE_API_TOKEN, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
     AWS_SESSION_TOKEN (optional), SES_REGION (optional)
`);
  process.exit(opt.help ? 0 : 1);
}

const HOST = String(HOSTNAME).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(HOST)) {
  die(`"${HOSTNAME}" is not a valid hostname (no scheme, no path, at least one dot)`);
}

const REGION = opt.region || process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1';
const ENV_FILE = opt['env-file'] || `${opt['app-dir']}/.env`;
const DMARC_POLICY = opt['dmarc-policy'];
if (!['none', 'quarantine', 'reject'].includes(DMARC_POLICY)) die('--dmarc-policy must be none, quarantine or reject');

// ── tiny helpers ─────────────────────────────────────────────────────
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data, 'utf8').digest();

function httpJson(url, { method = 'GET', headers = {}, body } = {}) {
  return fetch(url, { method, headers, body }).then(async (r) => {
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
    if (!r.ok) {
      const detail = json ? JSON.stringify(json) : text.slice(0, 400);
      throw new Error(`${method} ${url} -> HTTP ${r.status}: ${detail}`);
    }
    return json;
  });
}

// ── Cloudflare ───────────────────────────────────────────────────────
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function cf(pathname, { method = 'GET', body } = {}) {
  if (!CF_TOKEN) die('CLOUDFLARE_API_TOKEN is not set');
  const json = await httpJson(`https://api.cloudflare.com/client/v4${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (json && json.success === false) {
    throw new Error(`Cloudflare ${method} ${pathname} failed: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

async function detectZone() {
  if (opt.zone) return opt.zone.toLowerCase();
  // Try the full hostname, then each parent, until Cloudflare knows the zone.
  const labels = HOST.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.');
    const res = await cf(`/zones?name=${enc(candidate)}&status=active`);
    if (res.result && res.result.length === 1) return res.result[0].name;
  }
  die(`Cloudflare has no active zone for ${HOST} or its parents. Pass --zone explicitly.`);
}

async function upsertDns(zoneId, { type, name, content, priority, ttl = 300, proxied = false }) {
  const fqdn = name.endsWith('.') ? name.slice(0, -1) : name;
  const list = await cf(`/zones/${zoneId}/dns_records?type=${type}&name=${enc(fqdn)}`);
  const existing = (list.result || [])[0];
  const payload = { type, name: fqdn, content, ttl, proxied: type === 'A' || type === 'CNAME' ? proxied : false };
  if (priority !== undefined) payload.priority = priority;

  const label = `${type} ${fqdn} -> ${content}${priority !== undefined ? ` (prio ${priority})` : ''}`;
  if (DRY) { log(`[dry-run] would ${existing ? 'update' : 'create'} ${label}`); return; }

  if (existing) {
    if (existing.content === content && existing.priority === priority &&
        existing.proxied === payload.proxied) {
      done(`unchanged: ${label}`);
      return;
    }
    await cf(`/zones/${zoneId}/dns_records/${existing.id}`, { method: 'PUT', body: payload });
    done(`updated: ${label}`);
  } else {
    await cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body: payload });
    done(`created: ${label}`);
  }
}

// ── AWS SigV4 (no SDK, no new dependency) ───────────────────────────
const AWS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_SESSION = process.env.AWS_SESSION_TOKEN;

async function awsRequest({ service, method, path, body = '' }) {
  if (!AWS_KEY || !AWS_SECRET) die('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set');
  const host = `${service}.${REGION}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const headers = {
    'content-type': 'application/json',
    host,
    'x-amz-date': amzDate,
  };
  if (AWS_SESSION) headers['x-amz-security-token'] = AWS_SESSION;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((k) => `${k}:${String(headers[k]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalUri = path.split('/').map(enc).join('/') || '/';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  let key = hmac(`AWS4${AWS_SECRET}`, dateStamp);
  key = hmac(key, REGION);
  key = hmac(key, service);
  key = hmac(key, 'aws4_request');
  const signature = createHmac('sha256', key).update(stringToSign, 'utf8').digest('hex');
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${AWS_KEY}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const sendHeaders = { 'content-type': headers['content-type'], 'x-amz-date': amzDate, authorization: headers.authorization };
  if (AWS_SESSION) sendHeaders['x-amz-security-token'] = AWS_SESSION;

  return httpJson(`https://${host}${canonicalUri}`, { method, headers: sendHeaders, body: body || undefined });
}

// ── Caddyfile ────────────────────────────────────────────────────────
function stripSiteBlock(text, host) {
  const lines = text.split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && new RegExp(`^${host.replace(/\./g, '\\.')}\\s*\\{?\\s*$`).test(line.trim())) {
      skipping = true;
      if (line.includes('{')) continue;
      continue;
    }
    if (skipping) {
      if (/^\}/.test(line.trim())) skipping = false;
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

async function writeCaddy() {
  const path = opt.caddyfile;
  const block = `${HOST} {\n    reverse_proxy 127.0.0.1:${process.env.APP_PORT || 3000}\n}`;
  let existing = '';
  try { existing = readFileSync(path, 'utf8'); } catch { existing = ''; }
  const kept = stripSiteBlock(existing, HOST);
  const next = `${block}\n${kept ? '\n' + kept : ''}\n`;

  if (DRY) {
    log(`[dry-run] would write ${path}:\n${next.replace(/^/gm, '      ')}`);
    return;
  }

  if (existsSync(path)) {
    const backup = `${path}.bak-${Date.now()}`;
    copyFileSync(path, backup);
    log(`backed up ${path} -> ${backup}`);
  }
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, next, { mode: 0o644 });
  renameSync(tmp, path);
  done(`wrote ${path}`);

  try {
    execFileSync('caddy', ['validate', '--config', path], { stdio: 'pipe' });
    done('caddy validate passed');
  } catch (e) {
    die(`caddy validate failed — Caddyfile NOT reloaded:\n${e.stderr?.toString() || e.message}`);
  }

  try {
    execFileSync('systemctl', ['reload', 'caddy'], { stdio: 'pipe' });
    done('caddy reloaded');
  } catch {
    try {
      execFileSync('caddy', ['reload', '--config', path], { stdio: 'pipe' });
      done('caddy reloaded (caddy reload)');
    } catch (e) {
      die(`could not reload Caddy: ${e.message}. Run: systemctl reload caddy`);
    }
  }
}

// ── .env ─────────────────────────────────────────────────────────────
function updateEnv(vars) {
  if (!existsSync(ENV_FILE)) die(`.env not found at ${ENV_FILE} (pass --env-file)`);
  const original = readFileSync(ENV_FILE, 'utf8');
  const lines = original.split('\n');
  const seen = new Set();

  const updated = lines.map((line) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    if (!(key in vars)) return line;
    seen.add(key);
    const value = String(vars[key]);
    const quote = /[\s#"'$]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
    return `${key}=${quote}`;
  });

  const missing = Object.entries(vars).filter(([k]) => !seen.has(k));
  if (missing.length) {
    if (updated.length && updated[updated.length - 1] !== '') updated.push('');
    updated.push('# Added by scripts/migrate-domain.mjs');
    for (const [k, v] of missing) {
      const quote = /[\s#"'$]/.test(String(v)) ? `"${String(v).replace(/"/g, '\\"')}"` : String(v);
      updated.push(`${k}=${quote}`);
    }
  }

  const next = updated.join('\n');
  if (DRY) {
    log(`[dry-run] would update ${ENV_FILE}: ${Object.keys(vars).join(', ')}`);
    return;
  }
  const backup = `${ENV_FILE}.pre-domain-${Date.now()}`;
  copyFileSync(ENV_FILE, backup);
  const tmp = `${ENV_FILE}.tmp-${process.pid}`;
  writeFileSync(tmp, next, { mode: 0o600 });
  renameSync(tmp, ENV_FILE);
  done(`updated ${ENV_FILE} (${Object.keys(vars).join(', ')}); backup ${backup}`);
}

// ── SES ──────────────────────────────────────────────────────────────
async function ensureIdentity(domain) {
  try {
    await awsRequest({
      service: 'ses', method: 'POST',
      path: `/v2/email/identities/${domain}`,
      body: '{}',
    });
    done(`SES identity created: ${domain}`);
  } catch (e) {
    if (/AlreadyExists|already exists/i.test(e.message)) log(`SES identity already exists: ${domain}`);
    else throw e;
  }
  const detail = await awsRequest({ service: 'ses', method: 'GET', path: `/v2/email/identities/${domain}` });
  return detail;
}

async function putMailFrom(domain, mailFrom) {
  await awsRequest({
    service: 'ses', method: 'PUT',
    path: `/v2/email/identities/${domain}/mail-from-attributes`,
    body: JSON.stringify({ MailFromDomain: mailFrom, BehaviorOnMxFailure: 'USE_DEFAULT_VALUE' }),
  });
  done(`SES MAIL FROM set to ${mailFrom}`);
}

async function waitVerified(domain, timeoutMs = 15 * 60 * 1000) {
  if (DRY) return true;
  const started = Date.now();
  for (;;) {
    const d = await awsRequest({ service: 'ses', method: 'GET', path: `/v2/email/identities/${domain}` });
    if (d.VerifiedForSendingStatus) { done(`SES identity verified: ${domain}`); return true; }
    if (Date.now() - started > timeoutMs) {
      log(`SES still unverified after ${Math.round(timeoutMs / 60000)} min — DNS may need time. Re-run later.`);
      return false;
    }
    const dkim = d.DkimAttributes?.Status || 'PENDING';
    log(`SES: ${dkim.toLowerCase()} — waiting 15s (${Math.round((Date.now() - started) / 1000)}s)`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nVELTRUVIA domain migration -> ${HOST}${DRY ? '  [DRY RUN]' : ''}`);
  console.log(`  region: ${REGION}   caddyfile: ${opt.caddyfile}   env: ${ENV_FILE}`);

  section('1/6 Cloudflare zone + A record');
  let zone = null, zoneId = null, ip = opt.ip;
  if (!opt['skip-cloudflare']) {
    zone = await detectZone();
    const zones = await cf(`/zones?name=${enc(zone)}&status=active`);
    zoneId = zones.result?.[0]?.id;
    if (!zoneId) die(`could not resolve zone id for ${zone}`);
    done(`zone ${zone} (${zoneId})`);

    if (!ip) {
      try {
        const r = await httpJson('https://api.ipify.org?format=json');
        ip = r.ip;
      } catch {
        die('could not detect the public IP; pass --ip');
      }
    }
    log(`server public IP: ${ip}`);

    const apex = HOST === zone;
    await upsertDns(zoneId, {
      type: 'A', name: HOST, content: ip, proxied: opt.proxied,
      // Cloudflare wants the literal @ for the apex
      ...(apex ? { name: zone } : {}),
    });
  } else {
    log('skipped Cloudflare records');
  }

  section('2/6 SES domain identity + DKIM');
  let dkimTokens = [];
  if (!opt['skip-ses']) {
    const meta = await ensureIdentity(zone);
    dkimTokens = meta.DkimAttributes?.Tokens || [];
    if (!dkimTokens.length) die('SES returned no DKIM tokens — check IAM permissions');
    done(`${dkimTokens.length} DKIM token(s) received`);
  } else {
    log('skipped SES identity/DKIM');
  }

  section('3/6 DNS records for mail');
  if (!opt['skip-cloudflare'] && !opt['skip-ses']) {
    for (const token of dkimTokens) {
      await upsertDns(zoneId, {
        type: 'CNAME',
        name: `${token}._domainkey.${zone}`,
        content: `${token}.dkim.amazonses.com`,
      });
    }

    const mailFrom = (opt['mail-from'] || `mail.${zone}`).toLowerCase();
    await upsertDns(zoneId, {
      type: 'MX', name: mailFrom,
      content: `feedback-smtp.${REGION}.amazonses.com`, priority: 10,
    });
    await upsertDns(zoneId, {
      type: 'TXT', name: mailFrom,
      content: 'v=spf1 include:amazonses.com ~all',
    });

    const dmarc = `v=DMARC1; p=${DMARC_POLICY}; rua=mailto:dmarc@${zone}; ruf=mailto:dmarc@${zone}; fo=1; adkim=r; aspf=r; pct=100`;
    await upsertDns(zoneId, { type: 'TXT', name: `_dmarc.${zone}`, content: dmarc });

    if (opt['root-spf']) {
      await upsertDns(zoneId, { type: 'TXT', name: zone, content: 'v=spf1 include:amazonses.com ~all' });
    }
  } else {
    log('skipped mail DNS records');
  }

  section('4/6 Caddy');
  if (!opt['skip-caddy']) await writeCaddy();
  else log('skipped Caddy');

  section('5/6 .env');
  const baseUrl = `https://${HOST}`;
  const fromAddr = opt['from-address'] || `no-reply@${zone}`;
  if (!opt['skip-env']) {
    updateEnv({
      SMTP_FROM: `VELTRUVIA <${fromAddr}>`,
      PUBLIC_BASE_URL: baseUrl,
      VELTRUVIA_DOMAIN: HOST,
    });
  } else {
    log('skipped .env');
  }

  section('6/6 SES verification');
  if (!opt['skip-ses']) {
    if (dkimTokens.length) await waitVerified(zone);
  } else {
    log('skipped');
  }

  if (opt['restart-service'] && !DRY) {
    section('restarting veltruvia');
    try {
      execFileSync('systemctl', ['restart', 'veltruvia'], { stdio: 'inherit' });
      done('service restarted');
    } catch (e) {
      log(`service restart failed: ${e.message}`);
    }
  }

  console.log(`\nDone. Canonical URL: ${baseUrl}`);
  console.log(`
Next steps:
  1. Point the apps at ${baseUrl} (Settings → Server address, or
     server-config.json / VELTRUVIA_SERVER_URL).
  2. If the SES account is in the sandbox, request production access in the
     SES console (both sender and recipient must be verified until then).
  3. Send a test: GET /api/health then a password-reset to your own address,
     and check the message headers show SPF pass, DKIM pass, DMARC pass.
  4. Keep the DuckDNS name live as a rollback address until the new URL has
     been in daily use for a week.
${DRY ? '\nThis was a dry run — nothing was changed.\n' : ''}`);
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}\n`);
  process.exit(1);
});
