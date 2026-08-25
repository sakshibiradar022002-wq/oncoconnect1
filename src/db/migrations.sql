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
