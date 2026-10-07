// ═══════════════════════════════════════════════════════════════════
// BILLING, NCCN, HIPAA, FHIR, ANALYTICS — Route Module
// ═══════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
const router = Router();

// Auth: only apply to routes this router handles (skip non-matching for 404 passthrough)
const BILLING_PREFIXES = ['/billing', '/hipaa', '/fhir', '/nccn', '/biomarkers', '/dosing', '/reports'];
router.use((req, res, next) => {
  const isBillingRoute = BILLING_PREFIXES.some(p => req.path.startsWith(p));
  if (isBillingRoute) {
    authenticate(req, res, () => requireRole('doctor', 'admin')(req, res, next));
  } else {
    next(); // Not our route — pass to next handler (404)
  }
});

// ─── Helper ───────────────────────────────────────────────────────
function now() { return new Date().toISOString(); }
function genId() { return randomUUID(); }
function genClaimNum() { return 'CLM-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase(); }
function genInvoiceNum() { return 'INV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase(); }

async function writeBillingAudit({ userId, action, category, details, patientMrn }) {
  try {
    await db.prepare(`INSERT INTO clinical_audit_log(id,doctor_id,patient_mrn,action,category,detail_enc,created_at) VALUES(?,?,?,?,?,?,?)`).run(
      genId(), userId || 'system', patientMrn || '', action, category || 'billing', JSON.stringify(details || {}), now()
    );
  } catch(e) { /* non-critical */ }
}

// ═══════════════════════════════════════════════════════════════════
// 💰 BILLING — Invoices, Claims, Payments, Insurance
// ═══════════════════════════════════════════════════════════════════

// --- Invoices ---
router.post('/billing/invoices', asyncHandler(async (req, res) => {
  const { patientMrn, items = [], notes, dueDate } = req.body;
  if (!patientMrn) return res.status(400).json({ error: 'patientMrn required' });
  const id = genId(), num = genInvoiceNum(), ts = now();
  let subtotal = 0;
  for (const it of items) subtotal += (it.unitPrice || 0) * (it.quantity || 1);
  const total = subtotal;
    await db.prepare(`INSERT INTO billing_invoices(id,doctor_id,patient_mrn,invoice_number,status,subtotal,total,balance_due,due_date,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.auth.subjectId, patientMrn, num, 'draft', subtotal, total, total, dueDate || null, notes || '', ts, ts
  );
  for (const it of items) {
    await db.prepare(`INSERT INTO billing_line_items(id,invoice_id,description,cpt_code,icd10_code,hcpcs_code,quantity,unit_price,total,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      genId(), id, it.description || '', it.cptCode || null, it.icd10Code || null, it.hcpcsCode || null, it.quantity || 1, it.unitPrice || 0, (it.unitPrice || 0) * (it.quantity || 1), ts
    );
  }
  writeBillingAudit({ userId: req.auth.subjectId, action: 'invoice_created', category: 'billing', details: { invoiceNumber: num, total }, patientMrn });
  res.json({ id, invoiceNumber: num, total });
}));

router.get('/billing/invoices', asyncHandler(async (req, res) => {
  const { patientMrn, status, limit = 50 } = req.query;
    let sql = 'SELECT * FROM billing_invoices WHERE 1=1';
  const params = [];
  if (patientMrn) { sql += ' AND patient_mrn = ?'; params.push(patientMrn); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(+limit);
  const rows = await db.prepare(sql).all(...params);
  res.json(rows);
}));

router.get('/billing/invoices/:id', asyncHandler(async (req, res) => {
    const inv = await db.prepare('SELECT * FROM billing_invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.items = await db.prepare('SELECT * FROM billing_line_items WHERE invoice_id = ?').all(req.params.id);
  inv.payments = await db.prepare('SELECT * FROM billing_payments WHERE invoice_id = ?').all(req.params.id);
  res.json(inv);
}));

router.put('/billing/invoices/:id', asyncHandler(async (req, res) => {
    const { status, notes, dueDate } = req.body;
  const ts = now();
  if (status) await db.prepare('UPDATE billing_invoices SET status=?, notes=COALESCE(?,notes), due_date=COALESCE(?,due_date), updated_at=? WHERE id=?').run(status, notes, dueDate, ts, req.params.id);
  res.json({ ok: true });
}));

// --- Claims ---
router.post('/billing/claims', asyncHandler(async (req, res) => {
  const { patientMrn, invoiceId, payerName, payerId, memberId, groupNumber, claimType, totalCharged } = req.body;
  if (!patientMrn || !payerName) return res.status(400).json({ error: 'patientMrn and payerName required' });
  const id = genId(), num = genClaimNum(), ts = now();
    await db.prepare(`INSERT INTO billing_claims(id,doctor_id,patient_mrn,invoice_id,claim_number,payer_name,payer_id,member_id,group_number,status,claim_type,total_charged,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.auth.subjectId, patientMrn, invoiceId || null, num, payerName, payerId || null, memberId || null, groupNumber || null, 'draft', claimType || 'professional', totalCharged || 0, ts, ts
  );
  res.json({ id, claimNumber: num });
}));

router.get('/billing/claims', asyncHandler(async (req, res) => {
  const { patientMrn, status, limit = 50 } = req.query;
    let sql = 'SELECT * FROM billing_claims WHERE 1=1';
  const params = [];
  if (patientMrn) { sql += ' AND patient_mrn = ?'; params.push(patientMrn); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(+limit);
  res.json(await db.prepare(sql).all(...params));
}));

router.put('/billing/claims/:id', asyncHandler(async (req, res) => {
    const { status, denialReason, totalAllowed, totalPaid } = req.body;
  const ts = now();
  let sql = 'UPDATE billing_claims SET status=?, updated_at=?';
  const params = [status || 'draft', ts];
  if (denialReason) { sql += ', denial_reason=?'; params.push(denialReason); }
  if (totalAllowed != null) { sql += ', total_allowed=?'; params.push(totalAllowed); }
  if (totalPaid != null) { sql += ', total_paid=?'; params.push(totalPaid); }
  if (status === 'paid' || status === 'approved') { sql += ', resolved_date=?'; params.push(ts); }
  sql += ' WHERE id=?'; params.push(req.params.id);
  await db.prepare(sql).run(...params);
  res.json({ ok: true });
}));

// --- Payments ---
router.post('/billing/payments', asyncHandler(async (req, res) => {
  const { patientMrn, invoiceId, claimId, amount, method, reference, notes } = req.body;
  if (!patientMrn || !amount) return res.status(400).json({ error: 'patientMrn and amount required' });
  const id = genId(), ts = now();
    await db.prepare(`INSERT INTO billing_payments(id,doctor_id,patient_mrn,invoice_id,claim_id,amount,method,reference,date,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.auth.subjectId, patientMrn, invoiceId || null, claimId || null, amount, method || 'cash', reference || '', ts, notes || '', ts
  );
  if (invoiceId) {
    await db.prepare('UPDATE billing_invoices SET amount_paid = amount_paid + ?, balance_due = balance_due - ?, updated_at = ? WHERE id = ?').run(amount, amount, ts, invoiceId);
  }
  res.json({ id });
}));

router.get('/billing/payments', asyncHandler(async (req, res) => {
  const { patientMrn, limit = 50 } = req.query;
    let sql = 'SELECT * FROM billing_payments WHERE 1=1';
  const params = [];
  if (patientMrn) { sql += ' AND patient_mrn = ?'; params.push(patientMrn); }
  sql += ' ORDER BY date DESC LIMIT ?'; params.push(+limit);
  res.json(await db.prepare(sql).all(...params));
}));

// --- Insurance ---
router.post('/billing/insurance', asyncHandler(async (req, res) => {
  const { patientMrn, payerName, planType, memberId, groupNumber, subscriberName, relationship, phone, isPrimary, effectiveDate, expiryDate, copay, deductible } = req.body;
  if (!patientMrn || !payerName) return res.status(400).json({ error: 'patientMrn and payerName required' });
  const id = genId(), ts = now();
    if (isPrimary) await db.prepare('UPDATE patient_insurance SET is_primary = 0 WHERE patient_mrn = ?').run(patientMrn);
  await db.prepare(`INSERT INTO patient_insurance(id,patient_mrn,payer_name,plan_type,member_id,group_number,subscriber_name,relationship,phone,is_primary,effective_date,expiry_date,copay,deductible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, patientMrn, payerName, planType || null, memberId || null, groupNumber || null, subscriberName || null, relationship || 'self', phone || null, isPrimary ? 1 : 0, effectiveDate || null, expiryDate || null, copay || null, deductible || null, ts, ts
  );
  res.json({ id });
}));

router.get('/billing/insurance/:patientMrn', asyncHandler(async (req, res) => {
    res.json(await db.prepare('SELECT * FROM patient_insurance WHERE patient_mrn = ? ORDER BY is_primary DESC').all(req.params.patientMrn));
}));

// --- Billing Dashboard Stats ---
router.get('/billing/stats', asyncHandler(async (req, res) => {
    const totalRevenue = (await db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM billing_payments").get()).v;
  const totalOutstanding = (await db.prepare("SELECT COALESCE(SUM(balance_due),0) as v FROM billing_invoices WHERE status NOT IN ('paid','cancelled','void')").get()).v;
  const totalClaims = (await db.prepare("SELECT COUNT(*) as v FROM billing_claims").get()).v;
  const pendingClaims = (await db.prepare("SELECT COUNT(*) as v FROM billing_claims WHERE status IN ('draft','submitted','in_review')").get()).v;
  const deniedClaims = (await db.prepare("SELECT COUNT(*) as v FROM billing_claims WHERE status = 'denied'").get()).v;
  const invoicesThisMonth = (await db.prepare("SELECT COUNT(*) as v FROM billing_invoices WHERE created_at >= date('now','start of month')").get()).v;
  const revenueThisMonth = (await db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM billing_payments WHERE date >= date('now','start of month')").get()).v;
  const avgInvoiceValue = (await db.prepare("SELECT COALESCE(AVG(total),0) as v FROM billing_invoices WHERE status != 'void'").get()).v;
  res.json({ totalRevenue, totalOutstanding, totalClaims, pendingClaims, deniedClaims, invoicesThisMonth, revenueThisMonth, avgInvoiceValue });
}));

// --- ICD-10 / CPT Quick Lookup ---
router.get('/billing/codes/icd10', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
    // Try nccn_guidelines cancer types first, then return common neuro-onc ICD codes
  const commonCodes = [
    { code: 'C71.0', desc: 'Malignant neoplasm of cerebral hemisphere' },
    { code: 'C71.1', desc: 'Malignant neoplasm of frontal lobe' },
    { code: 'C71.2', desc: 'Malignant neoplasm of temporal lobe' },
    { code: 'C71.3', desc: 'Malignant neoplasm of parietal lobe' },
    { code: 'C71.4', desc: 'Malignant neoplasm of occipital lobe' },
    { code: 'C71.5', desc: 'Malignant neoplasm of brain ventricle' },
    { code: 'C71.6', desc: 'Malignant neoplasm of cerebellum' },
    { code: 'C71.7', desc: 'Malignant neoplasm of brain stem' },
    { code: 'C71.8', desc: 'Malignant neoplasm of overlapping brain sites' },
    { code: 'C71.9', desc: 'Malignant neoplasm of brain, unspecified' },
    { code: 'C72.0', desc: 'Malignant neoplasm of spinal cord' },
    { code: 'C72.1', desc: 'Malignant neoplasm of cauda equina' },
    { code: 'C72.2', desc: 'Malignant neoplasm of olfactory nerve' },
    { code: 'C72.3', desc: 'Malignant neoplasm of optic nerve' },
    { code: 'C72.4', desc: 'Malignant neoplasm of acoustic nerve' },
    { code: 'C72.5', desc: 'Malignant neoplasm of cranial nerves, other' },
    { code: 'C70.0', desc: 'Malignant neoplasm of cerebral meninges' },
    { code: 'C70.1', desc: 'Malignant neoplasm of spinal meninges' },
    { code: 'D33.1', desc: 'Benign neoplasm of brain, cranial nerves' },
    { code: 'D33.2', desc: 'Benign neoplasm of brain, unspecified' },
    { code: 'D42.0', desc: 'Neoplasm of uncertain behavior, cerebral meninges' },
    { code: 'D43.0', desc: 'Neoplasm of uncertain behavior, cerebrum' },
    { code: 'D43.1', desc: 'Neoplasm of uncertain behavior, cerebellum' },
    { code: 'D43.2', desc: 'Neoplasm of uncertain behavior, brain, unspecified' },
    { code: 'R90.0', desc: 'Intracranial neoplasm, unspecified' },
  ];
  const lcq = q.toLowerCase();
  res.json(commonCodes.filter(c => c.code.toLowerCase().includes(lcq) || c.desc.toLowerCase().includes(lcq)));
}));

router.get('/billing/codes/cpt', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const commonCodes = [
    { code: '99201-99205', desc: 'Office visit, new patient (level 1-5)', category: 'E&M' },
    { code: '99211-99215', desc: 'Office visit, established patient (level 1-5)', category: 'E&M' },
    { code: '99281-99285', desc: 'Emergency department visit', category: 'E&M' },
    { code: '99232-99233', desc: 'Subsequent hospital care', category: 'E&M' },
    { code: '99242-99245', desc: 'Consultation', category: 'E&M' },
    { code: '70551-70553', desc: 'MRI brain without/with contrast', category: 'Radiology' },
    { code: '72141-72148', desc: 'MRI spine', category: 'Radiology' },
    { code: '70450-70470', desc: 'CT head', category: 'Radiology' },
    { code: '70496', desc: 'CTA head/neck', category: 'Radiology' },
    { code: '78608', desc: 'Brain PET scan', category: 'Nuclear' },
    { code: '96413', desc: 'Chemotherapy administration, IV', category: 'Chemo' },
    { code: '96401-96402', desc: 'Chemotherapy, IM/SC', category: 'Chemo' },
    { code: '96549', desc: 'Intrathecal chemotherapy', category: 'Chemo' },
    { code: '61590', desc: 'Craniotomy for tumor', category: 'Surgery' },
    { code: '61591', desc: 'Craniotomy, decompressive', category: 'Surgery' },
    { code: '61616', desc: 'Biopsy of brain lesion, needle', category: 'Surgery' },
    { code: '95819', desc: 'EEG, routine', category: 'Neuro' },
    { code: '95957', desc: 'EEG, continuous monitoring', category: 'Neuro' },
    { code: '93000', desc: 'EKG, 12-lead', category: 'Cardio' },
    { code: '85025', desc: 'CBC with differential', category: 'Lab' },
    { code: '80053', desc: 'Comprehensive metabolic panel', category: 'Lab' },
    { code: '84443', desc: 'TSH', category: 'Lab' },
    { code: '82607', desc: 'Vitamin B12', category: 'Lab' },
    { code: '82728', desc: 'Folate', category: 'Lab' },
    { code: '85610', desc: 'PT/INR', category: 'Lab' },
  ];
  const lcq = q.toLowerCase();
  res.json(commonCodes.filter(c => c.desc.toLowerCase().includes(lcq) || c.code.toLowerCase().includes(lcq) || c.category.toLowerCase().includes(lcq)));
}));

// ═══════════════════════════════════════════════════════════════════
// 📋 NCCN GUIDELINES & 🧬 BIOMARKER ALERTS
// ═══════════════════════════════════════════════════════════════════

router.get('/nccn/guidelines', asyncHandler(async (req, res) => {
  const { cancerType, biomarker, category } = req.query;
    let sql = 'SELECT * FROM nccn_guidelines WHERE 1=1';
  const params = [];
  if (cancerType) { sql += ' AND cancer_type LIKE ?'; params.push('%' + cancerType + '%'); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY evidence_level ASC';
  const rows = await db.prepare(sql).all(...params);
  // If biomarker filter, parse JSON and filter
  if (biomarker) {
    const lc = biomarker.toLowerCase();
    res.json(rows.filter(r => {
      try { const b = JSON.parse(r.biomarkers || '[]'); return b.some(x => x.toLowerCase().includes(lc)); }
      catch { return false; }
    }));
  } else {
    res.json(rows);
  }
}));

router.get('/nccn/recommendations/:patientMrn', asyncHandler(async (req, res) => {
  let diagText = '';
  try { const { decryptPHI } = await import('../crypto.js');
    const kvRow = await db.prepare('SELECT v_enc FROM kv_store WHERE k = ?').get('pat_' + req.params.patientMrn);
    if (kvRow) { const patData = decryptPHI(kvRow.v_enc); diagText = (patData?.diag || patData?.diagnosis || '').toLowerCase(); }
  } catch {}
  if (!diagText) return res.json([]);
  const biomarkers = await db.prepare('SELECT * FROM biomarker_results WHERE patient_mrn = ? ORDER BY report_date DESC').all(req.params.patientMrn);
  const allGuidelines = await db.prepare('SELECT * FROM nccn_guidelines').all();
  const recommendations = [];
  for (const g of allGuidelines) {
    let score = 0;
    if (diagText.includes(g.cancer_type.toLowerCase())) score += 3;
    if (g.biomarkers) { try { const gBios = JSON.parse(g.biomarkers);
      for (const bio of biomarkers) { const m = (bio.biomarker+'_'+bio.result).toLowerCase();
        if (gBios.some(gb => m.includes(gb.toLowerCase().replace(/ /g,'_')))) score += 2; } } catch {} }
    if (score > 0) recommendations.push({ ...g, relevanceScore: score });
  }
  recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
  res.json(recommendations.slice(0, 10));
}));

// --- Biomarker CRUD ---
router.post('/biomarkers', asyncHandler(async (req, res) => {
  const { patientMrn, biomarker, result, numericValue, method, labName, reportDate, clinicalSignificance, notes } = req.body;
  if (!patientMrn || !biomarker || !result) return res.status(400).json({ error: 'patientMrn, biomarker, result required' });
  const id = genId(), ts = now();
  
  // Auto-determine clinical significance
  let significance = clinicalSignificance || '';
  const bioLc = (biomarker + '_' + result).toLowerCase();
  const sigMap = {
    'mgmt_methylated': 'Favorable prognosis. Predicts improved response to temozolomide. Consider Stupp protocol.',
    'mgmt_unmethylated': 'Less favorable prognosis. TMZ benefit uncertain. Consider bevacizumab-based regimens.',
    'egfr_amplified': 'EGFR amplification detected. Consider EGFR-targeted therapy (RTA-744, depatuxizumab).',
    'braf_v600e': 'BRAF V600E mutation. Consider BRAF/MEK inhibitor combination (dabrafenib + trametinib).',
    'idh1_mutant': 'IDH1 mutant. Favorable prognosis. Consider IDH inhibitor (vorasidenib).',
    'idh2_mutant': 'IDH2 mutant. Favorable prognosis. Consider IDH inhibitor.',
    '1p19q_codeleted': '1p/19q co-deletion. Classic oligodendroglioma. PCV + RT regimen recommended.',
    'h3k27m': 'H3 K27M mutation. Diffuse midline glioma. Poor prognosis. Consider ONC201, clinical trials.',
    'tert_promoter_mutant': 'TERT promoter mutation. Associated with glioblastoma. May indicate poor prognosis.',
    'atrx_loss': 'ATRX loss. Alternative lengthening of telomeres. Associated with IDH-mutant gliomas.',
    'pten_loss': 'PTEN loss. Associated with aggressive GBM. PI3K/AKT pathway activation.',
    'ki67_high': 'High Ki-67 (>10%). Proliferative tumor. Consider aggressive therapy.',
  };
  if (!significance) {
    for (const [k, v] of Object.entries(sigMap)) {
      if (bioLc.includes(k)) { significance = v; break; }
    }
  }

  // Auto-recommend protocols
  let recommendedProtocols = '';
  const recs = await db.prepare('SELECT id, protocol_name FROM nccn_guidelines').all();
  const matched = [];
  for (const r of recs) {
    if (r.id.includes('gbm') && bioLc.includes('mgmt')) matched.push(r.id);
    if (r.id.includes('astro') && bioLc.includes('1p19q')) matched.push(r.id);
    if (r.id.includes('glioma') && (bioLc.includes('braf') || bioLc.includes('h3k27m'))) matched.push(r.id);
  }
  recommendedProtocols = JSON.stringify([...new Set(matched)]);

  await db.prepare(`INSERT INTO biomarker_results(id,doctor_id,patient_mrn,biomarker,result,numeric_value,method,lab_name,report_date,clinical_significance,recommended_protocols,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.auth.subjectId, patientMrn, biomarker, result, numericValue || null, method || null, labName || null, reportDate || ts, significance, recommendedProtocols, notes || '', ts
  );
  writeBillingAudit({ userId: req.auth.subjectId, action: 'biomarker_added', category: 'clinical', details: { biomarker, result }, patientMrn });

  // v2.1 delta-check + range flags: compare against this patient's most
  // recent prior value and the age/sex reference bands.
  let deltaCheck = null;
  try {
    const { computeDeltaCheck } = await import('./enhancements.js');
    deltaCheck = await computeDeltaCheck({ patientMrn, biomarker, numericValue, reportDate, excludeId: id });
  } catch {}

  res.json({ id, clinicalSignificance: significance, recommendedProtocols: JSON.parse(recommendedProtocols || '[]'), deltaCheck });
}));

router.get('/biomarkers/:patientMrn', asyncHandler(async (req, res) => {
    res.json(await db.prepare('SELECT * FROM biomarker_results WHERE patient_mrn = ? ORDER BY report_date DESC').all(req.params.patientMrn));
}));

// --- Cumulative Dose Tracking ---
router.post('/dosing/cumulative', asyncHandler(async (req, res) => {
  const { patientMrn, drugName, dose, doseUnit, maxLifetime, cycleNumber } = req.body;
  if (!patientMrn || !drugName) return res.status(400).json({ error: 'patientMrn and drugName required' });
  const ts = now();
  const existing = await db.prepare('SELECT * FROM cumulative_doses WHERE patient_mrn = ? AND drug_name = ?').get(patientMrn, drugName);

  let newCumulative, warnings = [];
  if (existing) {
    newCumulative = (existing.cumulative_dose || 0) + (dose || 0);
    await db.prepare('UPDATE cumulative_doses SET cumulative_dose=?, dose_unit=COALESCE(?,dose_unit), last_admin_date=?, cycle_number=?, updated_at=? WHERE id=?').run(
      newCumulative, doseUnit, ts, cycleNumber || existing.cycle_number, ts, existing.id
    );
  } else {
    newCumulative = dose || 0;
    const id = genId();
    await db.prepare(`INSERT INTO cumulative_doses(id,patient_mrn,drug_name,cumulative_dose,dose_unit,max_lifetime,last_admin_date,cycle_number,warnings,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, patientMrn, drugName, newCumulative, doseUnit || 'mg', maxLifetime || null, ts, cycleNumber || null, '[]', ts, ts
    );
  }

  // Check limits
  const lifetimeMax = maxLifetime || existing?.max_lifetime;
  if (lifetimeMax && newCumulative >= lifetimeMax * 0.9) {
    warnings.push(`⚠️ Approaching lifetime max dose of ${drugName}: ${newCumulative}/${lifetimeMax} ${doseUnit || 'mg'}`);
  }
  if (lifetimeMax && newCumulative >= lifetimeMax) {
    warnings.push(`🚨 EXCEEDED lifetime max dose of ${drugName}: ${newCumulative}/${lifetimeMax} ${doseUnit || 'mg'}`);
  }

  // Known cumulative dose limits for specific drugs
  const knownLimits = {
    'doxorubicin': { max: 550, unit: 'mg/m2', warning: 'Cardiotoxicity risk increases significantly above 550 mg/m2 cumulative dose' },
    'bleomycin': { max: 400, unit: 'units', warning: 'Pulmonary toxicity risk above 400 units cumulative' },
    'carboplatin': { max: null, unit: 'AUC', warning: 'Track cumulative AUC for ototoxicity and nephrotoxicity' },
    'cisplatin': { max: null, unit: 'mg/m2', warning: 'Track cumulative dose for ototoxicity (usually >300 mg/m2) and nephrotoxicity' },
    'lomustine': { max: 1000, unit: 'mg/m2', warning: 'Cumulative myelosuppression risk, bone marrow failure above 1000 mg/m2' },
  };
  const dl = knownLimits[drugName.toLowerCase()];
  if (dl && dl.max && newCumulative >= dl.max) {
    warnings.push(`🚨 ${dl.warning}`);
  } else if (dl) {
    warnings.push(`ℹ️ ${dl.warning}`);
  }

  res.json({ cumulativeDose: newCumulative, warnings });
}));

router.get('/dosing/cumulative/:patientMrn', asyncHandler(async (req, res) => {
    res.json(await db.prepare('SELECT * FROM cumulative_doses WHERE patient_mrn = ? ORDER BY drug_name').all(req.params.patientMrn));
}));

// ═══════════════════════════════════════════════════════════════════
// 🔗 FHIR R4 API
// ═══════════════════════════════════════════════════════════════════

router.get('/fhir/Patient/:mrn', asyncHandler(async (req, res) => {
  const { decryptPHI } = await import('../crypto.js');
  const kvRow = await db.prepare('SELECT v_enc, updated_at FROM kv_store WHERE k = ?').get('pat_' + req.params.mrn);
  if (!kvRow) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] });
  const patData = decryptPHI(kvRow.v_enc) || {};
  res.json({ resourceType: 'Patient', id: req.params.mrn, meta: { lastUpdated: kvRow.updated_at },
    identifier: [{ system: 'urn:oid:1.2.36.146.595.217.0.1', value: req.params.mrn }], active: true,
    name: [{ use: 'official', family: patData.name || 'Unknown', given: [patData.name || 'Unknown'] }],
    gender: patData.gender || 'unknown', birthDate: patData.dob || '',
  });
}));

router.get('/fhir/Condition/:mrn', asyncHandler(async (req, res) => {
  const { decryptPHI } = await import('../crypto.js');
  const kvRow = await db.prepare('SELECT v_enc FROM kv_store WHERE k = ?').get('pat_' + req.params.mrn);
  if (!kvRow) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] });
  const patData = decryptPHI(kvRow.v_enc) || {};
  const diagText = patData.diag || patData.diagnosis || '';
  const diagnoses = diagText ? [diagText] : [];
  const conditions = diagnoses.map((d, i) => ({ resourceType: 'Condition', id: 'condition-' + req.params.mrn + '-' + i,
    clinicalStatus: { coding: [{ code: 'active' }] }, code: { text: d },
    subject: { reference: 'Patient/' + req.params.mrn },
  }));
  res.json({ resourceType: 'Bundle', type: 'searchset', total: conditions.length, entry: conditions.map(c => ({ resource: c })) });
}));

router.get('/fhir/MedicationRequest/:mrn', asyncHandler(async (req, res) => {
  let meds = [];
  try { meds = await db.prepare('SELECT * FROM prescriptions WHERE patient_mrn = ?').all(req.params.mrn); } catch {}
  const requests = meds.map(m => ({ resourceType: 'MedicationRequest', id: m.id, status: 'active', intent: 'order',
    medicationCodeableConcept: { text: m.medication || m.name || '' },
    subject: { reference: 'Patient/' + req.params.mrn },
  }));
  res.json({ resourceType: 'Bundle', type: 'searchset', total: requests.length, entry: requests.map(r => ({ resource: r })) });
}));

router.get('/fhir/Observation/:mrn', asyncHandler(async (req, res) => {
  const bios = await db.prepare('SELECT * FROM biomarker_results WHERE patient_mrn = ? ORDER BY report_date DESC LIMIT 100').all(req.params.mrn);
  const observations = bios.map(b => ({ resourceType: 'Observation', id: b.id, status: 'final',
    code: { text: 'Biomarker: ' + b.biomarker }, subject: { reference: 'Patient/' + req.params.mrn },
    effectiveDateTime: b.report_date || b.created_at, valueString: b.result,
  }));
  res.json({ resourceType: 'Bundle', type: 'searchset', total: observations.length, entry: observations.map(o => ({ resource: o })) });
}));


// Export full patient FHIR bundle
router.get('/fhir/Bundle/:mrn', asyncHandler(async (req, res) => {
  const { decryptPHI } = await import('../crypto.js');
  const kvRow = await db.prepare('SELECT v_enc, updated_at FROM kv_store WHERE k = ?').get('pat_' + req.params.mrn);
  if (!kvRow) return res.status(404).json({ error: 'Not found' });
  const patData = decryptPHI(kvRow.v_enc) || {};
  const entries = [{ fullUrl: 'Patient/' + req.params.mrn, resource: { resourceType: 'Patient', id: req.params.mrn,
    name: [{ use: 'official', family: patData.name || 'Unknown' }] } }];
  try { const bios = await db.prepare('SELECT * FROM biomarker_results WHERE patient_mrn = ?').all(req.params.mrn);
    bios.forEach(b => entries.push({ fullUrl: 'Observation/bio-' + b.id, resource: { resourceType: 'Observation',
      id: 'bio-' + b.id, status: 'final', code: { text: 'Biomarker: ' + b.biomarker },
      subject: { reference: 'Patient/' + req.params.mrn }, valueString: b.result    }})); } catch {}
  // Medications
  try { const meds = await db.prepare('SELECT * FROM prescriptions WHERE patient_mrn = ?').all(req.params.mrn);
    meds.forEach(m => entries.push({ fullUrl: 'MedicationRequest/' + m.id, resource: {
      resourceType: 'MedicationRequest', id: m.id, status: 'active',
      medicationCodeableConcept: { text: m.medication || m.name || '' }, subject: { reference: 'Patient/' + req.params.mrn }
    }})); } catch {}

  res.json({ resourceType: 'Bundle', id: 'bundle-' + req.params.mrn + '-' + Date.now(),
    type: 'collection', timestamp: new Date().toISOString(), total: entries.length, entry: entries });
}));

// ═══════════════════════════════════════════════════════════════════
// 🔒 HIPAA COMPLIANCE — RBAC, Sessions, Break-Glass, PHI Log
// ═══════════════════════════════════════════════════════════════════

// --- Roles ---
router.get('/hipaa/roles', asyncHandler(async (req, res) => {
    res.json(await db.prepare('SELECT * FROM rbac_roles ORDER BY is_system DESC, name').all());
}));

router.post('/hipaa/roles', asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name || !permissions) return res.status(400).json({ error: 'name and permissions required' });
  const id = 'role-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    await db.prepare('INSERT OR REPLACE INTO rbac_roles(id,name,description,permissions,is_system,created_at) VALUES(?,?,?,?,0,?)').run(id, name, description || '', JSON.stringify(permissions), now());
  res.json({ id });
}));

// --- Session management ---
router.post('/hipaa/sessions/start', asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const ts = now();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min timeout
  const token = genId();
  // Invalidate old sessions
  await db.prepare('UPDATE user_sessions SET is_active = 0 WHERE user_id = ?').run(userId);
  await db.prepare('INSERT INTO user_sessions(id,user_id,token,ip_address,user_agent,created_at,expires_at,last_active,is_active) VALUES(?,?,?,?,?,?,?,?,1)').run(
    genId(), userId, token, req.ip, req.get('user-agent') || '', ts, expires, ts
  );
  res.json({ token, expiresAt: expires, timeoutMinutes: 30 });
}));

router.post('/hipaa/sessions/ping', asyncHandler(async (req, res) => {
  const { token } = req.body;
  const ts = now();
  const session = await db.prepare('SELECT * FROM user_sessions WHERE token = ? AND is_active = 1').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  if (new Date(session.expires_at) < new Date(ts)) {
    await db.prepare('UPDATE user_sessions SET is_active = 0 WHERE id = ?').run(session.id);
    return res.status(401).json({ error: 'Session expired' });
  }
  const newExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await db.prepare('UPDATE user_sessions SET last_active = ?, expires_at = ? WHERE id = ?').run(ts, newExpires, session.id);
  res.json({ ok: true, expiresAt: newExpires });
}));

// --- Break-the-Glass ---
router.post('/hipaa/break-glass', asyncHandler(async (req, res) => {
  const { patientMrn, reason } = req.body;
  if (!patientMrn || !reason) return res.status(400).json({ error: 'patientMrn and reason required' });
  const ts = now();
  const id = genId();
  await db.prepare('INSERT INTO break_glass_log(id,user_id,patient_mrn,reason,access_start,created_at) VALUES(?,?,?,?,?,?)').run(
    id, req.auth.subjectId, patientMrn, reason, ts, ts
  );
  writeBillingAudit({ userId: req.auth.subjectId, action: 'break_glass', category: 'security', details: { reason }, patientMrn });
  res.json({ id, message: 'Emergency access logged. All actions are being recorded.' });
}));

// --- PHI Access Log ---
router.post('/hipaa/phi-log', asyncHandler(async (req, res) => {
  const { patientMrn, action, section } = req.body;
    await db.prepare('INSERT INTO phi_access_log(id,user_id,patient_mrn,action,section,ip_address,timestamp) VALUES(?,?,?,?,?,?,?)').run(
    genId(), req.auth.subjectId, patientMrn, action || 'view', section || '', req.ip, now()
  );
  res.json({ ok: true });
}));

router.get('/hipaa/phi-log/:patientMrn', asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;
  res.json(await db.prepare('SELECT * FROM phi_access_log WHERE patient_mrn = ? ORDER BY timestamp DESC LIMIT ?').all(req.params.patientMrn, +limit));
}));

// --- Data Retention Policies ---
router.get('/hipaa/retention', asyncHandler(async (req, res) => {
    try { res.json(await db.prepare('SELECT * FROM data_retention_policies ORDER BY data_type').all()); } catch { res.json([]); }
}));

router.put('/hipaa/retention/:id', asyncHandler(async (req, res) => {
  const { retainYears, autoArchive, autoDelete } = req.body;
    if (retainYears != null) await db.prepare('UPDATE data_retention_policies SET retain_years = ? WHERE id = ?').run(retainYears, req.params.id);
  if (autoArchive != null) await db.prepare('UPDATE data_retention_policies SET auto_archive = ? WHERE id = ?').run(autoArchive ? 1 : 0, req.params.id);
  if (autoDelete != null) await db.prepare('UPDATE data_retention_policies SET auto_delete = ? WHERE id = ?').run(autoDelete ? 1 : 0, req.params.id);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════
// 📊 REPORTS & ANALYTICS
// ═══════════════════════════════════════════════════════════════════

router.get('/reports/panel-health', asyncHandler(async (req, res) => {
    let totalPatients = 0; try { totalPatients = (await db.prepare("SELECT COUNT(*) as v FROM kv_store WHERE k LIKE 'pat_%' AND k NOT LIKE 'pat_tokens_%'").get()).v; } catch {};
  const byPhase = [];
  const byDiagnosis = [];
  let activeTreatments = 0; try { activeTreatments = (await db.prepare("SELECT COUNT(DISTINCT patient_mrn) as v FROM prescriptions WHERE status = 'active'").get()).v; } catch {};
  let recentLabResults = 0;
  const appointmentsUpcoming = (await db.prepare("SELECT COUNT(*) as v FROM appointments WHERE date >= date('now') AND status != 'cancelled'").get()).v;
  const chemoActive = (await db.prepare("SELECT COUNT(*) as v FROM chemo_cycles WHERE status = 'active'").get()).v;
  res.json({ totalPatients, byPhase, byDiagnosis, activeTreatments, recentLabResults, appointmentsUpcoming, chemoActive });
}));

router.get('/reports/financial', asyncHandler(async (req, res) => {
    const totalRevenue = (await db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM billing_payments").get()).v;
  const revenueThisMonth = (await db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM billing_payments WHERE date >= date('now','start of month')").get()).v;
  const totalOutstanding = (await db.prepare("SELECT COALESCE(SUM(balance_due),0) as v FROM billing_invoices WHERE status NOT IN ('paid','cancelled','void')").get()).v;
  const claimsSubmitted = (await db.prepare("SELECT COUNT(*) as v FROM billing_claims WHERE status != 'draft'").get()).v;
  const claimsApproved = (await db.prepare("SELECT COUNT(*) as v FROM billing_claims WHERE status IN ('approved','paid')").get()).v;
  const claimsDenied = (await db.prepare("SELECT COUNT(*) as v FROM billing_claims WHERE status = 'denied'").get()).v;
  const avgDaysToPay = 0; // would need date math
  const topPayers = await db.prepare("SELECT payer_name, COUNT(*) as claims, SUM(total_paid) as paid FROM billing_claims GROUP BY payer_name ORDER BY claims DESC LIMIT 10").all();
  res.json({ totalRevenue, revenueThisMonth, totalOutstanding, claimsSubmitted, claimsApproved, claimsDenied, avgDaysToPay, topPayers });
}));

router.get('/reports/operational', asyncHandler(async (req, res) => {
    let totalAppointments = 0; try { totalAppointments = (await db.prepare("SELECT COUNT(*) as v FROM appointments").get()).v; } catch {};
  let completedAppts = 0; try { completedAppts = (await db.prepare("SELECT COUNT(*) as v FROM appointments WHERE status = 'completed'").get()).v; } catch {};
  let cancelledAppts = 0; try { cancelledAppts = (await db.prepare("SELECT COUNT(*) as v FROM appointments WHERE status = 'cancelled'").get()).v; } catch {};
  let noShowAppts = 0; try { noShowAppts = (await db.prepare("SELECT COUNT(*) as v FROM appointments WHERE status = 'no-show'").get()).v; } catch {};
  let totalMessages = 0;
  const totalNotes = (await db.prepare("SELECT COUNT(*) as v FROM clinical_notes").get()).v;
  const totalReferrals = (await db.prepare("SELECT COUNT(*) as v FROM referrals").get()).v;
  const pendingReferrals = (await db.prepare("SELECT COUNT(*) as v FROM referrals WHERE status IN ('pending','sent')").get()).v;
  res.json({ totalAppointments, completedAppts, cancelledAppts, noShowAppts, totalMessages, totalNotes, totalReferrals, pendingReferrals });
}));

router.get('/reports/quality', asyncHandler(async (req, res) => {
    // MIPS-like quality measures for oncology
  const measures = [
    { id: 'Q1', name: 'Use of EMR for e-Prescribing', description: 'Percentage of prescriptions sent electronically', value: 0, target: 70 },
    { id: 'Q2', name: 'Medication Reconciliation', description: 'Patients with medication reconciliation completed', value: 0, target: 80 },
    { id: 'Q3', name: 'Screening for Depression', description: 'Patients screened for depression', value: 0, target: 65 },
    { id: 'Q4', name: 'Advance Care Planning', description: 'Patients with documented advance directives', value: 0, target: 50 },
    { id: 'Q5', name: 'Immunization Status', description: 'Patients with up-to-date immunizations', value: 0, target: 75 },
  ];
  // Calculate actual values
  let totalPatients = 1; try { totalPatients = (await db.prepare("SELECT COUNT(*) as v FROM kv_store WHERE k LIKE 'pat_%' AND k NOT LIKE 'pat_tokens_%'").get()).v || 1; } catch {};
  let eRxCount = 0; try { eRxCount = (await db.prepare("SELECT COUNT(*) as v FROM prescriptions WHERE status = 'active'").get()).v; } catch {};
  measures[0].value = Math.min(100, Math.round((eRxCount / totalPatients) * 100));

  const noteCount = (await db.prepare("SELECT COUNT(DISTINCT patient_mrn) as v FROM clinical_notes").get()).v;
  measures[1].value = Math.min(100, Math.round((noteCount / totalPatients) * 100));

  res.json({ measures, totalPatients, complianceRate: Math.round(measures.reduce((s, m) => s + (m.value >= m.target ? 1 : 0), 0) / measures.length * 100) });
}));

router.get('/reports/cancer-registry', asyncHandler(async (req, res) => {
    const byHistology = [];
  const byPhase = [];
  const withBiomarkers = (await db.prepare("SELECT COUNT(DISTINCT patient_mrn) as v FROM biomarker_results").get()).v;
  let totalPatients = 1; try { totalPatients = (await db.prepare("SELECT COUNT(*) as v FROM kv_store WHERE k LIKE 'pat_%' AND k NOT LIKE 'pat_tokens_%'").get()).v || 1; } catch {};
  res.json({ byHistology, byPhase, withBiomarkers, totalPatients, biomarkerRate: Math.round(withBiomarkers / totalPatients * 100) });
}));

// ═══════════════════════════════════════════════════════════════════
export default router;
