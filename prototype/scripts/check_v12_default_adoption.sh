#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-g++}"
mkdir -p "$ROOT/build" "$ROOT/results"

# The historical filename is intentionally retained so every existing entry point
# switches atomically without changing public/source paths.
grep -q '#include "sauce_fast127_v12.hpp"' "$ROOT/src/year_fast_bench_v3.cpp"
grep -q '#include "sauce_fast127_v3.hpp"' "$ROOT/src/year_fast_bench_v3_reference.cpp"
for f in \
  pastafarian_cold_bench.cpp \
  pastafarian_cold_bench_avx2.cpp \
  pastafarian_cold_bench_avx2_split.cpp \
  pastafarian_cold_bench_portable.cpp \
  pastafarian_cold_bench_portable_split.cpp; do
  grep -q '#include "year_fast_bench_v3.cpp"' "$ROOT/src/$f"
done

grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 unavailable" >&2; exit 3; }
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_default_avx2"
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split_v12.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_explicit_v12"
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split_v3_reference.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_reference_v3"

A="$ROOT/build/seer_default_avx2"
B="$ROOT/build/seer_explicit_v12"
R="$ROOT/build/seer_reference_v3"
LOG="$ROOT/results/v12-default-adoption.txt"
: > "$LOG"
cd "$ROOT/data"
for target in 2461247 2461290 2462913 2464579 -12829630 6788193; do
  a="$($A 2461290 "$target" 4 512 2 | head -1)"
  b="$($B 2461290 "$target" 4 512 2 | head -1)"
  r="$($R 2461290 "$target" 4 512 2 | head -1)"
  [[ "$a" == "$b" ]] || { echo "FAIL default!=explicit-v12 target=$target" | tee -a "$LOG"; exit 4; }
  [[ "$a" == "$r" ]] || { echo "FAIL default semantic!=v3-reference target=$target" | tee -a "$LOG"; exit 5; }
  printf 'target=%s default_v12=YES v3_semantic=YES\n' "$target" | tee -a "$LOG"
done

echo "v12 default adoption: PASS" | tee -a "$LOG"
