// ═══════════════════════════════════════════════════════════════════════
// DOSING SAFETY — pediatric weight-based (mg/kg) and renal (creatinine /
// eGFR) dose checks, called from the prescription POST safety pipeline.
//
// Design:
//   • Patient context (age, weight, serum creatinine) is resolved from the
//     patient record + latest biomarker_results. Missing data ⇒ the check
//     is skipped for that dimension (never blocks on unknowns).
//   • Renal: Cockcroft-Gault CrCl when weight+age+sex+creatinine are known
//     (adults), else bedside Schwartz eGFR when height+creatinine known
//     (children). Stages map to classic dose-adjustment bands.
//   • Pediatric: parses "500 mg", "10 mg/kg", "250 mg/5 mL" style dosages
//     and compares the absolute daily dose against mg/kg/day ceilings for
//     common drugs (editable table). Age < 12 years = pediatric rules.
//   • Output shape matches the existing warnings pipeline:
//     { type:'dosing', severity:'warning'|'severe', message, recommendation }
// ═══════════════════════════════════════════════════════════════════════
import { db } from '../db/index.js';
import { decryptPHI } from '../crypto.js';
import { readFileSync as _readFileSync, existsSync as _existsSync } from 'node:fs';
import { join as _join, dirname as _dirname } from 'node:path';

// mg/kg/day ceilings for frequently prescribed drugs (reference values,
// conservative; admin-editable later via a dosing_limits table).
const PEDIATRIC_MGKG_DAY = {
  paracetamol: { max: 75, note: 'max 75 mg/kg/day (acute); 4 g/day adult ceiling' },
  acetaminophen: { max: 75, note: 'max 75 mg/kg/day (acute); 4 g/day adult ceiling' },
  ibuprofen: { max: 40, note: 'max 40 mg/kg/day' },
  amoxicillin: { max: 90, note: 'max 90 mg/kg/day (high-dose otitis 80–90)' },
  azithromycin: { max: 12, note: 'max 12 mg/kg/day' },
  cefixime: { max: 8, note: 'max 8 mg/kg/day' },
  cephalexin: { max: 100, note: 'max 100 mg/kg/day divided' },
  prednisolone: { max: 2, note: 'max 2 mg/kg/day (short course)' },
  ondansetron: { max: 0.5, note: 'max 0.5 mg/kg/dose — check frequency' },
  morphine: { max: 1, note: 'max 1 mg/kg/day oral (titrate; specialist)' },
};

// Renal adjustment bands (CrCl mL/min) — generic guidance per stage.
const RENAL_BANDS = [
  { min: 60, label: 'normal renal function', severity: null },
  { min: 30, label: 'mild–moderate impairment (CrCl 30–59)', severity: 'warning',
    note: 'Review dose/frequency for renally-cleared drugs (e.g. aminoglycosides, vancomycin, metformin, gabapentin, many NSAIDs).' },
  { min: 15, label: 'moderate–severe impairment (CrCl 15–29)', severity: 'severe',
    note: 'Dose reduction usually required for renally-cleared drugs; avoid NSAIDs and metformin.' },
  { min: 0, label: 'severe impairment / kidney failure (CrCl <15)', severity: 'severe',
    note: 'Nephrology input advised; many drugs contraindicated or needing major reduction.' },
];

// ── Renal dose-adjustment suggestions (per drug, by CrCl band) ─────
// Two bands: below 30, below 15 (mL/min). These are REFERENCE suggestions
// surfaced to the prescriber — never applied automatically.
const RENAL_ADJUSTMENTS = {
  metformin: {
    30: 'Do not initiate below eGFR 30; if already on it, halve the dose and recheck renal function every 3 months. Hold before iodine contrast.',
    15: 'CONTRAINDICATED below eGFR 15 — discontinue metformin.',
  },
  gabapentin: {
    30: 'Reduce total daily dose (CrCl 15–29: 300–600 mg/day) and titrate slowly.',
    15: 'Give 300 mg or less daily; supplement post-dialysis if on HD.',
  },
  pregabalin: {
    30: 'Reduce total daily dose (CrCl 15–29: 25–150 mg/day in 1–2 doses).',
    15: '25–75 mg/day as a single dose; supplement after dialysis.',
  },
  enoxaparin: {
    30: 'Reduce dose (prophylaxis 40 mg→20 mg or extend interval); anti-Xa monitoring advised.',
    15: 'Therapeutic: 1 mg/kg once daily; prophylaxis q48h; anti-Xa monitoring advised.',
  },
  vancomycin: {
    30: 'Extend interval and dose by AUC/trough-guided monitoring.',
    15: 'Extended-interval dosing per levels; nephrology co-management.',
  },
  digoxin: {
    30: 'Reduce dose and monitor serum levels (renal clearance dominates).',
    15: 'Roughly half normal dose with level monitoring.',
  },
  lithium: {
    30: 'Widen dosing interval and monitor levels closely (narrow therapeutic index).',
    15: 'Avoid unless essential; check level before each dose increase.',
  },
  nitrofurantoin: {
    30: 'Avoid — ineffective below eGFR 30 and raises toxicity risk.',
    15: 'CONTRAINDICATED.',
  },
  colchicine: {
    30: 'Reduce dose; avoid courses repeated within 2 weeks.',
    15: 'HALF dose, max one course per 2 weeks; avoid with statins/clarithromycin.',
  },
  allopurinol: {
    30: 'Start low (50–100 mg/day) and titrate to target urate.',
    15: 'Start 50 mg/day; escalate cautiously with monitoring.',
  },
  rosuvastatin: {
    30: 'Cap at 10 mg/day.',
    15: 'Cap at 10 mg/day; avoid with cyclosporin.',
  },
};

// ── Duplicate-therapy classes ──────────────────────────────────────
// Drugs in the same class taken together double class effects (bleeding,
// serotonin syndrome, sedation, rhabdo...). Same-drug matches are flagged
// as outright duplicates.
const DRUG_CLASSES = {
  nsaid:          ['ibuprofen', 'naproxen', 'diclofenac', 'ketoprofen', 'ketorolac', 'meloxicam', 'celecoxib', 'indomethacin'],
  antiplatelet:   ['aspirin', 'clopidogrel', 'ticagrelor', 'prasugrel', 'dipyridamole'],
  anticoagulant:  ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'enoxaparin', 'heparin'],
  ssri:           ['sertraline', 'fluoxetine', 'citalopram', 'escitalopram', 'paroxetine', 'fluvoxamine'],
  snri:           ['venlafaxine', 'duloxetine', 'desvenlafaxine'],
  benzodiazepine: ['diazepam', 'lorazepam', 'alprazolam', 'clonazepam', 'temazepam', 'midazolam'],
  opioid:         ['tramadol', 'codeine', 'morphine', 'oxycodone', 'hydromorphone', 'fentanyl', 'buprenorphine'],
  ppi:            ['omeprazole', 'pantoprazole', 'lansoprazole', 'esomeprazole', 'rabeprazole'],
  statin:         ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
  acei:           ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'perindopril'],
  arb:            ['losartan', 'valsartan', 'telmisartan', 'candesartan', 'irbesartan'],
  macrolide:      ['azithromycin', 'clarithromycin', 'erythromycin'],
  penicillin:     ['amoxicillin', 'ampicillin', 'penicillin', 'flucloxacillin', 'co-amoxiclav'],
  sulfonylurea:   ['gliclazide', 'glibenclamide', 'glimepiride', 'glipizide'],
};

function drugClassOf(name) {
  const n = String(name || '').toLowerCase();
  for (const [cls, list] of Object.entries(DRUG_CLASSES)) {
    if (list.some(d => n.includes(d))) return cls;
  }
  return null;
}

function patientSexIs(p, letter) {
  const s = String(p?.sex || p?.gender || '').toLowerCase();
  return s.startsWith(letter);
}

async function loadPatientContext(mrn) {
  const ctx = { dob: null, sex: null, weightKg: null, heightCm: null, creatinineMgDl: null, eGfr: null };
  // 1) Patient record (kv_store encrypted, or JSON store fallback)
  try {
    const row = await db.prepare('SELECT v_enc FROM kv_store WHERE k = ?').get('pat_' + mrn);
    if (row?.v_enc) {
      const p = JSON.parse(decryptPHI(row.v_enc));
      ctx.dob = p.dob || p.dateOfBirth || null;
      ctx.sex = p.sex || p.gender || null;
      const w = Number(p.weight);
      if (Number.isFinite(w) && w > 0) ctx.weightKg = w;
      const h = Number(p.height);
      if (Number.isFinite(h) && h > 0) ctx.heightCm = h;
    }    } catch { /* best-effort */ }
  // 1b) JSON patient store fallback (save-patient writes here; kv_store only
  //     exists for demo-seeded accounts). Same shape as the kv patient blob.
  if (ctx.dob == null && ctx.weightKg == null) {
    try {
      const store = JSON.parse(_readFileSync(_join(_dirname(process.env.DB_PATH || '.'), 'patient-store.json'), 'utf-8'));
      const p = store[String(mrn).toUpperCase()];
      if (p) {
        ctx.dob = p.dob || p.dateOfBirth || null;
        ctx.sex = p.sex || p.gender || null;
        const w = Number(p.weight);
        if (Number.isFinite(w) && w > 0) ctx.weightKg = w;
        const h = Number(p.height);
        if (Number.isFinite(h) && h > 0) ctx.heightCm = h;
      }
    } catch { /* best-effort */ }
  }
  // 2) Latest numeric labs for creatinine/eGFR
  try {
    const rows = await db.prepare(`
      SELECT biomarker, numeric_value FROM biomarker_results
      WHERE patient_mrn = ? AND numeric_value IS NOT NULL
        AND (lower(biomarker) LIKE '%creatinine%' OR lower(biomarker) LIKE '%egfr%' OR lower(biomarker) LIKE '%gfr%')
      ORDER BY created_at DESC LIMIT 6
    `).all(mrn);
    for (const r of rows) {
      const b = String(r.biomarker).toLowerCase();
      if (ctx.creatinineMgDl == null && b.includes('creatinine') && !b.includes('clearance')) {
        ctx.creatinineMgDl = Number(r.numeric_value);
      }
      if (ctx.eGfr == null && (b.includes('egfr') || b.includes('gfr'))) {
        ctx.eGfr = Number(r.numeric_value);
      }
    }
  } catch { /* best-effort */ }
  return ctx;
}

function ageYears(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
}

// CrCl (Cockcroft-Gault, mL/min)
function crcl({ age, weightKg, isFemale, scrMgDl }) {
  if (!age || !weightKg || !scrMgDl || scrMgDl <= 0) return null;
  const val = ((140 - age) * weightKg) / (72 * scrMgDl) * (isFemale ? 0.85 : 1);
  return Math.round(val * 10) / 10;
}

// eGFR (bedside Schwartz, mL/min/1.73m²) — pediatric
function schwartz({ heightCm, scrMgDl, k = 0.413 }) {
  if (!heightCm || !scrMgDl || scrMgDl <= 0) return null;
  return Math.round(((0.413 * heightCm) / scrMgDl) * 10) / 10;
}

// "500 mg", "1.2 g", "10 mg/kg", "250 mg/5ml", "2 tablets 500mg" → mg per unit dose
function parseDoseMg(dosage) {
  if (!dosage) return { mg: null, perKg: false };
  const s = String(dosage).toLowerCase().replace(/,/g, '.');
  const perKg = /mg\s*\/\s*kg/.test(s);
  let m = s.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|ug)\b/);
  if (!m) return { mg: null, perKg };
  let v = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'g') v *= 1000;
  else if (unit === 'mcg' || unit === 'µg' || unit === 'ug') v /= 1000;
  return { mg: v, perKg };
}

// doses per day from common frequency strings.
// ORDER MATTERS: specific multipliers (tid/qid/bid) must be tested BEFORE the
// generic "daily" pattern — "three times daily" contains "daily" and used to
// silently resolve to 1 dose/day, undercounting every multi-dose frequency.
function dosesPerDay(frequency) {
  const f = String(frequency || '').toLowerCase();
  if (/q(\d+)\s*h/.test(f)) { const n = Number(f.match(/q(\d+)\s*h/)[1]); return n > 0 ? Math.max(1, Math.round(24 / n)) : 1; }
  if (/qds|qid|four times|4x|q\.i\.d/.test(f)) return 4;
  if (/tds|tid|three times|3x|t\.i\.d/.test(f)) return 3;
  if (/bd|bid|twice|2x|b\.i\.d/.test(f)) return 2;
  if (/od\b|once|daily|noct|qhs|bedtime|every morning/.test(f)) return 1;
  if (/every 6/.test(f)) return 4;
  if (/every 8/.test(f)) return 3;
  if (/every 12/.test(f)) return 2;
  return 1; // conservative default
}

function findKey(list, name) {
  const n = String(name || '').toLowerCase();
  for (const k of Object.keys(list)) { if (n.includes(k)) return k; }
  return null;
}

export async function checkDosing({ patientMrn, medication, dosage, frequency, route }) {
  const warnings = [];
  const ctx = await loadPatientContext(patientMrn);
  const age = ageYears(ctx.dob);
  const isFemale = patientSexIs(ctx, 'f');
  const isPediatric = age != null && age < 12;
  const { mg: doseMg, perKg } = parseDoseMg(dosage);
  const freqN = dosesPerDay(frequency);
  const drugKey = findKey(PEDIATRIC_MGKG_DAY, medication);

  // ── Pediatric weight-based check ────────────────────────────────
  if (isPediatric && ctx.weightKg && doseMg != null && !perKg) {
    const dailyMg = doseMg * freqN;
    const mgKgDay = dailyMg / ctx.weightKg;
    if (drugKey) {
      const lim = PEDIATRIC_MGKG_DAY[drugKey];
      if (mgKgDay > lim.max) {
        warnings.push({
          type: 'dosing',
          severity: 'severe',
          message: `⚠️ PEDIATRIC DOSE HIGH: ${medication} ${dosage} ×${freqN}/day = ${Math.round(mgKgDay * 10) / 10} mg/kg/day for a ${ctx.weightKg} kg child — exceeds ${lim.max} mg/kg/day`,
          recommendation: lim.note,
        });
      } else if (mgKgDay > lim.max * 0.8) {
        warnings.push({
          type: 'dosing',
          severity: 'warning',
          message: `Pediatric dose near ceiling: ${Math.round(mgKgDay * 10) / 10} mg/kg/day (limit ${lim.max}) for ${ctx.weightKg} kg`,
          recommendation: 'Confirm weight is current and indication justifies the higher dose.',
        });
      }
    } else {
      // No specific limit — still surface the computed exposure so the
      // prescriber can judge (that's the point of a safety net).
      warnings.push({
        type: 'dosing',
        severity: 'warning',
        message: `Pediatric dosing (info): ${medication} ${dosage} ×${freqN}/day ≈ ${Math.round(mgKgDay * 10) / 10} mg/kg/day for ${ctx.weightKg} kg (age ${age})`,
        recommendation: 'Check a pediatric formulary for this drug\u2019s mg/kg/day ceiling.',
      });
    }
  } else if (isPediatric && perKg && ctx.weightKg && doseMg != null) {
    const dailyMg = doseMg * ctx.weightKg * freqN;
    warnings.push({
      type: 'dosing',
      severity: 'warning',
      message: `Pediatric mg/kg prescription: ${doseMg} mg/kg × ${ctx.weightKg} kg × ${freqN}/day = ${Math.round(dailyMg)} mg/day total`,
      recommendation: 'Verify the total daily dose against formulary limits.',
    });
  } else if (isPediatric && !ctx.weightKg) {
    warnings.push({
      type: 'dosing',
      severity: 'warning',
      message: `Pediatric patient (age ${age}) has no weight recorded — weight-based dose check skipped`,
      recommendation: 'Record the child\u2019s weight to enable dosing safety checks.',
    });
  }

  // ── Renal check ─────────────────────────────────────────────────
  let crclVal = null;
  if (ctx.creatinineMgDl != null && age != null && age >= 12 && ctx.weightKg) {
    crclVal = crcl({ age, weightKg: ctx.weightKg, isFemale, scrMgDl: ctx.creatinineMgDl });
  } else if (ctx.creatinineMgDl != null && age != null && age < 12 && ctx.heightCm) {
    crclVal = schwartz({ heightCm: ctx.heightCm, scrMgDl: ctx.creatinineMgDl });
  }
  if (crclVal == null && ctx.eGfr != null) crclVal = ctx.eGfr; // fall back to lab-reported eGFR

  // ── Duplicate-therapy detection (same drug, or same drug class) ──
  try {
    const actives = await db.prepare(
      "SELECT medication, dosage, frequency FROM prescriptions WHERE patient_mrn = ? AND status = 'active'"
    ).all(patientMrn);
    const newLc = String(medication || '').toLowerCase();
    const newCls = drugClassOf(medication);
    let dupFlags = 0;
    for (const rx of actives) {
      if (dupFlags >= 4) break; // don't spam the prescriber
      const rl = String(rx.medication || '').toLowerCase();
      if (!rl) continue;
      if (rl.includes(newLc) || newLc.includes(rl)) {
        warnings.push({
          type: 'duplicate',
          severity: 'severe',
          message: `⚠️ DUPLICATE THERAPY: patient already has ACTIVE ${rx.medication} (${rx.dosage || ''} ${rx.frequency || ''}). Review before adding ${medication}.`,
        });
        dupFlags++;
      } else {
        const rc = drugClassOf(rx.medication);
        if (newCls && rc === newCls) {
          warnings.push({
            type: 'duplicate',
            severity: 'warning',
            message: `⚠️ SAME CLASS (${newCls.toUpperCase()}): patient is already on ${rx.medication}. Adding ${medication} doubles the class effects (bleeding/sedation/serotonin risk).`,
          });
          dupFlags++;
        }
      }
    }
  } catch { /* never block prescribing on this check */ }

  if (crclVal != null) {
    const band = RENAL_BANDS.find(b => crclVal >= b.min) || RENAL_BANDS[RENAL_BANDS.length - 1];
    if (band.severity) {
      warnings.push({
        type: 'dosing',
        severity: band.severity,
        message: `⚠️ RENAL IMPAIRMENT: ${band.label} (eGFR/CrCl ${crclVal}) — check dosing of ${medication}`,
        recommendation: band.note,
      });
    }
    // Concrete dose-adjustment suggestion when the drug has one
    const adjKey = findKey(RENAL_ADJUSTMENTS, medication);
    if (adjKey) {
      const band = crclVal < 15 ? 15 : 30;
      const adj = RENAL_ADJUSTMENTS[adjKey][band];
      if (adj) {
        warnings.push({
          type: 'dosing-adjustment',
          severity: /CONTRAINDICATED|Avoid|discontinue/i.test(adj) ? 'severe' : 'warning',
          message: `💡 RENAL DOSE ADJUSTMENT — ${medication} at eGFR/CrCl ${crclVal}: ${adj}`,
          recommendation: 'Reference suggestion — confirm against the current formulary before prescribing.',
        });
      }
    }
    // Known high-risk renal drugs get an explicit flag even at mild stages
    const renalRisk = ['metformin', 'nsaid', 'ibuprofen', 'diclofenac', 'naproxen', 'gabapentin', 'pregabalin', 'vancomycin', 'gentamicin', 'amikacin', 'lithium', 'digoxin', 'nitrofurantoin'];
    const hit = renalRisk.find(d => String(medication).toLowerCase().includes(d));
    if (hit && crclVal < 60) {
      warnings.push({
        type: 'dosing',
        severity: crclVal < 30 ? 'severe' : 'warning',
        message: `⚠️ ${medication} requires renal caution — eGFR/CrCl ${crclVal}`,
        recommendation: 'Adjust dose/frequency per renal guidance or choose an alternative agent.',
      });
    }
  }

  return warnings;
}
