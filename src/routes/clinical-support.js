// ═══════════════════════════════════════════════════════════════════════
// CLINICAL DECISION SUPPORT (CDS)
// ═══════════════════════════════════════════════════════════════════════
// Drug interaction checks, allergy cross-referencing, and dosage
// safety alerts — critical for neuro-oncology prescribing.

import { Router } from 'express';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';

export const clinicalRouter = Router();

// ── Drug interaction lookup ────────────────────────────────────────
// Accepts a list of medication names, returns all known interactions.
const interactionSchema = z.object({
  medications: z.array(z.string().min(1).max(200)).min(2).max(20),
});

clinicalRouter.post('/interactions', authenticate, requireRole('doctor', 'admin'),
  validate(interactionSchema),
  asyncHandler(async (req, res) => {
    const meds = req.valid.medications.map(m => m.toLowerCase().trim());

    const interactions = [];
    for (let i = 0; i < meds.length; i++) {
      for (let j = i + 1; j < meds.length; j++) {
        const rows = await db.prepare(`
          SELECT * FROM drug_interactions
          WHERE (drug_a = ? AND drug_b = ?) OR (drug_a = ? AND drug_b = ?)
        `).all(meds[i], meds[j], meds[j], meds[i]);
        interactions.push(...rows);
      }
    }

    // Also check against patient's current active prescriptions
    const activeMeds = await db.prepare(`
      SELECT medication FROM prescriptions WHERE status = 'active'
      GROUP BY medication
    `).all();
    const activeMedNames = activeMeds.map(m => m.medication?.toLowerCase()).filter(Boolean);

    for (const activeMed of activeMedNames) {
      for (const prescribed of meds) {
        if (activeMed === prescribed) continue;
        const rows = await db.prepare(`
          SELECT * FROM drug_interactions
          WHERE (drug_a = ? AND drug_b = ?) OR (drug_a = ? AND drug_b = ?)
        `).all(activeMed, prescribed, prescribed, activeMed);
        if (rows.length > 0) {
          for (const r of rows) {
            if (!interactions.find(x => x.id === r.id)) {
              interactions.push({ ...r, _existingMed: activeMed });
            }
          }
        }
      }
    }

    // Sort by severity
    const order = { severe: 0, moderate: 1, mild: 2 };
    interactions.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    res.json({ ok: true, interactions, totalChecked: meds.length * (meds.length - 1) / 2 });
  })
);

// ── Allergy check for a patient + medication ───────────────────────
const allergyCheckSchema = z.object({
  patientMrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  medications: z.array(z.string().min(1).max(200)),
});

clinicalRouter.post('/allergy-check', authenticate, requireRole('doctor', 'admin'),
  validate(allergyCheckSchema),
  asyncHandler(async (req, res) => {
    const { patientMrn, medications } = req.valid;
    const meds = medications.map(m => m.toLowerCase().trim());

    const allergies = await db.prepare(
      'SELECT * FROM patient_allergies WHERE patient_mrn = ?'
    ).all(patientMrn);

    const alerts = [];
    for (const allergy of allergies) {
      for (const med of meds) {
        // Check exact match or partial match (e.g., "penicillin" matches "amoxicillin")
        if (med.includes(allergy.drug_name) || allergy.drug_name.includes(med) ||
            med === allergy.drug_name) {
          alerts.push({
            allergen: allergy.drug_name,
            medication: med,
            reaction: allergy.reaction,
            severity: allergy.severity,
            message: `⚠️ PATIENT ALLERGY: ${allergy.reaction || 'Unknown reaction'} to ${allergy.drug_name} — prescribed ${med}`,
          });
        }
      }
    }

    // Also check cross-reactivity families
    const crossReactivity = {
      'sulfonamide': ['sulfamethoxazole', 'sulfasalazine', 'celecoxib', 'sumatriptan', 'niprofurantoin'],
      'penicillin': ['amoxicillin', 'ampicillin', 'piperacillin', 'amoxicillin-clavulanate'],
      'nsaid': ['ibuprofen', 'naproxen', 'diclofenac', 'indomethacin', 'meloxicam'],
      'cephalosporin': ['cephalexin', 'ceftriaxone', 'cefuroxime', 'cefdinir'],
      'platinum': ['cisplatin', 'carboplatin', 'oxaliplatin'],
    };

    for (const allergy of allergies) {
      for (const [family, members] of Object.entries(crossReactivity)) {
        if (allergy.drug_name === family || allergy.drug_name.includes(family)) {
          for (const med of meds) {
            if (members.some(m => med.includes(m))) {
              alerts.push({
                allergen: allergy.drug_name,
                medication: med,
                reaction: allergy.reaction,
                severity: allergy.severity,
                crossReactivity: family,
                message: `⚠️ CROSS-REACTIVITY: ${med} belongs to the ${family} family — patient allergic to ${allergy.drug_name}`,
              });
            }
          }
        }
      }
    }

    res.json({ ok: true, alerts, allergyCount: allergies.length });
  })
);

// ── Dosage validation for neuro-oncology drugs ────────────────────
const dosageSchema = z.object({
  medication: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  patientWeight: z.number().positive().optional(),  // kg, for mg/kg calculations
  patientBsa: z.number().positive().optional(),     // m², for mg/m² calculations
  age: z.number().positive().optional(),
});

// Standard dosage ranges for common neuro-oncology drugs
const dosageRanges = {
  'temozolomide': {
    brand: 'Temodar',
    commonDoses: [150, 200],  // mg/m²
    unit: 'mg/m²/day',
    frequency: 'QD × 5 days (28-day cycle)',
    maxDaily: 200,
    renalAdjust: true,
    hepaticAdjust: true,
    notes: 'Reduce dose if ANC < 1.5 or platelets < 100. Take on empty stomach.',
    interactions: ['valproic acid (reduces clearance)', 'dexamethasone (may reduce levels)'],
  },
  'bevacizumab': {
    brand: 'Avastin',
    commonDoses: [10],  // mg/kg
    unit: 'mg/kg',
    frequency: 'Every 2 weeks',
    maxPerDose: 900,
    renalAdjust: false,
    hepaticAdjust: false,
    notes: 'Monitor BP. Contraindicated with recent hemorrhage or perforation.',
    blackBox: 'GI perforation risk, wound dehiscence, hemorrhage',
  },
  'carboplatin': {
    brand: 'Paraplatin',
    unit: 'AUC-based (Calvert formula)',
    formula: 'Dose = Target AUC × (GFR + 25)',
    commonAuc: [5, 6, 7],
    frequency: 'Every 28 days',
    notes: 'Use Calvert formula. Monitor CBC day 21.',
    renalAdjust: true,
  },
  'lomustine': {
    brand: 'CCNU',
    commonDoses: [100, 110, 130],  // mg/m²
    unit: 'mg/m²',
    frequency: 'Every 6 weeks',
    maxPerDose: 130,
    cumulativeLimit: 'Lifetime cumulative dose should not exceed 1100 mg/m²',
    renalAdjust: true,
    notes: 'Myelosuppressive. Check CBC before each dose. Pulmonary toxicity with high cumulative doses.',
  },
  'procarbazine': {
    brand: 'Matulane',
    commonDoses: [60, 100, 150],  // mg/day
    unit: 'mg/day',
    frequency: 'QD × 14 days (28-day cycle)',
    notes: 'MAO inhibitor — strict tyramine-free diet. Avoid sympathomimetics and TCAs.',
    interactions: ['tyramine-rich foods', 'meperidine', 'SSRIs/SNRIs (serotonin syndrome)', ' sympathomimetics'],
  },
  'levetiracetam': {
    brand: 'Keppra',
    commonDoses: [500, 750, 1000, 1500],
    unit: 'mg',
    frequency: 'BID',
    maxDaily: 3000,
    renalAdjust: true,
    notes: 'Taper gradually. Psychiatric side effects (irritability, aggression) possible.',
  },
  'dexamethasone': {
    brand: 'Decadron',
    commonDoses: [2, 4, 8],
    unit: 'mg',
    frequency: 'QD-BID',
    maxDaily: 16,
    notes: 'Taper slowly. Monitor blood glucose, GI prophylaxis. Adrenal suppression risk.',
    interactions: ['NSAIDs (GI bleed risk)', 'CYP3A4 inhibitors (increased levels)'],
  },
  'valproic-acid': {
    brand: 'Depakote',
    commonDoses: [250, 500, 750, 1000],
    unit: 'mg',
    frequency: 'BID-TID',
    maxDaily: 3000,
    hepaticAdjust: true,
    notes: 'Monitor LFTs, ammonia. Teratogenic. Reduces temozolomide clearance.',
    interactions: ['temozolomide (reduces levels)', 'lamotrigine (increases levels)', 'carbapenems (reduces levels)'],
  },
};

clinicalRouter.post('/dosage-check', authenticate, requireRole('doctor', 'admin'),
  validate(dosageSchema),
  asyncHandler(async (req, res) => {
    const { medication, dosage, frequency, patientWeight, patientBsa, age } = req.valid;
    const medLower = medication.toLowerCase().trim();
    const ref = dosageRanges[medLower];

    const alerts = [];
    let reference = null;

    if (ref) {
      reference = ref;

      // Parse numeric dosage
      const doseNum = parseFloat(dosage.replace(/[^0-9.]/g, ''));
      if (!isNaN(doseNum)) {
        if (ref.maxDaily && doseNum > ref.maxDaily) {
          alerts.push({
            severity: 'severe',
            message: `Dose ${doseNum}${ref.unit} exceeds maximum daily dose of ${ref.maxDaily}${ref.unit}`,
          });
        }
        if (ref.maxPerDose && doseNum > ref.maxPerDose) {
          alerts.push({
            severity: 'severe',
            message: `Single dose ${doseNum}${ref.unit} exceeds recommended max of ${ref.maxPerDose}${ref.unit}`,
          });
        }
      }

      if (ref.renalAdjust && !patientWeight) {
        alerts.push({
          severity: 'moderate',
          message: 'Renal dose adjustment may be needed. Consider checking creatinine clearance.',
        });
      }
      if (ref.hepaticAdjust) {
        alerts.push({
          severity: 'moderate',
          message: 'Hepatic dose adjustment may be required. Check LFTs.',
        });
      }
      if (ref.cumulativeLimit) {
        alerts.push({
          severity: 'mild',
          message: `Cumulative dose limit: ${ref.cumulativeLimit}`,
        });
      }
      if (age && age < 3 && medLower === 'temozolomide') {
        alerts.push({
          severity: 'severe',
          message: 'Temozolomide not recommended for children under 3 years.',
        });
      }
    }

    res.json({ ok: true, alerts, reference });
  })
);

// ═══════════════════════════════════════════════════════════════════
// ALLERGY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

// ── Get patient allergies ──────────────────────────────────────────
clinicalRouter.get('/allergies/:mrn', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const mrn = req.params.mrn.toUpperCase();
    const allergies = await db.prepare(
      'SELECT * FROM patient_allergies WHERE patient_mrn = ? ORDER BY created_at DESC'
    ).all(mrn);
    res.json({ ok: true, allergies });
  })
);

// ── Add allergy ────────────────────────────────────────────────────
const addAllergySchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  drugName: z.string().min(1).max(200).transform(s => s.toLowerCase().trim()),
  reaction: z.string().max(500).optional(),
  severity: z.enum(['mild', 'moderate', 'severe', 'anaphylaxis']).optional().default('moderate'),
});

clinicalRouter.post('/allergies', authenticate, requireRole('doctor', 'admin'),
  validate(addAllergySchema),
  asyncHandler(async (req, res) => {
    const { mrn, drugName, reaction, severity } = req.valid;
    const id = randomToken(16);

    await db.prepare(`
      INSERT OR REPLACE INTO patient_allergies (id, patient_mrn, drug_name, reaction, severity)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, mrn, drugName, reaction || null, severity);

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'cds.allergy_add', targetId: mrn,
      detail: { drug: drugName, severity }, ip: req.ip,
    });

    res.status(201).json({ ok: true, message: `Allergy to ${drugName} recorded` });
  })
);

// ── Remove allergy ─────────────────────────────────────────────────
clinicalRouter.delete('/allergies/:id', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const result = await db.prepare('DELETE FROM patient_allergies WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'cds.allergy_remove', targetId: req.params.id, ip: req.ip,
    });

    res.json({ ok: true, message: 'Allergy removed' });
  })
);

// ═══════════════════════════════════════════════════════════════════
// DRUG DATABASE LOOKUP
// ═══════════════════════════════════════════════════════════════════

clinicalRouter.get('/drug-info/:name', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const name = req.params.name.toLowerCase().trim();
    const info = dosageRanges[name];

    // Also check interactions in the DB
    const interactions = await db.prepare(`
      SELECT * FROM drug_interactions
      WHERE drug_a = ? OR drug_b = ?
      ORDER BY CASE severity WHEN 'severe' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END
    `).all(name, name);

    if (!info && interactions.length === 0) {
      return res.status(404).json({ error: 'Drug not found in database' });
    }

    res.json({ ok: true, info: info || null, interactions });
  })
);

// ── Seed drug interactions (called on first run) ───────────────────
export async function seedDrugInteractions() {
  const count = await db.prepare('SELECT COUNT(*) as n FROM drug_interactions').get();
  if (count.n > 0) return; // already seeded

  const now = new Date().toISOString();
  const ins = await db.prepare(`
    INSERT OR IGNORE INTO drug_interactions (id, drug_a, drug_b, severity, description, recommendation, source)
    VALUES (?, ?, ?, ?, ?, ?, 'OncoConnect CDS')
  `);

  const interactions = [
    // Severe
    ['temozolomide', 'valproic acid', 'severe',
      'Valproic acid inhibits UGT, reducing temozolomide clearance by ~35%. May reduce efficacy.',
      'Consider alternative antiepileptic (levetiracetam preferred). If VPA essential, monitor temozolomide levels.'],
    ['procarbazine', 'meperidine', 'severe',
      'Procarbazine is an MAO inhibitor. Meperidine causes fatal serotonin syndrome.',
      'ABSOLUTE CONTRAINDICATION. Use morphine or fentanyl instead.'],
    ['procarbazine', 'ssri', 'severe',
      'MAO inhibitor + SSRI risk of serotonin syndrome (potentially fatal).',
      'Washout period required: 2 weeks between SSRI discontinuation and procarbazine start (5 weeks for fluoxetine).'],
    ['bevacizumab', 'thrombolytics', 'severe',
      'Increased hemorrhage risk. Bevacizumab already carries GI hemorrhage risk.',
      'Avoid concurrent use. Monitor closely for bleeding.'],
    ['carboplatin', 'aminoglycosides', 'severe',
      'Additive nephrotoxicity and ototoxicity.',
      'Monitor renal function closely. Consider alternative antibiotics.'],
    ['dexamethasone', 'nsaid', 'moderate',
      'Concurrent use significantly increases GI ulceration and bleeding risk.',
      'Add GI prophylaxis (PPI). Monitor for GI symptoms.'],
    ['lomustine', 'myelosuppressive agents', 'severe',
      'Additive myelosuppression. CCNU is highly myelosuppressive (nadir 4-6 weeks).',
      'Stagger timing. Check CBC before each cycle. Reduce dose if ANC < 1.5K or platelets < 100K.'],
    ['temozolomide', 'phenytoin', 'moderate',
      'Phenytoin may decrease temozolomide levels via enzyme induction.',
      'Monitor seizure control and temozolomide efficacy. Consider levetiracetam.'],
    ['procarbazine', 'sympathomimetics', 'severe',
      'MAO inhibitor + sympathomimetics → hypertensive crisis.',
      'Avoid all sympathomymetics including nasal decongestants, ADHD meds, and pseudoephedrine.'],

    // Moderate
    ['dexamethasone', 'metformin', 'moderate',
      'Corticosteroids raise blood glucose, counteracting metformin.',
      'Monitor glucose closely. May need insulin adjustment.'],
    ['levetiracetam', 'phenytoin', 'moderate',
      'No significant pharmacokinetic interaction, but both affect seizure threshold differently.',
      'Monitor seizure control. Dose adjustment usually not needed.'],
    ['valproic acid', 'lamotrigine', 'moderate',
      'VPA doubles lamotrigine half-life, increasing risk of Stevens-Johnson syndrome.',
      'Reduce lamotrigine dose by 50% when adding VPA. Titrate slowly.'],
    ['bevacizumab', 'irinotecan', 'moderate',
      'May increase irinotecan exposure (reduced UGT1A1 activity).',
      'Monitor for diarrhea (irinotecan toxicity). Consider dose reduction.'],
    ['carboplatin', 'vancomycin', 'moderate',
      'Both nephrotoxic. Additive kidney injury risk.',
      'Monitor creatinine and urine output. Use lowest effective vancomycin dose.'],
    ['dexamethasone', 'warfarin', 'moderate',
      'Corticosteroids may reduce warfarin anticoagulant effect.',
      'Monitor INR closely during steroid tapers.'],
    ['temozolomide', 'ondansetron', 'mild',
      'QTc prolongation possible with both agents at high doses.',
      'ECG monitoring recommended with concurrent use.'],

    // Mild
    ['levetiracetam', 'methotrexate', 'mild',
      'No significant interaction, but monitor for additive CNS effects.',
      'Usually safe to use together. Monitor for increased sedation.'],
    ['dexamethasone', 'insulin', 'mild',
      'Steroids increase insulin resistance.',
      'May need to increase insulin dose during steroid therapy. Monitor glucose.'],
  ];

  for (const [a, b, sev, desc, rec] of interactions) {
    await ins.run(randomToken(16), a, b, sev, desc, rec);
  }

  console.log(`[CDS] Seeded ${interactions.length} drug interactions`);
}
