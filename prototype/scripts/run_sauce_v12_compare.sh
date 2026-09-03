#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPS="${1:-3}"
COUNT_THREADS="${COUNT_THREADS:-4}"
REPLAY_THREADS="${REPLAY_THREADS:-2}"
SB="${SB:-512}"
COOLDOWN="${COOLDOWN:-2}"
A="$ROOT/build/seer_avx2_v3_split"
B="$ROOT/build/seer_avx2_v12_split"
[[ -x "$A" && -x "$B" ]] || bash "$ROOT/scripts/build_sauce_v12.sh"
mkdir -p "$ROOT/results"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$ROOT/results/sauce-v12-ab-$STAMP.log"
cd "$ROOT/data"
CASES=(
  'same-query 2461290 2461290'
  'same-end 2461290 2464579'
  'far-past-3576y 2461290 -12829630'
  'forward-1002y 2461290 6788193'
)
run_one(){ local backend="$1" name="$2" calc="$3" target="$4" rep="$5" exe; [[ "$backend" == v3 ]] && exe="$A" || exe="$B"; echo "=== backend=$backend rep=$rep case=$name calc=$calc target=$target count_threads=$COUNT_THREADS replay_threads=$REPLAY_THREADS sb=$SB ===" | tee -a "$LOG"; /usr/bin/time -f 'external_wall_s=%e' "$exe" "$calc" "$target" "$COUNT_THREADS" "$SB" "$REPLAY_THREADS" 2>&1 | tee -a "$LOG"; sleep "$COOLDOWN"; }
for ((rep=1;rep<=REPS;rep++)); do
  for row in "${CASES[@]}"; do read -r name calc target <<<"$row"; if ((rep%2)); then run_one v3 "$name" "$calc" "$target" "$rep"; run_one v12 "$name" "$calc" "$target" "$rep"; else run_one v12 "$name" "$calc" "$target" "$rep"; run_one v3 "$name" "$calc" "$target" "$rep"; fi; done
done
echo "Log: $LOG"
