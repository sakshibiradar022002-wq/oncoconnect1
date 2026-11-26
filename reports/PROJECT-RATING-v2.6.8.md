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
| Test depth & reproducibility | 6.5 | **8.0** | Root suite **124/124**, bundle suite **36/36**, `check.mjs` green. CI runs the root suite on Node 20/22/24, which is where the hardening regressions live |
| Security engineering | 8.0 | **8.3** | S10 closed (spec no longer advertises an off-target host; that deployment is gone), S11 closed (TOTP replay, guarded by conditional `UPDATE` + retest on the VM), §4 auth flow **35/0/0/0** with `--expiry-waits`, S4 accepted with its cost measured rather than assumed |
| Regulatory / documentation | 7.5 | **7.8** | 2,688 lines of governance docs; Sepolia `[VERIFY]` markers resolved; the S8 notification decision is still open and belongs to counsel |
| Operations & release | 6.0 | **6.5** | `LICENSE`, `Dockerfile`, `docker-compose.yml`, server `.env.example` (41 env vars) all present now; `RELEASE-NOTES-2.6.8.txt` covers the 84 commits since 2.5.0, and the eight published artifacts are real and digest-verified — but they are a month older than the version the page advertises |
| Maintainability | 6.5 | **7.0** | Four bundles byte-identical under `check.mjs` (16 page-script blocks each); 54 src files / 16,242 LOC, 26 non-vendor page JS files / 10,978 LOC; drift gated in CI |
| **Overall** | 7.3 | **7.8 / 10** | Solid single-clinic pilot software. **Not** production-ready as a regulated multi-tenant EMR — see §4 |

---

## 2. What was run for this score

| Command | Result |
|---|---|
| `npm ci --omit=dev` (in `VELTRUVIA Server/resources/app`) | clean, lockfile unchanged |
| `node check.mjs` | **ALL CHECKS PASSED** — 4 bundles identical, 16 page-script blocks parse per bundle, icons correct |
| `node --test --test-force-exit tests/*.test.mjs` (root) | **124 / 124 pass, 0 fail, 0 skip** (re-run 2026-11-26; the bare `tests/` argument is not usable on Node 24 — it is resolved as a module path and fails with `MODULE_NOT_FOUND`) |
| `npm test` (bundle) | **36 / 36 pass** |
| `node scripts/verify-app.mjs "VELTRUVIA Server/resources/app" Server` | **90 / 90 feature checks pass**, including 20 imaging checks (upload → gallery → bytes → metadata → share → anonymous share → 6 unauthenticated 401s → patient delete 403 → token rejects → delete → patient/lab 403) |
| source measurement (shell counts, re-measured 2026-11-26) | 192 handlers / 24 route files / 54 src files; 16,242 src LOC; 10,978 non-vendor page-js LOC in 26 files; 42 distinct `process.env.*`; 2,688 governance-doc lines (root `*.md`) |

**Both `npm test` scripts were broken on the Node versions CI runs.** They passed a bare
`tests/` directory, which Node ≥ 22 resolves as a module path (`Cannot find module
'…/tests'`, exit 1) even though Node 20 scans it. The matrix in
`.github/workflows/tests.yml` is 20/22/24, so the suite that proves everything else could not
start on two of its three versions. Both scripts now pass an explicit glob
(`tests/*.test.mjs`, `tests/*.test.js`) and both suites complete here: **124/124** root,
**36/36** bundle, exit 0.

**Not run here, and therefore not claimed:** the Doctor, Patient and Lab bundles of
`scripts/verify-all.mjs` (only the Server bundle was installed and run; the four bundles share an
identical `src/`, checked by `check.mjs`, but identical source is not a substitute for a run),
ZAP and `pentest:auth` (need the VM and network), live probes
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
   stays covered and the UI removal cannot silently regress. Suite was **110/110** when that
   landed and is **118/118** now.
   The process lesson: `check.mjs` does not run tests, and the push happened without the root
   suite.

### P1 — open

2. **S8 — the Sepolia disclosure is still the highest residual risk.** Hash-only anchoring is
   enforced going forward (`assertHashOnlyAnchor`), but **1,008** already-anchored events carried
   **70 distinct identifiers** (an unrelated number), and the join against the 2026-11-24 backup puts at least one live
   patient MRN on a public chain. No code change closes this; the open action is the notification
   decision, which is counsel's.
3. **Release provenance — the page and the bytes disagree.** Correcting an earlier entry: the
   repository has no `public/downloads/`, but production does — the deploy preserves it — and it
   holds all eight artifacts plus `SHA256SUMS.txt`, served with 200. `sha256sum -c` passes on every
   one of the eight (2026-11-26), so there is no tampering signal. The problem is age and
   attribution: every installer, portable ZIP and APK is dated **2026-10-08 → 2026-10-15**, and the
   server's own manifest on production states `version: **2.5.0**` (checked 2026-11-26), while the
   page advertised v2.6.8 and `/health` reports 2.6.8 — so a visitor was told they were getting a
   build five minor releases newer than the bytes they actually receive. That is wider than the
   "month older" the earlier entries assumed. The checksum box that
   `download-page.js` unhides now lists digests for those older files, and nothing ties them to the
   2.6.8 source tree; which version the artifacts report internally was not determined. Fix: rebuild
   the four installers and two APKs from the current source and republish with a matching
   `SHA256SUMS.txt`. Until that happens the page no longer asserts a version it cannot read:
   `js/artifact-versions.js` fetches `downloads/latest-<app>.yml` for each card and for the header,
   shows the version and date that manifest carries, and the markup now carries no version string at
   all (`grep -c 'v2\.6\.' download.html` = 0) with every version line shipping hidden, so a reader
   without JavaScript is told nothing rather than something stale. `tests/artifact-versions.test.mjs`
   drives that wiring through a stubbed DOM and `fetch` (7 cases), but the page has **not** been
   rendered in a browser — the visual result is unverified.
4. **Imaging coverage in the sweep — corrected.** Earlier entries said `scripts/verify-all.mjs` had
   no imaging coverage because `grep -c images` was 0. That grep measured the delegating wrapper,
   which carries no checks for any feature — every check lives in `scripts/verify-app.mjs`. That
   runner has had a 9-check imaging block since `289ac2e` (v2.6.7): upload returns 201 with a
   sha256, the gallery lists the study and reports a total, the file endpoint returns exactly the
   uploaded byte length, `POST /api/images/share` returns a token, the share URL serves without a
   session, delete succeeds, and patient and lab sessions get 403 on the gallery. The four checks it
   lacked were added on 2026-11-26: `GET /api/images/:id` metadata (shape, plus an assertion that
   the share token does not leak), five unauthenticated probes expecting 401 on each route, a
   patient-role delete expecting 403, and malformed/unknown share tokens expecting 404. That brings
   the block to 20 checks and the Server run to **90/90**, all green. The expired-share 410 is still
   not covered locally: the API clamps `expiresInDays` to a minimum of 1, so reaching it means aging
   the encrypted `kv_store` row by hand — it is probed against the live deployment on 2026-12-02.
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
   action. The consumer now exists too: `scripts/anomaly-alert.mjs` pings a Healthchecks check on a
   clean window and `/fail` on exit 1 or 2, with a test for each code. What remains is creating that
   check and putting `ANOMALY_CHECK_URL` in the crontab. Both are now done on the VM: a separate
   Healthchecks check (period 15, grace 30) exists, its URL sits in `~/.secrets/anomaly-check.url`
   (mode 600) and the crontab line reads it with `$(cat …)`, so `crontab -l` is safe to hand to an
   auditor. The dry run exited 0 with `[anomaly-alert] ✅ heartbeat sent`, and a real cron tick
   wrote the same line to `~/veltruvia-anomaly.log`. A critical finding now reaches an outside
   service within 15 minutes instead of waiting to be read.

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
npm test                                      # 124/124 (root)
cd "VELTRUVIA Server/resources/app" && npm test # 36/36 (what CI runs first)
node scripts/verify-all.mjs                   # 4 × 90 checks — Server bundle verified here
```
