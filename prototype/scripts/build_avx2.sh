#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_AVX2_CXXFLAGS:--march=native}"

if [[ -r /proc/cpuinfo ]] && ! grep -qm1 -w avx2 /proc/cpuinfo; then
  echo "AVX2 is not exposed by this CPU/VM; refusing to run the AVX2 candidate." >&2
  exit 3
fi

printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_avx2"

COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$ROOT/src")
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/pastafarian_cold_bench_avx2"
"$CXX" "${COMMON[@]}" "$ROOT/src/rns_micro8_avx2_32x8.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/rns_micro8_avx2_32x8_selftest"
echo "Built AVX2 candidate."
