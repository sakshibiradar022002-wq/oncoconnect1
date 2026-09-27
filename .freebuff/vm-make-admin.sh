#!/bin/bash
# VELTRUVIA VM — bootstrap admin with a generated password
set -e
EMAIL="admin@veltruvia.local"
PASS="Vlt-$(openssl rand -hex 6)A9"   # 16 chars, letters+digits
cd ~/veltruvia/app
node vm-bootstrap-admin.mjs "$EMAIL" "$PASS"
umask 077
printf 'VELTRUVIA cloud admin\nURL: check tunnel\nemail: %s\npassword: %s\n(Change this password after first login.)\n' "$EMAIL" "$PASS" > ~/veltruvia-admin-credentials.txt
chmod 600 ~/veltruvia-admin-credentials.txt
echo "CREDENTIALS (also saved to ~/veltruvia-admin-credentials.txt on the VM):"
echo "email: $EMAIL"
echo "password: $PASS"
