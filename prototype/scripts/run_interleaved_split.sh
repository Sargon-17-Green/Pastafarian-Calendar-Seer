#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPS="${1:-3}"
COUNT_THREADS="${COUNT_THREADS:-4}"
SB="${SB:-512}"
COOLDOWN="${COOLDOWN:-2}"
PORT="$ROOT/build/pastafarian_cold_bench_portable_split"
AVX="$ROOT/build/pastafarian_cold_bench_avx2_split"
[[ -x "$PORT" && -x "$AVX" ]] || bash "$ROOT/scripts/build_split_bench.sh"
mkdir -p "$ROOT/results"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$ROOT/results/interleaved-split-$STAMP.log"
cd "$ROOT/data"

CASES=(
  'same-start 2461290 2461247'
  'same-query 2461290 2461290'
  'same-mid 2461290 2462913'
  'same-end 2461290 2464579'
  'far-past-3576y 2461290 -12829630'
)

run_one() {
  local backend="$1" name="$2" calc="$3" target="$4" replay="$5" rep="$6" phase="$7"
  local exe
  if [[ "$backend" == "scalar" ]]; then exe="$PORT"; else exe="$AVX"; fi
  echo "=== phase=$phase backend=$backend rep=$rep case=$name calc=$calc target=$target count_threads=$COUNT_THREADS replay_threads=$replay sb=$SB ===" | tee -a "$LOG"
  /usr/bin/time -f 'external_wall_s=%e' "$exe" "$calc" "$target" "$COUNT_THREADS" "$SB" "$replay" 2>&1 | tee -a "$LOG"
  sleep "$COOLDOWN"
}

echo "### replay-thread-sweep (AVX2; isolated cold runs)" | tee -a "$LOG"
for row in 'same-end 2461290 2464579' 'far-past-3576y 2461290 -12829630'; do
  read -r name calc target <<<"$row"
  for replay in 1 2 4 2 1; do
    run_one avx2 "$name" "$calc" "$target" "$replay" 0 sweep
  done
done

echo "### interleaved A/B (count=4, replay=2)" | tee -a "$LOG"
for ((rep=1;rep<=REPS;rep++)); do
  for row in "${CASES[@]}"; do
    read -r name calc target <<<"$row"
    if (( rep % 2 == 1 )); then
      run_one scalar "$name" "$calc" "$target" 2 "$rep" ab
      run_one avx2  "$name" "$calc" "$target" 2 "$rep" ab
    else
      run_one avx2  "$name" "$calc" "$target" 2 "$rep" ab
      run_one scalar "$name" "$calc" "$target" 2 "$rep" ab
    fi
  done
done

echo "Log: $LOG"
