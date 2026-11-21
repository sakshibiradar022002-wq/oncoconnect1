// Tests for drug-database lookups and the generated NLM label overlay.
// Covers: exact curated lookup, brand/generic aliasing, reference-only
// fallback for uncurated drugs, and search across both sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const app = new URL('../VELTRUVIA Server/resources/app/src/db/', import.meta.url);
const { DRUG_DATABASE, getDrugInfo, searchDrugs } = await import(new URL('drug-database.js', app));
const { normalizeDrugName, getLabelEntry, DRUG_LABEL_META } = await import(new URL('drug-labels.js', app));

test('normalizeDrugName folds case, punctuation and whitespace', () => {
  assert.equal(normalizeDrugName('  Temodar® '), 'temodar');
  assert.equal(normalizeDrugName('5-FU'), '5 fu');
  assert.equal(normalizeDrugName(''), '');
});

test('curated drugs keep their full clinical record', () => {
  const d = getDrugInfo('temozolomide');
  assert.ok(d, 'temozolomide must resolve');
  assert.equal(d.dosing.standard, '150-200 mg/m²');
  assert.equal(d.rxnormCui, '37776'); // RxNav-confirmed ingredient CUI
  assert.ok(Array.isArray(d.monitoring) && d.monitoring.length > 0);
});

test('brand names resolve to the curated generic entry', () => {
  const d = getDrugInfo('Temodar');
  assert.ok(d, 'brand name should resolve');
  assert.equal(d.brand, 'Temodar');
  assert.equal(d.dosing.unit, 'mg/m²/day');
});

test('every curated key still resolves', () => {
  for (const key of Object.keys(DRUG_DATABASE)) {
    assert.ok(getDrugInfo(key), `${key} must resolve`);
  }
});

test('unknown drugs still return null', () => {
  assert.equal(getDrugInfo('zzz-not-a-real-drug'), null);
  assert.equal(getDrugInfo(''), null);
});

test('NLM overlay is generated and covers uncurated drugs', () => {
  assert.ok(DRUG_LABEL_META.count > 0, 'run: npm run drug-labels');
  assert.ok(getLabelEntry('modafinil'), 'modafinil should be in the overlay');
});

test('uncurated drugs return a reference-only record, never fake dosing', () => {
  const d = getDrugInfo('modafinil');
  assert.ok(d, 'modafinil should fall back to the NLM overlay');
  assert.equal(d.coverage, 'label-only');
  assert.equal(d.dosing, null);
  assert.deepEqual(d.interactions, []);
  assert.equal(d.source, 'NLM DailyMed');
  assert.match(d.nlmLabel.url, /dailymed\.nlm\.nih\.gov/);
});

test('search spans curated and reference-only entries', () => {
  const curated = searchDrugs('temozolomide');
  assert.ok(curated.some(d => d.name === 'temozolomide' && d.coverage !== 'label-only'));

  const reference = searchDrugs('modafinil');
  assert.ok(reference.some(d => d.coverage === 'label-only'));
});
