#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_month_count"
grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 unavailable; current production-equivalent source includes the AVX2 backend." >&2; exit 3; }
"$CXX" "${COMMON[@]}" "$ROOT/src/month_count_table_verify.cpp" -lgmpxx -lgmp -o "$ROOT/build/month_count_table_verify"
"$CXX" "${COMMON[@]}" "$ROOT/src/month_count_table_bench.cpp" -lgmpxx -lgmp -o "$ROOT/build/month_count_table_bench"
echo "Built month-count verification and benchmark tools"
