#!/bin/bash
# VELTRUVIA TURN (coturn) setup — run on the Lightsail VM as ubuntu.
# Installs coturn, writes a locked-down config for the REST auth-secret scheme,
# and appends TURN_HOST/TURN_SECRET to the app .env (systemd EnvironmentFile).
set -e
PUB=16.4.28.130
echo "== 1. install coturn =="
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq coturn

echo "== 2. detect private IP =="
PRIV=$(curl -s --max-time 3 http://169.254.169.254/latest/meta-data/local-ipv4 || true)
if [ -z "$PRIV" ]; then PRIV=$(hostname -I | awk '{print $1}'); fi
echo "public=$PUB private=$PRIV"

echo "== 3. generate secret =="
SECRET=$(openssl rand -hex 32)

echo "== 4. write /etc/turnserver.conf =="
sudo tee /etc/turnserver.conf > /dev/null <<EOF
# VELTRUVIA TURN relay - generated $(date -u '+%Y-%m-%dT%H:%MZ')
# REST auth-secret scheme: the Node app mints time-limited HMAC credentials
# (username = "<unix-expiry>:veltruvia", credential = base64(HMAC-SHA1(secret, username))).
listening-port=3478
listening-ip=0.0.0.0
relay-ip=$PRIV
external-ip=$PUB/$PRIV
realm=veltruvia.duckdns.org
server-name=veltruvia.duckdns.org
fingerprint
use-auth-secret
static-auth-secret=$SECRET
# 56 relay ports = ~28 concurrent relayed calls
min-port=49160
max-port=49215
total-quota=120
user-quota=12
stale-nonce=600
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1
simple-log
log-file=/var/log/turnserver.log
# relay targets: block loopback, link-local and LAN ranges (CGNAT 100.64/10
# is deliberately ALLOWED - mobile-data phones peer from CGNAT)
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
EOF

echo "== 5. enable + start coturn =="
sudo sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
sudo systemctl enable coturn > /dev/null 2>&1 || true
sudo systemctl restart coturn
sleep 2
sudo systemctl is-active coturn

echo "== 6. wire secret into app .env =="
sed -i '/^TURN_/d' /home/ubuntu/veltruvia/app/.env
printf 'TURN_HOST=veltruvia.duckdns.org\nTURN_SECRET=%s\n' "$SECRET" >> /home/ubuntu/veltruvia/app/.env
chmod 600 /home/ubuntu/veltruvia/app/.env
chown ubuntu:ubuntu /home/ubuntu/veltruvia/app/.env

echo "== 7. listeners =="
ss -uln | grep -E ':(3478|4916[0-9])' || echo "(no udp listeners visible)"
ss -tln | grep ':3478' || true
echo "== TURN SETUP DONE =="
