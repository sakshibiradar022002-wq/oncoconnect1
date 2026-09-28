#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# VELTRUVIA Monthly Truth-Check
#
# Keeps the honesty-audit rule enforced (commits 63d00a5 / 22a08fa /
# e93bf48). Two checks:
#   1. REGRESSIONS — the exact lying patterns we fixed must never
#      reappear (SOS fake-success, fake "submitted", unchecked store
#      writes, unverified invite_sent audit, hardcoded health, ...).
#   2. NEW ok:true — every server route answering { ok: true } is
#      counted; an increase vs the baseline means a new success
#      response exists that a human must review before deploy.
#
# Usage:  bash truth-check.sh                # check + log
#         bash truth-check.sh --update-baseline   # accept current counts
# Exit:   0 = clean, 1 = findings, 2 = script error
# Log:    .freebuff/truth-check.log
# ═══════════════════════════════════════════════════════════════════
set -u
cd "$(dirname "$0")/.." || exit 2

LOG=".freebuff/truth-check.log"
BASE=".freebuff/truth-baseline.txt"
SRC="VELTRUVIA Server/resources/app/src"
PUB="VELTRUVIA Server/resources/app/public"
UPDATE_BASELINE=0
[ "${1:-}" = "--update-baseline" ] && UPDATE_BASELINE=1

findings=0
note() { echo "$1" >> "$LOG"; }
regression() { note "REGRESSION: $1"; findings=$((findings+1)); }

{ echo "=== truth-check $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="; } >> "$LOG"

# ── 1. Regression checks: the old lies must never come back ────────
has() { grep -qF "$2" "$1" 2>/dev/null; }

has "$PUB/js/page/patient-2-app.js" "Emergency alert sent to your doctor!" \
  && regression "SOS fake-success string is back (patient-2-app.js)"
has "$PUB/js/page/patient-1-core.js" "AppDialog.alert('Report submitted! ✓')" \
  && regression "fake lab-submit success is back (patient-1-core.js)"
has "$PUB/js/page/patient-1-core.js" "AppDialog.alert('Log saved! ✓')" \
  && regression "fake log-save success is back (patient-1-core.js)"
has "$PUB/js/page/patient-1-core.js" "AppDialog.alert('✅ Appointment request submitted!')" \
  && regression "fake booking success is back (patient-1-core.js)"
has "$SRC/routes/team.js" "action: 'team.invite_sent'" \
  && regression "unconditional invite_sent audit is back (team.js)"
has "$SRC/app.js" "'electron-module'" \
  && regression "hardcoded blockchain health placeholder is back (app.js)"

# Discarded store-write results (the ok:true-on-disk-failure lie)
n=$(grep -cE "^[[:space:]]*write(Log|Msg|Appt)Store\(.*\);[[:space:]]*$" "$SRC/routes/sync.js" 2>/dev/null)
[ "${n:-0}" -gt 0 ] && regression "$n unchecked write*(Store) call(s) in sync.js"

# pushToServer called without using its true/false result (doctor app)
n=$(grep -cE "^[[:space:]]*pushToServer\(" "$PUB/js/page/index-2-record.js" 2>/dev/null)
[ "${n:-0}" -gt 0 ] && regression "$n pushToServer call(s) ignoring their result (index-2-record.js)"

# ── 2. New unconditional ok:true vs baseline ───────────────────────
CUR="$(mktemp)"
grep -rc "ok: true" "$SRC/routes/"*.js 2>/dev/null | sort > "$CUR" || true

if [ ! -f "$BASE" ]; then
  cp "$CUR" "$BASE"
  note "Baseline created ($(wc -l < "$BASE") route files)."
else
  while IFS= read -r line; do
    file="${line%:*}"; cnt="${line##*:}"
    old="$(grep -F "$file:" "$BASE" 2>/dev/null | head -1 | awk -F: '{print $NF}')"
    if [ -z "$old" ]; then
      note "NEW FILE with ok:true: $file ($cnt) — review before deploy"
      findings=$((findings+1))
    elif [ "$cnt" -gt "$old" ]; then
      note "ok:true count grew in $file: $old -> $cnt — review the new success response(s)"
      findings=$((findings+1))
    fi
  done < "$CUR"
fi

# ── Verdict ────────────────────────────────────────────────────────
if [ "$UPDATE_BASELINE" = "1" ]; then
  cp "$CUR" "$BASE"
  note "Baseline updated by --update-baseline."
fi
rm -f "$CUR"

if [ "$findings" -gt 0 ]; then
  note "RESULT: $findings finding(s) — review before deploying. (Accept intentional changes with --update-baseline)"
  echo "TRUTH-CHECK: $findings finding(s) — see $LOG"
  exit 1
fi
note "RESULT: CLEAN — no regressions, no new unreviewed ok:true."
echo "TRUTH-CHECK: CLEAN"
exit 0
