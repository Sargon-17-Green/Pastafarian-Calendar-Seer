#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
OUTPUT="${2:-}"
case "$TARGET" in
  linux-x64) ARCH=amd64; MARCH=x86-64; GMP_CPU_BASELINE=x86_64-generic ;;
  linux-arm64) ARCH=arm64; MARCH=armv8-a; GMP_CPU_BASELINE=aarch64-generic ;;
  *) echo "usage: $0 <linux-x64|linux-arm64> <output-dir>" >&2; exit 2 ;;
esac
[[ -n "$OUTPUT" ]] || { echo "output-dir is required" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v g++ >/dev/null
command -v ldd >/dev/null
command -v curl >/dev/null
command -v make >/dev/null

EXPECTED_GLIBC="2.36"
ACTUAL_GLIBC="$(getconf GNU_LIBC_VERSION | awk '{print $2}')"
if [[ "$ACTUAL_GLIBC" != "$EXPECTED_GLIBC" && "${SEER_ALLOW_NONBASELINE_GLIBC:-0}" != 1 ]]; then
  echo "Refusing release-grade Linux package on glibc $ACTUAL_GLIBC; required baseline is glibc $EXPECTED_GLIBC." >&2
  echo "For a local smoke build only, set SEER_ALLOW_NONBASELINE_GLIBC=1; such an artifact must not be published." >&2
  exit 2
fi

GMP_URL="https://gmplib.org/download/gmp/gmp-6.3.0.tar.xz"
GMP_SHA="a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898"
GMP_SOURCE="${SEER_GMP_SOURCE_ARCHIVE:-${RUNNER_TEMP:-/tmp}/gmp-6.3.0.tar.xz}"
if [[ ! -f "$GMP_SOURCE" ]]; then curl -fsSL "$GMP_URL" -o "$GMP_SOURCE"; fi
echo "$GMP_SHA  $GMP_SOURCE" | sha256sum -c -

if [[ -z "${SEER_GMP_PREFIX:-}" ]]; then
  export SEER_GMP_PREFIX="${RUNNER_TEMP:-/tmp}/seer-gmp-prefix-$TARGET"
  GMP_WORK="${RUNNER_TEMP:-/tmp}/seer-gmp-work-$TARGET"
  scripts/build-gmp-from-source.sh "$TARGET" "$GMP_SOURCE" "$GMP_WORK" "$SEER_GMP_PREFIX"
fi
test -f "$SEER_GMP_PREFIX/include/gmp.h"

export SEER_ARCH="$ARCH"
export SEER_RNS_BACKEND=portable
export SEER_MARCH="$MARCH"
export SEER_STATIC_GNU_RUNTIME=1
export SEER_ORIGIN_RPATH=1
export SEER_GMP_CPU_BASELINE="$GMP_CPU_BASELINE"
export SEER_NATIVE_TOOLCHAIN="$(g++ --version | head -n1)"
export SEER_NATIVE_GLIBC="$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
export SEER_NATIVE_RUNTIME_PACKAGES="$(dpkg-query -W -f='${Package}=${Version}\n' libgomp1 libstdc++6 libgcc-s1 2>/dev/null | paste -sd ';' - || true)"
node scripts/build-runtime.mjs

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT/bin" "$OUTPUT/licenses" "$OUTPUT/third_party/source"
bins=(seer_year_batch seer_year_locator seer_year_structure seer_engine_service)
for name in "${bins[@]}"; do
  src="prototype/build/$name"
  [[ -x "$src" ]] || { echo "missing exact runtime binary: $src" >&2; exit 1; }
  cp "$src" "$OUTPUT/bin/$name"
done

declare -A runtime_libs=()
for name in "${bins[@]}"; do
  while read -r lib arrow resolved rest; do
    [[ "$arrow" == "=>" && -f "$resolved" ]] || continue
    base="$(basename "$resolved")"
    case "$base" in
      libgmp*.so*|libgomp.so*|libstdc++.so*|libgcc_s.so*) runtime_libs["$base"]="$resolved" ;;
    esac
  done < <(LD_LIBRARY_PATH="$SEER_GMP_PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ldd "$OUTPUT/bin/$name")
done

unexpected_runtime_libs=()
for base in "${!runtime_libs[@]}"; do
  case "$base" in
    libgmp.so*) ;;
    *) unexpected_runtime_libs+=("$base") ;;
  esac
done
if (( ${#unexpected_runtime_libs[@]} > 0 )); then
  printf 'Prebuilt Linux runtime must statically link GCC/OpenMP; unexpected shared libraries:\n' >&2
  printf '  %s\n' "${unexpected_runtime_libs[@]}" | sort >&2
  exit 1
fi
for base in "${!runtime_libs[@]}"; do
  cp -L "${runtime_libs[$base]}" "$OUTPUT/bin/$base"
done
for license in LGPL-3.0.txt GPL-3.0.txt GCC-RUNTIME-LIBRARY-EXCEPTION-3.1.txt; do
  test -f "third_party/licenses/$license"
  cp "third_party/licenses/$license" "$OUTPUT/licenses/$license"
done

cp "$GMP_SOURCE" "$OUTPUT/third_party/source/gmp-6.3.0.tar.xz"

node scripts/write-native-package.mjs "$TARGET" "$OUTPUT"
npm pack "$OUTPUT" --dry-run --json >/dev/null
for name in "${bins[@]}"; do
  if LD_LIBRARY_PATH="$OUTPUT/bin" ldd "$OUTPUT/bin/$name" | grep -q 'not found'; then
    echo "unresolved shared library in $name" >&2
    LD_LIBRARY_PATH="$OUTPUT/bin" ldd "$OUTPUT/bin/$name" >&2
    exit 1
  fi
done

printf 'Linux native package staged: %s\n' "$OUTPUT"
printf 'Bundled runtime libraries:\n'
printf '  %s\n' "${!runtime_libs[@]}" | sort
