#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_year_locator"
"$CXX" "${COMMON[@]}" "$ROOT/src/seer_year_locator.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_year_locator"
echo "Built $ROOT/build/seer_year_locator"
