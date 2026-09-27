#!/usr/bin/env bash
# Install @sentry/node on the VM, add the DSN to .env, restart the app service.
set -e
cd /home/ubuntu/veltruvia/app

echo "== 1. files already scp'd: package.json + package-lock.json =="
grep -q '"@sentry/node"' package.json && echo "package.json has @sentry/node OK"

echo "== 2. npm install --omit=dev (adds @sentry/node) =="
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -2

echo "== 3. add SENTRY_DSN to .env if missing =="
DSN="SENTRY_DSN=${SENTRY_DSN:?set SENTRY_DSN in the environment first}"
if grep -q '^SENTRY_DSN=' .env; then
  echo ".env already has SENTRY_DSN — leaving as-is"
else
  printf '\n%s\n' "$DSN" >> .env
  echo "DSN appended"
fi

echo "== 4. restart service =="
sudo systemctl restart veltruvia
sleep 5
systemctl is-active veltruvia

echo "== 5. boot log check =="
sudo journalctl -u veltruvia --since "30 seconds ago" --no-pager | grep -iE "sentry|listening|error" | head -6 || true
