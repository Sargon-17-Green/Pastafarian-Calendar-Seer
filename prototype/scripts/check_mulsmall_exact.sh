#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BUILD="$ROOT/build"
THREADS="${COUNT_THREADS:-4}"; REPLAY_THREADS="${REPLAY_THREADS:-2}"; SB="${SB:-512}"
(
  cd "$BUILD"
  ./mulsmall_exact
  for t in 2461247 2461290 2462913 2464579 -12829630 6788193; do
    a=$(./mulsmall_base 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -n1)
    b=$(./mulsmall_candidate 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -n1)
    if [[ "$a" != "$b" ]]; then echo "target=$t equal=NO"; echo "base: $a"; echo "cand: $b"; exit 1; fi
    echo "target=$t equal=YES"
  done
)
echo "AVX2 mul_small full-vector validation: PASS"
