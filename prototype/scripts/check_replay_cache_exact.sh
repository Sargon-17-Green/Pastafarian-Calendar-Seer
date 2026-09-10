#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
DATA="$ROOT/data/gates_u16.bin"
[[ -f "$DATA" ]] || { echo "missing $DATA" >&2; exit 2; }
ln -sf ../data/gates_u16.bin "$BUILD/gates_u16.bin"
THREADS="${THREADS:-4}"
SB="${SB:-512}"
REPLAY_THREADS="${REPLAY_THREADS:-2}"
mkdir -p "$ROOT/results"
(
  cd "$BUILD"
  ./replay_cache_top2_selftest "$THREADS" 1 > "$ROOT/results/replay-cache-top2-selftest.csv" 2> "$ROOT/results/replay-cache-top2-selftest.log"
  ./replay_cache_all_selftest "$THREADS" 1 > "$ROOT/results/replay-cache-all-selftest.csv" 2> "$ROOT/results/replay-cache-all-selftest.log"
)
grep -q '^mid,512,1,' "$ROOT/results/replay-cache-top2-selftest.csv"
grep -q '^rnd1,512,1,' "$ROOT/results/replay-cache-top2-selftest.csv"
grep -q '^mid,512,1,' "$ROOT/results/replay-cache-all-selftest.csv"
grep -q '^rnd1,512,1,' "$ROOT/results/replay-cache-all-selftest.csv"
grep -q 'count_validation bad=0 rec_eq=1' "$ROOT/results/replay-cache-top2-selftest.log"
grep -q 'count_validation bad=0 rec_eq=1' "$ROOT/results/replay-cache-all-selftest.log"
for exe in replay_cache_base replay_cache_top2 replay_cache_all; do
  bash "$ROOT/scripts/check_canonical_vectors.sh" "$BUILD/$exe" "$THREADS" "$SB" "$REPLAY_THREADS"
done
echo "Replay-cache exact + canonical saved-sum validation: PASS"
