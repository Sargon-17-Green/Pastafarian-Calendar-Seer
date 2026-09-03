#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build" "$ROOT/results"
CXX="${CXX:-g++}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_sauce_v12"
grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 unavailable" >&2; exit 3; }
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_avx2_v3_split"
"$CXX" "${COMMON[@]}" "$ROOT/src/pastafarian_cold_bench_avx2_split_v12.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_avx2_v12_split"
"$CXX" -O3 -DNDEBUG -std=c++20 -march=native -I"$ROOT/src" -DSAUCE_HEADER='"sauce_fast127_v3.hpp"' "$ROOT/tools/sauce_equivalence_dump.cpp" -o "$ROOT/build/sauce_dump_v3"
"$CXX" -O3 -DNDEBUG -std=c++20 -march=native -I"$ROOT/src" -DSAUCE_HEADER='"sauce_fast127_v12.hpp"' "$ROOT/tools/sauce_equivalence_dump.cpp" -o "$ROOT/build/sauce_dump_v12"
"$CXX" -O3 -DNDEBUG -std=c++20 -march=native -I"$ROOT/src" "$ROOT/tools/gate_validate_v12.cpp" -o "$ROOT/build/gate_validate_v12"
echo "Built Sauce v3/v12 A/B binaries and validators."
