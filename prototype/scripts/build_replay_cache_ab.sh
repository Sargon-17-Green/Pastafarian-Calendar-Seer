#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
BUILD="$ROOT/build"
mkdir -p "$BUILD" "$ROOT/results"
CXX="${CXX:-g++}"
read -r -a ARCH_FLAGS <<< "${SEER_AVX2_CXXFLAGS:--march=native}"

if [[ -r /proc/cpuinfo ]] && ! grep -qm1 -w avx2 /proc/cpuinfo; then
  echo "AVX2 unavailable" >&2
  exit 3
fi

printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$BUILD/deps_probe_replay_cache"

COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread "${ARCH_FLAGS[@]}" -I"$SRC")
BASE="$SRC/pastafarian_cold_bench_avx2_split.cpp"
TOP2_GEN="$BUILD/pastafarian_cold_bench_avx2_split_replay_top2.cpp"
ALL_GEN="$BUILD/pastafarian_cold_bench_avx2_split_replay_all.cpp"
python3 - "$BASE" "$TOP2_GEN" "$ALL_GEN" <<'PY'
from pathlib import Path
import sys
base=Path(sys.argv[1]).read_text()
needle='#include "rns_micro8_avx2_32x8.cpp"'
if base.count(needle)!=1:
    raise SystemExit(f'expected exactly one baseline RNS include, found {base.count(needle)}')
Path(sys.argv[2]).write_text(base.replace(needle,'#include "rns_micro8_avx2_32x8_replay_top2.cpp"'))
Path(sys.argv[3]).write_text(base.replace(needle,'#include "rns_micro8_avx2_32x8_replay_all.cpp"'))
PY

"$CXX" "${COMMON[@]}" "$BASE" -lgmpxx -lgmp -o "$BUILD/replay_cache_base"
"$CXX" "${COMMON[@]}" "$TOP2_GEN" -lgmpxx -lgmp -o "$BUILD/replay_cache_top2"
"$CXX" "${COMMON[@]}" "$ALL_GEN" -lgmpxx -lgmp -o "$BUILD/replay_cache_all"
"$CXX" "${COMMON[@]}" "$SRC/rns_micro8_avx2_32x8_replay_top2.cpp" -lgmpxx -lgmp -o "$BUILD/replay_cache_top2_selftest"
"$CXX" "${COMMON[@]}" "$SRC/rns_micro8_avx2_32x8_replay_all.cpp" -lgmpxx -lgmp -o "$BUILD/replay_cache_all_selftest"

echo "Built replay-cache baseline/top2/all candidates."
