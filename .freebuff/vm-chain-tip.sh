#!/usr/bin/env bash
# Append chain-tip anchoring to the nightly backup script, then seed the log now.
set -e
BS=~/veltruvia/vm-backup.sh
APP=~/veltruvia/app
DEST=~/veltruvia-backups

if ! grep -q "chain-tip.log" "$BS"; then
cat >> "$BS" <<'EOF'

# ── Chain-tip anchor (tamper-evidence beyond the VM) ─────────────────
# The tip hash + block count are appended to a log that leaves the VM via
# the offsite pull. Rewriting chain.json on the VM would no longer be
# enough to hide tampering: the offsite tip history would disagree.
TIP=$(python3 -c "import json;c=json.load(open('$APP/chain.json'))['chain'];print(c[-1]['hash'],len(c))" 2>/dev/null || echo "UNKNOWN 0")
echo "$(date -u +%FT%TZ) tip=$TIP" >> "$DEST/chain-tip.log"
EOF
echo "backup script patched"
else
echo "already patched"
fi

# Seed the log right now (same logic as the appended block)
TIP=$(python3 -c "import json;c=json.load(open('$APP/chain.json'))['chain'];print(c[-1]['hash'],len(c))")
echo "$(date -u +%FT%TZ) tip=$TIP" >> "$DEST/chain-tip.log"
echo "--- chain-tip.log now:"
cat "$DEST/chain-tip.log"
