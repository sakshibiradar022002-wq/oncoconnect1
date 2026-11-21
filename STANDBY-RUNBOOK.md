# VELTRUVIA — Standby & Restore Runbook

**Status:** ready to use · **Owner:** ops lead · **Last updated:** 2026-11-21
**Related:** [RISK-REGISTER.md](RISK-REGISTER.md) O1/O3 · [SUPPORT-POLICY.md](SUPPORT-POLICY.md) · [DEPLOY-AWS.md](DEPLOY-AWS.md)

Current production is a single Lightsail instance (`veltruvia-prod`) with
nightly database backups. This runbook adds the missing layer — **daily
whole-machine snapshots** — and the exact restore path. It does not replace the
application backups or the offsite copy; it shortens recovery from
"reinstall + restore DB" (4–8 h) to "launch from snapshot" (~1 h).

| Metric | Before | With snapshots |
|---|---|---|
| RPO | ≤ 24 h (nightly dump) | ≤ 24 h (snapshot) + 6 h DB backup |
| RTO | 4–8 h (build a VM) | ~1 h (launch from snapshot) |
| Restore granularity | database only | whole machine (OS, Caddy, `.env`, app) |

---

## 1. Enable automatic snapshots (one time)

Snapshots are daily, kept 7 days, billed at ~$0.05/GB-month (a small instance
is typically a few dollars per month). Time is **UTC**, on the hour.

**Console:** Lightsail → Instances → `veltruvia-prod` → **Snapshots** tab →
enable **Automatic snapshots** → set **03:00 UTC** → confirm.

**CLI** (replace `us-east-1` with the instance's actual region):

```bash
aws lightsail enable-add-on --region us-east-1 \
  --resource-name veltruvia-prod \
  --add-on-request 'addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=03:00}'
```

Verify:

```bash
aws lightsail get-instance --region us-east-1 --instance-name veltruvia-prod \
  --query 'instance.addOns'
aws lightsail get-auto-snapshots --region us-east-1 --resource-name veltruvia-prod
```

03:00 UTC is deliberately after the 02:15 UTC database backup, so the snapshot
contains a fresh dump. **Automatic snapshots disappear when the instance is
deleted** — keep a monthly manual copy (step 3).

## 2. Snapshot before risky operations

Take a named manual snapshot before a deploy, migration, or secret rotation:

```bash
aws lightsail create-instance-snapshot --region us-east-1 \
  --instance-name veltruvia-prod \
  --instance-snapshot-name pre-deploy-$(date -u +%Y%m%d-%H%M)
```

Wait for `state: available`:

```bash
aws lightsail get-instance-snapshots --region us-east-1 \
  --query 'instanceSnapshots[].[name,state,createdAt]' --output table
```

## 3. Keep a monthly snapshot past the 7-day window

```bash
# pick a date from get-auto-snapshots, then copy it to a manual snapshot
aws lightsail copy-snapshot --region us-east-1 --source-region us-east-1 \
  --source-resource-name veltruvia-prod --restore-date 2026-11-21 \
  --target-snapshot-name veltruvia-monthly-2026-11
```

Manual snapshots persist until you delete them; prune anything older than 6 months.

---

## 4. Restore drill (do this once per quarter)

Lightsail cannot roll an instance back in place — you launch a **new** instance
from the snapshot and cut over. Practise on a throwaway name so production is
never touched.

```bash
# 1. Launch a recovery instance from the snapshot
aws lightsail create-instances-from-snapshot --region us-east-1 \
  --instance-snapshot-name pre-deploy-2026-11-21-0900 \
  --instance-name veltruvia-drill --availability-zone us-east-1a \
  --bundle-id small_3_0 --key-pair-name <your-key-pair>

# 2. Watch until running, then get its IP
aws lightsail get-instance --region us-east-1 --instance-name veltruvia-drill \
  --query 'instance.[state.name,publicIpAddress]' --output text
```

On the recovery instance:

```bash
systemctl is-active veltruvia caddy
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/health?deep=1
sudo tail -n 20 /var/log/caddy/*.log 2>/dev/null
```

Then confirm the app serves through Caddy on the drill IP (HTTPS certificate
will not match until DNS points there — use `curl -k` for the drill only):

```bash
curl -k -fsS https://<drill-ip>/health
```

Check a login page loads and the admin account from the credentials file signs
in. Then delete the drill instance and its snapshots to stop billing:

```bash
aws lightsail delete-instance --region us-east-1 --instance-name veltruvia-drill
```

Record the drill date and elapsed time in the table at the bottom.

## 5. Real recovery / cutover

1. **Declare** the incident and note the recovery point (snapshot date).
2. **Stop** the old instance only if it is unhealthy; a running instance keeps
   the static IP attached. Snapshot restore does not require stopping it.
3. **Launch** the replacement from the newest good snapshot (step 4, commands 1–2).
4. **Attach the static IP**: Lightsail → Networking → the static IP →
   detach from the old instance, attach to the new one. (A static IP can serve
   only one instance at a time.)
5. **DNS**: if using the static IP, DuckDNS needs no change. If the IP changed,
   update the DuckDNS A record and wait for TTL.
6. **Verify**: `/health`, `/health?deep=1`, HTTPS certificate, admin login,
   latest patient record present, background backup timer running
   (`systemctl list-timers | grep -i backup`).
7. **Re-enable automatic snapshots** on the new instance (step 1) — the add-on
   may not carry over from a snapshot.
8. **Post-incident**: confirm the 6-hourly backup and the weekly restore drill
   cron are active, and write the timeline in the incident log.

> Treat the instance snapshot as **crash-consistent**, not application-quiesced.
> SQLite WAL recovers on start, but the 02:15 `VACUUM INTO` dump inside the
> snapshot is the authoritative database copy. If the snapshot restore looks
> inconsistent, restore the newest `backups/*.db` with
> `scripts/restore-backup.mjs` on the recovered machine.

---

## 6. Beyond snapshots

Snapshots protect against machine loss, not against a bad deploy that also
corrupts the snapshot or a region-wide outage.

| Option | Status | Benefit |
|---|---|---|
| Second offsite copy (any path or rclone remote: B2/R2/S3) | **Ready** — `npm run backup:offsite` | Survives account/region loss |
| External uptime dead-man's switch | **Ready** — `npm run uptime:ping` | Alerts when the VM itself dies |
| Cold standby instance (stopped, monthly snapshot refresh) | Not built | Cutover measured in minutes |
| Warm standby with streaming replication | Not built | Near-zero RPO; needs a real DB migration |

**Second offsite copy.** One-time setup on the backup host:

```bash
openssl rand -hex 32 > ~/.secrets/offsite.key && chmod 600 ~/.secrets/offsite.key
rclone config            # create a remote once (b2/r2/s3), then:
node scripts/offsite-backup.mjs --source /home/ubuntu/veltruvia/app/backups \
  --key-file ~/.secrets/offsite.key --rclone b2:veltruvia-offsite/db --keep 12
```

Each run encrypts the newest `*.db` with AES-256-GCM, writes a SHA-256
manifest, decrypts the result in memory to prove it round-trips, uploads both,
and prunes old timestamped archives. `--dest <dir>` targets a USB/NFS/other
host instead of rclone; `--dry-run` shows what it would do. Restore one archive
with `--decrypt <archive>.enc --out <dir> --key-file <key>`.

Trigger for a cold standby: first paid clinic, or > 1,000 patient records.

---

## 7. Drill log

| Date | Snapshot used | Launch → healthy | Verified by | Notes |
|---|---|---|---|---|
| _pending_ | | | | |
