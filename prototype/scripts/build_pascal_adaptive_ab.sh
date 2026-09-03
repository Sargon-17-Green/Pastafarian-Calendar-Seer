#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"; BUILD="$ROOT/build"
mkdir -p "$BUILD" "$ROOT/results"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_AVX2_CXXFLAGS:--march=native}"
if [[ -r /proc/cpuinfo ]] && ! grep -qm1 -w avx2 /proc/cpuinfo; then echo "AVX2 unavailable" >&2; exit 3; fi
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$SRC")
DEFAULT="$SRC/pastafarian_cold_bench_avx2_split.cpp"
REFGEN="$BUILD/pastafarian_cold_bench_avx2_split_pascal_reference.cpp"
python3 - "$DEFAULT" "$REFGEN" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
needle='#include "rns_micro8_avx2_32x8.cpp"'
if s.count(needle)!=1: raise SystemExit(f'expected one default include, got {s.count(needle)}')
Path(sys.argv[2]).write_text(s.replace(needle,'#include "rns_micro8_avx2_32x8_reference.cpp"'))
PY
"$CXX" "${COMMON[@]}" "$REFGEN" -lgmpxx -lgmp -o "$BUILD/pascal_adaptive_base"
"$CXX" "${COMMON[@]}" "$DEFAULT" -lgmpxx -lgmp -o "$BUILD/pascal_adaptive_candidate"
"$CXX" "${COMMON[@]}" "$SRC/rns_micro8_avx2_32x8.cpp" -lgmpxx -lgmp -o "$BUILD/pascal_adaptive_selftest"
ln -sf ../data/gates_u16.bin "$BUILD/gates_u16.bin"
echo "Built reference-vs-default adaptive Pascal-ladder A/B binaries."
