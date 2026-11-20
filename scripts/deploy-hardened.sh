#!/usr/bin/env bash
# deploy-hardened.sh — stage, verify, swap and roll back the VELTRUVIA server.
#
# Matches the reviewed procedure: run the new bundle on a spare port against a
# copy of the live DB, smoke-test it, and only then replace the production
# source in place — keeping the previous source for one-command rollback.
#
#   sudo ./scripts/deploy-hardened.sh stage      # no production change
#   sudo ./scripts/deploy-hardened.sh swap       # backup + install + verify
#   sudo ./scripts/deploy-hardened.sh rollback   # restore newest backup
#   sudo ./scripts/deploy-hardened.sh status
#
# Environment overrides:
#   APP_SRC     repo bundle to install   (default: ./VELTRUVIA Server/resources/app)
#   APP_DIR     production app dir       (default: /home/ubuntu/veltruvia/app)
#   SERVICE     systemd unit             (default: veltruvia)
#   STAGING_PORT spare port              (default: 3100)
#   PUBLIC_URL  public base URL          (default: https://veltruvia.duckdns.org)
#   ADMIN_EMAIL admin login              (default: admin@veltruvia.local)
#   CREDS_FILE  file with "password: ..." (default: ~/veltruvia-admin-credentials.txt)
#   STATE_DIR   backups                  (default: ~/veltruvia-deploys)
#
# Never touches the live DB, the live .env, or node_modules during `stage`.
set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_SRC="${APP_SRC:-$REPO_ROOT/VELTRUVIA Server/resources/app}"
APP_DIR="${APP_DIR:-/home/ubuntu/veltruvia/app}"
SERVICE="${SERVICE:-veltruvia}"
STAGING_PORT="${STAGING_PORT:-3100}"
PUBLIC_URL="${PUBLIC_URL:-https://veltruvia.duckdns.org}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@veltruvia.local}"
CREDS_FILE="${CREDS_FILE:-$HOME/veltruvia-admin-credentials.txt}"
STATE_DIR="${STATE_DIR:-$HOME/veltruvia-deploys}"

if [[ $EUID -eq 0 ]]; then SUDO=""; else SUDO="sudo"; fi

STAGE_TMP=""
STAGE_PID=""
cleanup() {
  if [[ -n "${STAGE_PID:-}" ]] && kill -0 "$STAGE_PID" 2>/dev/null; then
    kill "$STAGE_PID" 2>/dev/null || true
    wait "$STAGE_PID" 2>/dev/null || true
  fi
  [[ -n "${STAGE_TMP:-}" ]] && rm -rf "$STAGE_TMP"
}
trap cleanup EXIT

# Source trees that `swap` replaces and `rollback` restores.
INSTALL_PATHS=(src public electron package.json package-lock.json)

# Excluded from installation: runtime state that must survive a deploy.
RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .env
  --exclude '*.db'
  --exclude '*.db-wal'
  --exclude '*.db-shm'
  --exclude '*.db.lock'
  --exclude backups
  --exclude data
  --exclude chain.json
  --exclude '*-store.json'
  --exclude '*-store.enc.json'
  --exclude telehealth-*.json
  --exclude hardening-tmp
)

say()  { printf '\n\033[1m── %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

svc() { $SUDO systemctl "$@" "$SERVICE"; }

check_public() {
  local code
  code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$PUBLIC_URL/health" || true)
  [[ "$code" == "200" ]]
}

check_login() {
  [[ -r "$CREDS_FILE" ]] || { warn "no credentials file at $CREDS_FILE — skipping login check"; return 0; }
  local pass token
  pass=$(grep -oP 'password:\s*\K\S+' "$CREDS_FILE" | head -1)
  [[ -n "$pass" ]] || { warn "could not read password from $CREDS_FILE"; return 1; }
  token=$(curl -sS -m 20 -X POST "$1/api/auth/login" \
    -H 'Content-Type: application/json' -H 'x-veltruvia-native: 1' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$pass\"}" |
    grep -oP '"token":"\K[^"]+' || true)
  [[ -n "$token" ]]
}

db_path() {
  local p
  p=$(grep -E '^DB_PATH=' "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  p="${p:-$APP_DIR/chemocure.db}"
  [[ "$p" = /* ]] || p="$APP_DIR/$p"
  printf '%s' "$p"
}

stage() {
  need node
  need curl
  say "Staging $APP_SRC on port $STAGING_PORT (production untouched)"

  local tmp log
  tmp=$(mktemp -d /tmp/veltruvia-stage.XXXXXX)
  STAGE_TMP="$tmp"
  log="$tmp/server.log"

  rsync -a "${RSYNC_EXCLUDES[@]}" "$APP_SRC/" "$tmp/app/"

  # Secrets come from the live .env; the staged DB is a consistent copy.
  cp "$APP_DIR/.env" "$tmp/app/.env" || die "no .env at $APP_DIR/.env"
  chmod 600 "$tmp/app/.env"

  local live staledb
  live=$(db_path)
  staledb="$tmp/staging.db"
  [[ -f "$live" ]] || die "live DB not found at $live"

  if ! node --input-type=module -e '
      import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.argv[1]);
      // SQLite treats "double quoted" tokens as identifiers, so the target
      // filename must be a single-quoted literal; built without literal
      // quote characters because this snippet lives in a single-quoted -e arg.
      const q = String.fromCharCode(39);
      const target = process.argv[2].split(q).join(q + q);
      db.exec("VACUUM INTO " + q + target + q);
      db.close();
    ' "$live" "$staledb" 2>"$tmp/vacuum.err"; then
    die "could not snapshot the live DB (node:sqlite VACUUM INTO failed): $(tail -3 "$tmp/vacuum.err")"
  fi
  ok "live DB snapshotted to staging (read-only, no lock held)"

  # Link the existing dependencies — do not reinstall for a smoke test.
  ln -s "$APP_DIR/node_modules" "$tmp/app/node_modules"

  (
    cd "$tmp/app"
    # Do not bash-source .env: values like EMAIL_FROM=VELTRUVIA <no-reply@host>
    # are not valid shell (the '<' reads as a redirection) while systemd and
    # dotenv parse them fine. src/server.js imports 'dotenv/config', which
    # loads ./.env from this cwd; the explicit vars below still win over it.
    PORT="$STAGING_PORT" HOST=127.0.0.1 DB_PATH="$staledb" \
    NODE_ENV=production LOG_LEVEL=warn \
    node src/server.js >"$log" 2>&1 &
    echo $! >"$tmp/pid"
  )
  STAGE_PID=$(cat "$tmp/pid")

  local base="http://127.0.0.1:$STAGING_PORT" ready=""
  for _ in $(seq 1 60); do
    if curl -fsS -m 2 "$base/health" >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  [[ -n "$ready" ]] || die "staged server never became ready. Log tail:
$(tail -30 "$log")"

  local failures=0
  expect() { # name expected actual
    if [[ "$2" == "$3" ]]; then ok "$1 ($3)"; else warn "$1: expected $2, got $3"; failures=$((failures + 1)); fi
  }

  say "Smoke tests"
  expect "GET /health"              200 "$(curl -sS -o /dev/null -w '%{http_code}' "$base/health")"
  expect "GET /api/health"          200 "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/health")"
  expect "GET /health?deep=1"       200 "$(curl -sS -o /dev/null -w '%{http_code}' "$base/health?deep=1")"

  # These two prove the guards are wired, not merely imported.
  expect "TRACE rejected (methodGuard)" 405 \
    "$(curl -sS -o /dev/null -w '%{http_code}' -X TRACE "$base/health")"
  expect "path traversal rejected (pathTraversalGuard)" 400 \
    "$(curl --path-as-is -sS -o /dev/null -w '%{http_code}' "$base/api/x/..%2f..%2fetc%2fpasswd")"

  # /unsubscribe: 401 means the route is mounted behind auth (404 = not mounted).
  expect "POST /api/push/unsubscribe mounted" 401 \
    "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
        -d '{"endpoint":"https://example.test/x"}' "$base/api/push/unsubscribe")"

  if check_login "$base"; then ok "admin login issues a token"; else warn "admin login failed on staging"; failures=$((failures + 1)); fi

  if grep -qiE 'Error|FATAL' "$log"; then
    warn "log contains errors — review:"
    grep -iE 'Error|FATAL' "$log" | tail -5 | sed 's/^/    /'
  fi

  kill "$STAGE_PID" 2>/dev/null || true
  wait "$STAGE_PID" 2>/dev/null || true
  STAGE_PID=""

  [[ $failures -eq 0 ]] || die "$failures staging check(s) failed — do NOT swap"
  ok "staging passed; the swap is cleared to proceed"
  printf '\n  Next: sudo %s swap\n\n' "$0"
}

swap() {
  need rsync
  need tar
  say "Staging first (swap aborts if it fails)"
  if [[ "${SKIP_STAGE:-}" != "1" ]]; then stage; else warn "SKIP_STAGE=1 — staging skipped"; fi

  local ts backup
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  backup="$STATE_DIR/source-$ts"
  mkdir -p "$backup"

  say "Backing up production source to $backup"
  for p in "${INSTALL_PATHS[@]}"; do
    [[ -e "$APP_DIR/$p" ]] && cp -a "$APP_DIR/$p" "$backup/$(basename "$p")"
  done
  tar -C "$APP_DIR" -czf "$backup/runtime-config.tgz" .env deployment.json 2>/dev/null || true
  printf '%s\n' "$backup" >"$STATE_DIR/LATEST"
  ok "rollback point recorded in $STATE_DIR/LATEST"

  say "Installing hardened source"
  rsync -a --delete "$APP_SRC/src/" "$APP_DIR/src/"
  # public/downloads holds the built installers/APKs on the VM — never delete it
  rsync -a --delete --exclude downloads/ "$APP_SRC/public/" "$APP_DIR/public/"
  [[ -d "$APP_SRC/electron" ]] && rsync -a --delete "$APP_SRC/electron/" "$APP_DIR/electron/"
  cp -a "$APP_SRC/package.json" "$APP_DIR/package.json"
  cp -a "$APP_SRC/package-lock.json" "$APP_DIR/package-lock.json"
  ok "source replaced (DB, .env, node_modules, chain untouched)"

  if ! diff -q "$APP_SRC/package-lock.json" "$backup/package-lock.json" >/dev/null 2>&1; then
    say "Dependency manifest changed — installing production deps"
    if ! (cd "$APP_DIR" && npm ci --omit=dev); then
      warn "npm ci failed — rolling back"
      rollback
      die "deploy aborted; previous version restored"
    fi
  fi

  say "Restarting $SERVICE"
  svc restart
  local ok_health=""
  for _ in $(seq 1 30); do
    if check_public; then ok_health=1; break; fi
    sleep 2
  done

  if [[ -z "$ok_health" ]]; then
    warn "public health check failed — rolling back"
    rollback
    die "deploy failed; previous version restored"
  fi
  ok "public /health returns 200"

  if check_login "$PUBLIC_URL"; then ok "public login issues a token"; else
    warn "public login failed — rolling back"
    rollback
    die "deploy failed; previous version restored"
  fi

  printf '\n\033[1mDeployed.\033[0m Version reported by /health:\n'
  curl -sS "$PUBLIC_URL/health" | head -c 200; echo
  printf '\n  Rollback: sudo %s rollback\n\n' "$0"
}

rollback() {
  local backup
  if [[ $# -ge 1 ]]; then backup="$1"; else
    [[ -f "$STATE_DIR/LATEST" ]] || die "no rollback point in $STATE_DIR"
    backup=$(cat "$STATE_DIR/LATEST")
  fi
  [[ -d "$backup" ]] || die "backup directory not found: $backup"

  say "Rolling back from $backup"
  for p in "${INSTALL_PATHS[@]}"; do
    if [[ -e "$backup/$(basename "$p")" ]]; then
      rm -rf "${APP_DIR:?}/$p"
      cp -a "$backup/$(basename "$p")" "$APP_DIR/$p"
      ok "restored $p"
    fi
  done

  if [[ -f "$backup/runtime-config.tgz" ]]; then
    tar -C "$APP_DIR" -xzf "$backup/runtime-config.tgz" 2>/dev/null || warn "runtime config restore failed (left current)"
  fi

  svc restart
  for _ in $(seq 1 30); do check_public && { ok "public /health returns 200 after rollback"; return 0; }; sleep 2; done
  warn "rollback finished but /health is still failing — check: journalctl -u $SERVICE -n 50"
  return 1
}

status() {
  say "Status"
  printf '  app dir:    %s\n' "$APP_DIR"
  printf '  service:    %s\n' "$($SUDO systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)"
  printf '  local:      %s\n' "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health 2>/dev/null | tr -d '\r' || true)"
  printf '  public:     %s\n' "$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$PUBLIC_URL/health" 2>/dev/null | tr -d '\r' || true)"
  [[ -f "$STATE_DIR/LATEST" ]] && printf '  rollback:   %s\n' "$(cat "$STATE_DIR/LATEST")"
  printf '  version:    %s\n' "$(curl -sS -m 10 "$PUBLIC_URL/health" 2>/dev/null | grep -oP '"version":"\K[^"]+' || echo unknown)"
}

case "${1:-}" in
  stage)    stage ;;
  swap)     swap ;;
  rollback) shift; rollback "$@" ;;
  status)   status ;;
  *)        die "usage: $0 {stage|swap|rollback|status}" ;;
esac
