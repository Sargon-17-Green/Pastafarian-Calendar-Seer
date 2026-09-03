#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/results"
EXE="$ROOT/build/pastafarian_cold_bench_portable"
THREADS="${THREADS:-4}"
SB="${SB:-512}"
[[ -x "$EXE" ]] || bash "$ROOT/scripts/build_portable.sh"
LOG="$ROOT/results/portable-vector-check.log"
: > "$LOG"

run_case() {
  local name="$1" calc="$2" target="$3"; shift 3
  local out first
  out="$(cd "$ROOT/data" && "$EXE" "$calc" "$target" "$THREADS" "$SB")"
  first="$(printf '%s\n' "$out" | head -n1)"
  printf '=== %s ===\n%s\n' "$name" "$out" | tee -a "$LOG"
  for expected in "$@"; do
    if [[ "$first" != *"$expected"* ]]; then
      echo "VECTOR CHECK FAILED: $name missing [$expected]" | tee -a "$LOG" >&2
      return 1
    fi
  done
}

run_case same-start 2461290 2461247 \
  'year=5000' 'gates=31260:31266' 'offset=0'
run_case same-query 2461290 2461290 \
  'year=5000' 'gates=31260:31266' 'offset=43' \
  'cutlet_idx=11' 'day_cutlet=44' 'month_idx=7' 'day_month=2' \
  'months=29' 'Nbits=15837'
run_case same-mid 2461290 2462913 \
  'year=5000' 'gates=31260:31266' 'offset=1666'
run_case same-end 2461290 2464579 \
  'year=5000' 'gates=31260:31266' 'offset=3332'
run_case far-past-3576y 2461290 -12829630 \
  'year=1424' 'gates=992:1004' 'offset=3135' \
  'cutlet_idx=10' 'day_cutlet=1' 'month_idx=8' 'day_month=64' \
  'months=47' 'Nbits=30497'

echo 'Portable benchmark vectors: PASS' | tee -a "$LOG"
