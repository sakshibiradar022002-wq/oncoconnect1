#!/usr/bin/env bash
# Install Caddy web server + configure reverse proxy for veltruvia.duckdns.org
set -e
export DEBIAN_FRONTEND=noninteractive

sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update -y -o Dir::Etc::sourceparts=- -o APT::Get::List-Cleanup=0
sudo apt-get install -y caddy

# Caddyfile: DuckDNS domain -> local app on 127.0.0.1:3000
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
veltruvia.duckdns.org {
    reverse_proxy 127.0.0.1:3000
}
EOF

# Caddy needs the public IP for the ACME HTTP-01 challenge; bind-safe config already set.
sudo systemctl enable --now caddy
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "=== caddy version ==="
caddy version
echo "=== caddy status ==="
systemctl is-active caddy
