# VELTRUVIA — Project Rating & Gap Recheck (v2.6.8)

**Date:** 2026-11-25 · **Version:** 2.6.8 · **Scope:** this checkout, plus the VM state the
operator pasted this session. Not a live-deployment audit.

Every number below was produced by running something in this checkout, and is quoted with the
command that produced it. Where something could not be verified here, it says so.

Supersedes `reports/PROJECT-RATING-v2.6.4.md` (2026-11-19, 7.3/10).

---

## 1. Scorecard

| Axis | v2.6.4 | **v2.6.8** | Basis |
|---|---|---|---|
| Functional breadth | 8.5 | **8.7** | 24 route files / 192 `Router.verb(` handlers; imaging now has a real gallery (`index-5-imaging.js`, patient picker, upload, thumbnails, viewer, delete, DICOM via vendored Cornerstone3D) — v2.6.4 P0 #2 ("the feature has no interface") is closed |
| Test depth & reproducibility | 6.5 | **8.0** | Root suite **110/110**, bundle suite **36/36**, `check.mjs` green. CI runs the root suite on Node 20/22/24, which is where the hardening regressions live |
| Security engineering | 8.0 | **8.3** | S10 closed (spec no longer advertises an off-target host; that deployment is gone), S11 closed (TOTP replay, guarded by conditional `UPDATE` + retest on the VM), §4 auth flow **35/0/0/0** with `--expiry-waits`, S4 accepted with its cost measured rather than assumed |
| Regulatory / documentation | 7.5 | **7.8** | 2,654 lines of governance docs; Sepolia `[VERIFY]` markers resolved; the S8 notification decision is still open and belongs to counsel |
| Operations & release | 6.0 | **6.5** | `LICENSE`, `Dockerfile`, `docker-compose.yml`, server `.env.example` (41 env vars) all present now; still no release notes past 2.5.0 and `public/downloads/` is empty |
| Maintainability | 6.5 | **7.0** | Four bundles byte-identical under `check.mjs` (16 page-script blocks each); 54 src files / 16,296 LOC, 26 non-vendor page JS files / 11,004 LOC; drift gated in CI |
| **Overall** | 7.3 | **7.8 / 10** | Solid single-clinic pilot software. **Not** production-ready as a regulated multi-tenant EMR — see §4 |

---

## 2. What was run for this score

| Command | Result |
|---|---|
| `npm ci --omit=dev` (in `VELTRUVIA Server/resources/app`) | clean, lockfile unchanged |
| `node check.mjs` | **ALL CHECKS PASSED** — 4 bundles identical, 16 page-script blocks parse per bundle, icons correct |
| `node --test --test-force-exit tests/` (root) | **110 / 110 pass, 0 fail, 0 skip** (after the repair in §3.1) |
| `npm test` (bundle) | **36 / 36 pass** |
| source measurement (small node script) | 192 handlers / 24 route files; 16,296 src LOC; 11,004 non-vendor page-js LOC; 41 distinct `process.env.*`; 2,654 governance-doc lines |

**Not run here, and therefore not claimed:** `scripts/verify-all.mjs` (needs the three client
bundles' dependencies installed), ZAP and `pentest:auth` (need the VM and network), live probes
against `https://veltruvia.duckdns.org`, and a fresh Sepolia replay (needs RPC). The pentest
numbers quoted in §3 come from `PENTEST-SCOPE.md` §7 and `RISK-REGISTER.md`, dated 2026-11-24/25.

---

## 3. What is missing — verified, by severity

### 3.1 Found while scoring this, and fixed

1. **The Share removal left the root suite red.** `tests/imaging-ui.test.mjs:37` asserted the
   gallery module contains `/api/images/share` ("creates time-limited share links"). Commit
   `654e8fd` deleted that code, so `npm test` failed **1 of 109** and would have failed in CI on
   push. The assertion now locks the removal instead of the feature — no share call and no
   `imgShare`/`shareUrl` in the page, `POST /api/images/share` still present in
   `src/routes/images.js`, `#img-gallery` still present in `index.html` — so the server route
   stays covered and the UI removal cannot silently regress. Suite is **110/110** after it.
   The process lesson: `check.mjs` does not run tests, and the push happened without the root
   suite.

### P1 — open

2. **S8 — the Sepolia disclosure is still the highest residual risk.** Hash-only anchoring is
   enforced going forward (`assertHashOnlyAnchor`), but **1,008** already-anchored events carried
   **70 distinct identifiers**, and the join against the 2026-11-24 backup puts at least one live
   patient MRN on a public chain. No code change closes this; the open action is the notification
   decision, which is counsel's.
3. **Release provenance.** `public/download.html` advertises v2.6.8 with SHA-256 chips, but
   `RELEASE-NOTES-2.5.0.txt` is still the newest note and `public/downloads/` is absent. Either
   publish notes plus real checksums for 2.6.8 or stop asserting them.
4. **`scripts/verify-all.mjs` does not cover imaging** (`grep -c images` = 0). It is the only
   feature outside the 70×4 sweep, and it is the feature that just changed twice.
5. **Deployment-matches-source is not proven in this pass.** The v2.6.4 P0 said live 2.6.4
   returned 404 for `/api/metrics` and no `X-Request-Id`. One curl settles it; until then treat
   "tested here" and "running there" as separate claims.
6. **No BAA is in place for any subprocessor** before real PHI: Resend/Gmail, Cloudflare, GitHub,
   Sentry. Recorded as dated items, still dated.
7. **S6 anomaly alerting is shipped but not installed.** `scripts/audit-anomaly.mjs` exits 1 on a
   critical finding and 2 on a warning only when `--strict` is passed — the cron line documented
   before 2026-11-26 omitted that flag, so every warning-only rule exited 0 and stayed silent;
   the line is fixed and `--print-cron` now emits it. **Installed 2026-11-26** (`*/15`, `--strict`,
   `--stale-hours 24`), and cron firing is confirmed by the log growing at 06:45 without operator
   action. What remains is the consumer: the exit code goes to a log file, so a finding is recorded
   but not announced.

### P2 — tracked

8. **C4:** 31 of 201 supportive-care entries still lack monitoring/contraindication text,
   regression-locked at ≥80 % coverage with `bare.length ≤ 31`.
9. **Release engineering is still hand-run:** no container in production use, manual Lightsail +
   systemd + tunnel procedure, quick-tunnel URL that rotates on restart.
10. **S9:** the share API is a bearer token with no verified revocation path. UI removed
    2026-11-25; the route and its `sharedUntil` badge remain. Expiry probe due **2026-12-02**.

---

## 4. Honest bottom line

- **For one clinic, one VM, one operator:** genuinely good. The imaging gap that v2.6.4 called
  P0 is closed, the share surface got smaller rather than bigger, the auth-flow suite is at
  35/0/0/0 including real TTL waits, and the data-loss defences (atomic snapshots, corrupt-DB
  quarantine, writer lock) are better than most small EMRs.
- **For sale as a regulated multi-tenant product:** not yet. One un-closeable disclosure history,
  no BAAs, no third-party penetration test, release artefacts that are asserted but not
  published, and a deployment whose parity with this tree was last checked three weeks ago.
- **Highest-value next action:** counsel's decision on S8, followed by release provenance — the
  two things a buyer or auditor asks for first, and neither is more code.

---

### Reproduce

```bash
cd "VELTRUVIA Server/resources/app" && npm ci --omit=dev
cd - && node check.mjs                        # ALL CHECKS PASSED
npm test                                      # 110/110 (root)
cd "VELTRUVIA Server/resources/app" && npm test # 36/36 (what CI runs first)
node scripts/verify-all.mjs                   # 4 × 70 — needs the client bundles installed
```
