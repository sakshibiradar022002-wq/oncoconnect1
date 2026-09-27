# DEPLOY-GCP.md — VELTRUVIA on Google Cloud Free Tier

> ⚠️ **SUPERSEDED (2026-09-27):** production now runs on AWS Lightsail Mumbai.
> See **DEPLOY-AWS.md** — this document is kept for reference only.

Goal: 24/7 hosting on a **free-forever e2-micro VM**, $0/month, fixed URL via
Cloudflare named tunnel (no public IP → no IPv4 charge).

---

## ⏸ PAUSED STATE (resume from here — no re-doing work)
- gcloud CLI installed + authenticated as sakshibiradar022002@gmail.com
- Project in use: `noted-lead-491914-m3` (picked as gcloud default)
- Billing account `010B06-E253EF-18A73E` EXISTS but `open: false`
  (card verification never completed — user requested Google's student
  form instead, to avoid card verification entirely)
- Project↔billing link already created (billingEnabled: false until open)
- gcloud binary: `C:\Users\Sara\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`
- RESUME = when billing shows `open: true` → `services enable compute.googleapis.com`
  → create VM (Part B step 2) → continue down this file.

---

## PART A — You (one-time setup, ~10 min, browser + one installer)

1. Open **console.cloud.google.com** → sign in with any email you like
   (does NOT need to be veltruvia@gmail.com).
2. Accept terms; pick your country.
3. When prompted, **set up billing**: add a credit/debit card.
   - ~$1 pre-auth to verify (refunded automatically).
   - You also get **$300 trial credit / 90 days** automatically. Always Free
     tier usage never draws from it.
4. Stop on the dashboard. **Do not create a VM by hand** — the exact free-tier
   shape (region, disk type, no external IP) matters and is done by commands.
5. Install the **Google Cloud CLI** (so I can drive everything from your
   terminal): https://cloud.google.com/sdk/docs/install → Windows installer →
   default options throughout.
6. Open a NEW terminal and run:  `gcloud auth login`
   → browser opens → choose the same account → **Allow**.
7. Tell me: **"GCP verified"** — I take over from here.

## PART B — Me (all of this, you don't touch)

1. `gcloud projects create veltruvia-prod` + link billing + enable compute API.
2. Create the VM — exactly the free shape:
   - `e2-micro`, zone `us-central1-a` (always-free region)
   - 30 GB **standard** persistent disk (not SSD)
   - Ubuntu 24.04 LTS, **no external IP**
   - Access via `gcloud compute ssh --tunnel-through-iap` (free, no NAT)
3. Server setup over IAP SSH: Node 22, swap file (2 GB — RAM guard),
   firewall = IAP only, VELTRUVIA from GitHub repo, fresh production secrets
   in its own `.env` (never copied from Desktop), GMAIL_* keys carried over.
4. Data migration (safety order — patient data is untouchable):
   stop local server → run backup tool → upload encrypted backup via
   `gcloud scp` → restore on VM → verify **118/118 PHI blobs decrypt** on the
   VM → only then update clients/QR pairing.
5. `cloudflared` named tunnel on the VM → fixed public URL + real TLS.
   (Domain: GitHub Student Pack Namecheap domain / eu.org / ~$2yr domain —
   your choice when we get there.)
6. End-to-end verify from OUTSIDE the LAN: health, login, email OTP,
   HL7 :2575, telehealth WS, attachments. Then decommission the quick tunnel.

## Free-tier guardrails (why the bill stays $0)

| Edge | Rule we follow |
|---|---|
| e2-micro | 1 vCPU / 1 GB RAM — free **only** in us-west1, us-central1, us-east1 |
| Disk | 30 GB **standard** PD (not SSD, not balanced) |
| Network | 1 GB/mo egress free; ~$0.12/GB after → budget alert at $1 |
| IPv4 | **No external IP at all** — IAP for SSH, cloudflared (outbound) for public access |
| Snapshots | not free — skip; VELTRUVIA has its own 3-tier backup system |

## Rollback plan
Local server stays installed and intact on this PC. If the VM ever breaks,
stop clients → relaunch local → restore latest local backup → you're back in
minutes. The cloud is an upgrade, not a dependency, until you say otherwise.
