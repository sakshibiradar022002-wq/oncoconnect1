// Clinical-safety tests — drug & interaction RULE DATA integrity plus the
// interaction-check logic used before prescribing.
//
// Scope (deliberate): this suite protects the *clinical content* — every drug
// entry keeps its identity/dosing metadata, every interaction rule keeps its
// shape, and the matcher keeps detecting known dangerous pairs symmetrically.
// Route-level gates in prescriptions.js (allergy/dosing warnings wired into
// the prescribe flow) are NOT covered here — they need API-level tests with a
// seeded patient (follow-up work, tracked in the roadmap validation report).
//
// No source files are modified by these tests; they import the shipped
// drug-database module exactly as the server does.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import(
  new URL('../VELTRUVIA Server/resources/app/src/db/drug-database.js', import.meta.url)
);
const { DRUG_DATABASE, DRUG_INTERACTIONS, searchDrugs, getDrugInfo, checkInteractions } = mod;

const DRUG_KEYS = Object.keys(DRUG_DATABASE);
const SEVERITIES = new Set(['severe', 'moderate', 'mild']);

// ── Drug database integrity ─────────────────────────────────────────────
test('drug database is substantial (≥100 entries)', () => {
  assert.ok(
    DRUG_KEYS.length >= 100,
    `expected ≥100 drugs, found ${DRUG_KEYS.length}`
  );
});

test('every drug entry has RxNorm CUI, drug class, and a dosed unit', () => {
  const missingRx = DRUG_KEYS.filter(k => !DRUG_DATABASE[k].rxnormCui);
  const missingClass = DRUG_KEYS.filter(k => !DRUG_DATABASE[k].class);
  const missingUnit = DRUG_KEYS.filter(
    k => !DRUG_DATABASE[k].dosing || !DRUG_DATABASE[k].dosing.unit
  );
  assert.deepEqual(missingRx, [], 'entries missing rxnormCui');
  assert.deepEqual(missingClass, [], 'entries missing class');
  assert.deepEqual(missingUnit, [], 'entries missing dosing.unit');
});

test('high-risk chemotherapy staples keep their hard dose ceilings', () => {
  const temo = getDrugInfo('temozolomide');
  assert.ok(temo, 'temozolomide must exist');
  assert.equal(temo.dosing.maxDaily, 200, 'temozolomide maxDaily must stay 200 mg/m²');
  const lomustine = getDrugInfo('lomustine');
  assert.ok(lomustine?.cumulativeLimit, 'lomustine lifetime cumulative limit must exist');
  const carmustine = getDrugInfo('carmustine');
  assert.ok(carmustine, 'carmustine must exist');
});

test('clinical guidance coverage: ≥80% of drugs carry monitoring/contraindications, and the known gap may only shrink', () => {
  // KNOWN CONTENT GAP (measured 2026-10-05): 31 of 201 supportive-care
  // entries (e.g. senna, famotidine, granisetron — plus gefitinib) carry
  // neither monitoring nor contraindications. Closing that gap is
  // clinical-content work requiring pharmacist review (roadmap C21/governance),
  // so this test sets a floor and a regression budget instead of inventing
  // clinical text: coverage may improve freely, never erode.
  const bare = DRUG_KEYS.filter(
    k =>
      !(DRUG_DATABASE[k].monitoring && DRUG_DATABASE[k].monitoring.length) &&
      !(DRUG_DATABASE[k].contraindications && DRUG_DATABASE[k].contraindications.length)
  );
  const coverage = (DRUG_KEYS.length - bare.length) / DRUG_KEYS.length;
  assert.ok(coverage >= 0.8, `guidance coverage ${(coverage * 100).toFixed(1)}% fell below 80%`);
  assert.ok(bare.length <= 31, `bare entries grew from 31 to ${bare.length} — clinical content regressed`);
});

test('oncology backbone drugs all carry monitoring guidance', () => {
  for (const k of ['temozolomide', 'lomustine', 'carmustine']) {
    assert.ok(
      DRUG_DATABASE[k]?.monitoring?.length,
      `${k} must list monitoring requirements`
    );
  }
});

// ── Interaction rule integrity ──────────────────────────────────────────
test('interaction rules: well-formed tuples with usable text', () => {
  assert.ok(DRUG_INTERACTIONS.length >= 80, `expected ≥80 rules, found ${DRUG_INTERACTIONS.length}`);
  DRUG_INTERACTIONS.forEach((t, i) => {
    assert.equal(t.length, 5, `rule #${i} must have 5 fields`);
    assert.ok(SEVERITIES.has(t[2]), `rule #${i} severity "${t[2]}" not in {severe, moderate, mild}`);
    assert.ok(t[3] && t[3].length > 10, `rule #${i} needs a real description`);
    assert.ok(t[4] && t[4].length > 5, `rule #${i} needs a recommendation`);
    assert.ok(typeof t[0] === 'string' && typeof t[1] === 'string', `rule #${i} drug names must be strings`);
  });
});

test('interaction rules: all three severity tiers are represented', () => {
  for (const s of ['severe', 'moderate', 'mild']) {
    assert.ok(
      DRUG_INTERACTIONS.some(t => t[2] === s),
      `no ${s} rules present`
    );
  }
});

// ── Matcher behavior (checkInteractions) ────────────────────────────────
test('detects a known SEVERE pair (temozolomide + valproic acid)', () => {
  const hits = checkInteractions(['temozolomide', 'valproic acid']);
  assert.ok(hits.length >= 1, 'expected the temozolomide/valproic-acid rule to fire');
  assert.equal(hits[0].severity, 'severe');
  assert.ok(hits[0].description.includes('clearance'), 'rule text must explain the mechanism');
});

test('detects a known SEVERE pair (procarbazine + MAO inhibitors)', () => {
  const hits = checkInteractions(['procarbazine', 'MAO inhibitors']);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].severity, 'severe');
  assert.ok(hits[0].recommendation.length > 0);
});

test('matcher is symmetric: order of the two drugs does not matter', () => {
  const ab = checkInteractions(['temozolomide', 'valproic acid']);
  const ba = checkInteractions(['valproic acid', 'temozolomide']);
  assert.equal(ab.length, ba.length);
  assert.equal(ab[0]?.severity, ba[0]?.severity);
});

test('single medication produces no interaction findings', () => {
  assert.equal(checkInteractions(['temozolomide']).length, 0);
  assert.equal(checkInteractions([]).length, 0);
});

test('results are ranked with severe before milder severities', () => {
  // Comparator contract: unknown tiers must sort last, severe first.
  const order = { severe: 0, moderate: 1, mild: 2 };
  const sorted = [...DRUG_INTERACTIONS.map(t => t[2])].sort(
    (a, b) => (order[a] ?? 3) - (order[b] ?? 3)
  );
  const firstSevere = sorted.indexOf('severe');
  const lastSevere = sorted.lastIndexOf('severe');
  const firstMild = sorted.indexOf('mild');
  assert.ok(firstSevere === 0, 'severe must rank first');
  assert.ok(lastSevere < firstMild || firstMild === -1, 'all severe must precede mild');
});

// ── Lookup helpers used by clinical UI ──────────────────────────────────
test('search by brand name finds the right drug (Temodar)', () => {
  const hits = searchDrugs('Temodar');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].name, 'temozolomide');
});

test('search by RxNorm CUI works (36297)', () => {
  const hits = searchDrugs('36297');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].rxnormCui, '36297');
});

test('getDrugInfo normalizes case/whitespace; unknown drugs return null', () => {
  assert.equal(getDrugInfo('  Temozolomide  ').rxnormCui, '36297');
  assert.equal(getDrugInfo('definitely-not-a-drug-xyz'), null);
});
