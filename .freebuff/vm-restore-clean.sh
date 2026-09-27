#!/bin/bash
# VELTRUVIA VM — clean data restore with dual-engine verification
set -e
echo "== 1. stop service (and any stray node) =="
sudo systemctl stop veltruvia 2>/dev/null || true
pkill -f "node src/serve[r].js" 2>/dev/null || true
sleep 2

echo "== 2. wipe tainted db/state files =="
cd ~/veltruvia/app
rm -f chemocure.db chemocure.db-wal chemocure.db-shm chemocure.db.lock chain.json patient-store.json

echo "== 3. extract fresh data =="
tar -xzf /tmp/veltruvia-data.tar.gz
ls -la chemocure.db chain.json patient-store.json

echo "== 4. verify A: sql.js (verify-phi) =="
cd ~/veltruvia
node scripts/verify-phi.mjs --db 'VELTRUVIA Server/resources/app/chemocure.db' --env 'VELTRUVIA Server/resources/app/.env' 2>&1 | tail -1

echo "== 5. verify B: libsql (live engine) =="
cd ~/veltruvia/app
node vm-admin-list.mjs

echo "== 6. start service =="
sudo systemctl start veltruvia
sleep 6
systemctl is-active veltruvia
curl -s -m 5 http://127.0.0.1:3000/health
echo

echo "== 7. post-boot libsql re-check (server touching db must not lose rows) =="
sleep 3
node vm-admin-list.mjs
