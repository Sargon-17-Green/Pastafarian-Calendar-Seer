#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
mkdir -p "$ROOT/research/seer-next/build"
CXX="${CXX:-g++}"
BACKEND="${SEER_RNS_BACKEND:-avx2}"
MARCH="${SEER_MARCH:-x86-64}"
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread -I"$ROOT/prototype/src")
if [[ "$MARCH" != "none" && -n "$MARCH" ]]; then COMMON+=("-march=$MARCH"); fi
LINK=(-lgmp)
if [[ -n "${SEER_GMP_PREFIX:-}" ]]; then
  COMMON+=("-I$SEER_GMP_PREFIX/include")
  LINK=("-L$SEER_GMP_PREFIX/lib" -lgmp)
fi
case "$BACKEND" in
  portable)
    COMMON+=(-DSEER_USE_PORTABLE_RNS=1)
    WEAVE="$ROOT/prototype/src/seer_weave_portable.cpp"
    ;;
  avx2)
    [[ "$(uname -m)" == x86_64 ]] || { echo "AVX2 requires x86-64" >&2; exit 2; }
    COMMON+=(-mavx2)
    WEAVE="$ROOT/prototype/src/seer_weave_avx2.cpp"
    ;;
  *)
    echo "SEER_RNS_BACKEND must be avx2 or portable" >&2
    exit 2
    ;;
esac
"$CXX" "${COMMON[@]}"   "$ROOT/prototype/src/seer_year_core.cpp"   "$ROOT/prototype/src/seer_calendar_core.cpp" "$WEAVE"   "$ROOT/research/seer-next/src/seer_next_engine_service.cpp"   "${LINK[@]}" -o "$ROOT/research/seer-next/build/seer_next_engine_service"
echo "Built isolated Seer Next candidate ($BACKEND / $MARCH)"
