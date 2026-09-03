#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
DATA="$ROOT/data/gates_u16.bin"
[[ -f "$DATA" ]] || { echo "missing $DATA" >&2; exit 2; }
ln -sf ../data/gates_u16.bin "$BUILD/gates_u16.bin"
cd "$BUILD"
THREADS="${THREADS:-4}"
SB="${SB:-512}"
REPLAY_THREADS="${REPLAY_THREADS:-2}"

./replay_cache_top2_selftest "$THREADS" 1 > "$ROOT/results/replay-cache-top2-selftest.csv" 2> "$ROOT/results/replay-cache-top2-selftest.log"
./replay_cache_all_selftest "$THREADS" 1 > "$ROOT/results/replay-cache-all-selftest.csv" 2> "$ROOT/results/replay-cache-all-selftest.log"
grep -q '^mid,512,1,' "$ROOT/results/replay-cache-top2-selftest.csv"
grep -q '^rnd1,512,1,' "$ROOT/results/replay-cache-top2-selftest.csv"
grep -q '^mid,512,1,' "$ROOT/results/replay-cache-all-selftest.csv"
grep -q '^rnd1,512,1,' "$ROOT/results/replay-cache-all-selftest.csv"
grep -q 'count_validation bad=0 rec_eq=1' "$ROOT/results/replay-cache-top2-selftest.log"
grep -q 'count_validation bad=0 rec_eq=1' "$ROOT/results/replay-cache-all-selftest.log"

cases=(2461247 2461290 2462913 2464579 -12829630 6788193)
: > "$ROOT/results/replay-cache-vector-check.txt"
for t in "${cases[@]}"; do
  b=$(./replay_cache_base 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -1)
  x=$(./replay_cache_top2 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -1)
  y=$(./replay_cache_all 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -1)
  [[ "$b" == "$x" ]] || { echo "top2 mismatch target=$t" >&2; exit 1; }
  [[ "$b" == "$y" ]] || { echo "all mismatch target=$t" >&2; exit 1; }
  echo "target=$t top2=YES all=YES" | tee -a "$ROOT/results/replay-cache-vector-check.txt"
done
echo "Replay-cache exact validation: PASS" | tee -a "$ROOT/results/replay-cache-vector-check.txt"
