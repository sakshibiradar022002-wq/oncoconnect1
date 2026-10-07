# VELTRUVIA Support Policy

**Version 1.0 · Effective October 5, 2026 · Applies to:** VELTRUVIA 2.5.0 and later
**Status:** Internal / may be shared with pilot clinics verbatim

> **Honesty statement.** VELTRUVIA is maintained by a single operator. This policy
> defines commitments that are **explicit, modest, and achievable** by that team.
> It is better to promise little and deliver it than to promise enterprise SLAs we
> cannot staff. Clinic agreements should reference this document by version.

---

## 1. Support channels

| Channel | Address | Use for |
|---|---|---|
| **Issue tracker (primary)** | GitHub issues on `sakshibiradar022002-wq/oncoconnect1` | Bugs, feature requests, security reports (private advisories preferred for security) |
| **Deployment runbook** | `DEPLOY.md`, `DEPLOY-AWS.md`, `README.md` | Self-service operational answers |
| **Escalation contact** | The project contact named in the clinic's deployment record | Severity-1 incidents only |

There is no phone line or live chat. This is stated up front so no clinic discovers it during an outage.

## 2. Severity definitions

| Severity | Definition | Examples |
|---|---|---|
| **S1 — Critical** | Clinical care is blocked, or PHI may be exposed | Server down, login failure for all users, suspected breach, data corruption |
| **S2 — High** | Major workflow broken; viable workaround exists | Telehealth fails for all users, prescribing flow errors, backup failures |
| **S3 — Medium** | Partial degradation or incorrect behavior | Report layout errors, slow screens, non-critical sync failures |
| **S4 — Low** | Cosmetic or enhancement | UI polish, wording, nice-to-have features |

## 3. Response targets (business hours)

Business hours: **Monday–Friday, 10:00–18:00 IST**, excluding Indian public holidays.

| Severity | Acknowledge | Status update cadence | Target resolution* |
|---|---|---|---|
| S1 | **4 business hours** | Every 24 h | Best effort — 3 business days |
| S2 | 1 business day | Every 72 h | 10 business days |
| S3 | 2 business days | Weekly | Next release |
| S4 | 3 business days | On release | Backlog |

\* Targets are commitments to **communicate and work**, not guarantees of fix dates —
a single-maintainer product cannot honestly guarantee resolution times. Outages on
the hosted demo instance are handled at S1 during business hours; after-hours
response is best-effort.

## 4. Maintenance windows & incidents

- **Planned maintenance:** announced ≥48 h ahead via the deployment record; preferred window **Tuesdays 11:00–13:00 IST**.
- **Emergency maintenance:** may proceed without notice for security or data-integrity issues; a post-incident note follows within 2 business days.
- **Incident communication:** severity is announced in the issue tracker; a short post-incident review (impact, cause, corrective action) is written for every S1/S2.
- **Status visibility:** the service health endpoint (`/api/health`) and the nightly-backup log are the canonical liveness signals; a public status page is roadmap work (see `VELTRUVIA-ROADMAP-VALIDATION.md`, C39/C40).

## 5. Upgrade, rollback & release procedure

- **Desktop apps:** per-role auto-update channels (`latest-doctor/server/lab/patient`) check every 6 hours; updates are silent and checksum-verified against published ymls.
- **APKs:** same signing certificate across releases → in-place upgrade; distributed via the download portal.
- **Server:** deploy by source push to the pinned `main` commit; every release tag is reproducible from the repo.
- **Rollback:** previous release assets remain published on GitHub (releases are never deleted); rollback = reinstall previous version / redeploy previous tag. Nightly backups provide the data-level rollback (RPO ≤24 h — see §6).
- **Release notes:** every release ships `RELEASE-NOTES-<version>.txt`; changes affecting clinical workflow are called out explicitly.
- **Pre-release gates:** `npm run precommit` (drift check + test suite + 69-check feature sweep × 4 apps) must pass before any release is published.

## 6. Backup & data recovery commitments

- **Nightly encrypted backups** on the server (systemd timer, 02:15 UTC) with **daily offsite pull** to a second machine (30-copy retention).
- **Restore drill:** performed and documented 2026-09-27 (tarball → verify-phi 11/11 → live boot); scheduled quarterly.
- **RPO:** ≤ 24 hours (nightly). **RTO:** target 4–8 hours for a single-node restore.
- Data export on demand: SQL backups, CSV, FHIR/HL7 — no proprietary lock-in.

## 7. What is explicitly NOT offered

- 24×7 support, phone/chat support, or guaranteed response outside business hours.
- Contractual uptime SLA for the hosted demo instance (no HA yet — single node).
- Managed on-premise installations by the vendor (documentation-assisted self-deployment only).
- Custom development commitments without a separate written agreement.

## 8. Policy review

Reviewed at every major release, or quarterly — whichever comes first. Version
bump required for any change to response targets. History of changes lives in
this file.

---

*Owner: VELTRUVIA operations · Related: `INCIDENT-RESPONSE.md`, `SECURITY.md`, `DEPLOY.md`, `VELTRUVIA-ROADMAP-VALIDATION.md` (C57/C58/C77)*
