#!/usr/bin/env bash
# Restart the VELTRUVIA service (needs root) and deep-verify health.
set -e
sudo systemctl restart veltruvia
sleep 3
curl -s http://localhost:3000/health | head -c 120
echo
curl -s -o /dev/null -w 'public health: HTTP %{http_code}\n' https://veltruvia.duckdns.org/health || true
