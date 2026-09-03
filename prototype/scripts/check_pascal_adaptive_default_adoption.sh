#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SRC="$ROOT/src"; BUILD="$ROOT/build"
mkdir -p "$BUILD" "$ROOT/results"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_AVX2_CXXFLAGS:--march=native}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$SRC")
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
: > "$ROOT/results/pascal-adaptive-default-adoption.txt"
(
 cd "$BUILD"
 for t in 2461247 2461290 2462913 2464579 -12829630 6788193; do
   d=$(./pascal_adopt_default 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -n1)
   e=$(./pascal_adopt_explicit 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -n1)
   r=$(./pascal_adopt_reference 2461290 "$t" "$THREADS" "$SB" "$REPLAY_THREADS" | head -n1)
   [[ "$d" == "$e" ]] || { echo "target=$t default_explicit=NO"; exit 1; }
   [[ "$d" == "$r" ]] || { echo "target=$t semantic_reference=NO"; exit 1; }
   echo "target=$t default_explicit=YES semantic_reference=YES"
 done
) | tee "$ROOT/results/pascal-adaptive-default-adoption.txt"
echo "Adaptive Pascal-ladder default adoption: PASS" | tee -a "$ROOT/results/pascal-adaptive-default-adoption.txt"
