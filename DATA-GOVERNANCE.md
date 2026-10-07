# VELTRUVIA Data Governance & Privacy

**Version 1.0 · Effective October 5, 2026 · Applies to:** VELTRUVIA 2.5.0 and later
**Status:** Internal — basis for any future patient-facing privacy notice

> This document states **what actually happens today** (each claim verified
> 2026-10-05 against the running system and source tree), and marks known gaps
> with **TODO** rather than describing aspirational controls as if they existed.

---

## 1. Roles & data ownership

| Aspect | Position |
|---|---|
| Data controller | The clinic/operator running the instance (self-hosted by design) |
| Vendor's access to PHI | None on the hosted demo; the maintainer operates the server under operator authority |
| PHI storage location | Server disk of the deploying operator (currently: AWS Lightsail Mumbai region, Ubuntu) |
| Patient data on third parties | **Never** — the blockchain receives one-way hashes only (see §3) |

## 2. Data collected & protected

| Category | Where it lives | Protection at rest | Protection in transit |
|---|---|---|---|
| Clinical records (visits, vitals, symptoms, notes) | SQLite (sql.js) database, server disk | Filesystem permissions; full-disk backup encryption | TLS 1.2+ (Caddy/ACME) |
| Patient accounts & passwords | Same DB | **PBKDF2-SHA512**, per-user random salt, non-reversible | TLS |
| PHI JSON stores (`*-store.enc.json`) | Server data dir | **PBKDF2-derived key → AES encryption**; plaintext gitignored and absent from installers | TLS |
| Sessions | Server-side revocable store; JWT in **httpOnly** cookies | Signed tokens, sliding refresh | TLS |
| Lab files / attachments | Raw-byte store (10 MB cap) | Same filesystem controls | TLS |
| Telehealth media | WebRTC peer-to-peer | Not stored by the server | **DTLS-SRTP** end-to-end |

## 3. What leaves the server (complete list)

| Destination | Data | Notes |
|---|---|---|
| **Sepolia blockchain** | One-way **hashes** of audit events + previous-hash chain | No PHI, no names, no MRNs on chain; `/chain.json` not web-exposed (404 by design); fail-open so care never blocks on chain writes |
| **Sentry** (error monitoring) | Error messages/stack traces after `beforeSend` scrub | Scrub strips request bodies, queries, cookies, URL querystrings, and redacts MRN-/pat_/lab_/email patterns (`src/observability/sentry.js`, verified 2026-09-27) |
| **Cloudflare tunnel** | Encrypted traffic in transit | Edge sees IP addresses and TLS traffic only; no PHI storage |
| **GitHub Releases** | Installers, checksums, ymls | Binaries only — **no patient data ever** |
| **Twilio / Gmail-SMTP** | Appointment reminders (if configured) | Optional; disabled unless operator supplies credentials |
| **Google STUN / coturn** | ICE/relay metadata for calls | Media is DTLS-SRTP encrypted; relay forwards ciphertext only |

**No** product analytics, advertising SDKs, or third-party trackers exist in the client apps.

## 4. Retention & deletion

| Data | Retention today | Notes |
|---|---|---|
| Nightly DB backups (server) | Kept while disk allows (currently ~9 retained) | `veltruvia-backup.timer`, 02:15 UTC |
| Offsite backup copies | **Newest 30** (auto-pruned) | Daily pull to a second machine |
| Clinical records | **Indefinite until the operator deletes them** | TODO: formal retention schedule per jurisdictional law (e.g., India DPDP / record-retention rules) once legal counsel is engaged |
| Patient/user deprovisioning | Admin removes the account; related rows and store entries removable | TODO: scripted one-click "erase subject" bundle for GDPR/DPDP-style requests |
| Audit (blockchain) hashes | Permanent, append-only | Not personal data as stored (hashes); deletion requests cannot unwrite chain entries — this is by design and must be disclosed to patients |

**Right to export:** CSV (per-patient), FHIR resources, HL7 v2 messages, and raw SQL backups — no proprietary formats.

## 5. Subprocessors

| Provider | Purpose | Contract status |
|---|---|---|
| Amazon Web Services (Lightsail) | Hosting | **BAA accepted via AWS Artifact, active 2026-09-27** (per `DEPLOY-AWS.md`) |
| Cloudflare | Tunnel / edge | TODO: BAA/review — checklist item open in `HIPAA-CONTROLS.md` |
| GitHub (Microsoft) | Source + release artifacts (no PHI) | TODO: BAA/review for artifact hosting |
| Sentry | Error telemetry (scrubbed) | Free tier; TODO: DPA review |
| DuckDNS | DNS | Free service; no data processing of PHI |
| Twilio / Gmail | Optional SMS/email reminders | Disabled by default; enable only with operator approval |

## 6. Secrets & credentials

- Server secrets live in the VM `.env` (never committed); Windows build material lives in a **DPAPI-encrypted vault** (`keys.vault.bin`) with unlock/lock lifecycle.
- **Published demo credentials exist for the demo instance only** and must be rotated (`scripts/rotate-secrets.mjs`) before any real-clinic deployment — this is a go-live gate, not a suggestion.
- MFA (TOTP) is code-complete and enforced when enabled; **TODO: mandate it for all privileged roles** (roadmap item 90-day #1).

## 7. Incident response

`INCIDENT-RESPONSE.md` defines the runbook; breach-notification route is implemented server-side (`src/routes/breach-notification.js`); HIPAA-style control inventory lives in `HIPAA-CONTROLS.md` (currently mostly unchecked — honest status).

---

*Owner: VELTRUVIA operations · Related: `HIPAA-CONTROLS.md`, `INCIDENT-RESPONSE.md`, `SECURITY.md`, `SUPPORT-POLICY.md`, `VELTRUVIA-ROADMAP-VALIDATION.md` (C14–C19)*
