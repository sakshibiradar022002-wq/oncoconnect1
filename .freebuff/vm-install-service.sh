#!/bin/bash
# VELTRUVIA VM — install systemd service, kill stale test process, start service
set -e
pkill -f "node src/serve[r].js" 2>/dev/null || true
sleep 1
sudo mv /tmp/veltruvia.service /etc/systemd/system/veltruvia.service
sudo systemctl daemon-reload
sudo systemctl enable veltruvia
sudo systemctl restart veltruvia
sleep 6
systemctl is-active veltruvia
curl -s -m 5 http://127.0.0.1:3000/health
echo
sudo systemctl status veltruvia --no-pager -n 3 | head -8
