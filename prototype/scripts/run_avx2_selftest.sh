#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
THREADS="${THREADS:-4}"
RANDOMS="${1:-3}"
EXE="$ROOT/build/rns_micro8_avx2_32x8_selftest"
[[ -x "$EXE" ]] || bash "$ROOT/scripts/build_avx2.sh"
mkdir -p "$ROOT/results"
TMP="$ROOT/results/avx2-selftest.tmp"
ERR="$ROOT/results/avx2-selftest.err"
OMP_NUM_THREADS="$THREADS" OMP_PROC_BIND=close OMP_PLACES=cores \
  "$EXE" "$THREADS" "$RANDOMS" >"$TMP" 2>"$ERR"
cat "$ERR"
cat "$TMP"
grep -q 'count_ok=1 frac_ok=1' "$ERR"
awk -F, 'NR>1 && $3 != 1 { bad=1 } END { exit bad }' "$TMP"
echo 'AVX2 RNS exact self-test: PASS'
