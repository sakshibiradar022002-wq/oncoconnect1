#!/usr/bin/env bash
# Restart veltruvia + confirm health after team.js honesty fix.
set -e
sudo systemctl restart veltruvia
sleep 4
systemctl is-active veltruvia
curl -s 'http://127.0.0.1:3000/health?deep=1'
echo
sudo journalctl -u veltruvia --since "30 seconds ago" --no-pager | grep -iE "error|listening|sentry" | head -4 || true
