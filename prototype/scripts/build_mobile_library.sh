#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-host}"
OUT="${2:-$ROOT/build/mobile/$TARGET}"
mkdir -p "$OUT/include" "$OUT/data"
cp "$ROOT/include/seer_mobile.h" "$OUT/include/"
cp "$ROOT/data/gates_100k_u16.bin" "$ROOT/data/gates_negative_100k_u16.bin" "$OUT/data/"

SOURCES=(
  "$ROOT/src/seer_year_core.cpp"
  "$ROOT/src/seer_calendar_core.cpp"
  "$ROOT/src/seer_weave_portable.cpp"
  "$ROOT/src/seer_mobile.cpp"
)
COMMON=(
  -O2 -DNDEBUG -std=c++20 -fvisibility=hidden
  -DSEER_MOBILE_CPPINT=1 -DSEER_NO_OPENMP=1
  "-DSEER_BUILD_COMMIT=\"${SEER_BUILD_COMMIT:-unknown}\""
  "-DSEER_PACKAGE_VERSION=\"${SEER_PACKAGE_VERSION:-0.2.3}\""
  -I"$ROOT/include" -I"$ROOT/src"
)
if [[ -n "${BOOST_ROOT:-}" ]]; then COMMON+=("-I$BOOST_ROOT/include"); fi

build_static() {
  local cxx="$1" ar="$2"; shift 2
  local extra=("$@") objects=()
  local src obj
  for src in "${SOURCES[@]}"; do
    obj="$OUT/$(basename "${src%.cpp}").o"
    "$cxx" "${COMMON[@]}" "${extra[@]}" -c "$src" -o "$obj"
    objects+=("$obj")
  done
  "$ar" rcs "$OUT/libseer_mobile.a" "${objects[@]}"
}

case "$TARGET" in
  host)
    CXX="${CXX:-c++}"
    AR="${AR:-ar}"
    build_static "$CXX" "$AR" -pthread -fPIC
    ;;
  ios-arm64)
    SDK=iphoneos
    CXX="$(xcrun --sdk "$SDK" --find clang++)"
    AR="$(xcrun --sdk "$SDK" --find ar)"
    SYSROOT="$(xcrun --sdk "$SDK" --show-sdk-path)"
    build_static "$CXX" "$AR" -arch arm64 -isysroot "$SYSROOT" -miphoneos-version-min=17.0
    ;;
  ios-simulator-arm64)
    SDK=iphonesimulator
    CXX="$(xcrun --sdk "$SDK" --find clang++)"
    AR="$(xcrun --sdk "$SDK" --find ar)"
    SYSROOT="$(xcrun --sdk "$SDK" --show-sdk-path)"
    build_static "$CXX" "$AR" -arch arm64 -isysroot "$SYSROOT" -mios-simulator-version-min=17.0
    ;;
  android-arm64|android-x86_64)
    : "${ANDROID_NDK_HOME:?ANDROID_NDK_HOME is required}"
    HOST_TAG=linux-x86_64
    TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/bin"
    API="${ANDROID_API:-26}"
    if [[ "$TARGET" == android-arm64 ]]; then
      TRIPLE=aarch64-linux-android
    else
      TRIPLE=x86_64-linux-android
    fi
    CXX="$TOOLCHAIN/${TRIPLE}${API}-clang++"
    "$CXX" "${COMMON[@]}" -fPIC -pthread -static-libstdc++ -shared "${SOURCES[@]}" -Wl,-soname,libseer_mobile.so -o "$OUT/libseer_mobile.so"
    ;;
  *)
    echo "unknown target: $TARGET" >&2
    exit 2
    ;;
esac

echo "SEER_MOBILE_BUILD_PASS target=$TARGET output=$OUT"
