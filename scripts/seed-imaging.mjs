#!/usr/bin/env node
/**
 * seed-imaging.mjs — fill the imaging gallery with real studies, from your own
 * folder or from a public, openly-licensed source.
 *
 * The imaging API (upload/gallery/share/DICOM) had no bulk path: adding 10
 * studies meant 10 clicks. This script drives the same authenticated endpoints
 * the UI uses, so every image goes through the normal validation, PHI
 * encryption, SHA-256 recording and audit trail — nothing is written to the
 * database behind the app's back.
 *
 *   # curated, openly-licensed demo studies straight from Wikimedia Commons
 *   VELTRUVIA_EMAIL=you@clinic.org VELTRUVIA_PASSWORD='…' \
 *     node scripts/seed-imaging.mjs --mrn VEL-2026-0001 --demo 24
 *
 *   # a big local dataset (NIH ChestX-ray14, TCIA, Kaggle export, a USB drive…)
 *   node scripts/seed-imaging.mjs --mrn VEL-2026-0001 --dir ~/datasets/nih/images
 *
 *   # spread a study folder over several patients, 1 200 files max, dry run
 *   node scripts/seed-imaging.mjs --mrn A,B,C --dir ./study --limit 1200 --dry-run
 *
 *   # a trimmed sample of a public dataset, with an attribution manifest
 *   node scripts/seed-imaging.mjs --mrn VEL-2026-0001 --demo 50 \
 *     --manifest reports/imaging-seed-manifest.json
 *
 * Options
 *   --mrn <list>     comma-separated MRNs; images are spread round-robin
 *   --dir <path>     folder of images/DICOM, scanned recursively
 *   --demo [n]       download n openly-licensed studies from Wikimedia Commons
 *   --query <text>   extra Commons search term (repeatable; default = 4 modalities)
 *   --note <text>    note stored with every image (ASCII, 300 chars)
 *   --limit <n>      stop after n imports
 *   --delay <ms>     pause between uploads (default 250; raises on HTTP 429)
 *   --base-url <url> server root (default $VELTRUVIA_URL or https://veltruvia.duckdns.org)
 *   --email <addr>   account email   (or $VELTRUVIA_EMAIL)
 *   --password <pw>  account password(or $VELTRUVIA_PASSWORD)
 *   --creds <file>   file holding "email: …" / "password: …" (or EMAIL=/PASSWORD=)
 *   --totp <code>    current 6-digit code, only if 2FA is enabled
 *   --manifest <f>   write a JSON record of every import (source + licence)
 *   --duplicates     keep files that match the gallery by name+size
 *   --allow-mixed    let --demo add public studies to a chart that already
 *                    holds real patient images (refused by default)
 *   --dry-run        list what would be uploaded; no writes
 *
 * Upload rules come from src/routes/images.js: 10 MB max, PNG/JPEG/GIF/WebP/
 * BMP/DICOM, extension sniffed from the bytes, note capped at 300 chars.
 *
 * Exit: 0 all imported · 1 some failed · 2 nothing to do / bad usage.
 */
import { readdirSync, statSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';

const arg = (name, fallback = null) => {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);
const has = name => process.argv.includes(name) || process.argv.some(a => a.startsWith(name + '='));

const MAX_BYTES = 10 * 1024 * 1024;
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.dcm']);
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.dcm': 'application/dicom',
};
const BASE = String(arg('--base-url', process.env.VELTRUVIA_URL || 'https://veltruvia.duckdns.org')).replace(/\/+$/, '');
const MRNAMES = String(arg('--mrn', '')).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const DIR = arg('--dir');
const DEMO = has('--demo') ? Math.max(1, Number(arg('--demo', 24)) || 24) : 0;
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const DELAY = Math.max(0, Number(arg('--delay', 250)) || 0);
const NOTE = ascii(arg('--note', ''));
const DRY = flag('--dry-run');
const KEEP_DUPES = flag('--duplicates');
const MANIFEST = arg('--manifest');
const QUERIES = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--query' && process.argv[i + 1]) QUERIES.push(process.argv[i + 1]);
}

if (flag('--help') || flag('-h')) {
  const self = readFileSync(new URL(import.meta.url), 'utf8');
  console.log(self.slice(self.indexOf('/**') + 3, self.indexOf('*/')).replace(/^ \* ?/gm, ''));
  process.exit(0);
}

function ascii(s) {
  return String(s || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}
const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = buf => createHash('sha256').update(buf).digest('hex');

function die(msg) {
  console.error('\n  ✗ ' + msg + '\n');
  process.exit(2);
}

// ── credentials ─────────────────────────────────────────────────
function credentials() {
  let email = arg('--email', process.env.VELTRUVIA_EMAIL);
  let password = arg('--password', process.env.VELTRUVIA_PASSWORD);
  const file = arg('--creds');
  if ((!email || !password) && file) {
    if (!existsSync(file)) die(`credentials file not found: ${file}`);
    const text = readFileSync(file, 'utf8');
    try {
      const j = JSON.parse(text);
      email = email || j.email || j.EMAIL;
      password = password || j.password || j.PASSWORD;
    } catch {
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?["']?(email|username|user)["']?\s*[:=]\s*["']?([^"'\s]+)/i);
        const p = line.match(/^\s*(?:export\s+)?["']?password["']?\s*[:=]\s*["']?(.+?)["']?\s*$/i);
        if (m && !email) email = m[2];
        if (p && !password) password = p[1];
      }
    }
  }
  if (!email || !password) {
    die('no credentials: set VELTRUVIA_EMAIL / VELTRUVIA_PASSWORD or pass --creds <file>.\n'
      + '    (Use a doctor or admin account that can already see the MRN you are importing.)');
  }
  return { email: String(email).trim(), password: String(password) };
}

// ── HTTP (cookie session, manual because Node fetch keeps no jar) ──
let cookie = '';

async function request(path, { method = 'GET', headers = {}, body, tries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...headers },
        body,
        redirect: 'manual',
      });
      if (res.status === 429 || res.status >= 502) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        await sleep(Math.max(DELAY, retryAfter * 1000, attempt * 1000));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(attempt * 800);
    }
  }
  throw lastErr;
}

async function login() {
  const { email, password } = credentials();
  const totp = arg('--totp', process.env.VELTRUVIA_TOTP);
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(totp ? { totpCode: String(totp) } : {}) }),
    tries: 1,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    die(`login failed (HTTP ${res.status}): ${data.error || 'no message'}`
      + (data.totpRequired ? '\n    This account uses 2FA — pass --totp <current code>.' : ''));
  }
  cookie = (res.headers.getSetCookie?.() || [res.headers.get('set-cookie') || ''])
    .map(c => String(c || '').split(';')[0]).filter(Boolean)[0] || '';
  if (!cookie) die('login succeeded but no session cookie was returned');
  return data.user?.role || 'unknown';
}

// ── gallery (duplicate detection + demo/real separation) ────────
// Demo studies are tagged "Commons:" in their note. A chart that already
// holds anything else is a real patient chart, and public images must never
// be mixed into it.
async function existingKeys(mrns) {
  const seen = new Map();   // mrn → Set('name|size') — dedupe is per patient
  const realCharts = new Set();
  for (const mrn of mrns) {
    const res = await request('/api/images?mrn=' + encodeURIComponent(mrn) + '&limit=500');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      die(`cannot read the gallery for ${mrn} (HTTP ${res.status}): ${data.error || 'no message'}\n`
        + '    Sign in as a doctor/admin who can access that MRN, and check the MRN spelling.');
    }
    const data = await res.json().catch(() => ({}));
    const set = new Set();
    for (const im of data.images || []) {
      set.add(`${im.originalName}|${im.sizeBytes}`);
      if (!/commons:/i.test(String(im.note || ''))) realCharts.add(mrn);
    }
    seen.set(mrn, set);
  }
  return { seen, realCharts };
}

// ── local folder scan ───────────────────────────────────────────
function scan(dir) {
  const root = resolve(dir);
  if (!existsSync(root)) die(`folder not found: ${root}`);
  const out = [];
  const walk = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && EXTS.has(extname(e.name).toLowerCase())) out.push(p);
    }
  };
  walk(root);
  out.sort();
  return out;
}

// ── Wikimedia Commons: curated, licence-filtered demo studies ───
const DEFAULT_QUERIES = ['chest radiograph', 'brain MRI scan', 'abdominal CT scan', 'ultrasound scan'];
const LICENCE_OK = /^(CC0|CC BY(?!-NC|-ND)|Public domain|PD)/i;

function plain(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s*\(\s*talk\s*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function commonsSearch(query, want) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: String(Math.min(50, want)),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1400',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'user-agent': 'VELTRUVIA-imaging-seed/1.0 (EMR demo data)' } });
  if (!res.ok) throw new Error(`Commons search failed (HTTP ${res.status})`);
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  const out = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata || {};
    const licence = plain(meta.LicenseShortName?.value);
    if (!LICENCE_OK.test(licence)) continue;
    if (Number(info.width) < 300 || Number(info.height) < 300) continue;
    const src = info.thumburl || info.url;
    if (!src) continue;
    const ext = (extname(new URL(src).pathname) || '').toLowerCase();
    if (!EXTS.has(ext) || ext === '.dcm') continue;
    if (Number(info.size) > MAX_BYTES * 4) continue; // the scaled thumb is smaller; guard the fetch
    out.push({
      title: p.title.replace(/^File:/, ''),
      url: src,
      ext,
      licence,
      artist: plain(meta.Artist?.value) || 'unknown author',
      page: info.descriptionurl || info.descriptionshorturl || '',
      credit: `Commons: ${plain(meta.Artist?.value) || 'unknown'} · ${licence}`,
    });
  }
  return out;
}

async function demoFiles(want) {
  const queries = QUERIES.length ? QUERIES : DEFAULT_QUERIES;
  const picked = [];
  const titles = new Set();
  for (const q of queries) {
    if (picked.length >= want) break;
    let found = [];
    try { found = await commonsSearch(q, want * 2); } catch (err) { console.warn(`  ! ${q}: ${err.message}`); continue; }
    for (const f of found) {
      if (picked.length >= want) break;
      if (titles.has(f.title)) continue;
      titles.add(f.title);
      picked.push(f);
    }
  }
  return picked;
}

// ── upload one buffer ───────────────────────────────────────────
async function upload(mrn, name, buf, note) {
  const headers = {
    'Content-Type': MIME[extname(name).toLowerCase()] || 'application/octet-stream',
    'x-filename': name,
  };
  if (note) headers['x-note'] = note;
  const res = await request('/api/images/' + encodeURIComponent(mrn), { method: 'POST', headers, body: buf });
  const data = await res.json().catch(() => ({}));
  if (res.status !== 201) throw new Error(data.error || `HTTP ${res.status}`);
  if (data.sha256 && data.sha256 !== sha256(buf)) {
    throw new Error('server hash does not match the uploaded bytes');
  }
  return data.image;
}

// ── main ────────────────────────────────────────────────────────
async function main() {
  if (!MRNAMES.length) die('--mrn is required (comma-separated for several patients).');
  if (!DIR && !DEMO) {
    die('nothing to import: pass --dir <folder> and/or --demo [count].\n'
      + '    Open datasets that work well here: NIH ChestX-ray14, TCIA collections\n'
      + '    (cancerimagingarchive.net), MedNIST, or any Kaggle DICOM export.');
  }

  console.log(`\n  VELTRUVIA imaging seed → ${BASE}`);
  console.log(`  patients: ${MRNAMES.join(', ')}${DRY ? '   (dry run — nothing is saved)' : ''}`);

  let role = '(dry run)';
  let seen = new Map();
  let realCharts = new Set();
  if (!DRY) {
    role = await login();
    console.log(`  signed in as ${role}`);
    ({ seen, realCharts } = await existingKeys(MRNAMES));
    const existing = [...seen.values()].reduce((n, s) => n + s.size, 0);
    console.log(`  gallery already holds ${existing} image(s) for these patients`);
  }

  // Public demo studies go only to charts that hold no real patient images.
  const demoMrns = flag('--allow-mixed') ? MRNAMES : MRNAMES.filter((m) => !realCharts.has(m));
  if (DEMO && !DRY && !demoMrns.length) {
    die('refusing to add public demo studies to ' + MRNAMES.join(', ')
      + '\n    Those charts already hold images that did not come from Commons — real patient studies.'
      + '\n    Use an empty/demo MRN, or pass --allow-mixed only if you are certain.');
  }
  let demoN = 0;

  const plan = [];

  if (DIR) {
    const files = scan(DIR);
    if (!files.length) console.warn(`  ! no images found under ${resolve(DIR)}`);
    console.log(`  folder: ${files.length} image file(s) under ${resolve(DIR)}`);
    for (const p of files) plan.push({ kind: 'file', path: p, name: basename(p) });
  }

  if (DEMO) {
    console.log(`  commons: searching ${(QUERIES.length ? QUERIES : DEFAULT_QUERIES).join(' / ')} …`);
    const found = await demoFiles(DEMO);
    console.log(`  commons: ${found.length} openly-licensed study/studies selected`);
    for (const f of found) plan.push({ kind: 'url', ...f });
    if (found.length < DEMO) console.warn(`  ! only found ${found.length} of ${DEMO} requested`);
  }

  let done = 0, skipped = 0, failed = 0, bytes = 0, i = 0;
  const manifest = [];

  for (const item of plan) {
    if (done >= LIMIT) break;
    i++;

    let name = item.name;
    let buf;
    if (item.kind === 'file') {
      const st = statSync(item.path);
      if (st.size > MAX_BYTES) { console.log(`  [${i}] skip  ${kb(st.size)} > 10 MB  ${name}`); skipped++; continue; }
      buf = readFileSync(item.path);
    } else {
      try {
        const res = await fetch(item.url, { headers: { 'user-agent': 'VELTRUVIA-imaging-seed/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        console.log(`  [${i}] fail  ${name} — download: ${err.message}`);
        failed++; continue;
      }
      if (buf.length > MAX_BYTES) { console.log(`  [${i}] skip  ${kb(buf.length)} > 10 MB  ${name}`); skipped++; continue; }
      name = ascii(item.title).replace(/[^\w.\- ()]/g, '_').slice(0, 90) || 'study';
      if (!name.toLowerCase().endsWith(item.ext)) name += item.ext;
      if (NOTE.length + item.credit.length + 3 <= 300) item.note = ascii(`${NOTE} · ${item.credit}`);
      else item.note = ascii(item.credit);
    }

    const key = `${name}|${buf.length}`;
    const targetMrn = item.kind === 'url'
      ? demoMrns[demoN % demoMrns.length]
      : MRNAMES[done % MRNAMES.length];
    const alreadyThere = seen.get(targetMrn);
    if (!KEEP_DUPES && alreadyThere?.has(key)) { console.log(`  [${i}] dup   ${name}`); skipped++; continue; }

    if (DRY) {
      console.log(`  [${i}] would upload  ${kb(buf.length)}  ${name}${item.note ? '  — ' + item.note : ''}`);
      done++; bytes += buf.length;
      continue;
    }

    const mrn = item.kind === 'url'
      ? demoMrns[demoN++ % demoMrns.length]
      : MRNAMES[done % MRNAMES.length];
    try {
      const img = await upload(mrn, name, buf, item.note || NOTE);
      if (!seen.has(mrn)) seen.set(mrn, new Set());
      seen.get(mrn).add(key);
      done++; bytes += buf.length;
      console.log(`  [${i}] ✓ ${mrn}  ${kb(buf.length)}  ${name}`);
      manifest.push({
        id: img.id, mrn, name, sizeBytes: buf.length, sha256: sha256(buf), createdAt: img.createdAt,
        ...(item.kind === 'url' ? { source: item.page, licence: item.licence, author: item.artist, originalTitle: item.title } : {}),
      });
    } catch (err) {
      failed++;
      console.log(`  [${i}] fail  ${mrn}  ${name} — ${err.message}`);
    }
    if (DELAY) await sleep(DELAY);
  }

  if (MANIFEST && manifest.length) {
    mkdirSync(dirname(resolve(MANIFEST)), { recursive: true });
    writeFileSync(resolve(MANIFEST), JSON.stringify({
      generatedAt: new Date().toISOString(), server: BASE, patients: MRNAMES, images: manifest,
    }, null, 2) + '\n');
    console.log(`  manifest: ${resolve(MANIFEST)} (${manifest.length} entries)`);
  }

  console.log(`\n  imported ${done} · skipped ${skipped} · failed ${failed} · ${kb(bytes)}\n`);
  if (DRY) return 0;
  if (!done && failed) return 1;
  return failed ? 1 : 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('\n  ✗ ' + (err?.stack || err) + '\n');
  process.exit(1);
});
