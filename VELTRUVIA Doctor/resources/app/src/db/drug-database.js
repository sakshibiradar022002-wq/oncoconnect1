// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA Drug Database — RxNorm-style comprehensive drug data
// ═══════════════════════════════════════════════════════════════════
// Curated clinical data lives below. A generated, reference-only overlay
// (NLM RxNorm + DailyMed) supplies label identity for drugs outside this
// table and resolves brand names to their curated entry — see
// ./drug-labels.js and scripts/enrich-drug-labels.mjs.

import { allLabelEntries, getLabelEntry, normalizeDrugName } from './drug-labels.js';
// 100+ drugs covering neuro-oncology, supportive care, and common
// medications. Each entry includes RxNorm CUI, NDC, class, dosing,
// interactions, contraindications, and monitoring requirements.

export const DRUG_DATABASE = {
  // ═══════════════════════════════════════════════════════════════════
  // CHEMOTHERAPY — Alkylating Agents
  // ═══════════════════════════════════════════════════════════════════
  'temozolomide': {
    rxnormCui: '37776', ndc: '59148-0721-01', brand: 'Temodar',
    generic: 'Temozolomide', class: 'Alkylating agent (imidazotetrazine)',
    route: 'oral', forms: ['capsule 5mg', 'capsule 20mg', 'capsule 100mg', 'capsule 140mg', 'capsule 180mg', 'capsule 250mg'],
    dosing: { standard: '150-200 mg/m²', unit: 'mg/m²/day', frequency: 'Days 1-5 of 28-day cycle', maxDaily: 200 },
    renalAdjust: true, hepaticAdjust: true, pediatricDose: 'Not recommended <3 years',
    blackBox: null, category: 'Pregnancy D',
    interactions: ['valproic acid (reduces clearance ~35%)', 'dexamethasone (may reduce levels)', 'St. John\'s wort (reduces efficacy)'],
    contraindications: ['ANC < 1.5', 'Platelets < 100', 'Severe hepatic impairment (Child-Pugh C)'],
    monitoring: ['CBC weekly during cycle', 'LFTs monthly', 'MRI brain q2-3 months'],
    storage: 'Store at 25°C (77°F)', halfLife: '1.8 hours',
    metabolism: 'Hepatic via P450; non-enzymatic hydrolysis at physiological pH',
    packaging: 'Unit-dose blister packs; light-sensitive',
  },
  'lomustine': {
    rxnormCui: '6466', brand: 'Ceenu', generic: 'Lomustine',
    class: 'Nitrosourea alkylating agent', route: 'oral',
    forms: ['capsule 10mg', 'capsule 40mg', 'capsule 100mg'],
    dosing: { standard: '100-130 mg/m²', unit: 'mg/m²', frequency: 'Every 6 weeks', maxPerDose: 130 },
    cumulativeLimit: 'Lifetime cumulative dose ≤1100 mg/m²',
    renalAdjust: true, category: 'Pregnancy D',
    interactions: ['other myelosuppressive drugs (additive)', 'phenytoin (reduces levels)'],
    contraindications: ['Severe myelosuppression', 'Active infection'],
    monitoring: ['CBC before each dose', 'PFTs with cumulative doses', 'Hepatic function'],
    halfLife: '16-48 hours (variable)',
  },
  'carmustine': {
    rxnormCui: '2105', brand: 'BiCNU', generic: 'Carmustine',
    class: 'Nitrosourea alkylating agent', route: 'IV',
    forms: ['injection 100mg vial'],
    dosing: { standard: '150-200 mg/m²', unit: 'mg/m²', frequency: 'Every 6-8 weeks', cumulativeLimit: 'Lifetime 1200 mg/m²' },
    renalAdjust: true, category: 'Pregnancy D',
    interactions: ['hepatotoxic drugs (additive)', 'live vaccines'],
    monitoring: ['CBC q6 weeks', 'PFTs', 'LFTs'],
  },
  'procarbazine': {
    rxnormCui: '8702', brand: 'Matulane', generic: 'Procarbazine',
    class: 'Methylhydrazine alkylating agent', route: 'oral',
    forms: ['capsule 50mg'],
    dosing: { standard: '60-100 mg/m²', unit: 'mg/day', frequency: 'Days 8-21 of 28-day cycle' },
    interactions: ['MAO inhibitors (contraindicated)', 'meperidine (fatal)', 'SSRIs/SNRIs (serotonin syndrome)', 'sympathomimetics', 'tyramine-rich foods'],
    contraindications: ['MAO inhibitor use', 'Pheochromocytoma'],
    monitoring: ['CBC weekly', 'Tyramine-free diet counseling'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CHEMOTHERAPY — Platinum Agents
  // ═══════════════════════════════════════════════════════════════════
  'cisplatin': {
    rxnormCui: '2555', brand: 'Platinol', generic: 'Cisplatin',
    class: 'Platinum alkylating agent', route: 'IV',
    forms: ['injection 1mg/mL', 'injection 50mg/50mL', 'injection 100mg/100mL'],
    dosing: { standard: '50-100 mg/m²', unit: 'mg/m²', frequency: 'Every 3-4 weeks' },
    renalAdjust: true, category: 'Pregnancy D',
    interactions: ['aminoglycosides (additive nephrotoxicity)', 'ototoxic drugs', 'phenytoin (reduced levels)', 'live vaccines'],
    contraindications: ['Severe renal impairment', 'Severe hearing loss'],
    monitoring: ['Serum creatinine, BUN', 'Electrolytes (Mg²⁺, K⁺)', 'Audiogram', 'GFR before each dose'],
  },
  'carboplatin': {
    rxnormCui: '40048', brand: 'Paraplatin', generic: 'Carboplatin',
    class: 'Platinum alkylating agent', route: 'IV',
    forms: ['injection 10mg/mL', 'injection 150mg/15mL', 'injection 450mg/45mL'],
    dosing: { standard: 'AUC 5-7 (Calvert)', unit: 'AUC', formula: 'Dose = Target AUC × (GFR + 25)', frequency: 'Every 28 days' },
    renalAdjust: true, category: 'Pregnancy D',
    interactions: ['aminoglycosides', 'myelosuppressive drugs (additive)'],
    monitoring: ['CBC day 21', 'Serum creatinine', 'GFR (Calvert formula)'],
  },
  'oxaliplatin': {
    rxnormCui: '32592', brand: 'Eloxatin', generic: 'Oxaliplatin',
    class: 'Platinum alkylating agent', route: 'IV',
    forms: ['injection 50mg vial', 'injection 100mg vial'],
    dosing: { standard: '85-130 mg/m²', unit: 'mg/m²', frequency: 'Every 2 weeks' },
    interactions: ['5-FU (enhanced efficacy)', 'taxanes (additive neuropathy)'],
    monitoring: ['CBC', 'Neurologic assessment', 'Cold sensitivity counseling'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CHEMOTHERAPY — Antimetabolites
  // ═══════════════════════════════════════════════════════════════════
  'methotrexate': {
    rxnormCui: '6851', brand: 'Trexall', generic: 'Methotrexate',
    class: 'Antimetabolite (folate antagonist)', route: 'oral/IV',
    forms: ['tablet 2.5mg', 'tablet 5mg', 'tablet 7.5mg', 'tablet 10mg', 'injection 25mg/mL'],
    dosing: { standard: '15-30 mg/m²', unit: 'mg/m²', frequency: 'Weekly (low-dose) or monthly (high-dose)' },
    renalAdjust: true, category: 'Pregnancy X',
    interactions: ['NSAIDs (reduced clearance)', 'probenecid', 'penicillins', 'trimethoprim (additive myelosuppression)'],
    contraindications: ['Pregnancy', 'Severe renal impairment', 'Pre-existing hepatic disease'],
    monitoring: ['CBC weekly', 'LFTs', 'Serum creatinine', 'Folic acid supplementation'],
  },
  'pemetrexed': {
    rxnormCui: '68446', brand: 'Alimta', generic: 'Pemetrexed',
    class: 'Antimetabolite (folate antagonist)', route: 'IV',
    forms: ['injection 500mg vial'],
    dosing: { standard: '500 mg/m²', unit: 'mg/m²', frequency: 'Every 21 days' },
    renalAdjust: true, interactions: ['NSAIDs (reduced clearance)', 'nephrotoxic drugs'],
    monitoring: ['CBC', 'LFTs', 'Renal function', 'Folic acid + B12 supplementation required'],
  },
  'fluorouracil': {
    rxnormCui: '4492', brand: 'Adrucil', generic: 'Fluorouracil',
    class: 'Antimetabolite (pyrimidine analog)', route: 'IV',
    forms: ['injection 50mg/mL'],
    dosing: { standard: '375-425 mg/m²', unit: 'mg/m²', frequency: 'Daily × 4-5 days (Mayo) or weekly' },
    interactions: ['warfarin (increased INR)', 'cimetidine (reduced clearance)'],
    monitoring: ['CBC weekly', 'Mucositis assessment', 'Hand-foot syndrome monitoring'],
  },
  'capecitabine': {
    rxnormCui: '194000', brand: 'Xeloda', generic: 'Capecitabine',
    class: 'Antimetabolite (oral 5-FU prodrug)', route: 'oral',
    forms: ['tablet 150mg', 'tablet 500mg'],
    dosing: { standard: '1000-1250 mg/m²', unit: 'mg/m² BID', frequency: 'Days 1-14 of 21-day cycle' },
    interactions: ['warfarin (increased INR)', 'leucovorin (increased toxicity)'],
    monitoring: ['CBC', 'Hand-foot syndrome assessment', 'LFTs'],
  },
  'cytarabine': {
    rxnormCui: '3041', brand: 'Cytosar-U', generic: 'Cytarabine',
    class: 'Antimetabolite (pyrimidine analog)', route: 'IV/IT',
    forms: ['injection 20mg/mL', 'injection 100mg/mL', 'injection 500mg/mL', 'injection 1g vial', 'injection 2g vial'],
    dosing: { standard: '100-200 mg/m²', unit: 'mg/m²', frequency: 'Continuous infusion × 7 days' },
    interactions: ['live vaccines', 'digoxin (reduced levels)'],
    monitoring: ['CBC daily during infusion', 'LFTs', 'Neurologic assessment (IT doses)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CHEMOTHERAPY — Plant Alkaloids
  // ═══════════════════════════════════════════════════════════════════
  'vincristine': {
    rxnormCui: '11202', brand: 'Oncovin', generic: 'Vincristine',
    class: 'Vinca alkaloid (mitotic inhibitor)', route: 'IV',
    forms: ['injection 1mg/mL', 'injection 5mg/mL (Oncovin)'],
    dosing: { standard: '1.4 mg/m²', unit: 'mg/m²', frequency: 'Weekly or every 2 weeks', maxPerDose: 2.0 },
    category: 'Pregnancy D',
    interactions: ['live vaccines', 'CYP3A4 inhibitors (increased toxicity)'],
    contraindications: ['NEVER give intrathecally (FATAL)'],
    monitoring: ['Neurologic assessment (reflexes, sensation)', 'Jaw pain', 'Constipation monitoring'],
  },
  'vinblastine': {
    rxnormCui: '11198', brand: 'Velban', generic: 'Vinblastine',
    class: 'Vinca alkaloid', route: 'IV',
    forms: ['injection 1mg/mL', 'injection 10mg vial'],
    dosing: { standard: '6 mg/m²', unit: 'mg/m²', frequency: 'Weekly' },
    monitoring: ['CBC', 'Neurologic assessment'],
  },
  'etoposide': {
    rxnormCui: '4179', brand: 'VePesid', generic: 'Etoposide',
    class: 'Topoisomerase II inhibitor', route: 'IV/oral',
    forms: ['injection 20mg/mL', 'capsule 50mg'],
    dosing: { standard: '50-100 mg/m²', unit: 'mg/m²', frequency: 'Days 1-5 of 21-day cycle' },
    renalAdjust: true, category: 'Pregnancy D',
    interactions: ['warfarin (increased INR)', 'cyclosporine (additive toxicity)'],
    monitoring: ['CBC day 7-14', 'Blood pressure (rapid infusion)'],
  },
  'irinotecan': {
    rxnormCui: '51499', brand: 'Camptosar', generic: 'Irinotecan',
    class: 'Topoisomerase I inhibitor', route: 'IV',
    forms: ['injection 20mg/mL', 'injection 50mg/25mL', 'injection 100mg/50mL'],
    dosing: { standard: '125-350 mg/m²', unit: 'mg/m²', frequency: 'Weekly or every 2 weeks', maxPerDose: 350 },
    interactions: ['CYP3A4 inhibitors (increased toxicity)', 'CYP3A4 inducers (reduced efficacy)'],
    monitoring: ['UGT1A1 genotype', 'Cholinergic syndrome management', 'Diarrhea protocol'],
  },
  'topotecan': {
    rxnormCui: '57308', brand: 'Hycamtin', generic: 'Topotecan',
    class: 'Topoisomerase I inhibitor', route: 'IV',
    forms: ['injection 1mg/mL'],
    dosing: { standard: '1.5 mg/m²', unit: 'mg/m²', frequency: 'Days 1-5 of 21-day cycle' },
    renalAdjust: true, monitoring: ['CBC weekly', 'Diarrhea assessment'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CHEMOTHERAPY — Anthracyclines & Cytotoxics
  // ═══════════════════════════════════════════════════════════════════
  'doxorubicin': {
    rxnormCui: '3639', brand: 'Adriamycin', generic: 'Doxorubicin',
    class: 'Anthracycline antibiotic', route: 'IV',
    forms: ['injection 2mg/mL', 'injection 10mg vial', 'injection 50mg vial', 'injection 200mg vial'],
    dosing: { standard: '50-75 mg/m²', unit: 'mg/m²', frequency: 'Every 21-28 days', cumulativeLimit: '550 mg/m² (450 with radiation)' },
    category: 'Pregnancy D',
    interactions: ['trastuzumab (additive cardiotoxicity)', 'dexrazoxane (cardioprotectant)'],
    monitoring: ['Echocardiogram baseline + q3 months', 'CBC', 'Urine red discoloration (not harmful)'],
  },
  'paclitaxel': {
    rxnormCui: '56946', brand: 'Taxol', generic: 'Paclitaxel',
    class: 'Taxane', route: 'IV',
    forms: ['injection 6mg/mL'],
    dosing: { standard: '175-200 mg/m²', unit: 'mg/m²', frequency: 'Every 3 weeks' },
    interactions: ['CYP3A4 inhibitors (reduced clearance)', 'carboplatin (synergistic)'],
    monitoring: ['Premedication (dexamethasone + diphenhydramine)', 'CBC', 'Neuropathy assessment'],
  },
  'docetaxel': {
    rxnormCui: '72962', brand: 'Taxotere', generic: 'Docetaxel',
    class: 'Taxane', route: 'IV',
    forms: ['injection 20mg/mL', 'injection 40mg vial', 'injection 80mg vial'],
    dosing: { standard: '60-100 mg/m²', unit: 'mg/m²', frequency: 'Every 3 weeks' },
    interactions: ['CYP3A4 inhibitors/inducers'],
    monitoring: ['Premedication (dexamethasone)', 'CBC', 'Fluid retention assessment', 'Nail changes'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // TARGETED THERAPY
  // ═══════════════════════════════════════════════════════════════════
  'bevacizumab': {
    rxnormCui: '253337', brand: 'Avastin', generic: 'Bevacizumab',
    class: 'Anti-VEGF monoclonal antibody', route: 'IV',
    forms: ['injection 25mg/mL (100mL)', 'injection 25mg/mL (400mL)'],
    dosing: { standard: '10 mg/kg', unit: 'mg/kg', frequency: 'Every 2 weeks', maxPerDose: 900 },
    interactions: ['irinotecan (enhanced efficacy in GBM)'],
    contraindications: ['GI perforation risk', 'Recent hemorrhage', 'Wound healing issues'],
    monitoring: ['Blood pressure q2 weeks', 'Urine protein', 'Wound healing assessment'],
    blackBox: 'GI perforation risk, wound dehiscence, hemorrhage',
  },
  'erlotinib': {
    rxnormCui: '337525', brand: 'Tarceva', generic: 'Erlotinib',
    class: 'EGFR tyrosine kinase inhibitor', route: 'oral',
    forms: ['tablet 25mg', 'tablet 100mg', 'tablet 150mg'],
    dosing: { standard: '150 mg', unit: 'mg', frequency: 'Daily' },
    interactions: ['CYP3A4 inhibitors (increased levels)', 'CYP3A4 inducers (reduced levels)', 'proton pump inhibitors (reduced absorption)'],
    monitoring: ['Rash assessment', 'LFTs monthly', 'PFTs if dyspnea'],
  },
  'gefitinib': {
    rxnormCui: '328134', brand: 'Iressa', generic: 'Gefitinib',
    class: 'EGFR tyrosine kinase inhibitor', route: 'oral',
    forms: ['tablet 250mg'],
    dosing: { standard: '250 mg', unit: 'mg', frequency: 'Daily' },
    interactions: ['CYP3A4 inhibitors/inducers', 'PPIs (reduced absorption)'],
  },
  'dabrafenib': {
    rxnormCui: '1424911', brand: 'Tafinlar', generic: 'Dabrafenib',
    class: 'BRAF inhibitor', route: 'oral',
    forms: ['capsule 50mg', 'capsule 75mg'],
    dosing: { standard: '150 mg BID', unit: 'mg BID', frequency: 'Twice daily' },
    interactions: ['CYP3A4 substrates (reduced levels of co-medications)'],
    monitoring: ['Echocardiogram (cardiomyopathy)', 'Uric acid', 'Skin exams'],
  },
  'trametinib': {
    rxnormCui: '1425099', brand: 'Mekinist', generic: 'Trametinib',
    class: 'MEK inhibitor', route: 'oral',
    forms: ['tablet 0.5mg', 'tablet 1mg', 'tablet 2mg'],
    dosing: { standard: '2 mg', unit: 'mg', frequency: 'Daily' },
    interactions: ['CYP3A4 inhibitors/inducers'],
    monitoring: ['Echocardiogram (LVEF)', 'Blood pressure', 'Ophthalmologic exam'],
  },
  'vorasidenib': {
    rxnormCui: '2690647', brand: 'Voranigo', generic: 'Vorasidenib',
    class: 'Dual IDH1/IDH2 inhibitor', route: 'oral',
    forms: ['tablet 10mg', 'tablet 40mg'],
    dosing: { standard: '40 mg', unit: 'mg', frequency: 'Daily' },
    interactions: ['Strong CYP3A4 inhibitors/inducers'],
    monitoring: ['LFTs', 'MRI brain q2-4 months'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // MONOCLONAL ANTIBODIES
  // ═══════════════════════════════════════════════════════════════════
  'rituximab': {
    rxnormCui: '121191', brand: 'Rituxan', generic: 'Rituximab',
    class: 'Anti-CD20 monoclonal antibody', route: 'IV',
    forms: ['injection 10mg/mL (10mL)', 'injection 10mg/mL (50mL)'],
    dosing: { standard: '375 mg/m²', unit: 'mg/m²', frequency: 'Weekly × 4' },
    interactions: ['live vaccines (contraindicated 12 months)', 'cisplatin (renal toxicity)'],
    monitoring: ['Hepatitis B reactivation screen', 'Tumor lysis syndrome monitoring', 'Infusion reaction kit available'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Anticonvulsants
  // ═══════════════════════════════════════════════════════════════════
  'levetiracetam': {
    rxnormCui: '114477', brand: 'Keppra', generic: 'Levetiracetam',
    class: 'Anticonvulsant', route: 'oral/IV',
    forms: ['tablet 250mg', 'tablet 500mg', 'tablet 750mg', 'tablet 1000mg', 'oral solution 100mg/mL', 'injection 500mg/5mL', 'injection 1500mg/15mL'],
    dosing: { standard: '500-1500 mg', unit: 'mg', frequency: 'BID', maxDaily: 3000 },
    renalAdjust: true, interactions: [],
    monitoring: ['Psychiatric symptoms (irritability, aggression)', 'Renal function'],
  },
  'valproic-acid': {
    rxnormCui: '11118', brand: 'Depakote', generic: 'Valproic acid',
    class: 'Anticonvulsant (broad-spectrum)', route: 'oral/IV',
    forms: ['capsule 250mg', 'capsule 500mg', 'tablet delayed-release 125mg', 'tablet delayed-release 250mg', 'tablet delayed-release 500mg', 'oral syrup 250mg/5mL', 'injection 100mg/mL'],
    dosing: { standard: '250-1000 mg', unit: 'mg', frequency: 'BID-TID', maxDaily: 3000 },
    hepaticAdjust: true, category: 'Pregnancy D',
    interactions: ['temozolomide (reduces levels ~35%)', 'lamotrigine (increases levels — risk of SJS)', 'carbapenems (reduces levels)', 'phenytoin (bidirectional)'],
    monitoring: ['LFTs monthly', 'Ammonia level', 'Therapeutic drug monitoring (50-100 mcg/mL)', 'Teratogenicity counseling'],
  },
  'phenytoin': {
    rxnormCui: '8183', brand: 'Dilantin', generic: 'Phenytoin',
    class: 'Anticonvulsant', route: 'oral/IV',
    forms: ['capsule 30mg', 'capsule 100mg', 'capsule 200mg', 'capsule 300mg', 'oral suspension 25mg/5mL', 'injection 50mg/mL'],
    dosing: { standard: '300-400 mg', unit: 'mg', frequency: 'BID-TID', maxDaily: 600 },
    interactions: ['warfarin (reduced levels)', 'dexamethasone (reduced levels)', 'many drugs via CYP induction'],
    monitoring: ['Drug levels (10-20 mcg/mL)', ' Gingival hyperplasia', 'Folate levels'],
  },
  'gabapentin': {
    rxnormCui: '25480', brand: 'Neurontin', generic: 'Gabapentin',
    class: 'Anticonvulsant/Analgesic', route: 'oral',
    forms: ['capsule 100mg', 'capsule 300mg', 'capsule 400mg', 'tablet 600mg', 'tablet 800mg', 'oral solution 250mg/5mL'],
    dosing: { standard: '300-800 mg', unit: 'mg', frequency: 'TID', maxDaily: 3600 },
    renalAdjust: true, interactions: ['antacids (reduced absorption)', 'opioids (additive sedation)'],
  },
  'pregabalin': {
    rxnormCui: '187832', brand: 'Lyrica', generic: 'Pregabalin',
    class: 'Anticonvulsant/Analgesic', route: 'oral',
    forms: ['capsule 25mg', 'capsule 50mg', 'capsule 75mg', 'capsule 100mg', 'capsule 150mg', 'capsule 225mg', 'capsule 300mg'],
    dosing: { standard: '75-300 mg', unit: 'mg', frequency: 'BID', maxDaily: 600 },
    renalAdjust: true, interactions: ['opioids (respiratory depression risk)'],
    monitoring: ['Weight gain', 'Edema', 'Controlled substance monitoring'],
  },
  'lacosamide': {
    rxnormCui: '623400', brand: 'Vimpat', generic: 'Lacosamide',
    class: 'Anticonvulsant', route: 'oral/IV',
    forms: ['tablet 50mg', 'tablet 100mg', 'tablet 150mg', 'tablet 200mg', 'oral solution 10mg/mL', 'injection 200mg/20mL'],
    dosing: { standard: '100-200 mg', unit: 'mg', frequency: 'BID', maxDaily: 400 },
    interactions: ['CYP2C19 inhibitors (increased levels)'],
    monitoring: ['ECG (PR interval)', 'Dizziness assessment'],
  },
  'lamotrigine': {
    rxnormCui: '28439', brand: 'Lamictal', generic: 'Lamotrigine',
    class: 'Anticonvulsant/Mood stabilizer', route: 'oral',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg', 'tablet 200mg', 'chewable dispersible 2mg', 'chewable dispersible 5mg', 'chewable dispersible 25mg'],
    dosing: { standard: '25-200 mg', unit: 'mg', frequency: 'BID', maxDaily: 400 },
    interactions: ['valproic acid (increased levels — must start low)', 'carbamazepine (reduced levels)', 'oral contraceptives (reduced levels)'],
    monitoring: ['Slow titration required (rash risk)', 'DRESS syndrome monitoring'],
  },
  'oxcarbazepine': {
    rxnormCui: '32624', brand: 'Trileptal', generic: 'Oxcarbazepine',
    class: 'Anticonvulsant', route: 'oral',
    forms: ['tablet 150mg', 'tablet 300mg', 'tablet 600mg', 'oral suspension 300mg/5mL'],
    dosing: { standard: '300-600 mg', unit: 'mg', frequency: 'BID', maxDaily: 2400 },
    interactions: ['CYP3A4 substrates', 'Hormonal contraceptives (reduced efficacy)'],
    monitoring: ['Sodium levels (hyponatremia risk)', 'LFTs'],
  },
  'topiramate': {
    rxnormCui: '38404', brand: 'Topamax', generic: 'Topiramate',
    class: 'Anticonvulsant', route: 'oral',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg', 'tablet 200mg', 'capsule sprinkle 15mg', 'capsule sprinkle 25mg'],
    dosing: { standard: '50-200 mg', unit: 'mg', frequency: 'BID', maxDaily: 400 },
    interactions: ['Valproic acid (increased levels)', 'Oral contraceptives (reduced efficacy)'],
    monitoring: ['Kidney stones screening', 'Metabolic acidosis', 'Cognitive assessment'],
  },
  'zonisamide': {
    rxnormCui: '39998', brand: 'Zonegran', generic: 'Zonisamide',
    class: 'Anticonvulsant', route: 'oral',
    forms: ['capsule 25mg', 'capsule 50mg', 'capsule 100mg'],
    dosing: { standard: '100-300 mg', unit: 'mg', frequency: 'BID', maxDaily: 600 },
    interactions: ['Phenytoin (bidirectional)', 'Carbonic anhydrase inhibitors (additive)'],
    monitoring: ['Kidney stones', 'Sulfonamide allergy screen'],
  },
  'brivaracetam': {
    rxnormCui: '1739745', brand: 'Briviact', generic: 'Brivaracetam',
    class: 'Anticonvulsant (SV2A ligand)', route: 'oral/IV',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 75mg', 'tablet 100mg', 'injection 50mg/mL'],
    dosing: { standard: '50-100 mg', unit: 'mg', frequency: 'BID', maxDaily: 400 },
    interactions: ['Rifampin (reduced levels)', 'Phenytoin (bidirectional)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // STEROIDS & HORMONES
  // ═══════════════════════════════════════════════════════════════════
  'dexamethasone': {
    rxnormCui: '3264', brand: 'Decadron', generic: 'Dexamethasone',
    class: 'Corticosteroid', route: 'oral/IV',
    forms: ['tablet 0.5mg', 'tablet 0.75mg', 'tablet 1mg', 'tablet 1.5mg', 'tablet 2mg', 'tablet 4mg', 'injection 4mg/mL'],
    dosing: { standard: '2-16 mg', unit: 'mg', frequency: 'QD-BID', maxDaily: 16 },
    interactions: ['NSAIDs (GI bleed risk)', 'CYP3A4 inhibitors (increased levels)', 'Live vaccines'],
    monitoring: ['Blood glucose', 'GI prophylaxis', 'Bone density', 'Adrenal suppression taper'],
  },
  'methylprednisolone': {
    rxnormCui: '6902', brand: 'Solu-Medrol', generic: 'Methylprednisolone',
    class: 'Corticosteroid', route: 'IV/oral',
    forms: ['tablet 4mg', 'tablet 8mg', 'tablet 16mg', 'injection 40mg/mL', 'injection 125mg/mL', 'injection 500mg vial', 'injection 1g vial'],
    dosing: { standard: '40-1000 mg', unit: 'mg', frequency: 'Daily or pulse' },
    interactions: ['NSAIDs', 'Live vaccines'],
    monitoring: ['Blood glucose', 'Electrolytes', 'GI prophylaxis'],
  },
  'hydrocortisone': {
    rxnormCui: '5492', brand: 'Solu-Cortef', generic: 'Hydrocortisone',
    class: 'Corticosteroid', route: 'oral/IV/IM',
    forms: ['tablet 5mg', 'tablet 10mg', 'tablet 20mg', 'injection 50mg/mL', 'injection 100mg/mL', 'injection 250mg/mL'],
    dosing: { standard: '20-80 mg', unit: 'mg', frequency: 'QD-BID' },
  },
  'prednisone': {
    rxnormCui: '8640', brand: 'Deltasone', generic: 'Prednisone',
    class: 'Corticosteroid (prodrug)', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'tablet 20mg', 'tablet 50mg'],
    dosing: { standard: '5-60 mg', unit: 'mg', frequency: 'QD-BID' },
    interactions: ['NSAIDs', 'Live vaccines'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Antiemetics
  // ═══════════════════════════════════════════════════════════════════
  'ondansetron': {
    rxnormCui: '26225', brand: 'Zofran', generic: 'Ondansetron',
    class: '5-HT3 antagonist', route: 'oral/IV',
    forms: ['tablet 4mg', 'tablet 8mg', 'orally disintegrating tablet 4mg', 'orally disintegrating tablet 8mg', 'injection 2mg/mL', 'injection 4mg/2mL'],
    dosing: { standard: '4-8 mg', unit: 'mg', frequency: 'Q8H PRN' },
    interactions: ['SSRIs/SNRIs (serotonin syndrome risk)', ' QT-prolonging drugs'],
    monitoring: ['ECG if QTc > 470ms', 'Constipation'],
  },
  'granisetron': {
    rxnormCui: '26237', brand: 'Kytril', generic: 'Granisetron',
    class: '5-HT3 antagonist', route: 'oral/IV',
    forms: ['tablet 1mg', 'injection 1mg/mL'],
    dosing: { standard: '1-2 mg', unit: 'mg', frequency: 'Q12H' },
  },
  'aprepitant': {
    rxnormCui: '358255', brand: 'Emend', generic: 'Aprepitant',
    class: 'NK1 receptor antagonist', route: 'oral',
    forms: ['capsule 40mg', 'capsule 80mg', 'capsule 125mg'],
    dosing: { standard: 'Day 1: 125mg, Days 2-3: 80mg', unit: 'mg', frequency: 'Daily × 3 days' },
    interactions: ['Dexamethasone (increased levels — reduce dose)', 'Warfarin (reduced INR)', 'CYP3A4 substrates'],
    monitoring: ['CYP3A4 interaction awareness'],
  },
  'palonosetron': {
    rxnormCui: '70561', brand: 'Aloxi', generic: 'Palonosetron',
    class: '5-HT3 antagonist (long-acting)', route: 'IV',
    forms: ['injection 0.25mg/5mL'],
    dosing: { standard: '0.25 mg', unit: 'mg', frequency: 'Every 3 days' },
  },
  'lorazepam': {
    rxnormCui: '6470', brand: 'Ativan', generic: 'Lorazepam',
    class: 'Benzodiazepine (antiemetic adjunct)', route: 'oral/IV',
    forms: ['tablet 0.5mg', 'tablet 1mg', 'tablet 2mg', 'injection 2mg/mL'],
    dosing: { standard: '0.5-2 mg', unit: 'mg', frequency: 'Q6H PRN' },
    interactions: ['Opioids (respiratory depression)', 'Alcohol (CNS depression)'],
    monitoring: ['Respiratory rate', 'Sedation level', 'Fall risk'],
  },
  'prochlorperazine': {
    rxnormCui: '8704', brand: 'Compazine', generic: 'Prochlorperazine',
    class: 'Dopamine antagonist', route: 'oral/IV/IM',
    forms: ['tablet 5mg', 'tablet 10mg', 'suppository 25mg', 'injection 5mg/mL'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'Q6H PRN' },
    monitoring: ['EPS assessment', 'QTc if IV', 'AKA risk'],
  },
  'metoclopramide': {
    rxnormCui: '6915', brand: 'Reglan', generic: 'Metoclopramide',
    class: 'Dopamine antagonist (prokinetic)', route: 'oral/IV',
    forms: ['tablet 5mg', 'tablet 10mg', 'injection 5mg/mL'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'Q6H PRN' },
    interactions: ['Dopamine agonists (reduced efficacy)', 'SSRIs (serotonin syndrome risk)'],
    monitoring: ['EPS/Tardive dyskinesia screening', 'QTc'],
  },
  'dronabinol': {
    rxnormCui: '10402', brand: 'Marinol', generic: 'Dronabinol',
    class: 'Cannabinoid (antiemetic)', route: 'oral',
    forms: ['capsule 2.5mg', 'capsule 5mg', 'capsule 10mg'],
    dosing: { standard: '2.5-5 mg', unit: 'mg', frequency: 'Q6H PRN' },
    monitoring: ['Psychiatric effects', 'Driving impairment counseling'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Pain Management
  // ═══════════════════════════════════════════════════════════════════
  'morphine': {
    rxnormCui: '7052', brand: 'MS Contin', generic: 'Morphine',
    class: 'Opioid analgesic', route: 'oral/IV',
    forms: ['tablet 15mg', 'tablet 30mg', 'extended-release tablet 15mg', 'extended-release tablet 30mg', 'extended-release tablet 60mg', 'solution 10mg/5mL', 'injection 10mg/mL'],
    dosing: { standard: '5-15 mg', unit: 'mg', frequency: 'Q4H PRN' },
    interactions: ['Benzodiazepines (respiratory depression)', 'MAO inhibitors (serotonin syndrome)', 'Alcohol'],
    monitoring: ['Respiratory rate', 'Sedation (PAS scale)', 'Bowel regimen', 'PRN naloxone availability'],
  },
  'oxycodone': {
    rxnormCui: '7804', brand: 'OxyContin', generic: 'Oxycodone',
    class: 'Opioid analgesic', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'tablet 15mg', 'tablet 20mg', 'extended-release tablet 10mg', 'extended-release tablet 15mg', 'extended-release tablet 20mg', 'extended-release tablet 30mg', 'extended-release tablet 40mg', 'capsule 5mg'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'Q4-6H PRN' },
    interactions: ['Benzodiazepines', 'MAO inhibitors', 'Serotonergic drugs'],
    monitoring: ['Urine drug screen', 'Morphine equivalence tracking'],
  },
  'hydromorphone': {
    rxnormCui: '3423', brand: 'Dilaudid', generic: 'Hydromorphone',
    class: 'Opioid analgesic', route: 'oral/IV',
    forms: ['tablet 2mg', 'tablet 4mg', 'tablet 8mg', 'injection 1mg/mL', 'injection 2mg/mL', 'injection 10mg/mL'],
    dosing: { standard: '2-4 mg', unit: 'mg', frequency: 'Q3-4H PRN' },
    monitoring: ['Same as morphine'],
  },
  'fentanyl': {
    rxnormCui: '4337', brand: 'Sublimaze', generic: 'Fentanyl',
    class: 'Opioid analgesic (potent)', route: 'IV/transdermal/oral',
    forms: ['injection 50mcg/mL', 'transdermal patch 12mcg/h', 'transdermal patch 25mcg/h', 'transdermal patch 50mcg/h', 'transdermal patch 75mcg/h', 'transdermal patch 100mcg/h', 'oral lozenge 200mcg', 'oral lozenge 400mcg', 'oral lozenge 600mcg', 'oral lozenge 800mcg', 'oral lozenge 1200mcg', 'oral lozenge 1600mcg'],
    dosing: { standard: '25-50 mcg', unit: 'mcg', frequency: 'Q1-2H PRN (IV)' },
    interactions: ['Benzodiazepines', 'CYP3A4 inhibitors (increased levels)'],
    monitoring: ['Continuous pulse oximetry (IV)', 'Strict prescription monitoring'],
  },
  'acetaminophen': {
    rxnormCui: '161', brand: 'Tylenol', generic: 'Acetaminophen',
    class: 'Non-opioid analgesic', route: 'oral/IV',
    forms: ['tablet 325mg', 'tablet 500mg', 'tablet 650mg', 'tablet 1000mg', 'oral suspension 160mg/5mL', 'oral suspension 500mg/5mL', 'injection 1000mg/100mL'],
    dosing: { standard: '325-1000 mg', unit: 'mg', frequency: 'Q4-6H', maxDaily: 3000 },
    interactions: ['Warfarin (increased INR at high doses)', 'Isoniazid (hepatotoxicity)'],
    monitoring: ['Hepatic function if chronic use', 'Total daily dose tracking'],
  },
  'ibuprofen': {
    rxnormCui: '5640', brand: 'Advil', generic: 'Ibuprofen',
    class: 'NSAID', route: 'oral',
    forms: ['tablet 200mg', 'tablet 400mg', 'tablet 600mg', 'tablet 800mg'],
    dosing: { standard: '200-800 mg', unit: 'mg', frequency: 'Q6-8H', maxDaily: 3200 },
    interactions: ['Anticoagulants (increased bleeding)', 'Lithium (increased levels)', 'Methotrexate (reduced clearance)'],
    monitoring: ['GI symptoms', 'Renal function', 'Blood pressure'],
  },
  'celecoxib': {
    rxnormCui: '140587', brand: 'Celebrex', generic: 'Celecoxib',
    class: 'COX-2 selective NSAID', route: 'oral',
    forms: ['capsule 100mg', 'capsule 200mg', 'capsule 400mg'],
    dosing: { standard: '100-200 mg', unit: 'mg', frequency: 'BID' },
    interactions: ['Sulfonamide allergy (cross-reactivity)', 'Warfarin', 'Lithium'],
  },
  'tramadol': {
    rxnormCui: '10689', brand: 'Ultram', generic: 'Tramadol',
    class: 'Weak opioid / SNRI', route: 'oral',
    forms: ['tablet 50mg', 'extended-release tablet 100mg', 'extended-release tablet 200mg', 'extended-release tablet 300mg'],
    dosing: { standard: '50-100 mg', unit: 'mg', frequency: 'Q6H PRN', maxDaily: 400 },
    interactions: ['SSRIs/SNRIs (serotonin syndrome)', 'Tricyclics (serotonin syndrome)', 'MAO inhibitors', 'Benzodiazepines'],
    monitoring: ['Seizure threshold', 'Serotonin syndrome symptoms'],
  },
  'gabapentin-enacarbil': {
    rxnormCui: '1101333', brand: 'Horizant', generic: 'Gabapentin enacarbil',
    class: 'Anticonvulsant (prodrug of gabapentin)', route: 'oral',
    forms: ['tablet 300mg', 'tablet 600mg'],
    dosing: { standard: '600 mg', unit: 'mg', frequency: 'BID' },
    renalAdjust: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — GI
  // ═══════════════════════════════════════════════════════════════════
  'pantoprazole': {
    rxnormCui: '40790', brand: 'Protonix', generic: 'Pantoprazole',
    class: 'Proton pump inhibitor', route: 'oral/IV',
    forms: ['tablet 20mg', 'tablet 40mg', 'injection 40mg/vial'],
    dosing: { standard: '20-40 mg', unit: 'mg', frequency: 'QD (IV or PO)' },
    interactions: ['Methotrexate (reduced clearance)', 'Mycophenolate (reduced levels)'],
    monitoring: ['B12 levels (long-term)', 'Magnesium (long-term)', 'Bone density'],
  },
  'omeprazole': {
    rxnormCui: '7646', brand: 'Prilosec', generic: 'Omeprazole',
    class: 'Proton pump inhibitor', route: 'oral',
    forms: ['capsule 10mg', 'capsule 20mg', 'capsule 40mg'],
    dosing: { standard: '20-40 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Clopidogrel (reduced activation)', 'Methotrexate'],
  },
  'famotidine': {
    rxnormCui: '4278', brand: 'Pepcid', generic: 'Famotidine',
    class: 'H2 receptor antagonist', route: 'oral/IV',
    forms: ['tablet 20mg', 'tablet 40mg', 'injection 20mg/2mL'],
    dosing: { standard: '20-40 mg', unit: 'mg', frequency: 'Q12H' },
  },
  'sucralfate': {
    rxnormCui: '10156', brand: 'Carafate', generic: 'Sucralfate',
    class: 'Mucosal protectant', route: 'oral',
    forms: ['tablet 1g'],
    dosing: { standard: '1 g', unit: 'g', frequency: 'Q6H on empty stomach' },
    interactions: ['PPIs (reduced absorption)', 'Fluoroquinolones (reduced absorption)'],
  },
  'docusate': {
    rxnormCui: '71722', brand: 'Colace', generic: 'Docusate sodium',
    class: 'Stool softener', route: 'oral',
    forms: ['capsule 50mg', 'capsule 100mg'],
    dosing: { standard: '100 mg', unit: 'mg', frequency: 'BID' },
  },
  'senna': {
    rxnormCui: '36387', brand: 'Senokot', generic: 'Senna',
    class: 'Stimulant laxative', route: 'oral',
    forms: ['tablet 8.6mg', 'tablet 17.2mg', 'oral syrup 8.8mg/5mL'],
    dosing: { standard: '8.6-17.2 mg', unit: 'mg', frequency: 'QHS PRN' },
  },
  'ondansetron-prn': {
    rxnormCui: '26225', brand: 'Zofran ODT', generic: 'Ondansetron ODT',
    class: '5-HT3 antagonist (orally disintegrating)', route: 'oral',
    forms: ['ODT 4mg', 'ODT 8mg'],
    dosing: { standard: '4-8 mg', unit: 'mg', frequency: 'Q8H PRN' },
  },
  'alosetron': {
    rxnormCui: '85248', brand: 'Lotronex', generic: 'Alosetron',
    class: '5-HT3 antagonist (GI-specific)', route: 'oral',
    forms: ['tablet 0.5mg', 'tablet 1mg'],
    dosing: { standard: '0.5-1 mg', unit: 'mg', frequency: 'BID' },
    contraindications: ['IBS-D history of complications'],
  },
  'loperamide': {
    rxnormCui: '6468', brand: 'Imodium', generic: 'Loperamide',
    class: 'Antidiarrheal (peripheral opioid)', route: 'oral',
    forms: ['capsule 2mg', 'oral solution 1mg/5mL'],
    dosing: { standard: '2-4 mg', unit: 'mg', frequency: 'After each loose stool', maxDaily: 16 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Hematologic
  // ═══════════════════════════════════════════════════════════════════
  'filgrastim': {
    rxnormCui: '68442', brand: 'Neupogen', generic: 'Filgrastim',
    class: 'G-CSF', route: 'SC',
    forms: ['injection 300mcg/mL (0.5mL)', 'injection 300mcg/mL (0.8mL)', 'injection 480mcg/mL (0.8mL)'],
    dosing: { standard: '5 mcg/kg', unit: 'mcg/kg', frequency: 'Daily SC until ANC > 10,000' },
    monitoring: ['CBC with differential', 'Bone pain assessment'],
  },
  'pegfilgrastim': {
    rxnormCui: '338036', brand: 'Neulasta', generic: 'Pegfilgrastim',
    class: 'PEGylated G-CSF', route: 'SC',
    forms: ['injection 6mg/0.6mL prefilled syringe', 'injection 6mg/0.6mL Onpro device'],
    dosing: { standard: '6 mg', unit: 'mg', frequency: 'Once per cycle (24h post-chemo)' },
  },
  'epoetin-alfa': {
    rxnormCui: '105694', brand: 'Epogen', generic: 'Epoetin alfa',
    class: 'Erythropoiesis-stimulating agent', route: 'SC/IV',
    forms: ['injection 2000 IU/mL', 'injection 3000 IU/mL', 'injection 4000 IU/mL', 'injection 10000 IU/mL', 'injection 20000 IU/mL'],
    dosing: { standard: '50-300 IU/kg', unit: 'IU/kg', frequency: '3×/week' },
    monitoring: ['Hemoglobin target 10-11 g/dL', 'Iron studies', 'Blood pressure'],
  },
  'iron-sucrose': {
    rxnormCui: '24909', brand: 'Venofer', generic: 'Iron sucrose',
    class: 'Iron supplement (IV)', route: 'IV',
    forms: ['injection 20mg/mL (2.5mL)', 'injection 20mg/mL (5mL)', 'injection 20mg/mL (10mL)'],
    dosing: { standard: '200 mg', unit: 'mg', frequency: 'Every 2-3 days' },
    monitoring: ['Hemoglobin', 'Ferritin', 'Anaphylaxis monitoring during infusion'],
  },
  'tranexamic-acid': {
    rxnormCui: '10691', brand: 'Lysteda', generic: 'Tranexamic acid',
    class: 'Antifibrinolytic', route: 'oral/IV',
    forms: ['tablet 650mg', 'injection 1000mg/10mL'],
    dosing: { standard: '1000 mg', unit: 'mg', frequency: 'TID × 5 days' },
    contraindications: ['Active thromboembolic disease'],
    monitoring: ['Signs of thrombosis', 'Seizure risk (high doses)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Neuropsychiatric
  // ═══════════════════════════════════════════════════════════════════
  'sertraline': {
    rxnormCui: '36437', brand: 'Zoloft', generic: 'Sertraline',
    class: 'SSRI antidepressant', route: 'oral',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg'],
    dosing: { standard: '50-200 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['MAO inhibitors (serotonin syndrome — contraindicated)', 'Tramadol (serotonin syndrome)', 'Meperidine (serotonin syndrome)'],
    monitoring: ['Suicidality screening', 'Serotonin syndrome', 'Hyponatremia (SIADH)'],
  },
  'citalopram': {
    rxnormCui: '2556', brand: 'Celexa', generic: 'Citalopram',
    class: 'SSRI antidepressant', route: 'oral',
    forms: ['tablet 10mg', 'tablet 20mg', 'tablet 40mg'],
    dosing: { standard: '20-40 mg', unit: 'mg', frequency: 'QD', maxDaily: 40 },
    interactions: ['MAO inhibitors', 'QT-prolonging drugs (max 20mg if >60yo)'],
    monitoring: ['QTc (max dose >20mg for elderly)', 'Suicidality'],
  },
  'escitalopram': {
    rxnormCui: '321988', brand: 'Lexapro', generic: 'Escitalopram',
    class: 'SSRI antidepressant', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'tablet 20mg'],
    dosing: { standard: '10-20 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['MAO inhibitors', 'QT-prolonging drugs'],
  },
  'duloxetine': {
    rxnormCui: '72625', brand: 'Cymbalta', generic: 'Duloxetine',
    class: 'SNRI antidepressant', route: 'oral',
    forms: ['capsule 20mg', 'capsule 30mg', 'capsule 60mg'],
    dosing: { standard: '30-60 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['MAO inhibitors', 'Fluoroquinolones (seizure risk)', 'Tramadol'],
  },
  'mirtazapine': {
    rxnormCui: '15996', brand: 'Remeron', generic: 'Mirtazapine',
    class: 'NaSSA antidepressant', route: 'oral',
    forms: ['tablet 7.5mg', 'tablet 15mg', 'tablet 30mg', 'tablet 45mg'],
    dosing: { standard: '15-45 mg', unit: 'mg', frequency: 'QHS' },
    monitoring: ['Weight gain', 'Sedation', 'Agranulocytosis (rare)'],
  },
  'trazodone': {
    rxnormCui: '10737', brand: 'Desyrel', generic: 'Trazodone',
    class: 'Serotonin modulator', route: 'oral',
    forms: ['tablet 50mg', 'tablet 100mg', 'tablet 150mg', 'tablet 300mg'],
    dosing: { standard: '50-150 mg', unit: 'mg', frequency: 'QHS' },
    interactions: ['MAO inhibitors', 'CYP3A4 inhibitors (increased levels)'],
    monitoring: ['QTc', 'Priapism counseling', 'Orthostatic hypotension'],
  },
  'quetiapine': {
    rxnormCui: '51272', brand: 'Seroquel', generic: 'Quetiapine',
    class: 'Atypical antipsychotic', route: 'oral',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg', 'tablet 200mg', 'tablet 300mg', 'tablet 400mg'],
    dosing: { standard: '25-200 mg', unit: 'mg', frequency: 'QHS-BID' },
    interactions: ['CYP3A4 inhibitors (increased levels)', 'Phenobarbital (reduced levels)'],
    monitoring: ['Metabolic panel (glucose, lipids)', 'Weight', 'QTc', 'Orthostatic BP'],
  },
  'aripiprazole': {
    rxnormCui: '89013', brand: 'Abilify', generic: 'Aripiprazole',
    class: 'Atypical antipsychotic (partial agonist)', route: 'oral',
    forms: ['tablet 2mg', 'tablet 5mg', 'tablet 10mg', 'tablet 15mg', 'tablet 20mg', 'tablet 30mg'],
    dosing: { standard: '5-15 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Strong CYP3A4 inhibitors (reduce dose)', 'Strong CYP2D6 inhibitors'],
  },
  'haloperidol': {
    rxnormCui: '5093', brand: 'Haldol', generic: 'Haloperidol',
    class: 'Typical antipsychotic', route: 'oral/IM',
    forms: ['tablet 0.5mg', 'tablet 1mg', 'tablet 2mg', 'tablet 5mg', 'injection 5mg/mL'],
    dosing: { standard: '0.5-5 mg', unit: 'mg', frequency: 'Q6-12H PRN' },
    monitoring: ['QTc', 'EPS', 'NMS symptoms'],
  },
  'olanzapine': {
    rxnormCui: '61381', brand: 'Zyprexa', generic: 'Olanzapine',
    class: 'Atypical antipsychotic', route: 'oral',
    forms: ['tablet 2.5mg', 'tablet 5mg', 'tablet 7.5mg', 'tablet 10mg', 'tablet 15mg', 'tablet 20mg'],
    dosing: { standard: '5-15 mg', unit: 'mg', frequency: 'QD-BID' },
    interactions: ['CYP1A2 inducers (smoking reduces levels)', 'CYP3A4 inhibitors'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Miscellaneous
  // ═══════════════════════════════════════════════════════════════════
  'trimethoprim-sulfamethoxazole': {
    rxnormCui: '10831', brand: 'Bactrim', generic: 'Trimethoprim/Sulfamethoxazole',
    class: 'Antibiotic (folate antagonist)', route: 'oral/IV',
    forms: ['tablet DS (160/800mg)', 'oral suspension (40/200mg/5mL)', 'injection (16/80mg/mL)'],
    dosing: { standard: '160/800 mg', unit: 'mg', frequency: 'BID' },
    interactions: ['Methotrexate (additive myelosuppression)', 'Warfarin (increased INR)', 'Phenytoin (increased levels)'],
    monitoring: ['CBC (myelosuppression)', 'Potassium (hyperkalemia)', 'Renal function'],
  },
  'fluconazole': {
    rxnormCui: '4450', brand: 'Diflucan', generic: 'Fluconazole',
    class: 'Azole antifungal', route: 'oral/IV',
    forms: ['tablet 50mg', 'tablet 100mg', 'tablet 150mg', 'tablet 200mg', 'injection 2mg/mL'],
    dosing: { standard: '100-400 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Warfarin (increased INR)', 'Phenytoin (increased levels)', 'CYP3A4 substrates (QTc prolongation)'],
    monitoring: ['LFTs', 'QTc if high dose'],
  },
  'acyclovir': {
    rxnormCui: '281', brand: 'Zovirax', generic: 'Acyclovir',
    class: 'Antiviral (nucleoside analog)', route: 'oral/IV',
    forms: ['tablet 200mg', 'tablet 400mg', 'tablet 800mg', 'injection 250mg/vial', 'suspension 200mg/5mL'],
    dosing: { standard: '200-800 mg', unit: 'mg', frequency: 'Q5H (oral)', renalAdjust: true },
    interactions: ['Nephrotoxic drugs (additive)'],
    monitoring: ['Hydration', 'Renal function', 'Neurotoxicity (high doses)'],
  },
  'valacyclovir': {
    rxnormCui: '73645', brand: 'Valtrex', generic: 'Valacyclovir',
    class: 'Antiviral (acyclovir prodrug)', route: 'oral',
    forms: ['tablet 500mg', 'tablet 1g'],
    dosing: { standard: '500-1000 mg', unit: 'mg', frequency: 'BID', renalAdjust: true },
  },
  'tamsulosin': {
    rxnormCui: '77492', brand: 'Flomax', generic: 'Tamsulosin',
    class: 'Alpha-1 blocker (BPH)', route: 'oral',
    forms: ['capsule 0.4mg', 'capsule 0.8mg'],
    dosing: { standard: '0.4 mg', unit: 'mg', frequency: 'QHS' },
    interactions: ['CYP3A4 inhibitors (increased levels)', 'PDE5 inhibitors (hypotension)'],
    monitoring: ['Orthostatic hypotension', 'IFIS (intraoperative floppy iris syndrome)'],
  },
  'finasteride': {
    rxnormCui: '25025', brand: 'Proscar', generic: 'Finasteride',
    class: '5-alpha reductase inhibitor', route: 'oral',
    forms: ['tablet 5mg'],
    dosing: { standard: '5 mg', unit: 'mg', frequency: 'QD' },
    contraindications: ['Women of childbearing potential (teratogenic)', 'Crushing pills (absorption)'],
  },
  'mycophenolate': {
    rxnormCui: '68149', brand: 'CellCept', generic: 'Mycophenolate mofetil',
    class: 'Immunosuppressant', route: 'oral/IV',
    forms: ['capsule 250mg', 'tablet 500mg', 'oral suspension 200mg/mL', 'injection 500mg vial'],
    dosing: { standard: '1000 mg BID', unit: 'mg', frequency: 'BID' },
    interactions: ['Antacids (reduced absorption)', 'Probenecid (increased levels)'],
    monitoring: ['CBC weekly × 1 month', 'LFTs', 'Pregnancy test (teratogenic)'],
  },
  'tacrolimus': {
    rxnormCui: '42316', brand: 'Prograf', generic: 'Tacrolimus',
    class: 'Calcineurin inhibitor', route: 'oral/IV',
    forms: ['capsule 0.5mg', 'capsule 1mg', 'capsule 5mg', 'injection 5mg/mL'],
    dosing: { standard: '0.1-0.2 mg/kg', unit: 'mg/kg', frequency: 'BID' },
    interactions: ['CYP3A4 inhibitors/inducers', 'Grapefruit juice', 'Azole antifungals (increased levels)'],
    monitoring: ['Drug levels (5-15 ng/mL)', 'LFTs', 'Renal function', 'Glucose (new-onset diabetes)'],
  },
  'cyclosporine': {
    rxnormCui: '3008', brand: 'Neoral', generic: 'Cyclosporine',
    class: 'Calcineurin inhibitor', route: 'oral/IV',
    forms: ['capsule 25mg', 'capsule 100mg', 'oral solution 100mg/mL', 'injection 50mg/mL'],
    dosing: { standard: '3-5 mg/kg', unit: 'mg/kg', frequency: 'BID' },
    interactions: ['Grapefruit juice', 'NSAIDs (nephrotoxicity)', 'St. John\'s wort (reduced levels)'],
    monitoring: ['Drug levels', 'LFTs', 'Renal function', 'Lipid profile', 'BP'],
  },
  'sirolimus': {
    rxnormCui: '35302', brand: 'Rapamune', generic: 'Sirolimus',
    class: 'mTOR inhibitor', route: 'oral',
    forms: ['tablet 0.5mg', 'tablet 1mg', 'tablet 2mg', 'oral solution 1mg/mL'],
    dosing: { standard: '2 mg', unit: 'mg', frequency: 'QD (after loading dose)' },
    interactions: ['CYP3A4 inhibitors/inducers', 'P-glycoprotein inhibitors'],
    monitoring: ['Drug levels', 'Lipid profile', 'CBC', 'Renal function'],
  },
  'everolimus': {
    rxnormCui: '141704', brand: 'Afinitor', generic: 'Everolimus',
    class: 'mTOR inhibitor', route: 'oral',
    forms: ['tablet 2.5mg', 'tablet 5mg', 'tablet 7.5mg', 'tablet 10mg'],
    dosing: { standard: '10 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Strong CYP3A4 inhibitors (reduce dose)', 'Strong CYP3A4 inducers (avoid)'],
    monitoring: ['CBC', 'LFTs', 'Glucose', 'Lipids', 'Mouth ulcers'],
  },
  'thalidomide': {
    rxnormCui: '10432', brand: 'Thalomid', generic: 'Thalidomide',
    class: 'IMiD (immunomodulatory)', route: 'oral',
    forms: ['capsule 50mg', 'capsule 100mg', 'capsule 200mg'],
    dosing: { standard: '50-200 mg', unit: 'mg', frequency: 'QHS' },
    interactions: ['Digoxin (reduced levels)', 'Oral contraceptives (reduced efficacy)'],
    contraindications: ['Pregnancy (TERATOGENIC — REMS required)', 'Neuropathy'],
    monitoring: ['Peripheral neuropathy assessment', 'DVT prophylaxis', 'Pregnancy testing monthly'],
  },
  'lenalidomide': {
    rxnormCui: '342369', brand: 'Revlimid', generic: 'Lenalidomide',
    class: 'IMiD', route: 'oral',
    forms: ['capsule 2.5mg', 'capsule 5mg', 'capsule 10mg', 'capsule 15mg', 'capsule 20mg', 'capsule 25mg'],
    dosing: { standard: '5-25 mg', unit: 'mg', frequency: 'Days 1-21 of 28-day cycle' },
    interactions: ['Digoxin (monitor)', 'Warfarin (increased INR)'],
    contraindications: ['Pregnancy (REMS required)', 'Neutropenia (adjust dose)'],
    monitoring: ['CBC weekly × 8 weeks', 'DVT prophylaxis', 'Pregnancy testing'],
  },
  'pomalidomide': {
    rxnormCui: '1369713', brand: 'Pomalyst', generic: 'Pomalidomide',
    class: 'IMiD', route: 'oral',
    forms: ['capsule 1mg', 'capsule 2mg', 'capsule 3mg', 'capsule 4mg'],
    dosing: { standard: '4 mg', unit: 'mg', frequency: 'Days 1-21 of 28-day cycle' },
    contraindications: ['Pregnancy (REMS required)'],
  },
  'azacitidine': {
    rxnormCui: '1251', brand: 'Vidaza', generic: 'Azacitidine',
    class: 'Hypomethylating agent', route: 'SC/IV',
    forms: ['injection 100mg vial'],
    dosing: { standard: '75 mg/m²', unit: 'mg/m²', frequency: 'Days 1-7 of 28-day cycle' },
    renalAdjust: true, interactions: [],
    monitoring: ['CBC', 'LFTs', 'Renal function'],
  },
  'decitabine': {
    rxnormCui: '15657', brand: 'Dacogen', generic: 'Decitabine',
    class: 'Hypomethylating agent', route: 'IV',
    forms: ['injection 50mg vial'],
    dosing: { standard: '20 mg/m²', unit: 'mg/m²', frequency: 'Days 1-5 of 28-day cycle' },
    renalAdjust: true, monitoring: ['CBC', 'LFTs'],
  },
  'hydroxyurea': {
    rxnormCui: '5552', brand: 'Hydrea', generic: 'Hydroxyurea',
    class: 'Ribonucleotide reductase inhibitor', route: 'oral',
    forms: ['capsule 200mg', 'capsule 300mg', 'capsule 400mg', 'capsule 500mg'],
    dosing: { standard: '500-2000 mg', unit: 'mg', frequency: 'QD or BID' },
    interactions: ['Live vaccines', 'Didanosine (pancreatitis)'],
    monitoring: ['CBC weekly', 'Renal function', 'LFTs'],
  },
  'idarubicin': {
    rxnormCui: '5650', brand: 'Idamycin', generic: 'Idarubicin',
    class: 'Anthracycline', route: 'IV',
    forms: ['injection 5mg vial', 'injection 10mg vial', 'injection 20mg vial'],
    dosing: { standard: '8-12 mg/m²', unit: 'mg/m²', frequency: 'Days 1-3' },
    interactions: ['CYP3A4 inhibitors', 'Live vaccines'],
    monitoring: ['CBC', 'Cardiac monitoring', 'Urine red discoloration'],
  },
  'mitoxantrone': {
    rxnormCui: '7005', brand: 'Novantrone', generic: 'Mitoxantrone',
    class: 'Anthracenedione', route: 'IV',
    forms: ['injection 2mg/mL (10mL)', 'injection 2mg/mL (12.5mL)', 'injection 2mg/mL (15mL)', 'injection 2mg/mL (25mL)'],
    dosing: { standard: '12 mg/m²', unit: 'mg/m²', frequency: 'Every 3 weeks' },
    cumulativeLimit: 'Lifetime 140 mg/m²',
    monitoring: ['CBC', 'Cardiac function', 'Blue-green urine (not harmful)'],
  },
  'bendamustine': {
    rxnormCui: '134547', brand: 'Treanda', generic: 'Bendamustine',
    class: 'Nitrogen mustard / benzimidazole', route: 'IV',
    forms: ['injection 25mg/mL (0.5mL)', 'injection 25mg/mL (3mL)', 'injection 25/mL (7.5mL)'],
    dosing: { standard: '90-120 mg/m²', unit: 'mg/m²', frequency: 'Days 1-2 of 28-day cycle' },
    interactions: ['Live vaccines', 'CYP1A2 inhibitors'],
    monitoring: ['CBC', 'LFTs', 'Tumor lysis syndrome monitoring'],
  },
  'ifosfamide': {
    rxnormCui: '5657', brand: 'Ifex', generic: 'Ifosfamide',
    class: 'Alkylating agent (cyclophosphamide analog)', route: 'IV',
    forms: ['injection 1g vial', 'injection 2g vial', 'injection 3g vial'],
    dosing: { standard: '1200-1800 mg/m²', unit: 'mg/m²', frequency: 'Daily × 3-5 days' },
    renalAdjust: true, interactions: [],
    contraindications: ['Severe renal impairment', 'CNS disorders'],
    monitoring: ['MESNA mandatory (bladder protection)', 'Mental status', 'CBC', 'Urinalysis'],
  },
  'cyclophosphamide': {
    rxnormCui: '3002', brand: 'Cytoxan', generic: 'Cyclophosphamide',
    class: 'Alkylating agent', route: 'oral/IV',
    forms: ['tablet 25mg', 'tablet 50mg', 'injection 200mg vial', 'injection 500mg vial', 'injection 1g vial', 'injection 2g vial'],
    dosing: { standard: '500-1500 mg/m²', unit: 'mg/m²', frequency: 'Daily (low-dose) or every 3-4 weeks (high-dose)' },
    renalAdjust: true, interactions: [],
    monitoring: ['CBC', 'Urinalysis (hemorrhagic cystitis)', 'MESNA for high-dose', 'Fertility counseling'],
  },
  'teniposide': {
    rxnormCui: '10362', brand: 'Vumon', generic: 'Teniposide',
    class: 'Topoisomerase II inhibitor', route: 'IV',
    forms: ['injection 10mg/mL (5mL)', 'injection 10mg/mL (25mL)'],
    dosing: { standard: '165-200 mg/m²', unit: 'mg/m²', frequency: 'Days 1-3' },
    interactions: ['Warfarin (increased INR)', 'Phenytoin (bidirectional)'],
    monitoring: ['CBC', 'Hypotension (infusion rate)', 'Allergic reactions'],
  },
  'mechlorethamine': {
    rxnormCui: '6674', brand: 'Mustargen', generic: 'Mechlorethamine',
    class: 'Nitrogen mustard', route: 'IV/topical',
    forms: ['injection 10mg vial', 'topical gel 0.01%'],
    dosing: { standard: '6 mg/m²', unit: 'mg/m²', frequency: 'Day 1 and 8 of 28-day cycle' },
    monitoring: ['CBC', 'Extravasation monitoring', 'Venous irritation'],
  },
  'dactinomycin': {
    rxnormCui: '3100', brand: 'Cosmegen', generic: 'Dactinomycin',
    class: 'Antitumor antibiotic', route: 'IV',
    forms: ['injection 500mcg vial'],
    dosing: { standard: '15 mcg/kg', unit: 'mcg/kg', frequency: 'Daily × 5' },
    monitoring: ['CBC', 'Extravasation monitoring', 'Mucositis'],
  },
  'bleomycin': {
    rxnormCui: '1622', brand: 'Blenoxane', generic: 'Bleomycin',
    class: 'Antitumor antibiotic', route: 'IV/IM',
    forms: ['injection 15 units vial'],
    dosing: { standard: '10-20 units/m²', unit: 'units/m²', frequency: 'Weekly', cumulativeLimit: '400 units lifetime' },
    interactions: ['Oxygen (enhanced pulmonary toxicity)', 'Cisplatin (reduced clearance)'],
    monitoring: ['PFTs (baseline + qcycle)', 'Skin changes', 'Mucositis', 'Oxygen exposure counseling'],
  },
  'streptozocin': {
    rxnormCui: '10114', brand: 'Zanosar', generic: 'Streptozocin',
    class: 'Alkylating agent (nitrosourea)', route: 'IV',
    forms: ['injection 1g vial'],
    dosing: { standard: '500 mg/m²', unit: 'mg/m²', frequency: 'Daily × 5' },
    renalAdjust: true, monitoring: ['Renal function', 'Glucose monitoring', 'LFTs'],
  },
  'l-asparaginase': {
    rxnormCui: '1156', brand: 'Elspar', generic: 'L-Asparaginase',
    class: 'Enzyme (depletes asparagine)', route: 'IM/IV',
    forms: ['injection 10,000 IU vial'],
    dosing: { standard: '5000-10000 IU/m²', unit: 'IU/m²', frequency: '3×/week' },
    interactions: ['Live vaccines', 'Methotrexate (increased toxicity)'],
    contraindications: ['Pancreatitis history', 'Hepatic dysfunction', 'Coagulopathy'],
    monitoring: ['LFTs', 'Coagulation studies', 'Glucose', 'Pancreatic enzymes'],
  },
  'pegaspargase': {
    rxnormCui: '34132', brand: 'Oncaspar', generic: 'Pegaspargase',
    class: 'PEGylated L-asparaginase', route: 'IM/IV',
    forms: ['injection 750 IU/mL (5mL)'],
    dosing: { standard: '2500 IU/m²', unit: 'IU/m²', frequency: 'Every 2 weeks' },
    monitoring: ['LFTs', 'Coagulation studies', 'Glucose', 'Hypersensitivity monitoring'],
  },
  'arsenic-trioxide': {
    rxnormCui: '18330', brand: 'Trisenox', generic: 'Arsenic trioxide',
    class: 'Differentiating agent', route: 'IV',
    forms: ['injection 1mg/mL (10mL)'],
    dosing: { standard: '0.15 mg/kg', unit: 'mg/kg', frequency: 'Daily × 2-8 weeks' },
    interactions: ['QT-prolonging drugs (avoid)', 'Drugs causing electrolyte imbalance'],
    monitoring: ['ECG (QTc)', 'Electrolytes (K⁺, Mg²⁺)', 'CBC', 'Differentiation syndrome monitoring'],
  },
  'hydroxyurea-supportive': {
    rxnormCui: '5552', brand: 'Droxia', generic: 'Hydroxyurea',
    class: 'Ribonucleotide reductase inhibitor', route: 'oral',
    forms: ['capsule 500mg'],
    dosing: { standard: '500-2000 mg', unit: 'mg', frequency: 'QD' },
    monitoring: ['CBC', 'Renal function', 'Skin monitoring'],
  },
  'thalidomide-supportive': {
    rxnormCui: '10432', brand: 'Thalomid', generic: 'Thalidomide',
    class: 'IMiD', route: 'oral',
    forms: ['capsule 50mg', 'capsule 100mg', 'capsule 200mg'],
    dosing: { standard: '50-200 mg', unit: 'mg', frequency: 'QHS' },
    contraindications: ['Pregnancy (TERATOGENIC — REMS required)'],
    monitoring: ['Peripheral neuropathy', 'DVT prophylaxis', 'Pregnancy testing monthly'],
  },
  'carfilzomib': {
    rxnormCui: '1302966', brand: 'Kyprolis', generic: 'Carfilzomib',
    class: 'Proteasome inhibitor', route: 'IV',
    forms: ['injection 60mg vial'],
    dosing: { standard: '27-56 mg/m²', unit: 'mg/m²', frequency: 'Days 1, 2, 8, 9, 15, 16 of 28-day cycle' },
    interactions: ['CYP3A4 inhibitors/inducers'],
    monitoring: ['Cardiac monitoring', 'Tumor lysis syndrome', 'Infusion reactions', 'LFTs'],
  },
  'bortezomib': {
    rxnormCui: '358258', brand: 'Velcade', generic: 'Bortezomib',
    class: 'Proteasome inhibitor', route: 'IV/SC',
    forms: ['injection 3.5mg vial', 'injection 1mg vial'],
    dosing: { standard: '1.3 mg/m²', unit: 'mg/m²', frequency: 'Days 1, 4, 8, 11' },
    interactions: ['CYP3A4 inhibitors', 'CYP3A4 inducers (reduced levels)'],
    monitoring: ['CBC', 'Peripheral neuropathy assessment', 'Platelet monitoring'],
  },
  'ixazomib': {
    rxnormCui: '1723735', brand: 'Ninlaro', generic: 'Ixazomib',
    class: 'Oral proteasome inhibitor', route: 'oral',
    forms: ['capsule 2.3mg', 'capsule 3mg', 'capsule 4mg'],
    dosing: { standard: '4 mg', unit: 'mg', frequency: 'Days 1, 8, 15 of 28-day cycle' },
    interactions: ['CYP3A4 inhibitors/inducers', 'Strong CYP1A2 inhibitors'],
    monitoring: ['CBC', 'LFTs', 'Peripheral neuropathy'],
  },
  'lenalidomide-supportive': {
    rxnormCui: '342369', brand: 'Revlimid', generic: 'Lenalidomide',
    class: 'IMiD', route: 'oral',
    forms: ['capsule 2.5mg', 'capsule 5mg', 'capsule 10mg', 'capsule 15mg', 'capsule 20mg', 'capsule 25mg'],
    dosing: { standard: '5-25 mg', unit: 'mg', frequency: 'Days 1-21 of 28-day cycle' },
    contraindications: ['Pregnancy (REMS required)'],
    monitoring: ['CBC weekly × 8 weeks', 'DVT prophylaxis', 'Pregnancy testing'],
  },
  'pomalidomide-supportive': {
    rxnormCui: '1369713', brand: 'Pomalyst', generic: 'Pomalidomide',
    class: 'IMiD', route: 'oral',
    forms: ['capsule 1mg', 'capsule 2mg', 'capsule 3mg', 'capsule 4mg'],
    dosing: { standard: '4 mg', unit: 'mg', frequency: 'Days 1-21 of 28-day cycle' },
    contraindications: ['Pregnancy (REMS required)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — GCSF
  // ═══════════════════════════════════════════════════════════════════
  'filgrastim-supportive': {
    rxnormCui: '68442', brand: 'Neupogen', generic: 'Filgrastim',
    class: 'G-CSF', route: 'SC',
    forms: ['injection 300mcg/mL (0.5mL)', 'injection 300mcg/mL (0.8mL)', 'injection 480mcg/mL (0.8mL)'],
    dosing: { standard: '5 mcg/kg', unit: 'mcg/kg', frequency: 'Daily SC until ANC > 10,000' },
    monitoring: ['CBC with differential', 'Bone pain assessment'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — IV Iron & Transfusion
  // ═══════════════════════════════════════════════════════════════════
  'ferric-carboxymaltose': {
    rxnormCui: '1433693', brand: 'Injectafer', generic: 'Ferric carboxymaltose',
    class: 'IV iron', route: 'IV',
    forms: ['injection 750mg/15mL'],
    dosing: { standard: '750 mg', unit: 'mg', frequency: 'Up to 2 doses, 7 days apart' },
    monitoring: ['Hemoglobin', 'Ferritin', 'Hypophosphatemia', 'Anaphylaxis monitoring'],
  },
  'ferric-maltol': {
    rxnormCui: '2539932', brand: 'Accrufer', generic: 'Ferric maltol',
    class: 'Oral iron', route: 'oral',
    forms: ['capsule 30mg'],
    dosing: { standard: '30 mg', unit: 'mg', frequency: 'TID' },
    monitoring: ['Hemoglobin', 'GI tolerance'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Antihistamines
  // ═══════════════════════════════════════════════════════════════════
  'diphenhydramine': {
    rxnormCui: '3498', brand: 'Benadryl', generic: 'Diphenhydramine',
    class: 'First-generation antihistamine', route: 'oral/IV',
    forms: ['tablet 25mg', 'tablet 50mg', 'injection 50mg/mL', 'injection 50mg/mL (1mL)'],
    dosing: { standard: '25-50 mg', unit: 'mg', frequency: 'Q6H PRN' },
    interactions: ['CNS depressants', 'MAO inhibitors'],
    monitoring: ['Sedation', 'Anticholinergic effects', 'QTc (IV)'],
  },
  'hydroxyzine': {
    rxnormCui: '5553', brand: 'Atarax', generic: 'Hydroxyzine',
    class: 'First-generation antihistamine / anxiolytic', route: 'oral/IM',
    forms: ['tablet 10mg', 'tablet 25mg', 'tablet 50mg', 'syrup 10mg/5mL', 'injection 25mg/mL', 'injection 50mg/mL'],
    dosing: { standard: '25-50 mg', unit: 'mg', frequency: 'Q6H PRN' },
    interactions: ['CNS depressants', 'MAO inhibitors'],
  },
  'cetirizine': {
    rxnormCui: '20610', brand: 'Zyrtec', generic: 'Cetirizine',
    class: 'Second-generation antihistamine', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'oral solution 1mg/mL'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'QD' },
    interactions: [],
    monitoring: ['Sedation (less than first-gen)', 'QTc if IV (not available)'],
  },
  'loratadine': {
    rxnormCui: '28889', brand: 'Claritin', generic: 'Loratadine',
    class: 'Second-generation antihistamine', route: 'oral',
    forms: ['tablet 10mg', 'oral solution 1mg/mL'],
    dosing: { standard: '10 mg', unit: 'mg', frequency: 'QD' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Skin / Mucositis
  // ═══════════════════════════════════════════════════════════════════
  'misoprostol': {
    rxnormCui: '42331', brand: 'Cytotec', generic: 'Misoprostol',
    class: 'Prostaglandin E1 analog (GI protection)', route: 'oral',
    forms: ['tablet 100mcg', 'tablet 200mcg'],
    dosing: { standard: '200 mcg', unit: 'mcg', frequency: 'QID with meals' },
    contraindications: ['Pregnancy (abortifacient)'],
  },
  'sucralfate-supportive': {
    rxnormCui: '10156', brand: 'Carafate', generic: 'Sucralfate',
    class: 'Mucosal protectant', route: 'oral',
    forms: ['suspension 1g/10mL', 'tablet 1g'],
    dosing: { standard: '1 g', unit: 'g', frequency: 'Q6H on empty stomach' },
    interactions: ['PPIs (reduced absorption)', 'Fluoroquinolones', 'Levothyroxine'],
  },
  'leucovorin': {
    rxnormCui: '225852', brand: 'Wellcovorin', generic: 'Leucovorin calcium',
    class: 'Folinic acid (rescue agent)', route: 'oral/IV',
    forms: ['tablet 5mg', 'tablet 15mg', 'injection 50mg vial', 'injection 100mg vial', 'injection 350mg vial', 'injection 500mg vial'],
    dosing: { standard: '10-100 mg/m²', unit: 'mg/m²', frequency: 'After MTX or with 5-FU' },
    monitoring: ['MTX levels (for rescue timing)', 'Renal function'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Muscle Relaxants
  // ═══════════════════════════════════════════════════════════════════
  'baclofen': {
    rxnormCui: '1292', brand: 'Lioresal', generic: 'Baclofen',
    class: 'GABA-B agonist (muscle relaxant)', route: 'oral',
    forms: ['tablet 10mg', 'tablet 20mg'],
    dosing: { standard: '5-20 mg', unit: 'mg', frequency: 'TID', maxDaily: 80 },
    interactions: ['MAO inhibitors', 'Tricyclics (enhanced CNS depression)'],
    monitoring: ['Gradual titration', 'Sedation', 'Weaning protocol (no abrupt discontinuation)'],
  },
  'tizanidine': {
    rxnormCui: '57258', brand: 'Zanaflex', generic: 'Tizanidine',
    class: 'Alpha-2 adrenergic agonist (muscle relaxant)', route: 'oral',
    forms: ['tablet 2mg', 'tablet 4mg'],
    dosing: { standard: '2-4 mg', unit: 'mg', frequency: 'TID', maxDaily: 36 },
    interactions: ['CYP1A2 inhibitors (fluvoxamine, ciprofloxacin — CONTRAINDICATED)', 'Fluvoxamine (major interaction)'],
    monitoring: ['Hepatic function', 'Blood pressure', 'Sedation'],
  },
  'cyclobenzaprine': {
    rxnormCui: '21949', brand: 'Flexeril', generic: 'Cyclobenzaprine',
    class: 'Centrally-acting muscle relaxant', route: 'oral',
    forms: ['tablet 5mg', 'tablet 7.5mg', 'tablet 10mg'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'TID', maxDaily: 30 },
    interactions: ['MAO inhibitors (CONTRAINDICATED)', 'Tricyclics (additive)', 'CYP1A2 inhibitors'],
    monitoring: ['Sedation', 'Anticholinergic effects', 'QTc'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Cardiovascular
  // ═══════════════════════════════════════════════════════════════════
  'metoprolol': {
    rxnormCui: '6918', brand: 'Lopressor', generic: 'Metoprolol',
    class: 'Beta-1 blocker', route: 'oral/IV',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg', 'extended-release tablet 25mg', 'extended-release tablet 50mg', 'extended-release tablet 100mg', 'extended-release tablet 200mg', 'injection 5mg/mL'],
    dosing: { standard: '25-200 mg', unit: 'mg', frequency: 'BID (tartrate) or QD (succinate)' },
    interactions: ['Verapamil (severe bradycardia)', 'CYP2D6 inhibitors (increased levels)', 'Clonidine (rebound hypertension)'],
    monitoring: ['Heart rate', 'Blood pressure', 'AV conduction'],
  },
  'lisinopril': {
    rxnormCui: '29046', brand: 'Zestril', generic: 'Lisinopril',
    class: 'ACE inhibitor', route: 'oral',
    forms: ['tablet 2.5mg', 'tablet 5mg', 'tablet 10mg', 'tablet 20mg', 'tablet 40mg'],
    dosing: { standard: '5-40 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['NSAIDs (reduced efficacy)', 'Potassium-sparing diuretics (hyperkalemia)', 'Aliskiren (contraindicated in diabetes)'],
    monitoring: ['BP', 'Renal function', 'Potassium', 'Cough (ACE inhibitor cough)'],
  },
  'amlodipine': {
    rxnormCui: '17767', brand: 'Norvasc', generic: 'Amlodipine',
    class: 'Calcium channel blocker (dihydropyridine)', route: 'oral',
    forms: ['tablet 2.5mg', 'tablet 5mg', 'tablet 10mg'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['CYP3A4 inhibitors (increased levels)', 'Simvastatin (reduced dose max 20mg)'],
    monitoring: ['BP', 'Heart rate', 'Peripheral edema', 'Reflex tachycardia'],
  },
  'hydralazine': {
    rxnormCui: '5470', brand: 'Apresoline', generic: 'Hydralazine',
    class: 'Direct vasodilator', route: 'oral/IV',
    forms: ['tablet 10mg', 'tablet 25mg', 'tablet 50mg', 'injection 20mg/mL'],
    dosing: { standard: '10-50 mg', unit: 'mg', frequency: 'TID-QID' },
    interactions: ['Nitrates (additive hypotension)', 'MAO inhibitors'],
    monitoring: ['BP', 'Heart rate (reflex tachycardia)', 'ANA positive (drug-induced lupus at high doses)'],
  },
  'nifedipine': {
    rxnormCui: '7417', brand: 'Procardia', generic: 'Nifedipine',
    class: 'Calcium channel blocker (dihydropyridine)', route: 'oral',
    forms: ['capsule 10mg', 'capsule 20mg', 'extended-release tablet 30mg', 'extended-release tablet 60mg', 'extended-release tablet 90mg'],
    dosing: { standard: '30-90 mg', unit: 'mg', frequency: 'QD (extended-release)' },
    interactions: ['CYP3A4 inhibitors', 'Simvastatin (reduced dose max 20mg)'],
    monitoring: ['BP', 'Heart rate', 'Peripheral edema'],
  },
  'spironolactone': {
    rxnormCui: '9997', brand: 'Aldactone', generic: 'Spironolactone',
    class: 'Potassium-sparing diuretic / Aldosterone antagonist', route: 'oral',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg'],
    dosing: { standard: '25-100 mg', unit: 'mg', frequency: 'QD-BID' },
    interactions: ['Potassium supplements (hyperkalemia risk)', 'ACE inhibitors (additive)', 'NSAIDs (reduced efficacy)'],
    monitoring: ['Potassium', 'Renal function', 'Gynecomastia (antiandrogenic effect)'],
  },
  'furosemide': {
    rxnormCui: '4603', brand: 'Lasix', generic: 'Furosemide',
    class: 'Loop diuretic', route: 'oral/IV',
    forms: ['tablet 20mg', 'tablet 40mg', 'tablet 80mg', 'oral solution 10mg/mL', 'injection 10mg/mL', 'injection 20mg/2mL', 'injection 40mg/4mL'],
    dosing: { standard: '20-80 mg', unit: 'mg', frequency: 'QD-BID' },
    interactions: ['Aminoglycosides (ototoxicity)', 'Lithium', 'Digoxin'],
    monitoring: ['Electrolytes (K⁺, Mg²⁺, Na⁺)', 'Renal function', 'Volume status', 'Audiogram (high doses)'],
  },
  'hydrochlorothiazide': {
    rxnormCui: '5487', brand: 'Microzide', generic: 'Hydrochlorothiazide',
    class: 'Thiazide diuretic', route: 'oral',
    forms: ['tablet 12.5mg', 'tablet 25mg', 'tablet 50mg'],
    dosing: { standard: '12.5-50 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Lithium (increased levels)', 'NSAIDs (reduced efficacy)', 'Digoxin (hypokalemia)'],
    monitoring: ['Electrolytes', 'Glucose (can cause hyperglycemia)', 'Uric acid (gout risk)'],
  },
  'carvedilol': {
    rxnormCui: '20352', brand: 'Coreg', generic: 'Carvedilol',
    class: 'Alpha-1/Beta blocker', route: 'oral',
    forms: ['tablet 3.125mg', 'tablet 6.25mg', 'tablet 12.5mg', 'tablet 25mg'],
    dosing: { standard: '3.125-25 mg', unit: 'mg', frequency: 'BID' },
    interactions: ['CYP2D6 inhibitors', 'CYP3A4 inhibitors', 'Insulin/sulfonylureas (masking hypoglycemia)'],
    monitoring: ['Heart rate', 'BP', 'Signs of heart failure worsening during titration'],
  },
  'propranolol': {
    rxnormCui: '8787', brand: 'Inderal', generic: 'Propranolol',
    class: 'Non-selective beta blocker', route: 'oral/IV',
    forms: ['tablet 10mg', 'tablet 20mg', 'tablet 40mg', 'tablet 60mg', 'tablet 80mg', 'oral solution 20mg/5mL', 'injection 1mg/mL'],
    dosing: { standard: '10-80 mg', unit: 'mg', frequency: 'BID-TID' },
    interactions: ['Verapamil (severe bradycardia)', 'CYP2D6/1A2 inhibitors', 'Insulin (masking hypoglycemia)'],
    monitoring: ['Heart rate', 'BP', 'Asthma assessment (contraindicated in reactive airway disease)'],
  },
  'diltiazem': {
    rxnormCui: '3443', brand: 'Cardizem', generic: 'Diltiazem',
    class: 'Non-dihydropyridine calcium channel blocker', route: 'oral/IV',
    forms: ['tablet 30mg', 'tablet 60mg', 'tablet 90mg', 'tablet 120mg', 'extended-release capsule 120mg', 'extended-release capsule 180mg', 'extended-release capsule 240mg', 'extended-release capsule 300mg', 'extended-release capsule 360mg', 'injection 5mg/mL'],
    dosing: { standard: '120-360 mg', unit: 'mg', frequency: 'QD (extended-release)' },
    interactions: ['Beta-blockers (severe bradycardia)', 'Digoxin (increased levels)', 'CYP3A4 inhibitors/inducers'],
    monitoring: ['ECG', 'Heart rate', 'BP', 'Liver function'],
  },
  'amlodipine-valsartan': {
    rxnormCui: '729455', brand: 'Exforge', generic: 'Amlodipine/Valsartan',
    class: 'CCB/ARB combination', route: 'oral',
    forms: ['tablet 5/80mg', 'tablet 5/160mg', 'tablet 10/160mg', 'tablet 10/320mg'],
    dosing: { standard: '5/80-10/320 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Potassium supplements', 'NSAIDs', 'Lithium'],
    monitoring: ['BP', 'Potassium', 'Renal function'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Thyroid / Endocrine
  // ═══════════════════════════════════════════════════════════════════
  'levothyroxine': {
    rxnormCui: '10582', brand: 'Synthroid', generic: 'Levothyroxine',
    class: 'Thyroid hormone', route: 'oral',
    forms: ['tablet 25mcg', 'tablet 50mcg', 'tablet 75mcg', 'tablet 100mcg', 'tablet 125mcg', 'tablet 150mcg', 'tablet 200mcg'],
    dosing: { standard: '1.6 mcg/kg', unit: 'mcg', frequency: 'QD on empty stomach' },
    interactions: ['Calcium/iron supplements (separate by 4h)', 'Antacids (separate by 4h)', 'Warfarin (increased INR)', 'Carbamazepine/phenytoin (reduced levels)'],
    monitoring: ['TSH q6-8 weeks until stable', 'Free T4'],
  },
  'methimazole': {
    rxnormCui: '6835', brand: 'Tapazole', generic: 'Methimazole',
    class: 'Antithyroid', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'tablet 20mg'],
    dosing: { standard: '5-30 mg', unit: 'mg', frequency: 'QD-QD' },
    monitoring: ['CBC (agranulocytosis — report sore throat/fever)', 'LFTs', 'TFTs q4-6 weeks'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Diabetes
  // ═══════════════════════════════════════════════════════════════════
  'insulin-glargine': {
    rxnormCui: '274783', brand: 'Lantus', generic: 'Insulin glargine',
    class: 'Long-acting insulin analog', route: 'SC',
    forms: ['injection 100 units/mL (3mL pen)', 'injection 100 units/mL (10mL vial)'],
    dosing: { standard: '10-80 units', unit: 'units', frequency: 'QD at bedtime' },
    monitoring: ['Blood glucose', 'HbA1c q3 months', 'Injection site rotation'],
  },
  'insulin-lispro': {
    rxnormCui: '86009', brand: 'Humalog', generic: 'Insulin lispro',
    class: 'Rapid-acting insulin analog', route: 'SC',
    forms: ['injection 100 units/mL (3mL pen)', 'injection 100 units/mL (10mL vial)'],
    dosing: { standard: '2-20 units', unit: 'units', frequency: 'Before meals (prandial)' },
    monitoring: ['Blood glucose', 'Hypoglycemia awareness'],
  },
  'metformin': {
    rxnormCui: '6809', brand: 'Glucophage', generic: 'Metformin',
    class: 'Biguanide', route: 'oral',
    forms: ['tablet 500mg', 'tablet 850mg', 'tablet 1000mg', 'extended-release tablet 500mg', 'extended-release tablet 750mg', 'extended-release tablet 1000mg'],
    dosing: { standard: '500-2000 mg', unit: 'mg', frequency: 'BID-TID with meals' },
    renalAdjust: true, interactions: ['Alcohol (lactic acidosis)', 'Iodinated contrast (hold 48h)'],
    monitoring: ['Renal function', 'LFTs', 'B12 levels (long-term)'],
  },
  'glipizide': {
    rxnormCui: '4821', brand: 'Glucotrol', generic: 'Glipizide',
    class: 'Sulfonylurea', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'extended-release tablet 2.5mg', 'extended-release tablet 5mg', 'extended-release tablet 10mg'],
    dosing: { standard: '5-20 mg', unit: 'mg', frequency: 'QD-BID before meals' },
    interactions: ['NSAIDs (increased hypoglycemia)', 'Fluconazole (increased levels)', 'Rifampin (reduced levels)'],
    monitoring: ['Blood glucose', 'Hypoglycemia awareness', 'HbA1c'],
  },
  'glimepiride': {
    rxnormCui: '25789', brand: 'Amaryl', generic: 'Glimepiride',
    class: 'Sulfonylurea', route: 'oral',
    forms: ['tablet 1mg', 'tablet 2mg', 'tablet 4mg', 'tablet 8mg'],
    dosing: { standard: '1-8 mg', unit: 'mg', frequency: 'QD with breakfast' },
    interactions: ['Fluconazole', 'CYP2C9 inhibitors'],
  },
  'sitagliptin': {
    rxnormCui: '593411', brand: 'Januvia', generic: 'Sitagliptin',
    class: 'DPP-4 inhibitor', route: 'oral',
    forms: ['tablet 25mg', 'tablet 50mg', 'tablet 100mg'],
    dosing: { standard: '100 mg', unit: 'mg', frequency: 'QD' },
    renalAdjust: true, interactions: [],
    monitoring: ['Blood glucose', 'Pancreatitis symptoms (rare)'],
  },
  'empagliflozin': {
    rxnormCui: '1545653', brand: 'Jardiance', generic: 'Empagliflozin',
    class: 'SGLT2 inhibitor', route: 'oral',
    forms: ['tablet 10mg', 'tablet 25mg'],
    dosing: { standard: '10-25 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Insulin/sulfonylureas (hypoglycemia risk)', 'Diuretics (volume depletion)'],
    monitoring: ['Blood glucose', 'Renal function', 'Ketoacidosis symptoms', 'UTI/genital infections'],
  },
  'semaglutide': {
    rxnormCui: '1991302', brand: 'Ozempic', generic: 'Semaglutide',
    class: 'GLP-1 receptor agonist', route: 'SC',
    forms: ['injection 2mg/1.5mL pen', 'injection 4mg/3mL pen', 'tablet 3mg', 'tablet 7mg', 'tablet 14mg'],
    dosing: { standard: '0.25-2 mg', unit: 'mg', frequency: 'Weekly SC (injection) or QD (tablet)' },
    interactions: ['Insulin/sulfonylureas (hypoglycemia risk)'],
    contraindications: ['Personal/family history of medullary thyroid carcinoma', 'MEN2'],
    monitoring: ['GI symptoms (nausea)', 'Pancreatitis', 'Retinopathy worsening'],
  },
  'dulaglutide': {
    rxnormCui: '1551291', brand: 'Trulicity', generic: 'Dulaglutide',
    class: 'GLP-1 receptor agonist', route: 'SC',
    forms: ['injection 0.75mg/0.5mL pen', 'injection 1.5mg/0.5mL pen', 'injection 3mg/0.5mL pen', 'injection 4.5mg/0.5mL pen'],
    dosing: { standard: '0.75-4.5 mg', unit: 'mg', frequency: 'Weekly SC' },
    monitoring: ['GI symptoms', 'Pancreatitis', 'Injection site reactions'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Antimicrobial
  // ═══════════════════════════════════════════════════════════════════
  'ciprofloxacin': {
    rxnormCui: '2551', brand: 'Cipro', generic: 'Ciprofloxacin',
    class: 'Fluoroquinolone antibiotic', route: 'oral/IV',
    forms: ['tablet 250mg', 'tablet 500mg', 'tablet 750mg', 'oral suspension 250mg/5mL', 'oral suspension 500mg/5mL', 'injection 200mg/100mL', 'injection 400mg/200mL'],
    dosing: { standard: '250-750 mg', unit: 'mg', frequency: 'BID' },
    interactions: ['Antacids (reduced absorption — separate by 2h)', 'Theophylline (increased levels)', 'Tizanidine (CONTRAINDICATED)', 'Warfarin (increased INR)', 'Divalent cations'],
    contraindications: ['Myasthenia gravis', 'Tizanidine use'],
    monitoring: ['QTc', 'Tendon pain', 'CNS effects', 'Blood glucose'],
  },
  'levofloxacin': {
    rxnormCui: '82122', brand: 'Levaquin', generic: 'Levofloxacin',
    class: 'Fluoroquinolone antibiotic', route: 'oral/IV',
    forms: ['tablet 250mg', 'tablet 500mg', 'tablet 750mg', 'injection 250mg/50mL', 'injection 500mg/100mL', 'injection 750mg/150mL'],
    dosing: { standard: '250-750 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Antacids', 'Iron supplements', 'Warfarin'],
    monitoring: ['QTc', 'Tendon pain', 'Blood glucose'],
  },
  'meropenem': {
    rxnormCui: '29561', brand: 'Merrem', generic: 'Meropenem',
    class: 'Carbapenem antibiotic', route: 'IV',
    forms: ['injection 500mg vial', 'injection 1g vial'],
    dosing: { standard: '500mg-2g', unit: 'mg', frequency: 'Q8H' },
    interactions: ['Valproic acid (reduces levels — AVOID)', 'Probenecid'],
    monitoring: ['CBC', 'LFTs', 'Renal function', 'Seizures (rare)'],
  },
  'piperacillin-tazobactam': {
    rxnormCui: '74169', brand: 'Zosyn', generic: 'Piperacillin/Tazobactam',
    class: 'Extended-spectrum penicillin + beta-lactamase inhibitor', route: 'IV',
    forms: ['injection 3.375g vial', 'injection 4.5g vial', 'injection 2.25g in dextrose 250mL', 'injection 3.375g in dextrose 50mL', 'injection 4.5g in dextrose 100mL'],
    dosing: { standard: '3.375-4.5 g', unit: 'g', frequency: 'Q6H-Q8H' },
    interactions: ['Vancomycin (increased AKI risk)', 'Probenecid'],
    monitoring: ['CBC', 'LFTs', 'Renal function', 'Platelet count (prolonged use)'],
  },
  'vancomycin': {
    rxnormCui: '11124', brand: 'Vancocin', generic: 'Vancomycin',
    class: 'Glycopeptide antibiotic', route: 'oral/IV',
    forms: ['capsule 125mg', 'capsule 250mg', 'injection 500mg vial', 'injection 1g vial'],
    dosing: { standard: '15-20 mg/kg', unit: 'mg/kg', frequency: 'Q8-12H' },
    interactions: ['Aminoglycosides (additive nephrotoxicity)', 'Piperacillin-tazobactam (increased AKI risk)'],
    monitoring: ['AUC-guided dosing', 'Trough levels', 'Red man syndrome (infusion rate)', 'Renal function', 'CBC'],
  },
  'linezolid': {
    rxnormCui: '190376', brand: 'Zyvox', generic: 'Linezolid',
    class: 'Oxazolidinone antibiotic', route: 'oral/IV',
    forms: ['tablet 600mg', 'oral suspension 100mg/5mL', 'injection 600mg/300mL'],
    dosing: { standard: '600 mg', unit: 'mg', frequency: 'Q12H' },
    interactions: ['MAO inhibitors (serotonin syndrome)', 'Sympathomimetics (hypertensive crisis)', 'Meperidine', 'Triptans'],
    monitoring: ['CBC weekly', 'LFTs', 'Lactate', 'Serotonin syndrome symptoms', 'Serotonergic drug review'],
  },
  'amoxicillin': {
    rxnormCui: '723', brand: 'Amoxil', generic: 'Amoxicillin',
    class: 'Penicillin antibiotic', route: 'oral',
    forms: ['capsule 250mg', 'capsule 500mg', 'tablet 875mg', 'oral suspension 125mg/5mL', 'oral suspension 200mg/5mL', 'oral suspension 250mg/5mL', 'oral suspension 400mg/5mL'],
    dosing: { standard: '250-875 mg', unit: 'mg', frequency: 'BID-TID' },
    interactions: ['Warfarin (increased INR)', 'Oral contraceptives (reduced efficacy — debate)'],
    monitoring: ['Allergy screening', 'Rash assessment (not viral exanthem)'],
  },
  'amoxicillin-clavulanate': {
    rxnormCui: '19711', brand: 'Augmentin', generic: 'Amoxicillin/Clavulanate',
    class: 'Penicillin + beta-lactamase inhibitor', route: 'oral',
    forms: ['tablet 250/125mg', 'tablet 500/125mg', 'tablet 875/125mg', 'oral suspension 125/31.25mg per 5mL', 'oral suspension 200/28.5mg per 5mL', 'oral suspension 400/57mg per 5mL', 'chewable tablet 125/31.25mg', 'chewable tablet 200/28.5mg', 'chewable tablet 400/57mg'],
    dosing: { standard: '250-875 mg', unit: 'mg (amoxicillin component)', frequency: 'BID-TID' },
    interactions: ['Warfarin (increased INR)', 'Methotrexate'],
    monitoring: ['Allergy screening', 'Diarrhea (C. diff risk)'],
  },
  'doxycycline': {
    rxnormCui: '3640', brand: 'Vibramycin', generic: 'Doxycycline',
    class: 'Tetracycline antibiotic', route: 'oral/IV',
    forms: ['capsule 50mg', 'capsule 100mg', 'tablet 50mg', 'tablet 75mg', 'tablet 100mg', 'tablet 150mg', 'oral suspension 25mg/5mL'],
    dosing: { standard: '100 mg', unit: 'mg', frequency: 'BID' },
    interactions: ['Antacids (reduced absorption)', 'Calcium/iron (reduced absorption)', 'Oral contraceptives (reduced efficacy)', 'Warfarin (increased INR)'],
    monitoring: ['Esophageal ulceration (take upright)', 'Photosensitivity', 'Tooth discoloration (children)'],
  },
  'azithromycin': {
    rxnormCui: '18631', brand: 'Zithromax', generic: 'Azithromycin',
    class: 'Macrolide antibiotic', route: 'oral/IV',
    forms: ['tablet 250mg', 'tablet 500mg', 'tablet 600mg', 'oral suspension 100mg/5mL', 'oral suspension 200mg/5mL', 'oral suspension 200mg/5mL (packets)', 'injection 500mg vial'],
    dosing: { standard: '250-500 mg', unit: 'mg', frequency: 'QD (500mg day 1, then 250mg days 2-5)' },
    interactions: ['QT-prolonging drugs', 'Warfarin', 'Nelfinavir'],
    monitoring: ['QTc', 'GI symptoms', 'Hearing (high doses/long courses)'],
  },
  'fluconazole-supportive': {
    rxnormCui: '4450', brand: 'Diflucan', generic: 'Fluconazole',
    class: 'Azole antifungal', route: 'oral/IV',
    forms: ['tablet 50mg', 'tablet 100mg', 'tablet 150mg', 'tablet 200mg', 'injection 2mg/mL'],
    dosing: { standard: '100-400 mg', unit: 'mg', frequency: 'QD' },
    interactions: ['Warfarin (increased INR)', 'Phenytoin (increased levels)', 'CYP3A4 substrates (QTc prolongation)'],
    monitoring: ['LFTs', 'QTc if high dose'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Immunomodulators
  // ═══════════════════════════════════════════════════════════════════
  'azathioprine': {
    rxnormCui: '1256', brand: 'Imuran', generic: 'Azathioprine',
    class: 'Purine analog immunosuppressant', route: 'oral/IV',
    forms: ['tablet 50mg', 'injection 100mg vial'],
    dosing: { standard: '1-3 mg/kg', unit: 'mg/kg', frequency: 'QD' },
    interactions: ['Allopurinol (reduced clearance — REDUCE DOSE 75%)', 'Live vaccines', 'Warfarin (increased INR)'],
    monitoring: ['CBC weekly × 1 month', 'LFTs', 'TPMT genotype if available'],
  },
  'methotrexate-supportive': {
    rxnormCui: '6851', brand: 'Otrexup', generic: 'Methotrexate',
    class: 'Antimetabolite (immunosuppressant dose)', route: 'SC',
    forms: ['injection pen 7.5mg/0.3mL', 'injection pen 10mg/0.4mL', 'injection pen 12.5mg/0.5mL', 'injection pen 15mg/0.6mL', 'injection pen 17.5mg/0.7mL', 'injection pen 20mg/0.8mL', 'injection pen 22.5mg/0.9mL', 'injection pen 25mg/1mL'],
    dosing: { standard: '7.5-25 mg', unit: 'mg', frequency: 'Weekly' },
    monitoring: ['CBC', 'LFTs', 'Creatinine', 'Folic acid supplementation'],
  },
  'mycophenolate-supportive': {
    rxnormCui: '68149', brand: 'CellCept', generic: 'Mycophenolate mofetil',
    class: 'Immunosuppressant', route: 'oral',
    forms: ['capsule 250mg', 'tablet 500mg', 'oral suspension 200mg/mL'],
    dosing: { standard: '1000 mg BID', unit: 'mg', frequency: 'BID' },
    interactions: ['Antacids (reduced absorption)', 'Probenecid (increased levels)'],
    monitoring: ['CBC weekly × 1 month', 'LFTs', 'Pregnancy test (teratogenic)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Sleep / Anxiety
  // ═══════════════════════════════════════════════════════════════════
  'zolpidem': {
    rxnormCui: '39993', brand: 'Ambien', generic: 'Zolpidem',
    class: 'Non-benzodiazepine hypnotic (Z-drug)', route: 'oral',
    forms: ['tablet 5mg', 'tablet 10mg', 'extended-release tablet 6.25mg', 'extended-release tablet 12.5mg', 'sublingual tablet 5mg', 'sublingual tablet 10mg'],
    dosing: { standard: '5-10 mg', unit: 'mg', frequency: 'QHS PRN' },
    interactions: ['Opioids (complex sleep behaviors)', 'CYP3A4 inhibitors (increased levels)', 'Alcohol (CNS depression)'],
    monitoring: ['Sleep behaviors (sleepwalking)', 'Dependence risk'],
  },
  'eszopiclone': {
    rxnormCui: '461016', brand: 'Lunesta', generic: 'Eszopiclone',
    class: 'Non-benzodiazepine hypnotic (Z-drug)', route: 'oral',
    forms: ['tablet 1mg', 'tablet 2mg', 'tablet 3mg'],
    dosing: { standard: '1-3 mg', unit: 'mg', frequency: 'QHS' },
    interactions: ['CYP3A4 inhibitors', 'CYP1A2 inhibitors (fluvoxamine — REDUCE DOSE)'],
  },
  'melatonin': {
    rxnormCui: '6711', brand: 'Sonne Slumber', generic: 'Melatonin',
    class: 'Pineal hormone (chronobiotic)', route: 'oral',
    forms: ['tablet 1mg', 'tablet 3mg', 'tablet 5mg', 'tablet 10mg'],
    dosing: { standard: '0.5-5 mg', unit: 'mg', frequency: 'QHS' },
    interactions: ['CYP1A2 substrates', 'Anticoagulants'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Mucositis / Oral Care
  // ═══════════════════════════════════════════════════════════════════
  'palifermin': {
    rxnormCui: '196319', brand: 'Kepivance', generic: 'Palifermin',
    class: 'Keratinocyte growth factor', route: 'IV',
    forms: ['injection 6.25mg vial'],
    dosing: { standard: '60 mcg/kg', unit: 'mcg/kg', frequency: 'QD × 3 days before + 3 days after conditioning' },
    contraindications: ['Solid tumors', 'Concomitant ilixotide/alfitinib'],
    monitoring: ['Oral mucositis assessment', 'Taste changes', 'Renal function'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Bone / Calcium
  // ═══════════════════════════════════════════════════════════════════
  'zoledronic-acid': {
    rxnormCui: '77655', brand: 'Reclast', generic: 'Zoledronic acid',
    class: 'Bisphosphonate', route: 'IV',
    forms: ['injection 5mg/100mL'],
    dosing: { standard: '4 mg', unit: 'mg', frequency: 'Every 3-4 weeks (cancer) or yearly (osteoporosis)' },
    contraindications: ['CrCl < 30 mL/min', 'Dental extraction within 3 months'],
    monitoring: ['Renal function', 'Calcium/Vitamin D supplementation', 'ONJ risk assessment', 'Flu-like symptoms post-infusion'],
  },
  'denosumab': {
    rxnormCui: '993449', brand: 'Xgeva', generic: 'Denosumab',
    class: 'RANKL inhibitor (bone)', route: 'SC',
    forms: ['injection 60mg/mL (1mL)', 'injection 120mg/1.7mL'],
    dosing: { standard: '120 mg', unit: 'mg', frequency: 'Every 4 weeks' },
    interactions: [],
    monitoring: ['Calcium levels', 'ONJ risk', 'Atypical femoral fractures (long-term)'],
  },
  'calcium-carbonate': {
    rxnormCui: '1897', brand: 'Tums', generic: 'Calcium carbonate',
    class: 'Calcium supplement', route: 'oral',
    forms: ['tablet 500mg', 'tablet 600mg', 'tablet 750mg', 'chewable tablet 500mg', 'chewable tablet 750mg'],
    dosing: { standard: '500-1500 mg', unit: 'mg elemental calcium/day', frequency: 'TID with meals' },
    interactions: ['Thyroid hormones (separate by 4h)', 'Fluoroquinolones', 'Levothyroxine'],
    monitoring: ['Serum calcium', 'Phosphorus', 'Kidney stones'],
  },
  'vitamin-d': {
    rxnormCui: '2418', brand: 'D3', generic: 'Cholecalciferol',
    class: 'Vitamin D', route: 'oral',
    forms: ['tablet 400 IU', 'tablet 1000 IU', 'tablet 2000 IU', 'tablet 5000 IU', 'tablet 50000 IU', 'liquid 800 IU/mL', 'liquid 2000 IU/mL'],
    dosing: { standard: '1000-4000 IU', unit: 'IU', frequency: 'QD' },
    interactions: ['Thiazide diuretics (hypercalcemia)', 'Cardiac glycosides (hypercalcemia)'],
    monitoring: ['25-OH Vitamin D level', 'Calcium level', 'PTH'],
  },
  'calcitriol': {
    rxnormCui: '1894', brand: 'Rocaltrol', generic: 'Calcitriol',
    class: 'Active vitamin D metabolite', route: 'oral',
    forms: ['capsule 0.25mcg', 'capsule 0.5mcg', 'oral solution 1mcg/mL'],
    dosing: { standard: '0.25-0.5 mcg', unit: 'mcg', frequency: 'QD' },
    monitoring: ['Calcium', 'Phosphorus', 'PTH', '24h urine calcium'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Phosphate / Electrolyte
  // ═══════════════════════════════════════════════════════════════════
  'sevelamer': {
    rxnormCui: '214824', brand: 'Renagel', generic: 'Sevelamer',
    class: 'Phosphate binder', route: 'oral',
    forms: ['tablet 400mg', 'tablet 800mg', 'powder for suspension 800mg'],
    dosing: { standard: '400-800 mg', unit: 'mg', frequency: 'TID with meals' },
    interactions: ['Fluoroquinolones (reduced absorption)', 'Levothyroxine (reduced absorption)', 'Dofetilide'],
    monitoring: ['Serum phosphorus', 'Bicarbonate (metabolic acidosis)'],
  },
  'calcium-acetate': {
    rxnormCui: '214342', brand: 'PhosLo', generic: 'Calcium acetate',
    class: 'Phosphate binder', route: 'oral',
    forms: ['capsule 667mg'],
    dosing: { standard: '667-1334 mg', unit: 'mg', frequency: 'TID with meals' },
    monitoring: ['Serum phosphorus', 'Calcium', 'Vascular calcification risk'],
  },
  'sodium-bicarbonate': {
    rxnormCui: '36676', brand: 'Neutra-Phos', generic: 'Sodium bicarbonate',
    class: 'Alkalinizing agent', route: 'oral/IV',
    forms: ['tablet 650mg', 'tablet 1300mg', 'effervescent tablet 650mg', 'injection 8.4%', 'injection 4.2%', 'injection 50mEq/50mL'],
    dosing: { standard: '650-1300 mg', unit: 'mg', frequency: 'TID' },
    monitoring: ['Serum bicarbonate', 'Serum CO2', 'Blood gas if IV', 'Fluid status'],
  },
  'potassium-chloride': {
    rxnormCui: '8591', brand: 'K-Tab', generic: 'Potassium chloride',
    class: 'Potassium supplement', route: 'oral/IV',
    forms: ['tablet 8mEq', 'tablet 10mEq', 'tablet 20mEq', 'oral solution 20mEq/15mL', 'injection 2mEq/mL (10mL)', 'injection 4mEq/mL (10mL)', 'premixed 20mEq/100mL', 'premixed 40mEq/100mL'],
    dosing: { standard: '10-40 mEq', unit: 'mEq', frequency: 'TID with meals' },
    interactions: ['ACE inhibitors (hyperkalemia)', 'Spironolactone (hyperkalemia)', 'ARBs (hyperkalemia)'],
    monitoring: ['Serum potassium', 'ECG if IV', 'GI tolerance (oral)'],
  },
  'magnesium-oxide': {
    rxnormCui: '6582', brand: 'Mag-Ox', generic: 'Magnesium oxide',
    class: 'Magnesium supplement', route: 'oral',
    forms: ['tablet 400mg', 'tablet 500mg'],
    dosing: { standard: '400-800 mg', unit: 'mg', frequency: 'QD-BID' },
    interactions: ['Bisphosphonates (reduced absorption)', 'Antibiotics (reduced absorption)'],
    monitoring: ['Serum magnesium', 'Loose stools'],
  },
  'sodium-phosphate': {
    rxnormCui: '36709', brand: 'OsmoPrep', generic: 'Sodium phosphate',
    class: 'Bowel preparation / Phosphate', route: 'oral',
    forms: ['tablet 500mg', 'oral solution 19g/45mL'],
    dosing: { standard: '40 mL or 32 tablets over 24h', unit: 'varies', frequency: 'Bowel prep' },
    contraindications: ['Renal impairment', 'Heart failure', 'Electrolyte disorders'],
    monitoring: ['Electrolytes (Na⁺, K⁺, PO₄)', 'Renal function', 'Hydration status'],
  },
  'filgrastim-snapfi': {
    rxnormCui: '2057198', brand: 'Nivestym', generic: 'Filgrastim-aafi',
    class: 'G-CSF (biosimilar)', route: 'SC',
    forms: ['injection 300mcg/0.5mL', 'injection 480mcg/0.8mL'],
    dosing: { standard: '5 mcg/kg', unit: 'mcg/kg', frequency: 'Daily SC' },
    monitoring: ['ANC', 'Bone pain'],
  },
  'pegfilgrastim-sndk': {
    rxnormCui: '2048018', brand: 'Fulphila', generic: 'Pegfilgrastim-jmdb',
    class: 'PEGylated G-CSF (biosimilar)', route: 'SC',
    forms: ['injection 6mg/0.6mL'],
    dosing: { standard: '6 mg', unit: 'mg', frequency: 'Once per cycle' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — HRT / Fertility
  // ═══════════════════════════════════════════════════════════════════
  'testosterone': {
    rxnormCui: '10379', brand: 'AndroGel', generic: 'Testosterone',
    class: 'Androgen', route: 'SC/IM/topical',
    forms: ['gel 1%', 'gel 1.62%', 'gel 2%', 'injection 200mg/mL', 'injection 100mg/mL', 'patch 2mg/24h', 'patch 4mg/24h', 'nasal gel 5.5mg/actuation', 'buccal tablet 30mg'],
    dosing: { standard: '50-200 mg', unit: 'mg', frequency: 'QD (topical) or Q2 weeks (IM)' },
    interactions: ['Anticoagulants (increased INR)', 'Corticosteroids (edema)'],
    monitoring: ['Testosterone level', 'Hemoglobin/Hematocrit', 'PSA', 'Lipid profile', 'Liver function'],
  },
  'estradiol': {
    rxnormCui: '4083', brand: 'Estrace', generic: 'Estradiol',
    class: 'Estrogen', route: 'oral/transdermal/vaginal',
    forms: ['tablet 0.5mg', 'tablet 1mg', 'tablet 2mg', 'patch 0.025mg/day', 'patch 0.0375mg/day', 'patch 0.05mg/day', 'patch 0.075mg/day', 'patch 0.1mg/day', 'gel 0.06%', 'vaginal cream 0.01%', 'vaginal ring 0.05mg/day', 'vaginal insert 10mcg'],
    dosing: { standard: '0.5-2 mg', unit: 'mg', frequency: 'QD (oral) or QD (patch)' },
    interactions: ['CYP3A4 inhibitors', 'St. John\'s wort (reduced levels)'],
    contraindications: ['Undiagnosed vaginal bleeding', 'History of breast cancer', 'Active DVT/PE', 'Liver disease'],
    monitoring: ['Blood pressure', 'Breast exam', 'Endometrial assessment', 'Lipid profile', 'Mammogram'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Ophthalmology
  // ═══════════════════════════════════════════════════════════════════
  'timolol-eye': {
    rxnormCui: '1157100', brand: 'Timoptic', generic: 'Timolol ophthalmic',
    class: 'Beta-blocker (ophthalmic)', route: 'ophthalmic',
    forms: ['solution 0.25%', 'solution 0.5%', 'gel-forming solution 0.25%', 'gel-forming solution 0.5%'],
    dosing: { standard: '1 drop', unit: 'drop', frequency: 'BID' },
    interactions: ['Oral beta-blockers (additive)', 'CYP2D6 inhibitors'],
    monitoring: ['IOP', 'Heart rate', 'Pulmonary function (asthma)'],
  },
  'latanoprost': {
    rxnormCui: '43611', brand: 'Xalatan', generic: 'Latanoprost',
    class: 'Prostaglandin analog (ophthalmic)', route: 'ophthalmic',
    forms: ['solution 0.005%'],
    dosing: { standard: '1 drop', unit: 'drop', frequency: 'QHS' },
    monitoring: ['IOP', 'Iris pigmentation changes', 'Lash growth', 'Macular edema'],
  },
  'pilocarpine': {
    rxnormCui: '8328', brand: 'Isopto Carpine', generic: 'Pilocarpine',
    class: 'Cholinergic agonist (ophthalmic)', route: 'ophthalmic',
    forms: ['solution 0.5%', 'solution 1%', 'solution 2%', 'solution 4%'],
    dosing: { standard: '1 drop', unit: 'drop', frequency: 'QID-Q6H' },
    interactions: ['Anticholinergics (antagonize effect)'],
    monitoring: ['IOP', 'Miosis', 'Brow ache', 'Miotic complications'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Dermatology
  // ═══════════════════════════════════════════════════════════════════
  'hydrocortisone-topical': {
    rxnormCui: '1164013', brand: 'Cortaid', generic: 'Hydrocortisone topical',
    class: 'Topical corticosteroid', route: 'topical',
    forms: ['cream 0.5%', 'cream 1%', 'cream 2.5%', 'ointment 0.5%', 'ointment 1%', 'ointment 2.5%'],
    dosing: { standard: 'Apply thin layer', unit: 'topical', frequency: 'BID-QID' },
    monitoring: ['Skin atrophy', 'Hypothalamic-pituitary-adrenal (HPA) axis suppression (high potency)'],
  },
  'betamethasone-topical': {
    rxnormCui: '19254', brand: 'Diprolene', generic: 'Betamethasone dipropionate',
    class: 'Topical corticosteroid (high potency)', route: 'topical',
    forms: ['cream 0.05%', 'ointment 0.05%', 'lotion 0.05%'],
    dosing: { standard: 'Apply thin layer', unit: 'topical', frequency: 'BID' },
    monitoring: ['Skin atrophy', 'HPA axis suppression', 'Tinea screening before use'],
  },
  'mupirocin': {
    rxnormCui: '42372', brand: 'Bactroban', generic: 'Mupirocin',
    class: 'Topical antibiotic', route: 'topical',
    forms: ['ointment 2%', 'cream 2%'],
    dosing: { standard: 'Apply to affected area', unit: 'topical', frequency: 'TID × 5-10 days' },
    monitoring: ['MRSA coverage', 'Treatment response'],
  },
  'permethrin': {
    rxnormCui: '33199', brand: 'Elimite', generic: 'Permethrin',
    class: 'Topical antiparasitic', route: 'topical',
    forms: ['cream 5%', 'lotion 1%', 'shampoo 1%'],
    dosing: { standard: 'Apply to affected area', unit: 'topical', frequency: 'Leave on 8-14 hours, then wash off' },
    monitoring: ['Re-treatment at 7-14 days if needed', 'Contact dermatitis'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORTIVE CARE — Residual Strength Agents
  // ═══════════════════════════════════════════════════════════════════
  'oxymetazoline': {
    rxnormCui: '1162247', brand: 'Afrin', generic: 'Oxymetazoline nasal',
    class: 'Topical decongestant (alpha-1 agonist)', route: 'nasal',
    forms: ['nasal spray 0.05%'],
    dosing: { standard: '2-3 sprays', unit: 'spray', frequency: 'Q12H PRN × 3 days max' },
    interactions: ['MAO inhibitors (hypertensive crisis)', 'Sympathomimetics'],
    monitoring: ['Rhinitis medicamentosa (rebound congestion if >3 days)'],
  },
  'phenylephrine-nasal': {
    rxnormCui: '1158148', brand: 'Neo-Synephrine', generic: 'Phenylephrine nasal',
    class: 'Topical decongestant', route: 'nasal',
    forms: ['nasal spray 0.25%', 'nasal spray 0.5%'],
    dosing: { standard: '2-3 sprays', unit: 'spray', frequency: 'Q4H PRN' },
  },
  'fluticasone-nasal': {
    rxnormCui: '50121', brand: 'Flonase', generic: 'Fluticasone propionate nasal',
    class: 'Intranasal corticosteroid', route: 'nasal',
    forms: ['nasal spray 50mcg/spray'],
    dosing: { standard: '2 sprays', unit: 'spray', frequency: 'QD' },
    monitoring: ['Nasal septum perforation (rare)', 'Adrenal suppression (high doses)'],
  },
  'budesonide-nasal': {
    rxnormCui: '1156071', brand: 'Rhinocort', generic: 'Budesonide nasal',
    class: 'Intranasal corticosteroid', route: 'nasal',
    forms: ['nasal spray 32mcg/spray'],
    dosing: { standard: '2 sprays', unit: 'spray', frequency: 'QD' },
  },
  'montelukast': {
    rxnormCui: '88249', brand: 'Singulair', generic: 'Montelukast',
    class: 'Leukotriene receptor antagonist', route: 'oral',
    forms: ['tablet 4mg', 'tablet 5mg', 'tablet 10mg', 'chewable tablet 4mg', 'chewable tablet 5mg'],
    dosing: { standard: '10 mg', unit: 'mg', frequency: 'QHS' },
    interactions: [],
    monitoring: ['Neuropsychiatric effects (FDA boxed warning)', 'Asthma control', 'Churg-Strauss syndrome'],
  },
};

// Drug interaction pairs for fast lookup
// Brand, generic and NLM aliases → curated key (built once at load).
const CURATED_INDEX = new Map();
for (const [key, drug] of Object.entries(DRUG_DATABASE)) {
  CURATED_INDEX.set(normalizeDrugName(key), key);
  if (drug.generic) CURATED_INDEX.set(normalizeDrugName(drug.generic), key);
  if (drug.brand) CURATED_INDEX.set(normalizeDrugName(drug.brand), key);
}

// A drug seen only through the NLM overlay: label link, no structured data.
function labelOnlyRecord(name, entry) {
  return {
    generic: entry.generic || name,
    brand: entry.brand || null,
    class: null, route: null, forms: [],
    dosing: null,
    interactions: [], contraindications: [], monitoring: [],
    coverage: 'label-only',
    source: 'NLM DailyMed',
    nlmLabel: entry.label || null,
  };
}

export const DRUG_INTERACTIONS = [
  ['temozolomide', 'valproic acid', 'severe', 'Valproic acid inhibits UGT, reducing temozolomide clearance by ~35%. May reduce efficacy.', 'Consider alternative antiepileptic (levetiracetam preferred). If VPA essential, monitor temozolomide levels closely.'],
  ['temozolomide', 'dexamethasone', 'moderate', 'Dexamethasone may reduce temozolomide levels via CYP enzyme induction.', 'Monitor clinical response. Consider alternative steroid if possible.'],
  ['temozolomide', 'st johns wort', 'moderate', 'St. John\'s Wort induces CYP3A4 and P-glycoprotein, potentially reducing temozolomide efficacy.', 'Avoid concomitant use. Document reason for avoidance.'],
  ['cisplatin', 'aminoglycosides', 'severe', 'Additive nephrotoxicity and ototoxicity.', 'Avoid if possible. Monitor renal function, electrolytes, and hearing closely.'],
  ['carboplatin', 'aminoglycosides', 'severe', 'Additive nephrotoxicity.', 'Monitor renal function closely. Consider alternative antibiotic.'],
  ['methotrexate', 'nsaids', 'severe', 'NSAIDs reduce renal clearance of methotrexate, increasing toxicity risk.', 'Avoid NSAIDs 2 days before and after high-dose MTX. Use acetaminophen for pain.'],
  ['methotrexate', 'trimethoprim', 'severe', 'Additive folate antagonism causing severe myelosuppression.', 'Avoid combination. Use alternative antibiotic.'],
  ['methotrexate', 'penicillins', 'moderate', 'Penicillins reduce renal tubular secretion of methotrexate.', 'Monitor methotrexate levels if combination unavoidable.'],
  ['cyclophosphamide', 'allopurinol', 'moderate', 'Allopurinol increases cyclophosphamide-induced myelosuppression.', 'Reduce cyclophosphamide dose by 25-50% if allopurinol required.'],
  ['vincristine', 'live vaccines', 'severe', 'Vincristine causes immunosuppression; live vaccines may cause disseminated infection.', 'Avoid live vaccines during and for 3 months after treatment.'],
  ['doxorubicin', 'trastuzumab', 'severe', 'Additive cardiotoxicity. Risk of congestive heart failure.', 'Monitor LVEF closely. Consider dexrazoxane cardioprotection.'],
  ['fluorouracil', 'warfarin', 'severe', '5-FU potentiates warfarin effect, causing bleeding.', 'Monitor INR closely. Consider heparin bridge during 5-FU cycles.'],
  ['irinotecan', 'cyp3a4 inhibitors', 'moderate', 'CYP3A4 inhibitors (ketoconazole, itraconazole) increase irinotecan toxicity.', 'Reduce irinotecan dose or avoid strong CYP3A4 inhibitors.'],
  ['bevacizumab', 'nsaids', 'moderate', 'NSAIDs may increase GI perforation risk with bevacizumab.', 'Avoid NSAIDs during bevacizumab treatment. Use acetaminophen for pain.'],
  ['paclitaxel', 'cyp3a4 inhibitors', 'moderate', 'CYP3A4 inhibitors (ketoconazole) increase paclitaxel clearance reduction.', 'Monitor for increased toxicity. Consider dose reduction.'],
  ['pemetrexed', 'nsaids', 'severe', 'NSAIDs reduce renal clearance of pemetrexed, increasing myelosuppression and nephrotoxicity.', 'Avoid NSAIDs 2 days before, day of, and 2 days after pemetrexed.'],
  ['procarbazine', 'mao inhibitors', 'severe', 'Procarbazine is an MAO inhibitor — concurrent MAO inhibitors cause hypertensive crisis and serotonin syndrome.', 'CONTRAINDICATED. Document allergy to MAO inhibitors.'],
  ['procarbazine', 'ssri snri', 'severe', 'Additive serotonergic effect — risk of serotonin syndrome.', 'Discontinue SSRI/SNRI 2 weeks before starting procarbazine. Use alternative antidepressant.'],
  ['procarbazine', 'meperidine', 'severe', 'Procarbazine + meperidine can cause fatal serotonin syndrome and respiratory depression.', 'CONTRAINDICATED. Use alternative opioid (morphine, hydromorphone).'],
  ['lomustine', 'phenytoin', 'moderate', 'Phenytoin reduces lomustine levels. Lomustine may increase phenytoin levels.', 'Monitor phenytoin levels. May need dose adjustment.'],
  ['erlotinib', 'cyp3a4 inhibitors', 'moderate', 'Ketoconazole increases erlotinib AUC by 86%.', 'Reduce erlotinib dose to 50mg if strong CYP3A4 inhibitor required.'],
  ['erlotinib', 'cyp3a4 inducers', 'moderate', 'Rifampin reduces erlotinib AUC by 69%.', 'Avoid rifampin. Use alternative antibiotic. If unavoidable, increase erlotinib dose.'],
  ['gefitinib', 'ppis', 'moderate', 'Proton pump inhibitors raise gastric pH, reducing gefitinib absorption.', 'Separate by 12 hours. Consider H2 blocker instead.'],
  ['fluconazole', 'warfarin', 'moderate', 'Fluconazole inhibits CYP2C9, potentiating warfarin effect.', 'Monitor INR closely. Consider 25-50% warfarin dose reduction.'],
  ['fluconazole', 'phenytoin', 'moderate', 'Fluconazole increases phenytoin levels via CYP2C9 inhibition.', 'Monitor phenytoin levels. Reduce phenytoin dose if needed.'],
  ['linezolid', 'ssri snri', 'severe', 'Linezolid is a weak MAO inhibitor — combined with serotonergic drugs causes serotonin syndrome.', 'CONTRAINDICATED with SSRIs, SNRIs, triptans, meperidine, tramadol. Switch antibiotic.'],
  ['dexamethasone', 'nsaids', 'moderate', 'Additive GI ulceration and bleeding risk.', 'Add PPI or H2 blocker prophylaxis if combination required.'],
  ['phenytoin', 'warfarin', 'moderate', 'Phenytoin induces CYP enzymes, reducing warfarin effect (reduced INR).', 'Monitor INR closely. May need warfarin dose increase.'],
  ['phenytoin', 'dexamethasone', 'moderate', 'Phenytoin induces CYP3A4, reducing dexamethasone levels.', 'Consider alternative anticonvulsant (levetiracetam) to avoid interaction.'],
  ['phenytoin', 'amiodarone', 'moderate', 'Amiodarone inhibits phenytoin metabolism, increasing levels.', 'Monitor phenytoin levels. Reduce phenytoin dose.'],
  ['levetiracetam', 'none significant', 'mild', 'Levetiracetam has minimal CYP interactions.', 'Preferred anticonvulsant during chemotherapy due to few interactions.'],
  ['valproic acid', 'lamotrigine', 'severe', 'Valproic acid increases lamotrigine levels 2-4x, increasing SJS risk.', 'Reduce lamotrigine dose by 50%. Slow titration essential.'],
  ['valproic acid', 'carbamazepine', 'moderate', 'Bidirectional interaction — valproate increases CBZ metabolite levels.', 'Monitor CBZ levels and LFTs. Consider levetiracetam instead.'],
  ['valproic acid', 'carbapenems', 'severe', 'Carbapenems rapidly reduce valproic acid levels (up to 90% reduction).', 'AVOID combination. Use alternative antibiotic. If unavoidable, switch anticonvulsant.'],
  ['ondansetron', 'ssri snri', 'mild', 'Theoretical serotonin syndrome risk — low clinical significance at standard doses.', 'Monitor for serotonin syndrome symptoms. Usually safe at standard antiemetic doses.'],
  ['ondansetron', 'qt prolonging drugs', 'moderate', 'Ondansetron prolongs QTc. Additive with other QT-prolonging drugs.', 'Monitor QTc. Avoid if baseline QTc > 470ms (male) or > 480ms (female).'],
  ['haloperidol', 'qt prolonging drugs', 'moderate', 'Haloperidol prolongs QTc. Additive with other QT-prolonging drugs.', 'Monitor QTc. Avoid IV haloperidol with other QT-prolonging drugs.'],
  ['methadone', 'benzodiazepines', 'severe', 'Additive respiratory depression — leading cause of opioid overdose death.', 'AVOID if possible. If necessary, reduce both doses 50% and monitor closely.'],
  ['morphine', 'benzodiazepines', 'severe', 'Additive respiratory depression and sedation.', 'Use lowest effective doses. Monitor respiratory rate, sedation. Have naloxone available.'],
  ['potassium', 'ace inhibitors', 'moderate', 'ACE inhibitors increase potassium retention — combined risk of hyperkalemia.', 'Monitor potassium closely. Avoid potassium supplements if K⁺ > 5.0.'],
  ['digoxin', 'amiodarone', 'severe', 'Amiodarone increases digoxin levels by 70-100%.', 'Reduce digoxin dose by 50%. Monitor digoxin levels and toxicity.'],
  ['warfarin', 'amiodarone', 'severe', 'Amiodarone inhibits CYP2C9, increasing warfarin effect for weeks to months.', 'Reduce warfarin dose by 30-50%. Monitor INR weekly for 6+ weeks.'],
  ['methotrexate', 'probenecid', 'severe', 'Probenecid blocks renal tubular secretion of methotrexate, causing severe toxicity.', 'Avoid combination. Use alternative urate-lowering therapy.'],
  ['methotrexate', 'penicillin v', 'moderate', 'High-dose penicillin reduces renal tubular secretion of methotrexate.', 'Monitor methotrexate levels. Use alternative antibiotic if possible.'],
  ['methotrexate', 'trimethoprim sulfamethoxazole', 'severe', 'Additive antifolate effect causing severe pancytopenia.', 'AVOID combination. Use alternative antibiotic. Add leucovorin rescue if unavoidable.'],
  ['bleomycin', 'oxygen', 'severe', 'Oxygen potentiates bleomycin pulmonary toxicity. Even FiO₂ > 21% increases risk.', 'Minimize oxygen exposure during and 2 months after bleomycin. Use lowest FiO₂.'],
  ['l-asparaginase', 'methotrexate', 'moderate', 'L-asparaginase may decrease methotrexate clearance.', 'Monitor methotrexate levels and toxicity. Timing of administration matters.'],
  ['cyclophosphamide', 'digoxin', 'moderate', 'Cyclophosphamide may reduce digoxin absorption.', 'Monitor digoxin levels during cyclophosphamide therapy.'],
  ['capecitabine', 'warfarin', 'severe', 'Capecitabine increases INR with warfarin.', 'Monitor INR closely. Consider LMWH bridge during capecitabine cycles.'],
  ['doxorubicin', 'dexrazoxane', 'mild', 'Dexrazoxane is cardioprotective and may reduce doxorubicin cardiotoxicity.', 'Use dexrazoxane for patients who have received >300 mg/m² doxorubicin or high risk.'],
  ['vinblastine', 'mitomycin', 'severe', 'Additive pulmonary toxicity.', 'Monitor PFTs closely. Limit cumulative doses of both.'],
  ['carmustine', 'phenytoin', 'moderate', 'Carmustine may reduce phenytoin levels; phenytoin may reduce carmustine efficacy.', 'Monitor phenytoin levels. Consider levetiracetam instead.'],
  ['oxaliplatin', '5 fu', 'mild', 'Synergistic efficacy in colorectal cancer (FOLFOX).', 'Expected combination — monitor for additive neuropathy and mucositis.'],
  ['thalidomide', 'digoxin', 'mild', 'Thalidomide may reduce digoxin absorption.', 'Monitor digoxin levels. Consider levetiracetam for seizures instead of phenytoin.'],
  ['bortezomib', 'cyp3a4 inhibitors', 'moderate', 'Ketoconazole increases bortezomib AUC by 35%.', 'Monitor for increased bortezomib toxicity. Consider dose reduction.'],
  ['lenalidomide', 'digoxin', 'mild', 'Lenalidomide may affect digoxin absorption.', 'Monitor digoxin levels if co-prescribed.'],
  ['cyclosporine', 'grapefruit juice', 'moderate', 'Grapefruit juice increases cyclosporine levels by 50-300%.', 'AVOID grapefruit and grapefruit juice during cyclosporine therapy.'],
  ['tacrolimus', 'grapefruit juice', 'moderate', 'Grapefruit juice increases tacrolimus levels significantly.', 'AVOID grapefruit and grapefruit juice during tacrolimus therapy.'],
  ['tacrolimus', 'azole antifungals', 'severe', 'Azole antifungals inhibit CYP3A4, significantly increasing tacrolimus levels.', 'Reduce tacrolimus dose 50-75%. Monitor levels daily during azole therapy.'],
  ['sirolimus', 'azole antifungals', 'severe', 'Azole antifungals increase sirolimus levels via CYP3A4 inhibition.', 'Reduce sirolimus dose. Monitor levels closely.'],
  ['mycophenolate', 'antacids', 'moderate', 'Antacids reduce mycophenolate absorption by 30-40%.', 'Separate administration by 2 hours. Use mycophenolate mofetil instead of mycophenolate sodium.'],
  ['metformin', 'contrast dye', 'severe', 'Iodinated contrast causes metformin accumulation and lactic acidosis risk.', 'Hold metformin 48h before and after contrast. Recheck renal function before restarting.'],
  ['metformin', 'alcohol', 'severe', 'Alcohol potentiates metformin-induced lactic acidosis.', 'Counsel patient to limit alcohol. Discourage binge drinking.'],
  ['warfarin', 'amiodarone', 'severe', 'Amiodarone increases warfarin effect for weeks to months.', 'Reduce warfarin dose 30-50%. Monitor INR weekly for 6+ weeks.'],
  ['warfarin', 'fluconazole', 'moderate', 'Fluconazole inhibits CYP2C9, increasing warfarin effect.', 'Monitor INR. Consider 25-50% warfarin dose reduction.'],
  ['warfarin', 'phenytoin', 'moderate', 'Bidirectional: phenytoin induces warfarin metabolism (reduces INR) but also inhibits it acutely.', 'Monitor INR closely. Complex interaction — may need frequent adjustments.'],
  ['lisinopril', 'potassium', 'moderate', 'ACE inhibitors increase potassium retention.', 'Monitor potassium. Avoid potassium supplements if K⁺ > 5.0.'],
  ['lisinopril', 'nsaids', 'moderate', 'NSAIDs reduce ACE inhibitor efficacy and increase renal risk.', 'Avoid chronic NSAID use with ACE inhibitors. Use acetaminophen for pain.'],
  ['metoprolol', 'verapamil', 'severe', 'Additive bradycardia and AV block — can cause cardiac arrest.', 'AVOID combination unless closely monitored in controlled setting.'],
  ['amlodipine', 'simvastatin', 'moderate', 'Amlodipine increases simvastatin levels, increasing myopathy risk.', 'Limit simvastatin to 20mg/day with amlodipine.'],
  ['levothyroxine', 'calcium', 'moderate', 'Calcium supplements reduce levothyroxine absorption.', 'Separate by 4 hours. Take levothyroxine on empty stomach.'],
  ['levothyroxine', 'iron', 'moderate', 'Iron supplements reduce levothyroxine absorption.', 'Separate by 4 hours.'],
  ['azathioprine', 'allopurinol', 'severe', 'Allopurinol blocks azathioprine metabolism, causing severe myelosuppression.', 'Reduce azathioprine dose by 75%. Or use alternative (mycophenolate).'],
  ['fluoroquinolones', 'antacids', 'moderate', 'Divalent cations (Ca²⁺, Mg²⁺, Al³⁺) chelate fluoroquinolones, reducing absorption.', 'Separate by 2 hours before or 6 hours after fluoroquinolone.'],
  ['fluoroquinolones', 'tizanidine', 'severe', 'Fluoroquinolones (especially ciprofloxacin) inhibit CYP1A2, increasing tizanidine levels 10x.', 'CONTRAINDICATED. Use alternative antibiotic or muscle relaxant.'],
  ['fluoroquinolones', 'theophylline', 'severe', 'Fluoroquinolones (especially ciprofloxacin) increase theophylline levels, causing seizures.', 'Avoid combination. If unavoidable, monitor theophylline levels and reduce dose.'],
  ['linezolid', 'meperidine', 'severe', 'Linezolid (weak MAO inhibitor) + meperidine = fatal serotonin syndrome.', 'CONTRAINDICATED. Use alternative opioid.'],
  ['linezolid', 'mao inhibitors', 'severe', 'Additive MAO inhibition — risk of severe hypertensive crisis and serotonin syndrome.', 'CONTRAINDICATED. Wait 2 weeks after MAO inhibitor discontinuation.'],
  ['meropenem', 'valproic acid', 'severe', 'Carbapenems rapidly reduce valproic acid levels (up to 90%).', 'AVOID combination. Use alternative antibiotic. Switch anticonvulsant.'],
  ['vancomycin', 'piperacillin-tazobactam', 'moderate', 'Increased acute kidney injury risk vs vancomycin + cefepime.', 'Prefer vancomycin + cefepime when possible. Monitor renal function closely.'],
  ['vancomycin', 'aminoglycosides', 'severe', 'Additive nephrotoxicity and ototoxicity.', 'Avoid combination. Monitor renal function, drug levels, and hearing.'],
  ['methimazole', 'warfarin', 'moderate', 'Methimazole may potentiate warfarin effect via iodine release.', 'Monitor INR. May need warfarin dose adjustment.'],
  ['insulin', 'beta blockers', 'moderate', 'Beta blockers mask hypoglycemia symptoms (tachycardia).', 'Counsel patient on non-adrenergic hypoglycemia symptoms (sweating, confusion).'],
  ['glipizide', 'fluconazole', 'moderate', 'Fluconazole increases sulfonylurea levels via CYP2C9 inhibition.', 'Monitor blood glucose. Reduce sulfonylurea dose if hypoglycemia occurs.'],
  ['semaglutide', 'insulin', 'moderate', 'Additive hypoglycemia risk.', 'Reduce insulin dose when initiating semaglutide. Monitor blood glucose closely.'],
];

/**
 * Search drugs by name, brand, or RxNorm CUI
 */
export function searchDrugs(query) {
  const q = query.toLowerCase().trim();
  const results = [];
  const seen = new Set();
  for (const [name, drug] of Object.entries(DRUG_DATABASE)) {
    if (name.includes(q) || (drug.brand || '').toLowerCase().includes(q) ||
        (drug.generic || '').toLowerCase().includes(q) ||
        (drug.rxnormCui || '').includes(q)) {
      results.push({ name, ...drug });
      seen.add(normalizeDrugName(name));
      if (drug.generic) seen.add(normalizeDrugName(drug.generic));
      if (drug.brand) seen.add(normalizeDrugName(drug.brand));
    }
  }
  // Reference-only entries for drugs outside the curated table.
  for (const entry of allLabelEntries()) {
    if (seen.has(entry.key)) continue;
    const haystack = [entry.key, entry.generic, ...(entry.aliases || [])].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(q) || (entry.rxcui || '').includes(q)) {
      results.push({ name: entry.key, ...labelOnlyRecord(entry.displayName || entry.key, entry) });
    }
  }
  return results;
}

/**
 * Get detailed drug info by name, generic, or brand.
 * Curated entries win; anything known only to the NLM overlay returns a
 * reference-only record (`coverage: 'label-only'`, no dosing) instead of null.
 */
export function getDrugInfo(name) {
  const key = normalizeDrugName(name);
  if (!key) return null;

  const curatedKey = CURATED_INDEX.get(key);
  if (curatedKey) {
    const drug = DRUG_DATABASE[curatedKey];
    const entry = getLabelEntry(curatedKey) || getLabelEntry(key);
    return entry?.label ? { ...drug, nlmLabel: entry.label } : drug;
  }

  const entry = getLabelEntry(key);
  if (entry) return labelOnlyRecord(entry.displayName || entry.generic || name, entry);
  return null;
}

/**
 * Check interactions for a list of medications
 */
export function checkInteractions(medications) {
  const meds = medications.map(m => m.toLowerCase().trim());
  const interactions = [];
  for (const [drugA, drugB, severity, description, recommendation] of DRUG_INTERACTIONS) {
    for (let i = 0; i < meds.length; i++) {
      for (let j = i + 1; j < meds.length; j++) {
        if ((meds[i].includes(drugA) && meds[j].includes(drugB)) ||
            (meds[i].includes(drugB) && meds[j].includes(drugA))) {
          interactions.push({ drugA: meds[i], drugB: meds[j], severity, description, recommendation });
        }
      }
    }
  }
  return interactions.sort((a, b) => {
    const order = { severe: 0, moderate: 1, mild: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
}
