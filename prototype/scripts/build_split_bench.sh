#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_split"
grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 unavailable" >&2; exit 3; }

"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_portable_split.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/pastafarian_cold_bench_portable_split"
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/pastafarian_cold_bench_avx2_split"
echo "Built split-thread scalar and AVX2 binaries."
