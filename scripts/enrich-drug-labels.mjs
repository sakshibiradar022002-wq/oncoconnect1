#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Drug-label enrichment — NLM RxNorm + DailyMed (public domain)
// ═══════════════════════════════════════════════════════════════════
// Builds src/db/drug-labels.json, the reference-only overlay used by
// getDrugInfo() when a drug is not in the curated DRUG_DATABASE.
//
//   node scripts/enrich-drug-labels.mjs                 # curated + brands
//   node scripts/enrich-drug-labels.mjs --names=extra.txt
//   node scripts/enrich-drug-labels.mjs --review        # + dosing excerpts
//   node scripts/enrich-drug-labels.mjs --limit=5       # smoke test
//   node scripts/enrich-drug-labels.mjs --refresh       # ignore HTTP cache
//
// Only label identity, link and (with --review) raw excerpts are stored.
// Nothing from here is auto-injected into clinical logic: the curated
// table stays the source of dosing, interactions and monitoring.
//
// Cache: data/nlm-cache/ (gitignored) so reruns are offline and calm.
// NLM requests are serialised with --delay ms between calls.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRUG_DATABASE } from '../VELTRUVIA Server/resources/app/src/db/drug-database.js';
import { normalizeDrugName } from '../VELTRUVIA Server/resources/app/src/db/drug-labels.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'VELTRUVIA Server/resources/app/src/db/drug-labels.json');
const CACHE = join(ROOT, 'data/nlm-cache');
const REPORTS = join(ROOT, 'reports');
const UA = 'VELTRUVIA-drug-label-enrichment/1.0 (offline EMR build tool)';

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [k, v] = raw.replace(/^--/, '').split('=');
  args.set(k, v ?? true);
}
const DELAY_MS = Number(args.get('delay') ?? 120);
const LIMIT = Number(args.get('limit') ?? 0);
const REFRESH = args.get('refresh') === true;
const WANT_REVIEW = args.get('review') === true;
const EXTRA_FILE = args.get('names') ? resolve(ROOT, String(args.get('names'))) : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => normalizeDrugName(s).replace(/ /g, '-');

// ── HTTP with on-disk cache ─────────────────────────────────────────
async function fetchText(url) {
  const cacheFile = join(CACHE, createHash('sha256').update(url).digest('hex') + '.txt');
  if (!REFRESH && existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json, application/xml;q=0.9, */*;q=0.5' },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(cacheFile, text);
      await sleep(DELAY_MS);
      return text;
    } catch (err) {
      lastErr = err;
      await sleep(400 * attempt);
    }
  }
  throw lastErr;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

// ── Build lookup targets: one per curated drug, plus uncovered extras ──
// Comparing a brand name's CUI to the curated ingredient CUI is meaningless,
// so each curated drug is resolved once by its generic name and all of its
// names (key, generic, brand) become aliases of that single entry.
const CURATED_BY_NAME = new Map();
for (const [key, drug] of Object.entries(DRUG_DATABASE)) {
  for (const name of [key, drug.generic, drug.brand]) {
    if (name) CURATED_BY_NAME.set(normalizeDrugName(name), key);
  }
}

const targets = new Map(); // entry key → { display, curatedKey, aliases:Set }
for (const [key, drug] of Object.entries(DRUG_DATABASE)) {
  targets.set(key, {
    display: drug.generic || key,
    curatedKey: key,
    aliases: new Set([key, drug.generic, drug.brand].filter(Boolean)),
  });
}
if (EXTRA_FILE) {
  if (!existsSync(EXTRA_FILE)) {
    console.error(`❌ --names file not found: ${EXTRA_FILE}`);
    process.exit(2);
  }
  for (const line of readFileSync(EXTRA_FILE, 'utf8').split('\n')) {
    const name = line.replace(/#.*/, '').trim();
    if (!name) continue;
    const curatedKey = CURATED_BY_NAME.get(normalizeDrugName(name));
    if (curatedKey) {
      targets.get(curatedKey).aliases.add(name);
      continue;
    }
    const key = slug(name);
    if (!targets.has(key)) targets.set(key, { display: name, curatedKey: null, aliases: new Set([name]) });
    else targets.get(key).aliases.add(name);
  }
}

let todo = [...targets.entries()];
if (LIMIT > 0) todo = todo.slice(0, LIMIT);
console.log(`🔎 Resolving ${todo.length} name(s) against RxNorm + DailyMed…`);

// /drugs.json only returns packaged/clinical forms; the exact-name endpoint
// resolves the ingredient concept the curated table stores.
async function resolveIngredientCui(name) {
  try {
    const rx = await fetchJson(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}`);
    return rx?.idGroup?.rxnormId?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Resolve each name ───────────────────────────────────────────────
const entries = {};
const unresolved = [];
let withLabel = 0;

for (const [i, [key, target]] of todo.entries()) {
  const { display, curatedKey, aliases: aliasSet } = target;
  const drug = curatedKey ? DRUG_DATABASE[curatedKey] : null;

  const rxcui = await resolveIngredientCui(display);
  let label = null;

  for (const query of [display, drug?.brand].filter(Boolean)) {
    try {
      const spl = await fetchJson(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(query)}&pagesize=1`);
      const first = spl?.data?.[0];
      if (first?.setid) {
        label = {
          setid: first.setid,
          title: first.title || null,
          publishedDate: first.published_date || null,
          url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${first.setid}`,
        };
        break;
      }
    } catch { /* try the next query form */ }
  }

  const aliases = [...aliasSet];
  entries[key] = {
    displayName: drug?.generic || display,
    generic: drug?.generic || display,
    brand: drug?.brand || null,
    aliases,
    rxcui,
    // null when this name has no RxNav match — "unresolved", not a mismatch
    rxcuiMatchesCurated: drug?.rxnormCui ? (rxcui ? drug.rxnormCui === rxcui : null) : null,
    curated: Boolean(curatedKey),
    label,
  };
  if (label) withLabel++; else unresolved.push(display);
  if ((i + 1) % 25 === 0) console.log(`   … ${i + 1}/${todo.length}`);
}

// ── Write overlay (sorted for stable diffs) ─────────────────────────
const sorted = {};
for (const key of Object.keys(entries).sort()) sorted[key] = entries[key];
const overlay = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'NLM RxNorm + DailyMed (public domain)',
  note: 'Reference-only label overlay. Curated DRUG_DATABASE remains authoritative for dosing, interactions and monitoring.',
  entries: sorted,
};
mkdirSync(dirname(OUT), { recursive: true });
const tmp = OUT + '.tmp';
writeFileSync(tmp, JSON.stringify(overlay, null, 2) + '\n');
renameSync(tmp, OUT);

// ── Coverage report ────────────────────────────────────────────────
const referenceOnly = Object.values(sorted).filter(e => !e.curated).length;
const curatedCount = Object.keys(DRUG_DATABASE).length;
const report = {
  generatedAt: overlay.generatedAt,
  curatedDrugs: curatedCount,
  overlayEntries: Object.keys(sorted).length,
  labelsFound: withLabel,
  referenceOnlyDrugs: referenceOnly,
  unresolved: unresolved.sort(),
  rxcuiMismatches: Object.entries(sorted)
    .filter(([, e]) => e.rxcuiMatchesCurated === false)
    .map(([key, e]) => ({ key, curatedCui: DRUG_DATABASE[key]?.rxnormCui ?? null, rxnavCui: e.rxcui })),
};
mkdirSync(REPORTS, { recursive: true });
writeFileSync(join(REPORTS, 'drug-label-coverage.json'), JSON.stringify(report, null, 2) + '\n');

// ── Optional review queue: raw dosing/warning excerpts for curation ─
if (WANT_REVIEW) {
  const strip = xml => xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
  const excerptAfter = (text, heading, size = 1500) => {
    const at = text.toUpperCase().indexOf(heading);
    return at === -1 ? null : text.slice(at, at + size);
  };
  const queue = [];
  for (const [key, entry] of Object.entries(sorted)) {
    if (entry.curated || !entry.label?.setid) continue;
    try {
      const xml = await fetchText(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${entry.label.setid}.xml`);
      const text = strip(xml);
      queue.push({
        key,
        displayName: entry.displayName,
        labelTitle: entry.label.title,
        labelUrl: entry.label.url,
        boxedWarningExcerpt: excerptAfter(text, 'BOXED WARNING', 1200),
        dosageExcerpt: excerptAfter(text, 'DOSAGE AND ADMINISTRATION', 1500),
        warningsExcerpt: excerptAfter(text, 'WARNINGS AND PRECAUTIONS', 1200),
        reviewed: false,
      });
    } catch (err) {
      queue.push({ key, displayName: entry.displayName, labelUrl: entry.label.url, error: err.message, reviewed: false });
    }
  }
  writeFileSync(join(REPORTS, 'drug-label-review.json'), JSON.stringify({
    generatedAt: overlay.generatedAt,
    note: 'Raw FDA-label excerpts for human curation. Nothing here is clinical advice or auto-applied.',
    entries: queue,
  }, null, 2) + '\n');
  console.log(`📝 Review queue → reports/drug-label-review.json (${queue.length} entries)`);
}

console.log(`✅ ${Object.keys(sorted).length} overlay entries · ${withLabel} labels · ${referenceOnly} reference-only drugs`);
console.log(`   → ${OUT.replace(ROOT + '/', '')}`);
if (unresolved.length) console.log(`   ⚠️  ${unresolved.length} name(s) had no DailyMed label (see reports/drug-label-coverage.json)`);
