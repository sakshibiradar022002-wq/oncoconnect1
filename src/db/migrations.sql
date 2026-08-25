-- ═══════════════════════════════════════════════════════════════════════
-- ONCOCONNECT MIGRATION: Scheduling, E-Prescribing, Telehealth, CDS
-- ═══════════════════════════════════════════════════════════════════════

-- ── Doctor Availability: weekly recurring slots ─────────────────────
-- Each row is a recurring time block (e.g., Mon 09:00-12:00).
-- The scheduler expands these into concrete date/time slots on the fly.
CREATE TABLE IF NOT EXISTS doctor_availability (
  id            TEXT PRIMARY KEY,           -- uuid
  doctor_id     TEXT NOT NULL,              -- users.id
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  start_time    TEXT NOT NULL,              -- "HH:MM" (24h)
  end_time      TEXT NOT NULL,              -- "HH:MM"
  slot_duration INTEGER NOT NULL DEFAULT 30, -- minutes per slot
  appointment_types TEXT,                   -- JSON array of allowed types
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_avail_doctor ON doctor_availability(doctor_id);
CREATE INDEX IF NOT EXISTS idx_avail_day ON doctor_availability(day_of_week);

-- ── Appointments (server-side, replaces KV-only storage) ───────────
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,           -- uuid
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  date          TEXT NOT NULL,              -- "YYYY-MM-DD"
  start_time    TEXT NOT NULL,              -- "HH:MM"
  end_time      TEXT NOT NULL,              -- "HH:MM"
  type          TEXT NOT NULL DEFAULT 'Follow-up',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'cancelled', 'completed', 'no-show'
  )),
  notes         TEXT,                       -- encrypted
  booked_by     TEXT NOT NULL CHECK (booked_by IN ('doctor', 'patient')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_appt_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_mrn ON appointments(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);

-- ── Prescriptions (e-prescribing) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id            TEXT PRIMARY KEY,           -- uuid
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  medication    TEXT NOT NULL,              -- medication name (encrypted)
  generic_name  TEXT,                       -- generic name (encrypted)
  dosage        TEXT NOT NULL,              -- e.g. "100mg" (encrypted)
  frequency     TEXT NOT NULL,              -- e.g. "BID", "QD", "PRN" (encrypted)
  route         TEXT DEFAULT 'oral',        -- oral, IV, IM, etc.
  duration      TEXT,                       -- "30 days", "until follow-up"
  quantity      INTEGER,
  refills       INTEGER DEFAULT 0,
  pharmacy      TEXT,                       -- pharmacy name/address (encrypted)
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'cancelled', 'expired', 'pending-refill'
  )),
  instructions  TEXT,                       -- special instructions (encrypted)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_rx_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_rx_mrn ON prescriptions(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions(status);

-- ── Drug Interactions Database (embedded, subset) ───────────────────
-- Stores known interactions for clinical decision support.
-- Severity: 'severe', 'moderate', 'mild'
CREATE TABLE IF NOT EXISTS drug_interactions (
  id            TEXT PRIMARY KEY,
  drug_a        TEXT NOT NULL,              -- normalized lowercase
  drug_b        TEXT NOT NULL,              -- normalized lowercase
  severity      TEXT NOT NULL CHECK (severity IN ('severe', 'moderate', 'mild')),
  description   TEXT NOT NULL,
  recommendation TEXT,
  source        TEXT DEFAULT 'OncoConnect CDS',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_di_drug_a ON drug_interactions(drug_a);
CREATE INDEX IF NOT EXISTS idx_di_drug_b ON drug_interactions(drug_b);

-- ── Drug Allergies (patient-level) ─────────────────────────────────
-- Cross-reference against prescribed medications.
CREATE TABLE IF NOT EXISTS patient_allergies (
  id            TEXT PRIMARY KEY,
  patient_mrn   TEXT NOT NULL,
  drug_name     TEXT NOT NULL,              -- normalized lowercase
  reaction      TEXT,                       -- type of reaction
  severity      TEXT DEFAULT 'moderate',    -- mild, moderate, severe, anaphylaxis
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(patient_mrn, drug_name)
);
CREATE INDEX IF NOT EXISTS idx_allergy_mrn ON patient_allergies(patient_mrn);

-- ── Telehealth Rooms ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telehealth_rooms (
  id            TEXT PRIMARY KEY,           -- room code (short)
  appointment_id TEXT,                      -- linked appointment
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN (
    'waiting', 'active', 'ended'
  )),
  created_at    TEXT NOT NULL,
  ended_at      TEXT,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_th_doctor ON telehealth_rooms(doctor_id);
CREATE INDEX IF NOT EXISTS idx_th_mrn ON telehealth_rooms(patient_mrn);

-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION v2: Critical Safety + Clinical Features
-- ═══════════════════════════════════════════════════════════════════════

-- ── Enhanced Audit Trail (patient-facing, HIPAA-compliant) ─────────
CREATE TABLE IF NOT EXISTS clinical_audit_log (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  action        TEXT NOT NULL,             -- e.g. 'rx.create', 'allergy.add', 'note.save'
  category      TEXT NOT NULL,             -- 'prescription', 'allergy', 'clinical_note', 'referral', 'lab', 'imaging', 'protocol'
  target_id     TEXT,                      -- affected record id
  detail_enc    TEXT,                      -- encrypted change details
  ip            TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_caudit_mrn ON clinical_audit_log(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_caudit_doctor ON clinical_audit_log(doctor_id);
CREATE INDEX IF NOT EXISTS idx_caudit_action ON clinical_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_caudit_created ON clinical_audit_log(created_at DESC);

-- ── High-Risk Drug TOTP Confirmation ──────────────────────────────
CREATE TABLE IF NOT EXISTS rx_totp_confirmations (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  prescription_id TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  medication    TEXT NOT NULL,
  totp_code     TEXT NOT NULL,             -- hashed 6-digit code
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  confirmed_at  TEXT,
  FOREIGN KEY (doctor_id) REFERENCES users(id),
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
);
CREATE INDEX IF NOT EXISTS idx_totp_rx ON rx_totp_confirmations(prescription_id);
CREATE INDEX IF NOT EXISTS idx_totp_status ON rx_totp_confirmations(status);

-- ── Patient Medication Adherence ──────────────────────────────────
CREATE TABLE IF NOT EXISTS medication_adherence (
  id            TEXT PRIMARY KEY,
  patient_mrn   TEXT NOT NULL,
  prescription_id TEXT,
  medication    TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,            -- YYYY-MM-DD
  scheduled_time TEXT,                     -- HH:MM
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'missed', 'skipped', 'late')),
  taken_at      TEXT,                      -- actual time taken
  notes         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adhere_mrn ON medication_adherence(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_adhere_date ON medication_adherence(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_adhere_rx ON medication_adherence(prescription_id);

-- ── Chemotherapy Cycles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chemo_cycles (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  protocol_name TEXT NOT NULL,             -- e.g. 'Stupp Protocol', 'PCV'
  regimen       TEXT,                      -- detailed regimen description
  total_cycles  INTEGER NOT NULL DEFAULT 6,
  current_cycle INTEGER NOT NULL DEFAULT 1,
  cycle_length_days INTEGER DEFAULT 28,
  start_date    TEXT NOT NULL,
  next_cycle_date TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'discontinued')),
  dose_modifications TEXT,                 -- JSON array of dose changes
  cumulative_tox TEXT,                     -- JSON toxicity tracker
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_chemo_mrn ON chemo_cycles(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_chemo_status ON chemo_cycles(status);

-- ── Clinical Notes (SOAP + templates) ─────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_notes (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  note_type     TEXT NOT NULL DEFAULT 'progress' CHECK (note_type IN ('progress', 'soap', 'procedure', 'discharge', 'consult', 'referral_note')),
  subjective    TEXT,                      -- SOAP: subjective
  objective     TEXT,                      -- SOAP: objective
  assessment    TEXT,                      -- SOAP: assessment
  plan          TEXT,                      -- SOAP: plan
  free_text     TEXT,                      -- non-SOAP notes
  template_name TEXT,                      -- which template was used
  signed        INTEGER NOT NULL DEFAULT 0,
  signed_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_notes_mrn ON clinical_notes(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_notes_type ON clinical_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_notes_created ON clinical_notes(created_at DESC);

-- ── Referrals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  to_specialty  TEXT NOT NULL,             -- e.g. 'Neurosurgery', 'Radiation Oncology'
  to_provider   TEXT,                      -- specific doctor name
  reason        TEXT NOT NULL,
  urgency       TEXT DEFAULT 'routine' CHECK (urgency IN ('urgent', 'expedited', 'routine')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'declined')),
  clinical_summary TEXT,                   -- encrypted
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ref_mrn ON referrals(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_ref_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_ref_specialty ON referrals(to_specialty);

-- ── Treatment Protocols (pre-built templates) ─────────────────────
CREATE TABLE IF NOT EXISTS treatment_protocols (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,             -- e.g. 'Stupp Protocol'
  category      TEXT NOT NULL,             -- 'chemo', 'radiation', 'combined'
  description   TEXT NOT NULL,
  drugs         TEXT NOT NULL,             -- JSON array of drug objects
  cycles        INTEGER,                  -- number of cycles
  cycle_length  INTEGER,                  -- days per cycle
  indications   TEXT,                      -- JSON array of indications
  contraindications TEXT,                   -- JSON array
  created_by    TEXT,
  is_template   INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proto_category ON treatment_protocols(category);

-- ── Patient Documents ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_documents (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  doc_type      TEXT NOT NULL,             -- 'consent', 'pathology', 'imaging_report', 'referral_letter', 'other'
  filename      TEXT NOT NULL,
  content_type  TEXT,
  file_size     INTEGER,
  content_b64   TEXT NOT NULL,             -- base64-encoded file content
  description   TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_docs_mrn ON patient_documents(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_docs_type ON patient_documents(doc_type);

-- ── Appointment Reminders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id            TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('email', 'sms', 'push')),
  send_at       TEXT NOT NULL,             -- when to send
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  message       TEXT,
  sent_at       TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_remind_appt ON appointment_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_remind_status ON appointment_reminders(status);

-- ── Patient Outcomes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_outcomes (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  outcome_type  TEXT NOT NULL CHECK (outcome_type IN ('survival', 'response', 'qol', 'toxicity', 'milestone')),
  date          TEXT NOT NULL,
  value         TEXT NOT NULL,             -- JSON: type-specific data
  notes         TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_out_mrn ON patient_outcomes(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_out_type ON patient_outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_out_date ON patient_outcomes(date DESC);

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2: BILLING, NCCN, HIPAA, FHIR, ANALYTICS
-- ═══════════════════════════════════════════════════════════════════

-- ── Billing: Invoices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_invoices (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled','void')),
  subtotal      REAL NOT NULL DEFAULT 0,
  tax           REAL DEFAULT 0,
  discount      REAL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  amount_paid   REAL DEFAULT 0,
  balance_due   REAL DEFAULT 0,
  due_date      TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_mrn ON billing_invoices(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_inv_status ON billing_invoices(status);

-- ── Billing: Line Items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_line_items (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL,
  description   TEXT NOT NULL,
  cpt_code      TEXT,
  icd10_code    TEXT,
  hcpcs_code    TEXT,
  quantity      INTEGER DEFAULT 1,
  unit_price    REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bli_invoice ON billing_line_items(invoice_id);

-- ── Billing: Claims ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_claims (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  invoice_id    TEXT,
  claim_number  TEXT NOT NULL UNIQUE,
  payer_name    TEXT NOT NULL,
  payer_id      TEXT,
  member_id     TEXT,
  group_number  TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','in_review','approved','denied','appealed','paid')),
  claim_type    TEXT DEFAULT 'professional' CHECK (claim_type IN ('professional','institutional','pharmacy')),
  total_charged  REAL NOT NULL DEFAULT 0,
  total_allowed  REAL DEFAULT 0,
  total_paid     REAL DEFAULT 0,
  denial_reason  TEXT,
  submitted_date TEXT,
  resolved_date  TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_claim_mrn ON billing_claims(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_claim_status ON billing_claims(status);

-- ── Billing: Payments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_payments (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  invoice_id    TEXT,
  claim_id      TEXT,
  amount        REAL NOT NULL,
  method        TEXT DEFAULT 'cash' CHECK (method IN ('cash','card','check','insurance','online','adjustment')),
  reference     TEXT,
  date          TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id)
);
CREATE INDEX IF NOT EXISTS idx_pay_mrn ON billing_payments(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_pay_date ON billing_payments(date DESC);

-- ── Billing: Insurance ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_insurance (
  id            TEXT PRIMARY KEY,
  patient_mrn   TEXT NOT NULL,
  payer_name    TEXT NOT NULL,
  plan_type     TEXT,                      -- HMO, PPO, Medicare, Medicaid
  member_id     TEXT,
  group_number  TEXT,
  subscriber_name TEXT,
  relationship  TEXT DEFAULT 'self',
  phone         TEXT,
  is_primary    INTEGER DEFAULT 1,
  effective_date TEXT,
  expiry_date   TEXT,
  copay         REAL,
  deductible    REAL,
  deductible_met REAL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ins_mrn ON patient_insurance(patient_mrn);

-- ── NCCN Guidelines ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nccn_guidelines (
  id            TEXT PRIMARY KEY,
  cancer_type   TEXT NOT NULL,              -- 'glioblastoma', 'meningioma', etc.
  histology     TEXT,                      -- 'GBM WHO grade 4', etc.
  stage         TEXT,                      -- 'IV', 'III', etc.
  protocol_name TEXT NOT NULL,             -- 'Stupp Protocol'
  regimen       TEXT NOT NULL,             -- 'TMZ 75mg/m2 daily x 42d + RT then adjuvant TMZ 150-200mg/m2 d1-5 q28d'
  drugs         TEXT,                      -- JSON array of drug objects
  evidence_level TEXT DEFAULT '2A',        -- NCCN evidence level
  category      TEXT,                      -- 'first_line','second_line','salvage'
  biomarkers    TEXT,                      -- JSON: relevant biomarkers
  dose_mods     TEXT,                      -- JSON: dose modification rules
  contraindications TEXT,                  -- JSON array
  monitoring    TEXT,                      -- JSON: lab monitoring schedule
  notes         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nccn_type ON nccn_guidelines(cancer_type);
CREATE INDEX IF NOT EXISTS idx_nccn_bio ON nccn_guidelines(biomarkers);

-- ── Biomarker Results ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biomarker_results (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  biomarker     TEXT NOT NULL,              -- 'MGMT','EGFR','BRAF','IDH1','IDH2','1p19q','TERT','ATRX','PTEN','Ki-67'
  result        TEXT NOT NULL,              -- 'methylated','wild_type','mutant','amplified','deleted','normal'
  numeric_value TEXT,                       -- for quantitative markers
  method        TEXT,                       -- 'IHC','FISH','NGS','PCR','methylation array'
  lab_name      TEXT,
  report_date   TEXT NOT NULL,
  clinical_significance TEXT,              -- auto-populated significance
  recommended_protocols TEXT,             -- JSON: auto-recommended protocol IDs
  notes         TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_bio_mrn ON biomarker_results(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_bio_name ON biomarker_results(biomarker);

-- ── Cumulative Dose Tracking ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cumulative_doses (
  id            TEXT PRIMARY KEY,
  patient_mrn   TEXT NOT NULL,
  drug_name     TEXT NOT NULL,
  cumulative_dose REAL NOT NULL DEFAULT 0,  -- total dose administered
  dose_unit     TEXT DEFAULT 'mg',          -- mg, mg/m2, AUC, g/m2
  max_lifetime   REAL,                      -- lifetime max dose
  last_admin_date TEXT,
  cycle_number  INTEGER,
  warnings      TEXT,                       -- JSON: dose warnings
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cd_mrn ON cumulative_doses(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_cd_drug ON cumulative_doses(drug_name);

-- ── FHIR Resource Cache ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fhir_resources (
  id            TEXT PRIMARY KEY,
  patient_mrn   TEXT NOT NULL,
  resource_type TEXT NOT NULL,              -- 'Patient','Observation','MedicationRequest','Condition','Procedure'
  resource_json TEXT NOT NULL,
  version_id    INTEGER DEFAULT 1,
  last_updated  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fhir_mrn ON fhir_resources(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_fhir_type ON fhir_resources(resource_type);

-- ── HIPAA: RBAC Roles & Permissions ───────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_roles (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  permissions   TEXT NOT NULL,              -- JSON array of permission strings
  is_system     INTEGER DEFAULT 0,          -- system roles can't be deleted
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id       TEXT NOT NULL,
  role_id       TEXT NOT NULL,
  assigned_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (role_id) REFERENCES rbac_roles(id)
);

-- ── HIPAA: Session Management ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_active   TEXT NOT NULL,
  is_active     INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sess_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_token ON user_sessions(token);

-- ── HIPAA: Break-the-Glass Emergency Access ───────────────────────
CREATE TABLE IF NOT EXISTS break_glass_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  reason        TEXT NOT NULL,              -- emergency reason
  accessed_sections TEXT,                   -- JSON array of sections accessed
  access_start  TEXT NOT NULL,
  access_end    TEXT,
  approved_by   TEXT,                       -- supervising physician
  created_at    TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_bg_mrn ON break_glass_log(patient_mrn);

-- ── HIPAA: PHI Access Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phi_access_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  patient_mrn   TEXT NOT NULL,
  action        TEXT NOT NULL,              -- 'view','edit','export','print','download'
  section       TEXT NOT NULL,              -- which record section
  ip_address    TEXT,
  timestamp     TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_phi_mrn ON phi_access_log(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_phi_user ON phi_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_phi_time ON phi_access_log(timestamp DESC);

-- ── HIPAA: Data Retention Policies ────────────────────────────────
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  data_type     TEXT NOT NULL,              -- 'clinical_notes','lab_results','imaging','billing'
  retain_years  INTEGER NOT NULL DEFAULT 7, -- years to retain
  auto_archive  INTEGER DEFAULT 0,
  auto_delete   INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- ── Reporting: Provider Analytics ─────────────────────────────────
CREATE TABLE IF NOT EXISTS report_snapshots (
  id            TEXT PRIMARY KEY,
  report_type   TEXT NOT NULL,              -- 'panel_health','financial','operational','quality','cancer_registry'
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  data          TEXT NOT NULL,              -- JSON report data
  generated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rpt_type ON report_snapshots(report_type);

-- ═══ SEED DATA ═══════════════════════════════════════════════════

-- Seed RBAC roles
INSERT OR IGNORE INTO rbac_roles (id, name, description, permissions, is_system, created_at) VALUES
('role-admin', 'Administrator', 'Full system access', '["*"]', 1, datetime('now')),
('role-attending', 'Attending Physician', 'Full clinical access', '["patient.*","prescription.*","note.*","billing.*","lab.*","report.*","referral.*"]', 1, datetime('now')),
('role-resident', 'Resident', 'Supervised clinical access', '["patient.view","patient.edit","prescription.view","note.create","note.view","lab.view"]', 1, datetime('now')),
('role-nurse', 'Nurse / MA', 'Clinical support access', '["patient.view","patient.edit","vitals.*","medication.administer","lab.view","appointment.view"]', 1, datetime('now')),
('role-billing', 'Billing Staff', 'Financial access only', '["billing.*","patient.view","insurance.*","claim.*"]', 1, datetime('now')),
('role-read-only', 'Read Only', 'View-only clinical access', '["patient.view","lab.view","note.view","imaging.view"]', 1, datetime('now'));

-- Seed NCCN Guidelines (Neuro-Oncology)
INSERT OR IGNORE INTO nccn_guidelines (id, cancer_type, histology, stage, protocol_name, regimen, drugs, evidence_level, category, biomarkers, contraindications, monitoring, created_at) VALUES
('nccn-gbm-stupp', 'Glioblastoma', 'GBM WHO Grade 4', 'IV', 'Stupp Protocol', 'Concurrent: TMZ 75mg/m2 daily x 42 days + RT 60Gy/30fx. Adjuvant: TMZ 150-200mg/m2 D1-5 Q28d x 6-12 cycles', '[{"name":"Temozolomide","dose":"75mg/m2","route":"oral","schedule":"daily x42d concurrent, then D1-5 Q28d"},{"name":"Radiation","dose":"60Gy/30fx","route":"external beam","schedule":"daily M-F x 6 weeks"}]', '2A', 'first_line', '["MGMT_methylated","MGMT_unmethylated"]', '["ANC<1500","Platelets<100000","Hgb<8","Pregnancy"]', '[{"test":"CBC","frequency":"weekly during concurrent, q2w adjuvant"},{"test":"CMP","frequency":"before each adjuvant cycle"},{"test":"MR Brain","frequency":"2-4 weeks after RT, then q2-3 months"}]', datetime('now')),
('nccn-gbm-bev', 'Glioblastoma', 'GBM WHO Grade 4', 'IV', 'Bevacizumab Salvage', 'Bevacizumab 10mg/kg IV q2w +/- Irinotecan 125mg/m2 IV q2w', '[{"name":"Bevacizumab","dose":"10mg/kg","route":"IV","schedule":"q2w"},{"name":"Irinotecan","dose":"125mg/m2","route":"IV","schedule":"q2w (optional)"}]', '2B', 'second_line', '["recurrent_GBM"]', '["GI perforation","Hemorrhage","Thromboembolism","Poor wound healing"]', '[{"test":"BP","frequency":"every visit"},{"test":"Urinalysis","frequency":"before each cycle"},{"test":"MR Brain","frequency":"q6-8 weeks"}]', datetime('now')),
('nccn-astro-pcv', 'Anaplastic Astrocytoma', 'AA WHO Grade 3', 'III', 'PCV Regimen', 'PCV: Procarbazine 60mg/m2 PO D8-21, CCNU 110mg/m2 PO D1, Vincristine 1.4mg/m2 (max 2mg) IV D8,29. Q8w x 6 cycles', '[{"name":"Procarbazine","dose":"60mg/m2","route":"oral","schedule":"D8-21"},{"name":"Lomustine (CCNU)","dose":"110mg/m2","route":"oral","schedule":"D1"},{"name":"Vincristine","dose":"1.4mg/m2","route":"IV","schedule":"D8,29"}]', '2A', 'first_line', '["1p19q_codeleted","IDH_mutant"]', '["ANC<1500","Hepatic dysfunction","Neuropathy grade 3"]', '[{"test":"CBC","frequency":"D1 and D22 of each cycle"},{"test":"LFTs","frequency":"before each cycle"}]', datetime('now')),
('nccn-meningioma', 'Meningioma', 'Atypical/Anaplastic', 'II-III', 'RT ± Chemotherapy', 'SRT 54Gy/30fx for subtotal resection. Adjuvant TMZ for WHO grade 3 if progression', '[{"name":"Radiation (SRS/SRT)","dose":"54Gy/30fx","route":"external beam","schedule":"daily"}]', '2B', 'first_line', '["NF2","TERT_promoter"]', '["Pregnancy","Prior RT to same field"]', '[{"test":"MR Brain","frequency":"q3-6 months first 2 years, then annually"}]', datetime('now')),
('nccn-ped-glioma', 'Pediatric Glioma', 'Low-grade / High-grade', 'I-IV', 'COG Regimens', 'Low-grade: VCR weekly + carboplatin. High-grade: RT + multi-agent chemo', '[{"name":"Vincristine","dose":"1.5mg/m2","route":"IV","schedule":"weekly"},{"name":"Carboplatin","dose":"AUC 5-7","route":"IV","schedule":"q3-4 weeks"}]', '1', 'first_line', '["BRAF_fusion","BRAF_V600E","H3K27M"]', '["Age<3 (avoid RT)","Severe myelosuppression"]', '[{"test":"CBC","frequency":"weekly during induction"},{"test":"MRI Brain","frequency":"q3 months"}]', datetime('now'));

-- Seed Data Retention Policies
INSERT OR IGNORE INTO data_retention_policies (id, name, data_type, retain_years, auto_archive, auto_delete, created_at) VALUES
('ret-clinical', 'Clinical Records', 'clinical_notes', 10, 1, 0, datetime('now')),
('ret-lab', 'Lab Results', 'lab_results', 7, 1, 0, datetime('now')),
('ret-imaging', 'Imaging Reports', 'imaging', 10, 1, 0, datetime('now')),
('ret-billing', 'Billing Records', 'billing', 7, 1, 0, datetime('now')),
('ret-audit', 'Audit Logs', 'audit', 6, 1, 0, datetime('now')),
('ret-phi', 'PHI Access Logs', 'phi_access', 6, 1, 0, datetime('now'));
