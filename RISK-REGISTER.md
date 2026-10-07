# VELTRUVIA Risk Register

Status of each risk is assessed against the code and infrastructure **as of
2026-10-05 (v2.5.0)**. "Accepted" means an owner has consciously accepted the
residual risk; nothing is marked closed without evidence.

Severity × Likelihood → Rating: **H** high, **M** medium, **L** low.

## 1. Clinical / patient-safety risks

| ID | Risk | Sev | Lik | Rating | Mitigation in place | Residual / status |
|----|------|-----|-----|--------|------|------|
| C1 | Wrong-drug / drug–drug interaction prescribed | H | M | **H** | 85 interaction rules (37 severe) checked at `/api/cds/interactions`; severity-sorted alerts; regression tests lock known severe pairs (temozolomide+valproic acid, procarbazine+MAOI) incl. route-level HTTP tests | Content is static, curated from labels — not a live drug-information feed. Clinician remains the decision-maker. **Accepted** with monitoring |
| C2 | Dose above maximum administered (overdose) | H | L | **M** | `/api/cds/dosage-check` enforces per-drug max daily / max per dose, returns `severe` alerts; therapeutic-dose false-positive covered by tests | Only ~10 drugs have curated ranges; unlisted drugs return reference `null` without alerts — **known gap, accepted** |
| C3 | Allergic patient receives cross-reactive drug | H | L | **M** | `/api/cds/allergy-check`: exact, partial and family cross-reactivity (penicillin, sulfonamide, NSAID, cephalosporin, platinum); severity preserved (incl. `anaphylaxis`); false-positive checked by test | Allergy list depends on clinician entry completeness; no FHIR AllergyIntolerance import yet — **accepted** |
| C4 | 31/201 supportive-care entries lack monitoring/contraindication text | M | M | **M** | Coverage regression-locked at ≥80 % (measured 84.6 %); `bare.length ≤ 31` budget fails the build if coverage degrades | Completing the 31 entries is a **open TODO** — not faked with placeholder clinical text |
| C5 | Software treated as substitute for clinical judgment | H | L | **M** | Every CDS response is advisory (alerts, never auto-decision); UI labels advisory role; disclaimer in app + docs | Cannot be enforced in code — **accepted**, addressed by deployment agreements |

## 2. Security risks

| ID | Risk | Sev | Lik | Rating | Mitigation in place | Residual / status |
|----|------|-----|-----|--------|------|------|
| S1 | Unauthorized access to PHI | H | M | **H** | PBKDF2-SHA512 210k passwords; session cookies; role gate (`requireRole` — doctor/admin/lab/patient/kv-*); optional TOTP 2FA; `REQUIRE_DOCTOR_APPROVAL` workflow; CSRF Origin check; login rate limiting | **External pen test not yet performed** — highest-value open item. **Open** |
| S2 | PHI readable at rest (stolen disk/backup) | H | L | **M** | AES-256-GCM for SQL PHI and every JSON store (same key via `encryptPHI`); offsite backups encrypted archives; key in `.env` outside archives | Key lives on the same host as the DB (no HSM/KMS split) — **accepted for current stage** |
| S3 | SQL injection / malformed input | H | L | **L** | Parameterized `db.prepare` everywhere (await-audit in `npm run check`); zod validation on every route (400, never 5xx); route test with injection payloads | None known — **mitigated** |
| S4 | XSS / supply-chain script injection | H | L | **L** | CSP `script-src 'self'` (no `unsafe-inline` — verified by test; CDN axe.js was blocked by it during audits); `script-src-attr 'none'`; nosniff | Inline styles allowed by policy — low risk. **Mitigated** |
| S5 | Credential stuffing / brute force | M | M | **M** | Per-IP rate limit (`apiLimiter` 300/min, tighter on login); account-approval gate; audit-log of every failed login | No WAF / IP ban list — **accepted**, monitor via audit log |
| S6 | Insider misuse (admin reads PHI they don't need) | M | L | **M** | `audit_log` on login, allergy writes, admin actions, patient access; admin cannot deactivate own account; least-privilege role gates | No automated anomaly alerting on audit stream — **open TODO** |
| S7 | Secrets leak via public repo | M | L | **L** | `.vm-target`, `.env`, keys gitignored; IP kept out of repo (`.vm-target` pattern); demo password written to local file only | BAA/subprocessor data in DATA-GOVERNANCE — **mitigated** |

## 3. Availability / operational risks

| ID | Risk | Sev | Lik | Rating | Mitigation in place | Residual / status |
|----|------|-----|-----|--------|------|------|
| O1 | Data loss (DB corruption, ransomware, accidental delete) | H | L | **M** | Nightly `VACUMM INTO` snapshot + tar (VM 02:15 UTC, keep 14); daily offsite pull to Sara's PC (keep 30); **freshness guard: pull exits 4 + watchdog Event ID 2 if newest offsite copy > 36 h old** (live-verified both branches) | Backups land on one person's PC — second offsite copy (different geography) **open TODO** |
| O2 | Service outage unnoticed | M | M | **M** | Uptime watchdog every 15 min → `watchdog.log` + Windows Event Log; `/health?deep=1` DB check | Single monitor (Sara's PC) — external uptime monitor **open TODO** |
| O3 | Single VM = single point of failure | H | M | **H** | Nightly offsite backups; restore procedure documented (`vm-restore-clean.sh`); RPO ≤ 24 h / RTO 4–8 h in SUPPORT-POLICY | No warm standby; manual restore. **Accepted** at current stage |
| O4 | TLS/certificate expiry takes site offline | H | L | **M** | Caddy auto-renewal; `check-cert.ps1`; cert-expiry in truth-check | Renewal depends on Caddy + DNS health — **mitigated** |
| O5 | Failed deploy bricks the service | M | L | **L** | Release checklist, `npm run precommit` (check+test+verify), SHA256SUMS, versioned bundles | No automated rollback job — restore-from-backup is the rollback. **Accepted** |

## 4. Compliance / market risks

| ID | Risk | Sev | Lik | Rating | Mitigation in place | Residual / status |
|----|------|-----|-----|--------|------|------|
| P1 | HIPAA obligations unmet at a real clinic | H | M | **H** | Technical-safeguard crosswalk (HIPAA-CONTROLS.md), DATA-GOVERNANCE, SUPPORT-POLICY, INCIDENT-RESPONSE, BAA via AWS | **No signed BAA with a customer yet; no completed administrative checklist — external, open** |
| P2 | Data-residency / subprocessor transparency challenged | M | L | **M** | Subprocessor list + BAA status in DATA-GOVERNANCE.md; data-flow map in DATA-FLOW.md | EU/GDPR not assessed (India/US focus) — out of scope, **accepted** |
| P3 | Unproven in production (no pilot clinic) | H | H | **H** | Demo instance live; 20-asset GitHub release; evaluation report + roadmap validation (78 claims audited) | **Market proof = external. Open** |
| P4 | Unsigned Windows binary blocks enterprise install | M | H | **H** | Hash-pinned releases, SHA256SUMS | **OV/EV code-signing certificate purchase — external, open** |

## Review cadence

Reviewed at every release (`RELEASE-CHECKLIST.md`) and monthly by the
truth-check task. Any risk that flips from Accepted → Open must be logged in
`VELTRUVIA-ROADMAP-VALIDATION.md` §8.
