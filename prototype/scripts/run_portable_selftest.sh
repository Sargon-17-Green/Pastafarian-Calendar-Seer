#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/results"
THREADS="${THREADS:-4}"
RANDOMS="${1:-1}"
EXE="$ROOT/build/rns_micro8_portable_selftest"
[[ -x "$EXE" ]] || bash "$ROOT/scripts/build_portable.sh"
LOG="$ROOT/results/portable-rns-selftest.log"
"$EXE" "$THREADS" "$RANDOMS" 2>&1 | tee "$LOG"
grep -q 'count_ok=1 frac_ok=1' "$LOG"
if grep -E '^[^,]+,[0-9]+,0,' "$LOG" >/dev/null; then
  echo 'Portable RNS self-test reported an unrank mismatch.' >&2
  exit 1
fi
echo 'Portable RNS exact self-test: PASS' | tee -a "$LOG"
