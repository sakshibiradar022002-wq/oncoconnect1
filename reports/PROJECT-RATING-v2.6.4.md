# VELTRUVIA — Project Rating & Gap Recheck (v2.6.4)

**Date:** 2026-11-19 · **Commit:** `cd73ca8` · **Scope:** the whole repo as checked out here, not the deployed VM.

Every number below was produced by running something in this checkout and is quoted with the
command that produced it. Where something could not be verified from the repo, it says so
instead of assuming.

---

## 1. Scorecard

| Axis | Score | Basis |
|---|---|---|
| Functional breadth | **8.5 / 10** | 249 route handlers across 19 domains (auth, sync, CDS, Rx, telehealth, HL7, FHIR, e-prescribe, HIPAA, breach, billing, blockchain, imaging, scheduling, team, admin, email/OTP, push, labs) |
| Test depth & reproducibility | **6.5 / 10** | Root suite 72/72 and bundle suite 35/35 pass, but they are two divergent suites and CI only runs the smaller one |
| Security engineering | **8.0 / 10** | Helmet+CSP, HSTS, origin CSRF guard, JWT sessions with server-side revocation, AES-256-GCM PHI at rest, PBKDF2 credentials, audit log, guards, rate limits — minus the gaps in §3 |
| Regulatory / documentation | **7.5 / 10** | 1,971 lines of governance docs, HIPAA control map, risk register, incident response — but the chain-disclosure evidence contradicts `DATA-GOVERNANCE.md` |
| Operations & release | **6.0 / 10** | No container, no licence, no release notes past 2.5.0, manual Lightsail deploy, version/checksum provenance unverifiable |
| Maintainability | **6.5 / 10** | 15,775 LOC server src + 10,394 LOC front-end JS, four near-identical bundles kept aligned by a script that was allowed to drift |
| **Overall** | **7.3 / 10** | Solid single-clinic pilot software. **Not** production-ready as a regulated multi-tenant EMR — see §4 |

The previous report (`reports/COMBINED-FEATURE-RATING-v2.6.3.md`) quotes **6.53/10** and
"75/75" per app. Those figures are not reproducible: its cited gates `npm run verify:ratings`
and `npm run verify:gaps` **do not exist** in `package.json`, and `node scripts/verify-all.mjs`
reports **70/70 for all four apps**, not 75. Treat that document as a historical claim, not
as evidence.

---

## 2. What I ran to score this

| Command | Result |
|---|---|
| `npm test` (repo root, 7 files) | **72/72 pass** |
| `npm test` (bundle `resources/app`, 2 files) | **35/35 pass** — this is what CI runs |
| `node check.mjs` | **ALL CHECKS PASSED** (syntax, await audit, bundle drift, junk trees, page scripts, icons) |
| `node scripts/verify-all.mjs` | **4 apps × 70/70, 0 failed** |
| `npm ci --omit=dev` (bundle) | clean after the lockfile repair in `cd73ca8`; would have failed before |
| live probes against a locally booted server | auth, images, metrics, ics, FHIR, HIPAA, attachments all 200/expected |

---

## 3. What is missing — verified, by severity

### P0 — blocks a real deployment

1. **Production does not run this source.** Live `https://veltruvia.duckdns.org` reports
   `version: 2.6.4` but returns **404 for `/api/metrics`** and sends **no `X-Request-Id`**,
   while this source mounts both. Whatever is deployed is not this tree. Until that is
   reconciled, "tested here" says nothing about "running there".
2. **The imaging feature has no interface.** `grep -rn "/api/images" public/` across all four
   bundles = **0 hits**. Commit `6878984` is titled "Integrate images API with all 6 endpoints
   **and patient gallery UI**"; the UI does not exist, so patients and doctors can never reach
   the feature. The API itself is now correct, authenticated and tested — but invisible.
3. **CI cannot prove the hardening.** `.github/workflows/tests.yml` runs only the bundle's
   `tests/` (35 tests, Node 20). The root suite — which holds `hardening.test.mjs` (single-writer
   lock, corrupt-DB recovery, atomic snapshots) and the new `images.api.test.mjs` — is never
   run in CI. That is exactly why the writer-lock bug survived on Node ≥ 22 until now.

### P1 — correctness / compliance risks

4. **`DATA-GOVERNANCE.md` and `DATA-FLOW.md` claim only hashes go on chain.** The 110-event
   Sepolia disclosure (`reports/SEPOLIA-DISCLOSURE-ASSESSMENT.md`) contradicts that. One of the
   two is wrong; leaving both published is a disclosure risk in a HIPAA/DPDP context.
5. **Sepolia assessment still has 5 `[VERIFY]` markers** — event count, distinct MRNs/emails,
   first/last block, field list. Counsel cannot rely on it until those are filled from a chain read.
6. **No server `.env.example`.** `src/` reads **41 distinct `process.env.*` variables**; only
   `contracts/.env.example` exists. A new operator has no authoritative list, which is how
   `PUBLIC_BASE_URL` ended up set-but-unused.
7. **Download page asserts binary provenance it cannot back.** `public/download.html` now shows
   v2.6.4 with Oct-2026 SHA-256 chips, but `public/downloads/` is not in the repo and
   `RELEASE-NOTES-2.5.0.txt` is the only release note. Either the checksums are for the 2.5.0
   binaries or they are unverified.
8. **Two divergent test suites.** `tests/` (root, 72) and `resources/app/tests/` (35) overlap
   without a stated rule for which one owns what. `images` exists only in the root suite.
9. **No `LICENSE`, no `Dockerfile`/compose.** Deployment is a hand-run Lightsail + systemd +
   Caddy procedure documented in prose; `scripts/deploy-hardened.sh` covers the app swap only.

### P2 — engineering debt, tracked or trivial

10. **Four open TODOs in `RISK-REGISTER.md`**: 31 supportive-care entries lacking
    monitoring/contraindication text; no anomaly alerting on the audit stream; only one offsite
    backup location; single uptime monitor.
11. **`/api/images` is absent from `routes/openapi.js`** (18 documented paths, 0 mentions) and
    from `verify-all.mjs`, so it is the one new feature with no contract and no smoke check there.
12. **`PUBLIC_BASE_URL` is read nowhere in `src/`** — the migration script sets an inert variable.
13. **Bundle drift recurred silently.** `src/`, `electron/` and `public/` had drifted across the
    four apps and `npm run check` was red before this session; it is green now only because
    `sync-bundles` was re-run. Nothing enforces running it.
14. **Node version skew:** `engines.node` is `24.x`, CI uses 20, this workspace runs 26. The lock
    bug proved that skew is not cosmetic.

---

## 4. Honest bottom line

- **As internal clinical software for one clinic, on one VM, with one operator:** genuinely
  good. The safety work is real (identity confirmation before notes/Rx, allergy cross-reactivity,
  delta checks), the security primitives are correct, and the data-loss defences (atomic
  snapshots, corrupt-DB quarantine + restore, writer lock) are better than most small EMRs.
- **As a regulated product you could sell or deploy multi-tenant:** not yet. There is no
  verified deployment matching this source, no clinical validation or regulatory clearance
  evidence in the repo, no third-party penetration test, and the governance documents make a
  on-chain disclosure claim that the chain evidence contradicts.
- **The single highest-value next action** is not more code: deploy the source that is actually
  in this repo, then run the root test suite in CI so the hardening regressions are caught where
  they happen.

---

### Reproduce

```bash
npm test                                  # 72/72 (root)
node check.mjs                            # ALL CHECKS PASSED
node scripts/verify-all.mjs               # 4 × 70/70
cd "VELTRUVIA Server/resources/app" && npm test   # 35/35 (what CI runs)
```
