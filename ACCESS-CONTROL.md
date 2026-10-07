# VELTRUVIA Access Control Policy

**Version 1.0 · Effective 2026-10-05 · Applies to:** VELTRUVIA 2.5.0+
**Basis:** verified against `src/middleware/auth.js`, `src/routes/auth.js` and
the route-level access tests in `tests/server.api.test.mjs` (63/63 green,
2026-10-05). Capabilities that do not exist yet are marked **TODO**, not
described as if live.

---

## 1. Roles

| Role | Granted to | Created how | Typical reach |
|------|-----------|-------------|---------------|
| `admin` | Instance operator / clinic IT | First demo account or promoted by another admin | User management (approve/deactivate), full API, metrics |
| `doctor` | Clinicians | Self-registration → **inactive until an admin approves** when `REQUIRE_DOCTOR_APPROVAL=true` | CDS (interactions/allergy/dosage), notes, prescriptions, scheduling, FHIR/HL7 |
| `specialist` | Consulting clinicians | Admin-granted | Reduced doctor surface (see route `requireRole` lists) |
| `lab` | Partner laboratories | Admin-granted | Result submission routes only |
| `patient` / `kv-patient` | Patients | MRN-based portal enrollment; session subject is `<docId>::<mrn>` | Own record read, consent, appointments — **never** CDS or admin routes |
| `kv-lab` | Lab portal sessions | Lab login | Own results only, scoped by labId |

Role is carried in the signed session payload and re-checked **on every
request** by `requireRole(...)`; UI hiding is never the control.

## 2. Authentication

| Control | Status | Detail |
|---|---|---|
| Password hashing | Live | PBKDF2-SHA512, 210 000 iterations, per-user 16-byte salt (`crypto.js`) |
| Patient/lab portal passwords | Live | PBKDF2v2 + upgrade-on-login migration; plaintext never stored |
| Session | Live | httpOnly signed cookie, server-side revocable, logout invalidates (tested) |
| Brute-force throttle | Live | Persistent `login_attempts` lockout (per-identifier counter + `locked_until`) on doctor/admin login; `authLimiter` on `/api/auth`; `loginLimiter` on patient/lab login; `apiLimiter` 300 req/min API-wide |
| Admin approval gate | Live (opt-in) | `REQUIRE_DOCTOR_APPROVAL=true` → new accounts `active=0` until approved; login then returns 403 "pending admin approval" (tested) |
| TOTP 2FA | Code-complete | Optional per account; **TODO: mandate for all privileged roles** (90-day roadmap #1) |
| CSRF | Live | Cross-origin `Origin` on writes → 403 (tested) |
| SSO / SCIM / passkeys | **TODO** | Not implemented |

## 3. Authorization rules

1. **Deny by default** — routes without a public marker require `authenticate`.
2. **Least privilege per route** — clinical routes require `doctor` or `admin`
   explicitly (e.g. `/api/cds/*`); patient sessions get **403** on them
   (tested: allergy-check and dosage-check reject `kv-patient`).
3. **Row scope** — patient sessions are bound to their own MRN in the session
   subject; lab sessions to their labId.
4. **Admin self-protection** — an admin cannot deactivate their own account
   (tested → 400).
5. **No privilege escalation** — non-admin sessions hitting admin user
   management get 403 (tested); registration always creates `doctor`, never
   `admin`.
6. **PHI minimization in listings** — `/api/admin/users` never returns
   `password_hash` (tested).

## 4. Audit & accountability

- Every login (success/failure), logout, TOTP change, admin user action,
  allergy write (`cds.allergy_add`), and patient portal login writes to the
  `audit_log` table (actor, role, action, target, IP, timestamp).
- Audit events are hash-chained and anchored to Sepolia for tamper evidence
  (hashes only — no PHI on chain).
- **TODO:** automated anomaly alerting on the audit stream (risk S6).

## 5. Session lifecycle

| Event | Effect |
|---|---|
| Logout | Session revoked server-side; cookie cleared (tested) |
| Deactivate account | Login blocked immediately with pending-approval message (tested); live sessions rejected at `authenticate` |
| Password change | Session rotation (TODO: force re-login on all devices — open) |
| Idle expiry | Sliding refresh past ⅔ of lifetime renews the session (`SESSION_TTL_MIN`, default 43 200 min = 30 d). **Note:** an *active* user is never logged out automatically. **TODO:** absolute hard cap on session age for privileged roles |

## 6. Review & offboarding

- Access lists reviewed at staff join/leave; admin deactivates (does not
  delete) to preserve audit continuity.
- Operator offboarding: transfer `admin` to another approved account **before**
  deactivating the last admin (self-deactivation is blocked, so a second admin
  always exists in practice).
- Quarterly: re-run `npm test` (route-level access suite) as evidence of
  control effectiveness.

## 7. Honest gaps (not yet implemented)

- MFA not yet mandatory for privileged roles.
- No IP allow-listing / device binding.
- No automated access-recertification workflow.
- No separate break-glass account procedure.

---

*Owner: VELTRUVIA operations · Related: `HIPAA-CONTROLS.md`, `RISK-REGISTER.md`,
`SECURITY.md`, `DATA-GOVERNANCE.md`*
