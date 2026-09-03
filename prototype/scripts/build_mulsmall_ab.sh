#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"; BUILD="$ROOT/build"
mkdir -p "$BUILD" "$ROOT/results"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_AVX2_CXXFLAGS:--march=native}"
if [[ -r /proc/cpuinfo ]] && ! grep -qm1 -w avx2 /proc/cpuinfo; then echo "AVX2 unavailable" >&2; exit 3; fi
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$SRC")
BASE="$SRC/pastafarian_cold_bench_avx2_split.cpp"
GEN="$BUILD/pastafarian_cold_bench_avx2_split_mulsmall.cpp"
python3 - "$BASE" "$GEN" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
needle='#include "rns_micro8_avx2_32x8.cpp"'
if s.count(needle)!=1: raise SystemExit(f'expected one baseline include, got {s.count(needle)}')
Path(sys.argv[2]).write_text(s.replace(needle,'#include "rns_micro8_avx2_32x8_mulsmall.cpp"'))
PY
"$CXX" "${COMMON[@]}" "$BASE" -lgmpxx -lgmp -o "$BUILD/mulsmall_base"
"$CXX" "${COMMON[@]}" "$GEN" -lgmpxx -lgmp -o "$BUILD/mulsmall_candidate"
"$CXX" "${COMMON[@]}" "$SRC/rns_micro8_avx2_32x8_mulsmall.cpp" -lgmpxx -lgmp -o "$BUILD/mulsmall_selftest"
"$CXX" "${COMMON[@]}" "$ROOT/tools/mulsmall_exact.cpp" -lgmpxx -lgmp -o "$BUILD/mulsmall_exact"
ln -sf ../data/gates_u16.bin "$BUILD/gates_u16.bin"
echo "Built AVX2 mul_small A/B binaries."
