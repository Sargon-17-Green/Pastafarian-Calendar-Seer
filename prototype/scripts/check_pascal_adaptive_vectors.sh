#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BUILD="$ROOT/build"
THREADS="${COUNT_THREADS:-4}"; REPLAY_THREADS="${REPLAY_THREADS:-2}"; SB="${SB:-512}"
for exe in pascal_adaptive_base pascal_adaptive_candidate; do
  bash "$ROOT/scripts/check_canonical_vectors.sh" "$BUILD/$exe" "$THREADS" "$SB" "$REPLAY_THREADS"
done
echo "Adaptive Pascal-ladder canonical saved-sum validation: PASS"
