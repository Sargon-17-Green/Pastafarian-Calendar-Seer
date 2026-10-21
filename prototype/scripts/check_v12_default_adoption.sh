#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESEARCH_SRC="$ROOT/../research/benchmarks/src"
CXX="${CXX:-g++}"
mkdir -p "$ROOT/build" "$ROOT/results"

grep -q '#include "sauce_fast127_v12.hpp"' "$ROOT/src/year_fast_bench_v3.cpp"
grep -q '#include "sauce_fast127_v3.hpp"' "$RESEARCH_SRC/year_fast_bench_v3_reference.cpp"
for f in \
  pastafarian_cold_bench.cpp \
  pastafarian_cold_bench_avx2.cpp \
  pastafarian_cold_bench_avx2_split.cpp \
  pastafarian_cold_bench_portable.cpp \
  pastafarian_cold_bench_portable_split.cpp; do
  grep -q '#include "year_fast_bench_v12.cpp"' "$ROOT/src/$f"
done

bash "$ROOT/scripts/check_saved_sum_conformance.sh"

grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 unavailable" >&2; exit 3; }
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src" -I"$RESEARCH_SRC")
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_default_avx2"
"$CXX" "${COMMON[@]}" "$RESEARCH_SRC/pastafarian_cold_bench_avx2_split_v12.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_explicit_v12"
"$CXX" "${COMMON[@]}" "$RESEARCH_SRC/pastafarian_cold_bench_avx2_split_v3_reference.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_reference_v3"

LOG="$ROOT/results/v12-default-adoption.txt"
: > "$LOG"
for exe in seer_default_avx2 seer_explicit_v12 seer_reference_v3; do
  echo "=== canonical vectors: $exe ===" | tee -a "$LOG"
  bash "$ROOT/scripts/check_canonical_vectors.sh" "$ROOT/build/$exe" 4 512 2 | tee -a "$LOG"
done

echo "v12 default adoption: PASS against independent saved-sum vectors" | tee -a "$LOG"
