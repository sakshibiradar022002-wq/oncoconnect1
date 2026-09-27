#!/bin/bash
# VELTRUVIA VM — real login + authenticated API + push self-test via public URL
set -e
B="https://rapids-shown-strictly-suggestion.trycloudflare.com"
PASS=$(grep -oP 'password: \K.*' ~/veltruvia-admin-credentials.txt)

echo "== 1. LOGIN (public URL) =="
RESP=$(curl -s -m 25 -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -H 'x-veltruvia-native: 1' \
  -d "{\"email\":\"admin@veltruvia.local\",\"password\":\"$PASS\"}")
echo "$RESP" | head -c 300; echo
TOKEN=$(echo "$RESP" | grep -oP '"token":"\K[^"]+' || true)
if [ -z "$TOKEN" ]; then echo "NO TOKEN — login failed"; exit 1; fi
echo "TOKEN acquired (${#TOKEN} chars)"

echo
echo "== 2. authenticated admin endpoint =="
curl -s -m 20 "$B/api/admin/users" -H "Authorization: Bearer $TOKEN" | head -c 250; echo

echo
echo "== 3. push self-test (triggers vapid heal) =="
curl -s -m 25 -X POST "$B/api/push/test" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' | head -c 200; echo

echo
echo "== 4. PHI verify after push self-test =="
cd ~/veltruvia
node scripts/verify-phi.mjs --db 'VELTRUVIA Server/resources/app/chemocure.db' --env 'VELTRUVIA Server/resources/app/.env' 2>&1 | tail -1
