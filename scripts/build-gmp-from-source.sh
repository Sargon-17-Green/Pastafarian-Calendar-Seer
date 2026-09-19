#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
ARCHIVE="${2:-}"
WORK_ROOT="${3:-}"
PREFIX="${4:-}"
EXPECTED_SHA="a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898"

case "$TARGET" in
  linux-x64|linux-arm64|win32-x64) ;;
  *) echo "usage: $0 <linux-x64|linux-arm64|win32-x64> <gmp.tar.xz> <work-root> <prefix>" >&2; exit 2 ;;
esac
[[ -f "$ARCHIVE" ]] || { echo "GMP source archive not found: $ARCHIVE" >&2; exit 2; }
[[ -n "$WORK_ROOT" && -n "$PREFIX" ]] || { echo "work-root and prefix are required" >&2; exit 2; }
ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || {
  echo "GMP source SHA-256 mismatch: $ACTUAL_SHA" >&2
  exit 1
}

SRC="$WORK_ROOT/gmp-6.3.0"
rm -rf "$WORK_ROOT" "$PREFIX"
mkdir -p "$WORK_ROOT" "$PREFIX"
tar -xf "$ARCHIVE" -C "$WORK_ROOT"
[[ -x "$SRC/configure" ]] || { echo "GMP source extraction is incomplete" >&2; exit 1; }
cd "$SRC"

CONFIGURE_ARGS=(--prefix="$PREFIX" --disable-static --enable-shared --enable-cxx)
export CFLAGS="${CFLAGS:--O2 -std=gnu17}"
export CXXFLAGS="${CXXFLAGS:--O2}"
case "$TARGET" in
  win32-x64)
    export ABI=64
    export CC=/ucrt64/bin/gcc
    export CXX=/ucrt64/bin/g++
    CONFIGURE_ARGS+=(--host=x86_64-w64-mingw32)
    ;;
  linux-x64)
    [[ "$(uname -m)" == x86_64 || "$(uname -m)" == amd64 ]] || {
      echo "linux-x64 GMP build requires native x86_64" >&2; exit 2;
    }
    CONFIGURE_ARGS+=(--build=x86_64-pc-linux-gnu --host=x86_64-pc-linux-gnu)
    export SEER_GMP_CPU_BASELINE=x86_64-generic
    ;;
  linux-arm64)
    [[ "$(uname -m)" == aarch64 || "$(uname -m)" == arm64 ]] || {
      echo "linux-arm64 GMP build requires native arm64" >&2; exit 2;
    }
    CONFIGURE_ARGS+=(--build=aarch64-unknown-linux-gnu --host=aarch64-unknown-linux-gnu)
    export SEER_GMP_CPU_BASELINE=aarch64-generic
    ;;
esac

./configure "${CONFIGURE_ARGS[@]}"
make -j"${SEER_GMP_BUILD_JOBS:-2}"
if [[ "$TARGET" == win32-x64 ]]; then
  PATH="$SRC/.libs:$PATH" make check
else
  make check
fi
make install
test -f "$PREFIX/include/gmp.h"
if [[ "$TARGET" == win32-x64 ]]; then
  compgen -G "$PREFIX/bin/libgmp-*.dll" >/dev/null || {
    echo "source-built GMP DLL not installed under $PREFIX/bin" >&2; exit 1;
  }
else
  compgen -G "$PREFIX/lib/libgmp.so*" >/dev/null || {
    echo "source-built GMP shared object not installed under $PREFIX/lib" >&2; exit 1;
  }
fi

printf 'GMP_SOURCE_BUILD_OK target=%s sha256=%s prefix=%s\n' "$TARGET" "$ACTUAL_SHA" "$PREFIX"
