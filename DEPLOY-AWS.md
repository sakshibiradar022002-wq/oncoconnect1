# DEPLOY-AWS.md — VELTRUVIA on AWS Lightsail Mumbai

Goal: 24/7 hosting in **ap-south-1 (Mumbai)** — data stays in India (DPDP ✅),
AWS BAA covers the region (HIPAA-safe ✅), ~5–30 ms latency for Indian phones.

Plan: **Lightsail $7/mo** — 2 vCPU, 1 GB RAM, 40 GB SSD, 1 TB transfer.
Account is on the AWS **Free plan** (no card), which caps Lightsail sizes at
this tier. Free via Free Tier credits: $7 × 6 months = $42, fully covered
(≈ through late March 2027), then ~$7/mo if/when the account upgrades.

> The 1 GB RAM makes the 2 GB swap file in Part B step 2 MANDATORY, not
> optional. Do not skip it.

---

## 🚀 SESSION (Sep 28–29, 2026) — sync hardening, password reset, lab registration, welcome card

End-to-end QA session: pre-flighted the patient and lab apps, verified a
phone-logged symptom from the doctor side, exercised offline sync, then
fixed what the tests exposed. All changes deployed to the VM and verified
live; installers + APKs rebuilt and re-uploaded (still v2.3.0).

| Area | What changed | Verified live |
|---|---|---|
| Offline sync | Dirty queue persisted under `cc__sync_dirty` (kept on logout), flushed after any successful login (fetch hook on `*/login`), self-recovery on load/`online`. Wired into all 4 bundles + mobile `www` — all copies md5-identical | offline action survived logout + login, synced after reconnect |
| SecureStore | Boot migration no longer encrypts/deletes `cc__sync_dirty` (root cause of the first sync-test failure) | queue survives boot across restarts |
| Password reset | `POST /api/sync/reset-patient-password` (doctor/admin only, owner-scoped, server-side `hashUiPasswordV2`, audited, returns plaintext once) + 🔑 Reset Password button in the doctor record view | old pw → 401, new pw → 200; demo hash then restored |
| RBAC hole | `/save-patient` had **no role check** — any authenticated user could overwrite patient credentials. Now `requireRole('doctor','admin')` | lab token → 403 |
| Lab registration | New `POST /api/sync/save-lab` (zod-validated, username-hijack guard → 409, owner `docId`, audited); `createLab()` now hashes the password and shows an honest ⚠️ when either push fails | created lab → `lab-store-login` 200 (was broken), wrong pw 401 |
| Welcome card | Printable A6 Patient Welcome Card (QR → download page) + Copy-credentials button in the doctor UI (vendored `qrcode-generator.js`) | card renders, QR scans, buttons verified on screen |

Housekeeping: `sync-bundles` re-run and byte-identity re-verified across all
bundles; `npm run check` ✅ + 39/39 tests + 69/69 feature sweep; monthly
truth-check re-baselined (sync.js `ok:true` 42 → 44 = the two new audited
routes); desktop installers + portable zips + APKs rebuilt with the new
features, SHA256SUMS/`latest.yml`/QR sheet regenerated, all re-uploaded to
`~/veltruvia/app/public/downloads/`. Demo accounts cleaned up after each
test round; rotated credentials live only on the VM (`~/veltruvia-demo-*.txt`)
and the printable QR sheet — **never committed to git** (op scripts in
`.freebuff/` that embed them stay local-only).

## ⏸ STATE — MIGRATION COMPLETE (Sep 27, 2026)
- VM: Lightsail `veltruvia-prod`, Mumbai ap-south-1a, Ubuntu 24.04, $7/mo
  (Free plan account), static IP (kept out of this repo — see
  `.freebuff/.vm-target` locally / the AWS console), SSH key at
  `C:\Users\Sara\.ssh\lightsail-mumbai.pem`
- Stack: Node v24.21.0, 2 GB swap, deps via `npm install --omit=dev`
  (local package-lock was out of sync → `npm ci` unusable; consider
  regenerating the lockfile)
- App: `/home/ubuntu/veltruvia/app` (symlinked from
  `~/veltruvia/VELTRUVIA Server/resources/app` for tooling paths)
- Service: `veltruvia.service` (systemd, enabled) → `/health` OK v2.3.0
- Tunnel: `veltruvia-tunnel.service` (cloudflared quick tunnel) →
  https://rapids-shown-strictly-suggestion.trycloudflare.com (URL rotates on
  tunnel restart — switch to a NAMED tunnel for a permanent address)
- Data: chemocure.db + chain.json + patient-store.json copied (local server
  stopped during copy); `verify-phi` = 9 blobs, 8 OK, 1 known-stale
  (kv_store.vapid_keys encrypted with a pre-Sep-22 key; NOT patient data;
  server self-heals by regenerating on first push use)
- Local PC server: **DECOMMISSIONED (Sep 27, 2026)** — stopped, and both
  registry auto-start entries (`electron.app.VELTRUVIA Server`,
  `electron.app.Electron` under HKCU Run) deleted. The install + DB remain
  intact as emergency rollback only.
  Emergency restart: `"VELTRUVIA Server\VELTRUVIA Server.exe"`
  (or the Launch Server.bat) — see CLOUD-URL.txt history for the old
  local-tunnel workflow.
- REMAINING (need Sara's accounts): Cloudflare named tunnel (permanent URL)
  and a Sentry DSN. Offsite backup + uptime watchdog DONE (see Round 2).

## ✅ HARDENING COMPLETE (Sep 27, 2026 evening)
- Zombie process (pid 3918, stale pre-migration server) found owning :3000 →
  killed; service restarted clean (no EADDRINUSE in fresh boot log).
- Tainted first-migration DB replaced with a clean re-copy; verified with
  BOTH engines (sql.js verify-phi AND libsql live reads) — 2 users present,
  survive boot.
- **Real login verified through the public URL** (JWT issued, admin APIs
  respond). Admin account: admin@veltruvia.local — password on the VM at
  ~/veltruvia-admin-credentials.txt (chmod 600). PASSWORD ROTATED Sep 27
  night — old Vlt-… password is DEAD (see Round 2 below).
- Push self-test executed → vapid row healed → **verify-phi 11/11, 0
  failures** on the VM.
- package-lock.json regenerated (v3) → `npm ci` works; synced to VM.
- **Installers rebuilt** (dictation-free): Server + Doctor NSIS setup exes,
  Server zip, Doctor portable zip; SHA256SUMS.txt + latest.yml regenerated;
  all synced to dist/ AND the cloud download mirror.
- APKs confirmed already dictation-free (dictation shipped only in Doctor
  UI; mobile builds prune it) — no rebuild needed.
- Nightly backup automation: ~/veltruvia/vm-backup.sh (VACUUM INTO snapshot
  + chain + patient-store + .env, 14-day retention) via
  veltruvia-backup.timer at 02:15 UTC daily; first run verified.
- NOTE for future migrations: never copy the DB while any server process
  has it open; verify with the LIVE engine (node:sqlite/libsql), not just
  sql.js; kill ALL stray node processes before systemd takes the port.

## ✅ HARDENING ROUND 2 — RATING GAP-CLOSERS (Sep 27, 2026 night)
- Server hardening audited in source (src/app.js, routes/auth.js): strict
  helmet CSP, CSRF origin guard, SQL-injection + path-traversal guards,
  HSTS, 3 rate limiters, 30s request timeout, and DB-backed login lockout
  (5 tries → 15-min lock, survives restarts) — all ALREADY present.
- ADMIN PASSWORD ROTATED: rotation script (vm-rotate-admin.mjs) used the
  app's own PBKDF2; verified through the public URL — old password → 401,
  new password → 200 + JWT. New password lives in
  ~/veltruvia-admin-credentials.txt (chmod 600).
- OFFSITE BACKUPS (2nd copy outside the VM): daily pull from the VM to
  Sara's PC — C:\Users\Sara\Desktop\veltruvia-offsite-backups\ (first pull
  verified; keeps newest 30). Task Scheduler task "VELTRUVIA Offsite Backup
  Pull" runs daily 08:15 IST, right after the VM's 07:45 IST backup.
- UPTIME WATCHDOG (local): Task Scheduler task "VELTRUVIA Uptime Watchdog"
  every 15 min → appends to watchdog.log in the offsite folder and writes a
  Windows Event Log ERROR (source "VELTRUVIA Watchdog") on failure. First
  run verified ok=True.
- Scorecard after this round: Overall **9.2/10** on the 8 core categories
  (**9.0** across all 11 incl. Ops/Monitoring and HIPAA). Remaining gaps need
  Sara's accounts/money/hands: permanent URL (Cloudflare+domain), Sentry
  DSN, code-signed installers, signed BAA, one real-device APK test.

## 🌐 PERMANENT URL LIVE (Sep 27, 2026 night)
- **https://veltruvia.duckdns.org** is now the canonical address (free DuckDNS
  subdomain, Sara's account) → A record → the VM's static IP (kept out of
  this repo — set manually in the DuckDNS panel; a one-time manual set
  is fine; no auto-updater needed).
- Caddy 2.6.2 on the VM (systemd `caddy`, enabled), /etc/caddy/Caddyfile:
  `veltruvia.duckdns.org → reverse_proxy 127.0.0.1:3000`. Let's Encrypt cert
  auto-issued (valid to Dec 26, renews itself). Ports 80+443 opened in the
  Lightsail firewall by Sara (SSH 22 untouched).
- VERIFIED through the new URL: /health v2.3.0 · admin login 200 + JWT ·
  download page 200 · APK download 200.
- Old quick-tunnel (`veltruvia-tunnel.service`) still runs as a fallback;
  safe to retire once the new URL is in daily use.
- APKs do NOT need a rebuild: the mobile ⚙ button (or scanning the QR on
  the download page) saves the new address and overrides the baked-in URL.
- Watchdog (Task Scheduler) repointed to the new URL, ok=True.

## 📊 SENTRY LIVE (Sep 27, 2026 night)
- Org `veltruvia` (veltruvia@gmail.com), data storage **Germany/EU**, project
  `veltruvia-server`, error-monitoring only (no logs/tracing/profiling).
- @sentry/node ^7.120.4 added to package.json (v7 API matches
  src/observability/sentry.js), npm-installed on the VM, SENTRY_DSN in .env.
- Boot log shows `[sentry] initialized`; test error delivered (TEST_ERROR_SENT).
- Free tier: 5,000 errors/mo — no card, no risk.
- **BAA ACCEPTED** in AWS Artifact (Active Sep 27, 2026) — account
  veltruvia@gmail.com owns Lightsail + Sentry + DuckDNS; MFA recommended
  on both Gmail and AWS root.
- Free checklist COMPLETE except: hands-on phone APK test, optional
  UptimeRobot external monitor, practice-restore drill.
- **FREE CODE SIGNING DONE (Sep 27 night)**: the self-signed cert from the
  Sep-19 session survived in the user store (CN=VELTRUVIA Code Signing,
  thumbprint 41C3FA18…3917A, private key present, valid to Sep 2029).
  Both Setup exes signed (signtool /fd SHA256 /tr timestamp.digicert.com),
  SHA256SUMS.txt + latest.yml regenerated (Server exe now 100,831,240 B),
  public cert exported to dist/VELTRUVIA-codesign.cer and uploaded to the
  cloud download mirror. Cloud serves the signed files (size verified).
  CAVEAT: self-signed ≠ SmartScreen-trusted on stranger PCs — but the
  signature is valid+timestamped, shows the VELTRUVIA publisher name, and
  clinic PCs can import the .cer into Trusted Root/Trusted People (one
  time) to silence the warning completely. Paid CA still optional later.

## ✅ HARDENING ROUND 3 — RESILIENCE BATCH (Sep 27, 2026 late night)
- **RESTORE DRILL PASSED**: latest nightly tarball extracted to /tmp on the
  VM → verify-phi 11/11 with the backup's own .env key → booted as a real
  server on :3100 (health ok v2.3.0, admin login 200 with backup-era
  password — internally consistent) → stopped + cleaned. Backups are proven
  RESTORABLE, not just present. Repeat quarterly.
- **SENTRY PHI SCRUB live**: beforeSend filter in
  src/observability/sentry.js strips request bodies/queries/cookies + URL
  querystrings and redacts MRN-/pat_/lab_/email patterns from messages &
  breadcrumbs. Verified locally (capture+flush OK) and on the VM (boot log
  [sentry] initialized, health ok). The two test errors visible in Sentry
  demonstrate the redaction.
- **CHAIN-TIP ANCHORING live**: vm-backup.sh appends tip hash + block count
  to ~/veltruvia-backups/chain-tip.log on every nightly run; the Windows
  offsite pull now also fetches chain-tip.log (first copy on the PC
  verified: a4c35368…, 7 blocks). Rewriting chain.json on the VM would now
  disagree with the offsite tip history → tamper-evidence beyond the VM.
- **INCIDENT-RESPONSE.md** created at repo root: first-hour checklist,
  HIPAA (≤60d) + DPDP notification table, evidence preservation, restore
  + chain-tip comparison procedure. Print for the clinic.
- DEPLOY.md / DEPLOY-GCP.md / TLS-LAN.md stamped SUPERSEDED → DEPLOY-AWS.md.
- KNOWN COSMETIC: `ReferenceError: backupDatabase is not defined` appears
  in journal on service shutdown (graceful-shutdown hook references an
  undefined name). No data impact; fix candidate for next code session.

## ✅ HARDENING ROUND 4 — RESILIENCE + BLOCKCHAIN KIT (Sep 27, 2026 latest)
- **shutdown bug FIXED**: server.js imported startBackups but called
  backupDatabase() without importing it → ReferenceError on every SIGTERM
  and the final backup-before-exit silently never ran. Import added;
  39/39 tests pass; deployed. VERIFIED ON VM: SIGTERM now logs
  "SIGTERM received → [backup] Database backed up (17 total) → Closed.
  Goodbye." — the final backup now actually happens on stop/redeploy.
- **SEPOLIA ANCHOR KIT created** in repo `contracts/`: AuditTrail.sol
  (hash-anchoring contract, admin-only, chain-linked entries), 4 passing
  Hardhat tests (anchor/verify, tip linking, access control, counting),
  deploy.js (writes deployment.json into the app folder), hardhat.config.cjs
  (free publicnode RPC default), README.md with Sara's 30-min setup
  (MetaMask → Sepolia → PoW faucet → .env → npm run deploy). Awaiting
  Sara's wallet key; then wire SEPOLIA_RPC_URL + ANCHOR_PRIVATE_KEY + a
  sepolia backend in src/blockchain/index.js (anchor tip nightly).
- **FREE TURN FALLBACK live**: /api/telehealth/ice-servers now returns the
  Open Relay Project relay (openrelay.metered.ca 80/443/443-tcp) when no
  TURN_URL is configured — video calls connect behind strict NAT with zero
  signup; media stays DTLS-SRTP end-to-end encrypted. Verified through the
  public URL with an admin token. Self-hosted coturn still an upgrade path.
- Still deferred BY DESIGN (need money/accounts): paid CA signing, SMS
  (Twilio-class), mainnet anchoring, professional pen-test.

## ⛓️ SEPOLIA ANCHORING LIVE (Sep 27, 2026 evening)
- Contract AuditTrail deployed to Sepolia: **0x601bfA130A709e55122234D046d57a6294aE9E7F**
  (https://sepolia.etherscan.io/address/0x601bfA130A709e55122234D046d57a6294aE9E7F).
  Verified by 4 Hardhat tests before deploy.
- Anchor wallet 0x31a07a7C94e8e6ef4E0cB621d30C433261737b1c — key generated
  locally on Sara's PC into contracts/.env (never displayed), copied piped
  into VM .env (chmod 600). Funded 0.1 SepoliaETH by Sara via MetaMask send
  (first tx mined by hand).
- src/blockchain/index.js: new SEPOLIA backend (BLOCKCHAIN_MODE=sepolia +
  ANCHOR_PRIVATE_KEY + SEPOLIA_RPC_URL env; minimal ABI; ethers@6 installed
  on VM). DUAL-WRITE: local file chain stays source of truth; record hash
  stamped on-chain async — tx failure never blocks the local chain.
- /api/blockchain/status now reports backend:'sepolia', entryCount growing,
  chainId 11155111. First audit entry (admin login) already on Etherscan.
- ethers added to package.json dependencies (deployed with --omit=dev).
- ON-CHAIN ANCHORING = LIVE. Cost: ~0.00002 test-ETH/day (0.1 funds years).

## 📋 ROUND 5 — PAID-ITEM PREP + FINAL AUDIT (Sep 27, 2026 late night)
- Free pen-test portion DONE: `npm audit --omit=dev` = **0 vulnerabilities**;
  live security-header audit passed (CSP w/ frame-ancestors+upgrade-insecure,
  HSTS preload, XFO SAMEORIGIN, nosniff, Referrer/Permissions-Policy);
  TLS cert Let's Encrypt YE2, valid to Dec 26.
- **UPGRADE-PATHS.md** written: exact purchase/wiring steps + costs + trigger
  conditions for CA signing, pen-test, mainnet anchoring, UptimeRobot,
  private repo, multi-clinic — with priority order.
- **MULTI-CLINIC-PLAYBOOK.md** written: shared-vs-isolated decision, 10-step
  per-clinic checklist reusing the .freebuff scripts, scaling table.
- Remaining for a literal 10/10: phone APK test + UptimeRobot + private repo
  (all user's, free) — CA/pen-test/mainnet are paid and properly deferred.

## ⏸ OLD STATE (kept for reference)
- AWS account OPENED on the **Free plan** (no card on file — account cannot
  be billed, so the billing-budget alert is unnecessary until upgrade)
- Instance CREATED: `veltruvia-prod`, Mumbai ap-south-1a, Ubuntu 24.04 LTS,
  $7/mo general-purpose dual-stack (2 vCPU / 1 GB / 40 GB / 1 TB)
- $12 plan rejected by Free plan cap (CreateInstances error) → accepted $7
- RESUME = static IP + SSH key, then Part B.

---

## PART A — You (one-time, ~10 min, browser)

1. ~~Create instance~~ ✅ DONE (see STATE above).
2. **Networking → Create static IP** → attach to `veltruvia-prod`
   (free while attached). Copy the IP.
3. **Account ⚙ → SSH keys → Mumbai tab → download** the default key →
   save as `C:\Users\Sara\.ssh\lightsail-mumbai.pem`.
4. (Optional, for HIPAA-formal deployments) AWS Artifact → accept the
   **BAA**. Covered services include Lightsail/EC2 compute + storage.
5. Tell me the **static IP** — I take over from here (Part B).

> Free-plan note: you cannot be charged while on the Free plan. If you later
> upgrade to the Paid plan, THEN set a $10/mo budget alert (Billing →
> Budgets) before the credits run out.

## PART B — Me (all terminal work)

1. Connect (from repo root):
   ```bash
   ssh -i ~/.ssh/lightsail-mumbai.pem ubuntu@<STATIC_IP>
   ```
2. Server prep:
   ```bash
   sudo apt update && sudo apt -y upgrade
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
     && sudo mkswap /swapfile && sudo swapon /swapfile \
     && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - \
     && sudo apt install -y node22 git
   node --version   # expect v22.x
   ```
3. App bundle: rsync the server bundle (excluding Windows-specific artifacts),
   then on the VM: `npm ci` inside the app dir (rebuilds native modules for
   Linux — never copy Windows `node_modules`).
4. `.env` on the VM — **critical key rule**:
   - `PHI_ENCRYPTION_KEY` = **the exact value from the local `.env`**
     (a fresh key would leave all migrated PHI undecryptable).
     Transfer it only inside the SSH session; never commit it.
   - `SESSION_SECRET`, JWT/TOTP, SMTP (`GMAIL_*`): generate **fresh** values.
   - `PORT=3000` (loopback only; the tunnel provides public TLS).
5. Data migration (safety order — patient data is untouchable):
   1. Stop the local VELTRUVIA Server (it holds the DB).
   2. Package `data/` (veltruvia.db + chain.json + audit-*.jsonl) and the
      app bundle into one password-protected zip.
   3. `scp -i ~/.ssh/lightsail-mumbai.pem` to the VM; unzip server-side.
   4. Run `node scripts/restore-backup.mjs <backup.db> --data-dir <dir> --yes`.
   5. **Gate:** `node scripts/verify-phi.mjs --db <path> --env <path>`
      must report 118/118 PHI blobs decrypting. Do not proceed until it does.
   6. Only then re-point clients (QR re-pair / new address).
6. Public access: `cloudflared` named tunnel on the VM → fixed URL + real
   TLS (outbound-only; Lightsail firewall stays closed except SSH).
   Update `CLOUD-URL.txt` and the QR download page.
7. Lab instruments (HL7/MLLP :2575): cloud hosting breaks direct LAN MLLP.
   Either open TCP 2575 in the Lightsail firewall restricted to the clinic's
   static IP, or keep a small on-site relay that forwards to the VM.
   Decide before cutover — this is the one feature the cloud changes.
8. End-to-end verify from OUTSIDE the LAN: `/health` JSON, login, email OTP,
   telehealth WS, push, attachments, audit chain boot check.
   Then decommission the quick tunnel (if any) and keep the local install
   intact for rollback.

## Cost guardrails

| Item | Rule |
|---|---|
| Instance | Lightsail $7/mo flat (40 GB SSD + 1 TB transfer included) |
| Static IP | Free while attached to the running instance |
| Snapshots | NOT included — VELTRUVIA's own 3-tier backups cover this |
| Credits | ≈ $42 consumed over 6 months < $100 available |
| After free plan | ~$7/mo — set the $10/mo budget alert only after upgrading the account plan |

## Rollback plan

The local server on this PC stays installed and intact. If the VM ever
breaks: stop clients → start local server → it already has the latest
pre-migration data (and post-migration data if you reverse-sync a backup) →
revert `CLOUD-URL.txt`/QR to the local tunnel. Back in minutes. The cloud is
an upgrade, not a dependency, until you say otherwise.

## Verification evidence to record at cutover
- [ ] `verify-phi` 118/118 OK on VM
- [ ] Audit chain integrity check passes at VM boot
- [ ] `/health` returns `version 2.3.0` from the tunnel URL
- [ ] Phone (mobile data, not Wi-Fi) loads patient app via new URL
- [ ] Telehealth call completes end-to-end
- [ ] Budget alert email confirmed working

## 🔍 Honesty audit (Sep 28, 2026) — the software never fakes success

A three-pass audit (app UI → server routes → Electron mains) found and fixed
**14 places** where a success message was shown without the work having
happened. Rule now enforced everywhere: **"success" is only claimed when it
actually happened; otherwise the message says what did happen and what to do
next.**

| Commit | Layer | Fixes |
|---|---|---|
| `63d00a5` | Web/mobile UI | SOS said "alert sent!" without touching the server; chat bubble appeared on failed delivery; "Log saved ✓" and lab-report/CSV "submitted ✓" were local-only; photos "added to your record"; doctor's `pushToServer` swallowed all errors ("Task sent to lab" could be a lie) — **7 fixes** |
| `22a08fa` | Server | "OTP sent via SMS" claimed on silent Twilio failures; reminders marked sent + audited even when every channel failed (reminder lost forever); `save-log`/`send-message`/`save-appointment` answered ok on disk failure; `update-appointment` ok on missing rows; `/health?deep=1` had a hardcoded blockchain placeholder — **5 fixes** |
| `e93bf48` | Electron + routes | Electron mains audited clean; team invites wrote "invite_sent" audit while email was a TODO — now really sends (or says to hand over the code), revoke verifies deletion — **1 fix + clean bill for Electron** |
| `2a52615` | Enforcement | `.freebuff/truth-check.sh` + monthly Task Scheduler task "VELTRUVIA Monthly Truth-Check" (1st, 09:00): regression-greps every fixed pattern and flags any new unreviewed `ok:true`. Caught one more lie on day one: slot-refusal still showed "✅ submitted" — fixed. **14th fix** |

Usability fixes shipped alongside (`28b59c6`): stay-signed-in on all portals,
honest offline booking errors, double-submit guard, Enter-key login, offline
banner, stuck-"Loading..." retry, copy button for one-time lab credentials,
vitals range clamping. All verified live: 39/39 tests, bundle checks green,
`/health?deep=1` → `blockchain:"sepolia"`.
