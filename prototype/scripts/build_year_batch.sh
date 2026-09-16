#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -march=native -I"$ROOT/src")
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_year_batch"
BACKEND="${SEER_RNS_BACKEND:-auto}"
if [[ "$BACKEND" == auto ]]; then
  if [[ -r /proc/cpuinfo ]] && grep -qm1 -w avx2 /proc/cpuinfo; then BACKEND=avx2; else BACKEND=portable; fi
elif [[ "$BACKEND" == avx2 ]]; then
  [[ -r /proc/cpuinfo ]] && grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 requested but unavailable." >&2; exit 3; }
elif [[ "$BACKEND" != portable ]]; then
  echo "SEER_RNS_BACKEND must be auto, avx2, or portable." >&2; exit 2
fi
BACKEND_FLAGS=()
[[ "$BACKEND" == portable ]] && BACKEND_FLAGS=(-DSEER_USE_PORTABLE_RNS=1)
"$CXX" "${COMMON[@]}" "${BACKEND_FLAGS[@]}" "$ROOT/src/pastafarian_year_batch.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_year_batch"
echo "Built $ROOT/build/seer_year_batch (RNS backend: $BACKEND)"
