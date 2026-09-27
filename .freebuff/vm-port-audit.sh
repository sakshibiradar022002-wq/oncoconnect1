#!/bin/bash
echo "=== who listens on :3000 ==="
sudo ss -ltnp | grep ":3000" || echo "(nothing)"
echo
echo "=== all node processes ==="
pgrep -fa node || echo "(none)"
echo
echo "=== veltruvia service state ==="
systemctl status veltruvia --no-pager -n 5 | head -12
