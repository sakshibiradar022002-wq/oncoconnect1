# Deploying the VELTRUVIA Server to the cloud

> ⚠️ **SUPERSEDED (2026-09-27):** production now runs on AWS Lightsail Mumbai.
> See **DEPLOY-AWS.md** — this document is kept for reference only.

Phones (Patient + Lab APKs) and the Doctor desktop app all talk to **one
always-on server**. This guide puts that server on a cloud VM with HTTPS.
~30 minutes, one VM, one domain.

## What you need

| Thing | Notes |
|---|---|
| VM | Any Linux box, 1 GB RAM is plenty (Hetzner CX22, DigitalOcean $6 droplet, EC2 t4g.nano…) |
| Domain | A subdomain like `emr.yourclinic.com` — DNS A record → VM IP |
| Docker | Installed on the VM (`curl -fsSL https://get.docker.com \| sh`) |

## Steps

### 1. Get the server code onto the VM

```bash
# Option A: git clone your repo, then:
cd VELTRUVIA\ Server/resources/app

# Option B: upload the folder (from your Windows machine, PowerShell):
scp -r "VELTRUVIA Server/resources/app" root@YOUR_VM_IP:/opt/veltruvia
ssh root@YOUR_VM_IP "cd /opt/veltruvia"
```

### 2. Configure secrets

```bash
cp .env.cloud.example .env
nano .env          # set JWT_SECRET + PHI_ENCRYPTION_KEY (openssl rand -hex 32 each)
                   # set VELTRUVIA_DOMAIN + ACME_EMAIL
```

### 3. Launch with HTTPS

```bash
docker compose up -d                      # build + start the API (loopback only)
docker compose --profile production up -d # add Caddy → HTTPS on 80/443
```

Caddy obtains and renews the Let's Encrypt certificate automatically.
Verify:

```bash
curl https://emr.yourclinic.com/health      # → {"ok":true,...}
```

### 4. Restore existing data (optional)

Copy your current database before the first start:

```bash
scp data/veltruvia.db root@YOUR_VM_IP:/opt/veltruvia/data/   # or any empty dir mounted at /app/data
```

Or mount a host dir instead of the named volume in `docker-compose.yml`.

### 5. Point the apps at the server

- **Doctor (Windows):** set the server URL once:
  ```powershell
  # config/server-config.json next to the VELTRUVIA Doctor folder (create the folder if needed)
  { "serverUrl": "https://emr.yourclinic.com" }
  ```
  or set env var `VELTRUVIA_SERVER_URL=https://emr.yourclinic.com` before launching.
- **Patient + Lab phones:** install the APK, open **Settings → Server address**,
  enter `https://emr.yourclinic.com`, save. Login pulls all data from the server.

## Operations

```bash
docker compose logs -f veltruvia     # live logs
docker compose restart veltruvia     # restart after config change
docker compose down                  # stop (data persists in the volume)
docker volume ls                     # veltruvia-data holds the SQLite DB
docker run --rm -v veltruvia-data:/d -v $(pwd):/b alpine cp /d/veltruvia.db /b/   # backup
```

## Video calls on mobile networks (TURN)

WebRTC video works peer-to-peer on the same Wi-Fi, but carrier-grade NAT
(phones on 4G/5G) often needs a relay. Run coturn next to the app and point
the API at it — patients on mobile data will then connect reliably.

`docker-compose.yml` (add under `services:`):

```yaml
  coturn:
    image: coturn/coturn:latest
    restart: unless-stopped
    network_mode: host          # coturn needs real ports, not NAT
    command: >
      -n --realm=${VELTRUVIA_DOMAIN} --fingerprint
      --lt-cred-mech --user=${TURN_USERNAME}:${TURN_CREDENTIAL}
      --no-cli
```

`.env` additions:

```
TURN_USERNAME=veltruvia
TURN_CREDENTIAL=<long random password>
TURN_URL=turn:${VELTRUVIA_DOMAIN}:3478
```

- Open UDP 3478 (and 49152-65535 for relay) in the VM firewall.
- The API exposes relay coordinates at `GET /api/telehealth/ice-servers`;
  the web and APK clients pick it up automatically (`public/js/rtc-config.js`).
- Without TURN configured, calls still work on Wi-Fi — the API just reports
  `turnConfigured: false` and clients fall back to STUN.

## Security notes

- Only ports 80/443 are public; the API port stays on loopback behind Caddy.
- All traffic is TLS 1.2+ with auto-renewed certificates.
- Rate limiting, Helmet, injection guards and audit chain are active in production mode.
- Back up `veltruvia-data` regularly — it is the only stateful thing.
- Keep `VELTRUVIA_DEMO` unset in production (demo accounts would be seeded).
