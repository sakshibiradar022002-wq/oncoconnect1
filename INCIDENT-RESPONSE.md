# INCIDENT RESPONSE — VELTRUVIA (one page)

**If you suspect patient data was exposed, altered, or lost — start here.**
Print this page. Do not investigate alone; follow the steps in order.

---

## 1 · What counts as an incident?

- A laptop/phone with patient data or VELTRUVIA access is **lost or stolen**
- You see logins, records, or files you don't recognize
- A stranger learns your admin password, or someone used your AWS/Google account
- The website shows someone else's patients, or data is missing/garbled
- Ransomware, a virus, or a "your files are locked" message
- Any **email from AWS/Sentry/Google about a login you didn't do**

Not sure? Treat it as an incident. Overreacting costs minutes; underreacting costs the clinic.

## 2 · First hour (in this order)

1. **Disconnect**: unplug the affected PC's network cable / turn off its Wi-Fi. For the cloud server: tell your tech to stop the service (`systemctl stop veltruvia`) — downtime is acceptable during a suspected breach.
2. **Change passwords from a DIFFERENT device**: Gmail (`veltruvia@gmail.com`) first, then AWS. If your PC may be infected, change passwords from your phone only.
3. **Do NOT delete anything.** Logs, files, the DB, even the suspicious email — they are evidence.
4. **Write down**: date/time noticed, what you saw, which device, who used it last. A paper notebook is fine.
5. **Call your technical contact** (IT/the person who set up VELTRUVIA) before restoring or reinstalling anything.

## 3 · Notify (legal duties — deadlines are strict)

| Who | When | How |
|---|---|---|
| **Affected patients** | Without unreasonable delay, **≤ 60 days** (US HIPAA §164.404); sooner is better | Letter/phone; what happened, what data, what we did, what they should do |
| **US HHS** (if any US patients) | ≤ 60 days | hhs.gov → "Report a breach" (form for under-500-individuals) |
| **India DPDP Board** (India patients) | "Without delay" once confirmed | dpb.gov.in portal; state facts, remedy steps |
| **AWS** | Same day | Support Center → security incident (they assist + check their side) |
| **Your cyber-insurer / lawyer** | Day 1 | Policy hotline — they often run the notification process |

If **fewer than 500 people** are affected: HHS accepts the annual-report route. Keep records either way — HIPAA requires retaining breach documentation **6 years**.

## 4 · Contain & recover (with technical help)

- Rotate secrets: admin password (VM: `~/veltruvia-admin-credentials.txt` procedure), JWT_SECRET and PHI_ENCRYPTION_KEY only with technical guidance — rotating the PHI key **without re-encryption makes old records unreadable**, never do it ad hoc.
- Restore data: pull the latest `veltruvia-backup-*.tar.gz` (PC Desktop → `veltruvia-offsite-backups`), verify with `verify-phi`, then restore (drill-tested 2026-09-27).
- Check the tamper-evidence chain: compare `chain-tip.log` on your PC against the server's current tip (`chain.json`). **A mismatch = records were altered — tell your lawyer.**
- Review `~/veltruvia-offsite-backups/watchdog.log` + Sentry dashboard for when it started.

## 5 · After the incident

- Write a short report: what happened, when, affected patients, actions taken, what changed. Keep 6 years.
- Fix the hole (password policy, device encryption, 2FA everywhere).
- Brief staff; update this page if the plan failed anywhere.

## 6 · Key facts about the system (for the lawyer/insurer)

- Hosting: AWS Lightsail **Mumbai** (data residency: India; **BAA active since 2026-09-27**)
- Patient data: AES-256-GCM encrypted at rest; TLS 1.2+ in transit; audit trail + hash chain on every access
- Backups: nightly, encrypted-environment `.env` included, **offsite copy on the clinic PC daily**; restore verified
- Access: single admin; brute-force lockout (5 tries/15 min); no patient data in error reports (Sentry scrubbed)

*Last reviewed: 2026-09-27 · Next review: 2027-03-27 (every 6 months)*
