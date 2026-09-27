#!/bin/bash
# VELTRUVIA VM — nightly backup (systemd timer, 02:15 UTC)
# Archives live DB (VACUUM INTO for a consistent snapshot), chain, stores.
set -e
APP=~/veltruvia/app
DEST=~/veltruvia-backups
KEEP=14
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DEST" "$APP/backups"
cd "$APP"

cat > /tmp/vm-snapshot.mjs <<'NODEEOF'
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { createClient } = require('@libsql/client');
const src = createClient({ url: 'file:./chemocure.db' });
await src.execute(`VACUUM INTO 'backups/nightly.db'`);
console.log('snapshot written');
NODEEOF
node /tmp/vm-snapshot.mjs
mv "backups/nightly.db" "backups/nightly-$STAMP.db"

tar -czf "$DEST/veltruvia-backup-$STAMP.tar.gz" \
  "backups/nightly-$STAMP.db" chain.json patient-store.json .env
rm -f "backups/nightly-$STAMP.db"

ls -1t "$DEST"/veltruvia-backup-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
echo "backup complete: $DEST/veltruvia-backup-$STAMP.tar.gz ($(ls -lh "$DEST/veltruvia-backup-$STAMP.tar.gz" | awk '{print $5}'))"
