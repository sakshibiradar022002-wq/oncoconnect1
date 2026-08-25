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
