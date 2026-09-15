#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' |
  "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_opt07"
"$CXX" "${COMMON[@]}" "$ROOT/src/opt07_transition_research.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/opt07_transition_research"
echo "Built $ROOT/build/opt07_transition_research"
