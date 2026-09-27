#!/usr/bin/env bash
set -e
sudo systemctl restart veltruvia
sleep 5
systemctl is-active veltruvia
sudo journalctl -u veltruvia --since "25 seconds ago" --no-pager | grep -iE "sentry|listening|EADDR|error" | head -5 || true
