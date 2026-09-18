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
printf '#include <gmpxx.h>\n#include <boost/multiprecision/cpp_int.hpp>\nint main(){}\n' \
  | "$CXX" -std=c++20 -x c++ - -lgmpxx -lgmp -o "$ROOT/build/deps_probe_year_locator"
"$CXX" "${COMMON[@]}" "$ROOT/src/seer_year_locator.cpp" -lgmpxx -lgmp -o "$ROOT/build/seer_year_locator"
echo "Built $ROOT/build/seer_year_locator (arch: $EFFECTIVE_ARCH; march: $MARCH)"
