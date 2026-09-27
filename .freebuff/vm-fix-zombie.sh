#!/bin/bash
# VELTRUVIA VM — kill zombie listener, restart service cleanly, verify
set -e
echo "== kill zombie 3918 and any stray node =="
sudo kill -9 3918 2>/dev/null || true
sudo pkill -9 -f "node src/serve[r].js" 2>/dev/null || true
sleep 2
echo "== restart service =="
sudo systemctl restart veltruvia
sleep 7
echo "== who owns :3000 now =="
sudo ss -ltnp | grep ":3000" || echo "(nothing!)"
echo
echo "== service health =="
systemctl is-active veltruvia
curl -s -m 5 http://127.0.0.1:3000/health
echo
echo "== fresh boot log (should be clean, no EADDRINUSE) =="
sudo journalctl -u veltruvia --no-pager --since "-60s" | grep -iE "EADDR|error|chain|backup|listen|running" | head -8
