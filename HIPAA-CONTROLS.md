# VELTRUVIA — HIPAA Security Rule Technical Safeguards Crosswalk

Maps 45 CFR §164.312 (Technical Safeguards) to what VELTRUVIA implements
today, and what remains an operational (non-software) responsibility.

Status legend: ✅ implemented & verified · 🟡 implemented, needs an operational
step by the clinic · ⬜ administrative responsibility (outside software).

## §164.312(a)(1) Access control

| Requirement | Status | Implementation |
|---|---|---|
| Unique user identification | ✅ | Every account is a named user; demo/seed accounts removed in v2.0.3 |
| Emergency access procedure | 🟡 | Break-glass = admin resets a user's password; documented below |
| Automatic logoff | ✅ | Session tokens expire; lockout after repeated failures |
| Encryption/decryption (addressable) | ✅ | PHI columns encrypted at rest (AES-256-GCM, `PHI_ENCRYPTION_KEY`, key rotation tooling included) |

## §164.312(a)(2)(i)–(iv) Access-control implementations

| Implementation | Status | Notes |
|---|---|---|
| (i) Unique user ID | ✅ | See above |
| (ii) Emergency access | 🟡 | Procedure: admin account → Users → reset password |
| (iii) Automatic logoff | ✅ | Configurable session TTL in `.env` |
| (iv) Encryption & decryption | ✅ | AES-256-GCM for PHI fields; TLS in transit (below) |

## §164.312(b) Audit controls

✅ Append-only audit log (`data/audit-*.jsonl`) — every PHI read/write recorded
with user, action, timestamp. Chain-hashed (tamper-evident, `blockchain.js`),
chain integrity verified at boot and by `npm run verify`.

**Operational duty:** export and review audit logs periodically; retain 6 years.

## §164.312(c)(1)–(2) Integrity

✅ Chain-hashed audit trail; DB integrity check at boot; WAL-mode SQLite
(node:sqlite backend, v2.0.4+) with atomic commits; automatic rotating backups
(`data/backups/`, keep 30) + restore tooling (`scripts/restore-backup.mjs`).

## §164.312(d) Person or entity authentication

✅ Password auth with salted hashing; optional TOTP 2FA (QR rendered **locally**
since v2.0.5 — the otpauth secret never leaves the machine); account lockout;
OTP codes delivered by email once SMTP is configured (`SETUP-EMAIL.md`).

🟡 Until `GMAIL_APP_PASSWORD` is set: OTP fallback is disabled in production
(codes are NOT displayed) — configure email to enable registration/2FA flows.

## §164.312(e)(1) Transmission security

| Channel | Encryption | Status |
|---|---|---|
| Same PC (desktop Doctor → Server) | Loopback — never leaves machine | ✅ |
| Clinic Wi-Fi (phones → Server) | HTTPS on port 3001 (TLS 1.2+, v2.0.5 sidecar) | 🟡 install clinic cert on each phone (see below) |
| Remote (over internet) | Cloudflare tunnel — real TLS, valid cert | ✅ |
| Lab instruments (MLLP :2575) | Plaintext HL7 over TCP | ⬜ isolate instrument VLAN — industry default for MLLP |

### Enabling encrypted Wi-Fi (5 minutes, per phone)
1. On the PC: `http://<server-ip>:3000/certs/veltruvia-lan.crt`
2. Phone: Settings → Security → Install a certificate → CA certificate
3. In the VELTRUVIA app ⚙ → set the address to `https://<server-ip>:3001`
4. Verify: the app loads over HTTPS (lock icon in WebView is expected)

Full guide: `TLS-LAN.md`.

## §164.308/316 (Administrative) — checklist for the clinic

- ⬜ Conduct a risk analysis (this file + a walkthrough of the deployment)
- ⬜ Name a security officer
- ⬜ Workforce training + sanctions policy
- ⬜ Business Associate Agreements (Cloudflare tunnel, GitHub Releases hosting
  artifacts, email provider if SMTP is added)
- ⬜ Contingency plan: backups verified quarterly (restore test), restore drill
- ⬜ Facility access controls: the server PC itself is physical PHI media —
  lock the room, enable disk encryption (BitLocker) on the server PC
- ⬜ Maintain the audit log for 6 years

## Honest gaps (what software cannot do for you)

1. **BitLocker / full-disk encryption** on the server PC — if the PC is stolen, file-
   level encryption of the DB does not protect against off-line attacks.
2. **BAA with Cloudflare/GitHub** — both offer them on paid/business tiers.
3. **Formal attestation** — a signed security assessment by a professional.

## Verification evidence — live instance, v2.6.8

Re-verified against production on 2026-11-23/24. Each row below is something
that was observed on the running system, not a claim from source reading.

| Control | Evidence |
|---|---|
| §164.312(e) TLS/HSTS/CSP | `npm run pentest:http` against `https://veltruvia.duckdns.org`, 2026-11-21: TLS 1.3, HSTS, CSP without `unsafe-inline` in `script-src`, every probed API route 401, CORS not reflective, TRACE 405, login limiter 429 at attempt 6 — **15 pass / 0 fail / 3 info** |
| Header hygiene | OWASP ZAP baseline against production, 2026-11-23 (v2.6.8): **1 Medium / 1 Low / 5 Informational**, no blocking finding. The Medium is CSP `style-src 'unsafe-inline'` (RISK-REGISTER S4, accepted); the Low is a missing `Cross-Origin-Embedder-Policy` (no PHI consequence for an app that embeds nothing) |
| §164.312(a)(2)(iv) encryption at rest | AES-256-GCM PHI columns with `PHI_ENCRYPTION_KEY`; offsite archives are ciphertext (AES-256-GCM + SHA-256 manifest, decrypt-verified before upload) and the key is held off-box, separate from the archives |
| §164.312(c)(1) integrity | In-app snapshot verified on production 2026-11-23: `backups/veltruvia-2026-11-23T11-02-31.db`, 1,163,264 B, `pragma quick_check` → `ok`, restored copy holds both users and 32 kv rows. Every snapshot is header-validated before it is reported as written |
| §164.312(d) authentication | Credentials that had been disclosed in plain text were rotated 2026-11-23; appointment/report passwords rewritten in the app's own `pbkdf2$210000$…` (SHA-512) format and re-verified by a real login |
| §164.308(a)(7)(ii)(B) contingency | Nightly `VACUUM INTO` + tar (14 kept), daily offsite pull to an off-VM location, plus an encrypted second copy with 12 kept; **freshness guard** fails the pull if the newest copy is older than 36 h |
| §164.308(a)(6) incident response | Dead-man's switch live since 2026-11-23 (cron every 5 min; pings only while the service answers, so a dead VM goes silent and alerts). Anomaly scanner over the audit stream; both documented in PENTEST-SCOPE §6 |
| Audit trail durability | Append-only `audit_log` rows plus the chain-hashed local trail, verified at boot and by `npm run verify`; the one blocking gap was that Sepolia anchors carried identifiers instead of hashes — fixed in 2.6.8 and recorded as RISK-REGISTER S8 |

**Still open, and it cannot be closed by software:** the active (attack-traffic)
ZAP pass and the six manual auth flows in `PENTEST-SCOPE.md` §4 — the full pass
needs a host with more RAM than the clinic VM. Administrative items (risk
analysis sign-off, security officer, training, BAAs, restore drill, 6-year
audit retention) remain the clinic's, per the checklist above.

## Historical evidence (v2.0.5)

The crosswalk was first verified against build v2.0.5, on narrower evidence than
the live checks above: "276/276 feature checks (incl. RBAC
privilege-separation), unit tests, audit-chain checks — see `npm run verify`".
Those were source-level checks; none of them exercised the deployed host, which
is why the 2026-11-23/24 pass above exists.

---
*Crosswalk last verified against build **v2.6.8** (2026-11-24).*