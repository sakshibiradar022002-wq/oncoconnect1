#!/bin/bash
# VELTRUVIA VM — install cloudflared + run public tunnel as a service
set -e
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update -qq
sudo apt-get install -y cloudflared
cloudflared --version

cat <<'EOF' | sudo tee /etc/systemd/system/veltruvia-tunnel.service
[Unit]
Description=VELTRUVIA public tunnel (cloudflared)
After=network-online.target veltruvia.service

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/bin/cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable veltruvia-tunnel
sudo systemctl restart veltruvia-tunnel
sleep 8
echo "=== TUNNEL URL ==="
sudo journalctl -u veltruvia-tunnel --no-pager -n 50 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
