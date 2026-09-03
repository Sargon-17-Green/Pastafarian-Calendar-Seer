#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/prototype/src"
BUILD="$ROOT/prototype/build"
mkdir -p "$BUILD"
CXX=${CXX:-g++}
FLAGS=(-O3 -std=c++20 -march=x86-64-v3 -fopenmp -I"$SRC")
LIBS=(-lgmpxx -lgmp -pthread)
# Baseline = current adopted default at this commit.
"$CXX" "${FLAGS[@]}" "$SRC/pastafarian_cold_bench_avx2_split.cpp" "${LIBS[@]}" -o "$BUILD/fracdouble_base"
# Candidate wrapper differs only in the RNS include.
sed 's/#include "rns_micro8_avx2_32x8.cpp"/#include "rns_micro8_avx2_32x8_fracdouble.cpp"/' \
  "$SRC/pastafarian_cold_bench_avx2_split.cpp" > "$BUILD/pastafarian_cold_bench_avx2_split_fracdouble.cpp"
"$CXX" "${FLAGS[@]}" "$BUILD/pastafarian_cold_bench_avx2_split_fracdouble.cpp" "${LIBS[@]}" -o "$BUILD/fracdouble_candidate"
# Heavy diagnostic selftest; compile-time counters do not affect timed candidate.
"$CXX" "${FLAGS[@]}" -DFRACDOUBLE_DIAGNOSTIC "$SRC/rns_micro8_avx2_32x8_fracdouble.cpp" "${LIBS[@]}" -o "$BUILD/fracdouble_selftest"
ln -sf ../data/gates_u16.bin "$BUILD/gates_u16.bin"
echo "Built fracdouble baseline/candidate and diagnostic selftest."
