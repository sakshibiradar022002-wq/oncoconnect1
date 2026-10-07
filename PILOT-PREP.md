# VELTRUVIA 2.5.0 — First Pilot Clinic Preparation Pack

**Scope:** everything needed to take one real clinic from "demo deployment" to a supervised 2–4 week pilot.
**Owner:** VELTRUVIA build/release & operations team. **Status doc date:** 2026-10-07.
**Companion docs:** Evaluation Report v1.3 (§8.8 roadmap + gate table) · `SUPPORT-POLICY.md` · `INCIDENT-RESPONSE.md` · `DATA-GOVERNANCE.md` · `HIPAA-CONTROLS.md` · `SETUP-EMAIL.md` · `CONNECT-ANYWHERE.md` · Master Report §19 (ops runbook).

**Principle:** the pilot is a *supervised production rehearsal*. Real workflows, real users, minimal real PHI — until the regulatory check clears (§7.6 of the Evaluation Report).

---

## 1. Gate status snapshot (as of 2026-10-07)

| # | Gate | Status | Notes / next step |
|---|---|---|---|
| ① | TURN relay firewall | ✅ **Done** | Lightsail rules opened (UDP 3478, UDP 49160–49215, TCP 3478); coturn reachable; STUN + relay-candidate probe + relay-path E2E call verified. Re-run `%TEMP%\vel-turn-probe.py` **from the clinic network** during Week 1 (carrier-NAT paths differ per site) |
| ② | Code-signing certificate | ❌ **Open — external** | Vault `veltruvia-codesign.pfx` is self-signed; cannot clear SmartScreen. Buy OV/EV cert (~$250–450/yr), replace PFX, re-sign installers, regen `SHA256SUMS.txt` + updater ymls. **Not a pilot blocker** if staff install via the "unblock" instructions, but blocks wider distribution |
| ③ | Demo credential rotation | ✅ **Done** | Rotated creds live; originals rejected. Rotate again immediately after pilot account provisioning (§4) |
| ④ | Offsite backup | ✅ **Done + hardened** | Nightly `~/veltruvia/vm-backup.sh` rebuilt WAL-safe (`node:sqlite`) 2026-10-07 after the WAL-orphan corruption incident; tar manifest fixed; first scheduled run on the hardened script succeeded 2026-10-07 02:15 UTC. Offsite pull + 36 h staleness guard active |
| ⑤ | Spot audits | ⚠️ **Mostly done** | Accessibility: axe 0 violations (6 public pages + 16 logged-in doctor panels × 2 themes), keyboard + 400 %/200 % zoom verified — **manual NVDA pass still open**. Security: internal pen-test 17/17 — third-party pen test still to commission (not a pilot blocker) |
| ⑥ | Playwright smoke book | ❌ **Open** | Commit the scripted smoke book so each pilot morning starts with a 2-minute green/red signal |
| ⑦ | Real clinic users | ❌ **Open — this pack** | The pilot itself closes it |

---

## 2. Infrastructure readiness (operator checklist — complete before Week 1)

| ✅ | Check | Command / where | Pass criterion |
|---|---|---|---|
| ☐ | Server healthy | `curl -s https://veltruvia.duckdns.org/api/health` | `{"ok":true,...}` |
| ☐ | Deep health (DB ok) | `curl -s https://veltruvia.duckdns.org/api/health/deep` (auth) | db ok |
| ☐ | Disk headroom | `ssh … 'df -h /home/ubuntu'` | < 70 % used |
| ☐ | RAM headroom | `ssh … 'free -m; uptime'` | load ≲ 1.0 on the ~1 GB instance |
| ☐ | Nightly backup current | `ssh … 'ls -lt ~/veltruvia-backups/ \| head -3'` | newest tarball < 36 h old |
| ☐ | **Restore drill** | restore newest tarball to a scratch dir on the VM, boot on port 3001, login + read one patient | login 200, data readable; then delete scratch |
| ☐ | DB integrity | `node:sqlite` one-liner: `PRAGMA integrity_check` on a **copy** of `chemocure.db` | `ok` |
| ☐ | TLS cert valid | `curl -vI https://veltruvia.duckdns.org 2>&1 \| grep -E "expire\|subject"` | > 14 days validity |
| ☐ | TURN probe from clinic network | `%TEMP%\vel-turn-probe.py` **run at the clinic** | relay candidates present |
| ☐ | Rate-limit sanity | 30 rapid failed logins from one IP | 429s fire (authLimiter) |
| ☐ | Blockchain anchor live | `curl -s https://veltruvia.duckdns.org/api/blockchain/status` | entries incrementing |

**Standing ops rules (learned 2026-10-07):**
- **Never open the live `chemocure.db` with `@libsql/client` while the server runs** — it unlinks the live WAL/SHM and corrupts reads. Use `node:sqlite` (`DatabaseSync`) or stop the server first.
- Restart without sudo: `kill $(systemctl show -p MainPID --value veltruvia)` — systemd `Restart=always` revives in ~9 s.
- Weekly: `PRAGMA integrity_check` on a copied DB + verify newest backup tarball size is in family (~130 KB now).

---

## 3. Decisions to lock before provisioning

| Decision | Options | Default for pilot |
|---|---|---|
| Patient account creation | (a) admin provisions accounts manually; (b) set up SMTP/Resend for OTP self-registration (`SETUP-EMAIL.md`) | **(a)** — email is **not configured** on the VM today, and OTP self-registration is impossible without it. (b) is a stretch goal; if wanted, complete it in Week 0 and live-test OTP delivery |
| PHI scope | (a) synthetic/skeleton records only; (b) full real PHI | **(a) until the regulatory check clears** (Evaluation Report §7.6) — start with initals/limited demographics, widen in Week 3 after the review |
| Devices | clinic Android tablets/phones for Patient + Lab APKs; clinic PC for Doctor shell | confirm at site survey; APKs ≈ 5.3 MB, install via download portal |
| Network | clinic Wi-Fi vs hotspot for telehealth | test **both** in Week 1; carrier-NAT is the known variable (gate ① re-probe) |

---

## 4. Accounts & provisioning (Week 0)

1. Create per-person accounts in the admin portal — never share logins (audit trail depends on it):
   1 admin · 2–3 doctors · 1 lab tech · pilot patients (≤ 10).
2. Record who-has-what in `ACCESS-CONTROL.md` appendix (roles + start dates).
3. **Re-run `rotate-secrets.mjs` after** the pilot accounts exist, so no pre-pilot password is live.
4. Confirm each user's first login + password change; confirm the audit panel shows the events.
5. Verify the audit-trail → Sepolia anchor increments after pilot-mutation smoke actions.

---

## 5. Week-by-week plan (mirrors Evaluation Report §8.8)

| Week | Focus | Exit criteria |
|---|---|---|
| **0 — Prep** | §2 checklist green; accounts provisioned (§4); NVDA manual pass scheduled/completed; installers distributed + first-run verified on clinic PC; restore drill done | every §2 row ☑; NVDA findings triaged |
| **1 — Shadow mode** | admin + lab on production paths, clinicians observing; **TURN probe from clinic network**; both-networks telehealth dry-run with test accounts; daily backup verification | zero P1 defects; relay works on clinic network |
| **2 — Clinicians live** | doctors run records/e-Rx/scheduling with skeleton data; measure e-Rx + scheduling time vs §7.5 assumptions | ≥ 5 complete clinical workflows; no data-loss events |
| **3–4 — Patients onboard** | patient APK installs, symptom diaries, first telehealth visits (regulatory check cleared → widen PHI scope if approved) | ≥ 8 patient activations; ≥ 3 telehealth calls with call-quality feedback |
| **5–6 — Full use + review** | full clinical use, nightly backup verification, weekly integrity check; gather ticket log | pilot review meeting booked; §6 metrics collected |

---

## 6. Metrics to collect (pilot review input)

- Uptime: from `/api/health` polling + systemd `NRestarts`.
- Telehealth: calls attempted / connected / relayed / P2P; user quality score (1–5).
- Workflow: time-to-complete e-Rx, schedule-appointment, lab-result round-trip (Week 2–3 baseline vs paper).
- Support: tickets by severity (S-1…S-4 per `SUPPORT-POLICY.md`), response times.
- Accessibility: NVDA findings open/closed; any user-reported barriers.
- Data: backup success streak; integrity_check results; blockchain anchor lag.

**Adopt decision** after Week 6 review against Evaluation Report §8.6 scores; re-score quarterly.

---

## 7. Rollback / exit plan

- **Stop criteria (any one halts the pilot):** a S-1 incident unresolved > 4 h; suspected PHI exposure; > 2 data-loss events; clinician safety concern (e-Rx or dosing).
- **Exit steps:** export data (SQL backup tarball + FHIR/HL7 bundles), preserve audit trail, disable pilot accounts (keep for forensics), retain offsite backups 30 days, revert clinic to paper workflow, hold a retro feeding `RISK-REGISTER.md`.
- **Data destruction (if requested):** pilot-DB snapshot archived encrypted, then live DB reset to pre-pilot state from the Week-0 backup.

---

## 8. Day-1 support runbook (operator card)

| Situation | Action |
|---|---|
| 5xx / login failures | Check `systemctl status veltruvia`; restart via MainPID kill (no sudo); check `journalctl -u veltruvia` tail; verify `integrity_check` on a **copy** |
| "database disk image is malformed" | **Do not open the live DB with libsql.** Stop writes, `kill` MainPID (systemd revives), REINDEX on a copy; if needed follow the 2026-10-07 repair recipe (Evaluation Report §8.8 gate ④); restore from newest tarball if unrecoverable |
| Telehealth fails at clinic | Confirm gate-① rules still open (`vel-turn-probe.py` from clinic network); fall back to P2P-on-open-network / phone consult; file ticket |
| Backup staleness alert | Check `~/veltruvia-backups/` newest mtime; run `vm-backup.sh` manually; check tar exit + WAL intact |
| Patient can't register | Expected if email not configured — admin-provision the account (§3 decision) |
| Anything else | `INCIDENT-RESPONSE.md` severity matrix; S-1 = page the maintainer immediately |

---

## 9. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Executive sponsor (clinic) | | | |
| Clinic administrator | | | |
| IT/security lead | | | |
| VELTRUVIA ops (maintainer) | | | |

*Pilot starts only when §2 is fully ☑ and §3 decisions are locked. This pack is versioned with the suite; update the gate table as items close.*
