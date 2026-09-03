#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_PORTABLE_CXXFLAGS:--march=native}"

echo 'Checking GMP/GMPXX and Boost headers...'
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_portable"

COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$ROOT/src")

"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_portable.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/pastafarian_cold_bench_portable"

"$CXX" "${COMMON[@]}" "$ROOT/src/rns_micro8_portable.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/rns_micro8_portable_selftest"

echo "Built: $ROOT/build/pastafarian_cold_bench_portable"
echo "Built: $ROOT/build/rns_micro8_portable_selftest"
