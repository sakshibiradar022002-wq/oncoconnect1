#!/bin/bash
# VELTRUVIA VM — health & feature audit (read-only)
echo "=== boot log (interesting lines) ==="
sudo journalctl -u veltruvia --no-pager -n 100 | grep -iE 'audit|chain|push|vapid|error|warn|listen|ready|integrity' | head -14
echo
echo "=== memory / swap ==="
free -h | head -3
echo
echo "=== uptime & load ==="
uptime
echo
echo "=== verify-phi (after boot heal) ==="
cd ~/veltruvia
node scripts/verify-phi.mjs --db 'VELTRUVIA Server/resources/app/chemocure.db' --env 'VELTRUVIA Server/resources/app/.env' 2>&1 | tail -1
echo
echo "=== 2.3.0 feature files present ==="
ls ~/veltruvia/app/src/routes/ | grep -iE 'dosing|queue|calendar|waiting' || true
grep -l 'ics' ~/veltruvia/app/src/routes/*.js 2>/dev/null | head -2 || true
echo
echo "=== dictation removed? ==="
grep -c 'webkitSpeechRecognition' ~/veltruvia/app/public/js/page/index-2-record.js 2>/dev/null || echo "0 (removed)"
echo
echo "=== backups configured? ==="
ls ~/veltruvia/app/backups 2>/dev/null | head -3 || echo "(no backups dir yet on VM)"
echo
echo "=== disk ==="
df -h / | tail -1
