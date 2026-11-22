# VELTRUVIA — Neuro-Oncology EMR Desktop Suite

Four self-contained desktop apps sharing one encrypted backend:

| App | Entry | Purpose |
|---|---|---|
| **VELTRUVIA Server** | `electron/main-server.js` | Headless backend + status window; binds `127.0.0.1:3000` |
| **VELTRUVIA Doctor** | `electron/main-doctor.js` | EMR & patient management (auto-connects to Server, falls back to local DB) |
| **VELTRUVIA Patient** | `electron/main-patient.js` | Patient symptom tracker & care portal |
| **VELTRUVIA Lab** | `electron/main-lab.js` | Lab portal with HL7 intake |

## Daily workflow

```bash
npm run check      # fast quality gate: syntax, await-audit, bundle drift, icons
npm run verify     # full 53-check feature verification × 4 apps (~2 min)
npm run sync-bundles   # propagate edits from the Server bundle to the 3 clients
node scripts/feature-sweep.mjs   # live-surface probe: every GET × every role (needs a running server)
```

**The `VELTRUVIA Server` bundle is the canonical source.** Edit code there, then run
`npm run sync-bundles` — never edit the client bundles directly. `npm run check`
fails if bundles drift or a new un-awaited `db.prepare(...)` sneaks in.

## First run (fresh install)

By default **no accounts exist** and no known credentials are seeded. Register the
first admin through the Doctor app (or `POST /api/auth/register`).

For demos/trials, set `VELTRUVIA_DEMO=true` (see `VELTRUVIA Server/start-test.bat`).
This seeds the classic demo accounts — doctor `test@example.com`, patient MRN
`12345`, lab `testlab` — with hashed passwords only. The demo admin's password is
generated randomly on first run, printed once to the console, and saved to
`.demo-admin-password` next to the database (git-ignored).

## Sample imaging data

The imaging gallery can be filled in bulk instead of one upload at a time:

```bash
npm run imaging:seed -- --help                                    # every option
npm run imaging:seed -- --mrn 12345 --demo 24                     # openly-licensed demo studies
npm run imaging:seed -- --mrn <MRN> --dir ~/datasets/nih/images   # a whole local dataset
```

- `--dir` walks a folder recursively and uploads every PNG / JPEG / GIF / WebP /
  BMP / DICOM file under 10 MB — point it at a Kaggle export, an NIH
  ChestX-ray14 `images/` folder, a TCIA download or a USB drive.
- `--demo` pulls radiology studies from Wikimedia Commons, keeps only public
  domain / CC0 / CC BY / CC BY-SA files, and stores the author, licence and
  source page in the image note. `--manifest <file>` writes the same
  attribution to JSON for compliance records.
- Uploads use the normal authenticated API, so PHI encryption, SHA-256
  verification and the audit trail all apply. Re-running skips images already
  in the gallery (same filename + size); `--duplicates` disables that.
- Never import public/demo studies into a chart that holds real patient images.
- A few hundred images per patient is comfortable. The gallery decrypts every
  image record on each request, so import thousands only after that query is
  indexed by MRN.

## Configuration

All secrets come from the shared `.env` at the install root (never committed):

- `JWT_SECRET`, `PHI_ENCRYPTION_KEY` — required in production; dev auto-generates
- `HOST` — defaults to `127.0.0.1` (data stays local); set `0.0.0.0` only to deliberately share on a LAN
- `TLS_KEY` / `TLS_CERT` — enables HTTPS (required for real PHI in production)
- `VELTRUVIA_DEMO` — seeds demo accounts (`true` only for trials)
- `DB_PATH`, `PORT`, `BACKUP_INTERVAL_MS`, `MLLP_ENABLED` — operational

## Shared data locations

- Database: `<install root>/data/veltruvia.db` (SQLite, WAL mode, auto-backups)
- Shared audit chain: `<install root>/data/chain.json` — one tamper-evident chain all four apps append to
- Server discovery: `<install root>/config/server-config.json`

## CI

`.github/workflows/tests.yml` runs on Node 20 **and** 22: the repo gate
(`node check.mjs`), the bundle API suite, and the root suite (hardening,
imaging, anomaly scan, offsite backup, heartbeat). Run `npm run precommit`
locally before committing.

## Resilience

The database is protected against the corruption class observed in the wild
(a process killed mid-snapshot used to zero the file):

- **Atomic snapshots** — the sql.js writer exports → validates → writes a
  temp file → renames it over the DB. The on-disk file is always a complete
  database, never a torn write.
- **Boot-time integrity check** — if the DB file lacks the SQLite header at
  startup, it is quarantined (`*.corrupt-<timestamp>`, never deleted) and the
  newest valid backup from `data/backups/` is restored automatically.
- **Boot restore point** — every healthy boot snapshots the DB to
  `data/backups/` (newest 30 kept) so a fresh backup always exists.
- **Boot watchdog** — the Server exe retries a failed API load and, if a
  corrupt database was the cause, self-heals before surfacing a visible error.

## Known limitations

- Exes are not code-signed; Windows SmartScreen will warn on first launch
- HL7 MLLP TCP listener binds broadly when enabled — restrict with a firewall in production
