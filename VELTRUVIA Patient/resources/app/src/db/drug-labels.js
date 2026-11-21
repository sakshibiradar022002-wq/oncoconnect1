// ═══════════════════════════════════════════════════════════════════
// NLM Drug-Label Overlay — reference-only coverage for drugs that are
// not in the curated DRUG_DATABASE.
// ═══════════════════════════════════════════════════════════════════
// drug-labels.json is generated from NLM RxNorm (RxCUI) and DailyMed
// (FDA Structured Product Label) — both public domain, no licence fee.
// It carries label identity + link only. It deliberately contains no
// dosing, interaction or monitoring text: those stay in the curated,
// clinically reviewed DRUG_DATABASE. Regenerate with:
//
//   node scripts/enrich-drug-labels.mjs
//
// The overlay is optional at runtime: if the file is missing the app
// behaves exactly as before (curated database only).

import { readFileSync } from 'node:fs';

const OVERLAY_PATH = new URL('./drug-labels.json', import.meta.url);
const EMPTY = { generatedAt: null, source: 'NLM RxNorm + DailyMed (public domain)', entries: {} };

let overlay = EMPTY;
try {
  overlay = JSON.parse(readFileSync(OVERLAY_PATH, 'utf8'));
} catch {
  // Overlay not generated yet — curated database remains authoritative.
}

/** Lowercase, trim, and collapse punctuation so "Temodar®" ≈ "temodar". */
export function normalizeDrugName(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BY_ALIAS = new Map();
for (const [key, entry] of Object.entries(overlay.entries || {})) {
  BY_ALIAS.set(normalizeDrugName(key), entry);
  for (const alias of entry.aliases || []) BY_ALIAS.set(normalizeDrugName(alias), entry);
}

export const DRUG_LABEL_META = {
  generatedAt: overlay.generatedAt || null,
  source: overlay.source || EMPTY.source,
  count: Object.keys(overlay.entries || {}).length,
};

/** Resolve any curated name, brand, or NLM generic to its overlay entry. */
export function getLabelEntry(name) {
  return BY_ALIAS.get(normalizeDrugName(name)) || null;
}

/** Every overlay entry as { key, ...entry } (curated and reference-only). */
export function allLabelEntries() {
  return Object.entries(overlay.entries || {}).map(([key, entry]) => ({ key, ...entry }));
}
