#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/results"
EXE="$ROOT/build/pastafarian_cold_bench_portable"
REPS="${1:-3}"
THREADS="${THREADS:-4}"
SB="${SB:-512}"
[[ -x "$EXE" ]] || bash "$ROOT/scripts/build_portable.sh"
export OMP_NUM_THREADS="$THREADS" OMP_PROC_BIND=close OMP_PLACES=cores
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$ROOT/results/portable-benchmark-$STAMP.log"
CASES=(
  'same-start 2461290 2461247'
  'same-query 2461290 2461290'
  'same-mid 2461290 2462913'
  'same-end 2461290 2464579'
  'far-past-3576y 2461290 -12829630'
)
cd "$ROOT/data"
for ((r=1;r<=REPS;r++)); do
  for row in "${CASES[@]}"; do
    read -r name calc target <<<"$row"
    echo "=== backend=portable rep=$r case=$name calc=$calc target=$target threads=$THREADS sb=$SB ===" | tee -a "$LOG"
    /usr/bin/time -f 'external_wall_s=%e' "$EXE" "$calc" "$target" "$THREADS" "$SB" 2>&1 | tee -a "$LOG"
  done
done
echo "Log: $LOG"
