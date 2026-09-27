# VELTRUVIA — HTTPS on the Clinic LAN (LIVE since v2.0.5)

> ⚠️ **SUPERSEDED (2026-09-27):** production is cloud-hosted with automatic
> HTTPS (Caddy + Let's Encrypt) — see **DEPLOY-AWS.md**. LAN TLS kept for
> offline/emergency use only.

Phone-to-server traffic on the clinic Wi-Fi is now **encrypted**.

## Current state (already done)

- The Server runs a **second listener on port 3001** that speaks HTTPS
  (TLS 1.2+) with the clinic certificate. Plain HTTP on :3000 stays on for
  the desktop Doctor app and the cloud tunnel — nothing broke.
- Certificate: `config/tls/veltruvia-lan.crt` (CN=VELTRUVIA Clinic Server,
  valid to Dec 2028) — also downloadable from the server at
  `http://<server-ip>:3000/certs/veltruvia-lan.crt`
- Key: `config/tls/veltruvia-lan.key` (private — never copy to phones)

## Set up a phone (2 minutes each)

1. In any browser on the phone: `http://<server-ip>:3000/certs/veltruvia-lan.crt`
2. Android: Settings → Security → **Install a certificate → CA certificate**
   (accept the warning — it's your own clinic certificate)
3. Open the VELTRUVIA app → ⚙ → **Scan QR** (point at the QR on the server's
   download page) or type: `https://<server-ip>:3001`
4. Save. The app now talks to the server encrypted.

The VELTRUVIA apps already trust user-installed CAs (network security
config) — no app rebuild needed.

## Managing it

- **Disable:** remove `TLS_KEY`/`TLS_CERT` lines from `.env` (or set
  `TLS_LAN_PORT=0`), restart the server.
- **Change port:** set `TLS_LAN_PORT=<port>` in `.env`.
- **Renew cert (Dec 2028):** regenerate with the command in `scripts/`
  history or any OpenSSL self-signed guide, keep the same file paths.
- The download page shows a green "encrypted HTTPS on port 3001" hint when
  the sidecar is reachable.

## Trade-offs to know

- The certificate is self-signed: browsers will show a one-time warning if
  you open `https://<ip>:3001` directly in a mobile browser — app traffic is
  unaffected once the CA is installed.
- Each phone must install the certificate once (step 1–2 above).
- If you prefer simplicity over encryption, phones may keep using the plain
  HTTP address — both work side by side.
