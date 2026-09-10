#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXE="$ROOT/build/pastafarian_cold_bench_portable"
THREADS="${THREADS:-4}"
SB="${SB:-512}"
[[ -x "$EXE" ]] || bash "$ROOT/scripts/build_portable.sh"
bash "$ROOT/scripts/check_canonical_vectors.sh" "$EXE" "$THREADS" "$SB"
