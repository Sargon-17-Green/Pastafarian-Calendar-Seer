#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SRC="$ROOT/src"; BUILD="$ROOT/build"
RESEARCH_SRC="$ROOT/../research/benchmarks/src"
mkdir -p "$BUILD" "$ROOT/results"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_AVX2_CXXFLAGS:--march=native}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$SRC" -I"$RESEARCH_SRC")
BASE="$SRC/pastafarian_cold_bench_avx2_split.cpp"
REF="$BUILD/pastafarian_cold_bench_avx2_split_reference.cpp"
EXP="$BUILD/pastafarian_cold_bench_avx2_split_explicit_adaptive.cpp"
python3 - "$BASE" "$REF" "$EXP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text(); needle='#include "rns_micro8_avx2_32x8.cpp"'
if s.count(needle)!=1: raise SystemExit('default AVX2 include not found exactly once')
Path(sys.argv[2]).write_text(s.replace(needle,'#include "rns_micro8_avx2_32x8_reference.cpp"'))
Path(sys.argv[3]).write_text(s.replace(needle,'#include "rns_micro8_avx2_32x8_pascal_adaptive.cpp"'))
PY
"$CXX" "${COMMON[@]}" "$BASE" -lgmpxx -lgmp -o "$BUILD/pascal_adopt_default"
"$CXX" "${COMMON[@]}" "$REF" -lgmpxx -lgmp -o "$BUILD/pascal_adopt_reference"
"$CXX" "${COMMON[@]}" "$EXP" -lgmpxx -lgmp -o "$BUILD/pascal_adopt_explicit"
ln -sf ../data/gates_u16.bin "$BUILD/gates_u16.bin"
THREADS="${COUNT_THREADS:-4}"; REPLAY_THREADS="${REPLAY_THREADS:-2}"; SB="${SB:-512}"
LOG="$ROOT/results/pascal-adaptive-default-adoption.txt"
: > "$LOG"
for exe in pascal_adopt_default pascal_adopt_explicit pascal_adopt_reference; do
  echo "=== canonical vectors: $exe ===" | tee -a "$LOG"
  bash "$ROOT/scripts/check_canonical_vectors.sh" "$BUILD/$exe" "$THREADS" "$SB" "$REPLAY_THREADS" | tee -a "$LOG"
done
echo "Adaptive Pascal-ladder default adoption: PASS against independent saved-sum vectors" | tee -a "$LOG"
