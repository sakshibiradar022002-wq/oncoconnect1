# 🏢 MULTI-CLINIC PLAYBOOK — VELTRUVIA

**When you land your second clinic, this is the exact order of operations.**
Written 2026-09-27 so future-you doesn't improvise.

---

## The decision to make first (before installing anything)

**Option A — One server, many clinics (shared instance)**
- Cheapest: one $7 VM serves N clinics
- Data is already partitioned per-doctor/per-store, but **admin accounts are shared**
- Right for: pilot phase, clinics under one operator/brand

**Option B — One VM per clinic (isolated instances)** ← recommended for real hospitals
- Full data isolation (strongest HIPAA story per clinic)
- Cost: $7/mo per clinic + one static IP each (~free while attached)
- Right for: separate legal entities, hospitals that demand their own environment

> VELTRUVIA's data model (per-doctor stores + per-clinic DB file) supports both.
> Only choose A while clinics share your trust domain; the moment a clinic has
> its own patients & admin, give it its own VM.

## Per-clinic install checklist (~45 min, mostly copy-paste)

1. Lightsail: create instance (`veltruvia-<clinicname>`), Ubuntu 24.04, $7 plan
2. Static IP → attach; SSH key → `~/.ssh/<clinic>.pem`
3. Firewall: HTTP 80 + HTTPS 443 (same as veltruvia-prod)
4. Run the same setup scripts from `.freebuff/` (vm-setup-node24, service install,
   caddy, backup, timer) — they are parameterized by nothing but the domain
5. DNS: a free DuckDNS name (e.g. `<clinicname>.duckdns.org`) or a subdomain of
   your own domain — point at the new static IP
6. Caddyfile: `<clinic-domain> → 127.0.0.1:3000` (one stanza, Caddy fetches its
   own certificate automatically)
7. `.env`: fresh PHI_ENCRYPTION_KEY + JWT_SECRET (rotate-secrets.mjs generates
   both), fresh admin password, same SENTRY_DSN (Sentry separates by environment:
   set `SENTRY_ENV=<clinicname>` to tag events)
8. Backup timer on; add the new VM to the offsite-pull script (one extra scp line)
9. `verify-phi` on a test record; smoke-test checklist; phone ⚙ → done
10. Optionally: a second anchor wallet if you want per-clinic on-chain anchors
    (or reuse the same one — the contract is multi-tenant by design)

## What scales for free vs what eventually costs

| Resource | Free until | Then |
|---|---|---|
| DuckDNS names | ~5 domains/account | extra accounts, or a real domain |
| Sentry errors | 5k/mo **total** | split by SENTRY_ENV, still one account |
| Caddy certs | unlimited | — |
| Backups (PC disk) | ~1 GB/clinic/year | an external drive when >5 clinics |
| Sepolia fuel | 0.27 ETH ≈ years | tiny top-ups per wallet |
| UptimeRobot | 50 monitors | — |
| VM | $7/clinic/mo | — (this is the only real per-clinic cost) |

## Governance (before signing clinic #2)

- Sign your own BAA/MSA per clinic (INCIDENT-RESPONSE.md §3 lists your duties)
- Each clinic admin gets their own credentials file procedure (never share yours)
- Keep one deploy/ops runbook per VM (this file + DEPLOY-AWS.md per instance)
- Consider a company email (Google Workspace ~$6/mo) once you're "a company"

## The 30-second version

> New clinic = new $7 VM + new DuckDNS name + run the same 6 scripts + fresh
> secrets + add one scp line to the offsite pull. One afternoon, all free
> except the $7.
