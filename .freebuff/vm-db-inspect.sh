#!/bin/bash
# VELTRUVIA VM — stop service, inspect DB state (read-only diagnostics)
set -e
sudo systemctl stop veltruvia
sleep 2
echo "=== app dir db/state files ==="
ls -la ~/veltruvia/app/ | grep -E "chemocure|chain|patient-store|corrupt|bak" || true
echo
echo "=== wal/shm sizes ==="
ls -la ~/veltruvia/app/chemocure.db-wal ~/veltruvia/app/chemocure.db-shm 2>/dev/null || echo "(no wal/shm)"
echo
echo "=== journal: db-related lines since service install ==="
sudo journalctl -u veltruvia --no-pager | grep -iE "schema|corrupt|recover|delete|wipe|reset|seed|users|EADDR|wal" | head -20
