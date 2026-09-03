#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
"$CXX" -O2 -std=c++20 "$ROOT/tools/cpu_probe.cpp" -o "$ROOT/build/cpu_probe"
"$ROOT/build/cpu_probe"
echo 'Checking GMP/GMPXX and Boost headers...'
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe"
"$CXX" -O3 -DNDEBUG -std=c++20 -fopenmp -pthread \
  -mavx512f -mavx512dq -mavx512bw -mavx512vl -mavx512ifma -mbmi2 -madx \
  -I"$ROOT/src" "$ROOT/src/pastafarian_cold_bench.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/pastafarian_cold_bench"
echo "Built: $ROOT/build/pastafarian_cold_bench"
