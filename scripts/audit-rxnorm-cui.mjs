#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// RxNorm CUI audit — verify every curated rxnormCui against RxNav
// ═══════════════════════════════════════════════════════════════════
// The curated table's rxnormCui values were hand-entered and several are
// wrong (non-existent CUIs or another drug's CUI). This script:
//
//   1. resolves each drug's ingredient concept (TTY IN/PIN/MIN) on RxNav
//   2. looks up the CUI currently in the table
//   3. reports match / mismatch / invalid / needs-review
//   4. with --write, rewrites only values where the RxNav concept name
//      agrees with the drug's generic name (never a blind overwrite)
//
//   node scripts/audit-rxnorm-cui.mjs
//   node scripts/audit-rxnorm-cui.mjs --write
//   node scripts/audit-rxnorm-cui.mjs --refresh   # ignore HTTP cache
//
// Report: reports/rxnorm-cui-audit.json (gitignored — regenerated on demand)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRUG_DATABASE } from '../VELTRUVIA Server/resources/app/src/db/drug-database.js';
import { normalizeDrugName } from '../VELTRUVIA Server/resources/app/src/db/drug-labels.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(ROOT, 'VELTRUVIA Server/resources/app/src/db/drug-database.js');
const CACHE = join(ROOT, 'data/nlm-cache');
const UA = 'VELTRUVIA-rxnorm-cui-audit/1.0 (offline EMR build tool)';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const REFRESH = args.has('--refresh');
const DELAY_MS = 70;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url) {
  const cacheFile = join(CACHE, createHash('sha256').update(url).digest('hex') + '.txt');
  if (!REFRESH && existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 404) {
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(cacheFile, '');
        return '';
      }
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

const json = async url => {
  const text = await fetchText(url);
  return text ? JSON.parse(text) : null;
};

// Exact-name lookup. /drugs.json only returns packaged/clinical forms, so
// the ingredient CUI has to come from /rxcui.json (RxNav's normalised match).
async function ingredientConcept(name) {
  try {
    const data = await json(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}`);
    const cui = data?.idGroup?.rxnormId?.[0];
    if (!cui) return null;
    return { rxcui: cui, name: await conceptName(cui) };
  } catch {
    return null;
  }
}

async function conceptName(rxcui) {
  try {
    const data = await json(`https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(rxcui)}/properties.json`);
    return data?.properties?.name || null;
  } catch {
    return null;
  }
}

// Form descriptors that are not part of the ingredient name.
const FORM_WORDS = /\b(odt|prn|supportive|topical|nasal|ophthalmic|otic|eye|injection|oral|xr|er|sr|cr|ir|extended|release|immediate)\b/gi;

// Fixed after manual verification against RxNav (combination / botanical
// products have no single exact-name match).
const MANUAL_CUI = {
  'senna': '36387',                     // sennosides, USP — senna's active ingredient
  'trimethoprim-sulfamethoxazole': '10831', // sulfamethoxazole / trimethoprim [MIN]
};

// Names agree if one normalised form contains the other (salt/hydrate and
// combination suffixes vary between RxNorm releases).
function namesAgree(a, b) {
  const na = normalizeDrugName(a), nb = normalizeDrugName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

const results = [];
const proposed = new Map(); // key → { cui, name }
console.log(`🔎 Auditing ${Object.keys(DRUG_DATABASE).length} curated RxNorm CUIs…`);

for (const [key, drug] of Object.entries(DRUG_DATABASE)) {
  const generic = drug.generic || key;
  const current = drug.rxnormCui || null;
  const isManual = Boolean(MANUAL_CUI[key]);

  let concept = null;
  if (isManual) {
    concept = { rxcui: MANUAL_CUI[key], name: await conceptName(MANUAL_CUI[key]) };
  } else {
    const lookupNames = [...new Set([
      generic,
      generic.replace(FORM_WORDS, '').replace(/\s+/g, ' ').trim(),
      generic.replace(/^L[- ]/i, ''),
    ])].filter(Boolean);
    for (const candidate of lookupNames) {
      concept = await ingredientConcept(candidate);
      if (concept) break;
    }
  }
  const resolvedCui = concept?.rxcui || null;
  const resolvedName = concept?.name || null;

  const currentName = current ? await conceptName(current) : null;
  const agree = Boolean(resolvedName) && namesAgree(resolvedName, generic);
  const exact = Boolean(resolvedName) && normalizeDrugName(resolvedName) === normalizeDrugName(generic);
  // Combination products have no single ingredient concept: never auto-map them.
  const core = normalizeDrugName(generic.replace(FORM_WORDS, '').replace(/^L[- ]/i, ''));
  const singleConcept = !/[-/]|\band\b/.test(core);

  let status;
  if (!resolvedCui) status = 'unresolved';
  else if (current === resolvedCui) status = 'match';
  else if (!current) status = 'missing';
  else if (!currentName) status = 'invalid';
  else if (!agree) status = 'wrong-drug';
  else status = 'variant';

  const safeToWrite = Boolean(
    resolvedCui && current !== resolvedCui && (isManual || (agree && (exact || singleConcept)))
  );

  if (safeToWrite) proposed.set(key, { cui: resolvedCui, name: resolvedName });
  results.push({
    key, generic,
    currentCui: current,
    currentName,
    resolvedCui,
    resolvedName,
    status: safeToWrite && status !== 'missing' ? `${status}-fixable` : status,
    safeToWrite,
  });
}

// ── Duplicate CUIs across different drugs ───────────────────────────
const byCui = new Map();
for (const r of results) {
  const cui = r.safeToWrite ? r.resolvedCui : r.currentCui;
  if (!cui) continue;
  if (!byCui.has(cui)) byCui.set(cui, []);
  byCui.get(cui).push(r.key);
}
const duplicates = [...byCui.entries()]
  .filter(([, keys]) => keys.length > 1)
  .map(([cui, keys]) => ({ cui, keys }));

// ── Report ─────────────────────────────────────────────────────────
const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'NLM RxNorm (RxNav REST)',
  counts,
  duplicates,
  entries: results,
};
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports/rxnorm-cui-audit.json'), JSON.stringify(report, null, 2) + '\n');

console.log('\nStatus:');
for (const [status, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${status.padEnd(18)} ${n}`);
}
if (duplicates.length) {
  console.log(`\n⚠️  ${duplicates.length} duplicate CUI group(s) after proposed fixes:`);
  for (const d of duplicates.slice(0, 10)) console.log(`   ${d.cui}: ${d.keys.join(', ')}`);
}
console.log('\nSample fixes:');
for (const r of results.filter(x => x.status.includes('fixable')).slice(0, 12)) {
  console.log(`   ${r.key}: ${r.currentCui} (${r.currentName || 'no such CUI'}) → ${r.resolvedCui} (${r.resolvedName})`);
}

// ── Apply verified rewrites ────────────────────────────────────────
if (WRITE) {
  const lines = readFileSync(DB_PATH, 'utf8').split('\n');
  let currentKey = null;
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    const keyMatch = lines[i].match(/^  '([^']+)': \{/);
    if (keyMatch) { currentKey = keyMatch[1]; continue; }
    if (!currentKey) continue;
    const fix = proposed.get(currentKey);
    if (!fix) continue;
    if (/^\s*rxnormCui: '\d+',/.test(lines[i])) {
      lines[i] = lines[i].replace(/rxnormCui: '\d+',/, `rxnormCui: '${fix.cui}',`);
      changed++;
      currentKey = null; // one CUI per entry
    }
  }
  const tmp = DB_PATH + '.tmp';
  writeFileSync(tmp, lines.join('\n'));
  renameSync(tmp, DB_PATH);
  console.log(`\n✅ Rewrote ${changed} verified CUI(s) in ${DB_PATH.replace(ROOT + '/', '')}`);
  console.log('   Next: npm run sync-bundles && npm test && npm run drug-labels');
} else {
  console.log(`\nDry run: ${proposed.size} verified fix(es) available. Re-run with --write to apply.`);
  console.log('   Report: reports/rxnorm-cui-audit.json');
}
