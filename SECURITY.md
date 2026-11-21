# Security Policy & Hardening Notes

## What protects patient data

- **PHI at rest**: field-level AES-256-GCM encryption (`PHI_ENCRYPTION_KEY`). Keys
  derive via SHA-256 from any sufficiently long secret; 64-hex-char keys are used verbatim.
- **Passwords**: PBKDF2-SHA512, 210,000 iterations (doctors); PBKDF2v2-SHA256 for
  patient/lab UI accounts. Plaintext passwords are **never stored or accepted** —
  legacy plaintext rows are rejected until re-saved (which re-hashes).
- **Sessions**: server-side, revocable, with idle timeouts; login rate-limiting and
  DB-backed brute-force lockout (8 attempts / 15 min).
- **Network**: server binds `127.0.0.1` by default. Exposure to a LAN requires an
  explicit `HOST=0.0.0.0`; real PHI over a network requires TLS (`TLS_KEY`/`TLS_CERT`).
- **Audit trail**: every write is recorded to the audit log and mirrored onto a
  shared hash-linked chain (`data/chain.json`) that all four apps append to;
  `GET /api/blockchain/verify` (or the app's blockchain page) validates the chain.
- **Guards**: CSRF origin checks, SQL-injection pattern scanning, path-traversal
  guard, Helmet security headers, request timeouts, role-based access control.

## Hardening applied (September 2026)

1. **Demo seeding is off by default.** A fresh install starts with zero known
   credentials; the first admin registers normally. `VELTRUVIA_DEMO=true` opts in.
2. **No hardcoded passwords.** The demo admin password is generated randomly on
   first demo run, printed once, and stored only in the git-ignored
   `.demo-admin-password` file.
3. **No plaintext password fields.** `passPlain`-style acceptance was removed from
   all login paths; the shared JSON store never receives plaintext credentials.
4. **Local-only by default.** `server.listen(port, '127.0.0.1')` unless overridden.

## Reporting a vulnerability

This is a local-first desktop application. If you find a security issue, please
open a private security advisory rather than a public issue.

## Production deployment requirements (HIPAA)

- TLS mandatory (`TLS_KEY` + `TLS_CERT`), `NODE_ENV=production` (enforces secret presence)
- Unique, rotated `PHI_ENCRYPTION_KEY` per installation; back it up securely —
  losing it makes encrypted PHI unreadable
- `VELTRUVIA_DEMO` unset; remove `data/patient-store.json` demo entries if present
- Automated backups are on by default (every 6 h, last 30 kept); `BACKUP_INTERVAL_MS` only
  tunes the cadence (`0` disables it). Secure the `backups/` directory
- Signed executables; OS-level disk encryption (BitLocker) on host machines
