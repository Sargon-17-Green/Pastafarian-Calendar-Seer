#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/build"
CXX="${CXX:-g++}"
HOST_ARCH="$(uname -m)"
REQUESTED_ARCH="${SEER_ARCH:-auto}"
case "$REQUESTED_ARCH" in
  auto)
    case "$HOST_ARCH" in
      x86_64|amd64) EFFECTIVE_ARCH=amd64 ;;
      aarch64|arm64) EFFECTIVE_ARCH=arm64 ;;
      *) echo "Unsupported native architecture: $HOST_ARCH" >&2; exit 2 ;;
    esac
    MARCH="${SEER_MARCH:-native}"
    ;;
  amd64|x86_64|x64)
    EFFECTIVE_ARCH=amd64
    [[ "$HOST_ARCH" == x86_64 || "$HOST_ARCH" == amd64 ]] || { echo "SEER_ARCH=amd64 cannot build natively on $HOST_ARCH." >&2; exit 2; }
    MARCH="${SEER_MARCH:-x86-64}"
    ;;
  arm64|aarch64)
    EFFECTIVE_ARCH=arm64
    [[ "$HOST_ARCH" == aarch64 || "$HOST_ARCH" == arm64 ]] || { echo "SEER_ARCH=arm64 cannot build natively on $HOST_ARCH." >&2; exit 2; }
    MARCH="${SEER_MARCH:-armv8-a}"
    ;;
  *)
    echo "SEER_ARCH must be auto, amd64, or arm64." >&2
    exit 2
    ;;
esac
COMMON=(-O3 -DNDEBUG -std=c++20 -fopenmp -pthread)
if [[ -n "$MARCH" && "$MARCH" != "none" ]]; then COMMON+=("-march=$MARCH"); fi
COMMON+=(-I"$ROOT/src")
GMP_LINK_FLAGS=()
if [[ -n "${SEER_GMP_PREFIX:-}" ]]; then
  [[ -f "$SEER_GMP_PREFIX/include/gmp.h" ]] || { echo "SEER_GMP_PREFIX is missing include/gmp.h: $SEER_GMP_PREFIX" >&2; exit 2; }
  COMMON+=("-I$SEER_GMP_PREFIX/include")
  GMP_LINK_FLAGS+=("-L$SEER_GMP_PREFIX/lib")
fi
RUNTIME_LINK_FLAGS=()
if [[ "${SEER_STATIC_GNU_RUNTIME:-0}" == 1 ]]; then
  RUNTIME_LINK_FLAGS=(-static-libgcc -static-libstdc++ -Wl,--as-needed -Wl,-Bstatic -lgomp -Wl,-Bdynamic)
fi
if [[ "${SEER_ORIGIN_RPATH:-0}" == 1 ]]; then
  RUNTIME_LINK_FLAGS+=('-Wl,-rpath,$ORIGIN')
fi
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 "${COMMON[@]}" -x c++ - "${GMP_LINK_FLAGS[@]}" -lgmp -o "$ROOT/build/deps_probe_year_structure"
BACKEND="${SEER_RNS_BACKEND:-auto}"
if [[ "$EFFECTIVE_ARCH" == arm64 ]]; then
  if [[ "$BACKEND" == auto ]]; then
    BACKEND=portable
  elif [[ "$BACKEND" == avx2 ]]; then
    echo "AVX2 backend is x86-only; use SEER_RNS_BACKEND=portable on ARM64." >&2
    exit 3
  elif [[ "$BACKEND" != portable ]]; then
    echo "SEER_RNS_BACKEND must be auto, avx2, or portable." >&2
    exit 2
  fi
else
  if [[ "$BACKEND" == auto ]]; then
    if [[ -r /proc/cpuinfo ]] && grep -qm1 -w avx2 /proc/cpuinfo; then BACKEND=avx2; else BACKEND=portable; fi
  elif [[ "$BACKEND" == avx2 ]]; then
    [[ -r /proc/cpuinfo ]] && grep -qm1 -w avx2 /proc/cpuinfo || { echo "AVX2 requested but unavailable." >&2; exit 3; }
  elif [[ "$BACKEND" != portable ]]; then
    echo "SEER_RNS_BACKEND must be auto, avx2, or portable." >&2
    exit 2
  fi
fi
BACKEND_FLAGS=()
if [[ "$BACKEND" == portable ]]; then
  BACKEND_FLAGS=(-DSEER_USE_PORTABLE_RNS=1)
  WEAVE_SOURCE="$ROOT/src/seer_weave_portable.cpp"
else
  BACKEND_FLAGS=(-mavx2)
  WEAVE_SOURCE="$ROOT/src/seer_weave_avx2.cpp"
fi
"$CXX" "${COMMON[@]}" "${BACKEND_FLAGS[@]}" \
  "$ROOT/src/seer_year_core.cpp" "$ROOT/src/seer_calendar_core.cpp" "$WEAVE_SOURCE" \
  "$ROOT/src/seer_year_structure.cpp" "${RUNTIME_LINK_FLAGS[@]}" "${GMP_LINK_FLAGS[@]}" \
  -lgmp -o "$ROOT/build/seer_year_structure"
echo "Built $ROOT/build/seer_year_structure (arch: $EFFECTIVE_ARCH; RNS backend: $BACKEND; march: $MARCH)"
