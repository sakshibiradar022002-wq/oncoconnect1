#!/usr/bin/env bash
# VELTRUVIA offsite backup pull — runs on Sara's Windows PC daily.
# Copies every backup tarball from the cloud VM to the local offsite store
# and prunes the local store to the newest 30. Exit 0 = OK, non-zero = problem.
set -u
KEY="C:/Users/Sara/.ssh/lightsail-mumbai.pem"
# VM target lives in an untracked local file (.vm-target, "ubuntu@<ip>")
# so this repo can stay public without leaking the server address.
TARGET_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.vm-target"
if [ ! -f "$TARGET_FILE" ]; then echo "!!! missing $TARGET_FILE" >&2; exit 9; fi
VM="$(tr -d '\r\n ' < "$TARGET_FILE")"
DEST="C:/Users/Sara/Desktop/veltruvia-offsite-backups"
LOG="$DEST/pull.log"

mkdir -p "$DEST" 2>/dev/null

{
  echo "=== pull $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  scp -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
      "$VM:/home/ubuntu/veltruvia-backups/*.tar.gz" "$DEST/" 2>&1
  rc=$?
  # Chain-tip anchor log: tamper-evidence history lives off the VM
  scp -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
      "$VM:/home/ubuntu/veltruvia-backups/chain-tip.log" "$DEST/" 2>&1 || true
  if [ $rc -ne 0 ]; then
    echo "SCP_FAILED rc=$rc"
    exit $rc
  fi
  # Prune local copies: keep newest 30 tarballs
  ls -1t "$DEST"/veltruvia-backup-*.tar.gz 2>/dev/null | tail -n +31 | while read -r f; do rm -f "$f"; done
  count=$(ls -1 "$DEST"/veltruvia-backup-*.tar.gz 2>/dev/null | wc -l)
  echo "OK local_copies=$count"
} >> "$LOG" 2>&1
exit 0
