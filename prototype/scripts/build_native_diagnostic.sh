#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-g++}"
MODE="${SEER_DIAGNOSTIC_MODE:-warnings}"
BACKEND="${SEER_DIAGNOSTIC_BACKEND:-portable}"
OUT="${SEER_DIAGNOSTIC_OUT:-$ROOT/build/diagnostic/${MODE}-${BACKEND}}"

case "$MODE" in
  warnings|asan|ubsan) ;;
  *) echo "SEER_DIAGNOSTIC_MODE must be warnings, asan, or ubsan" >&2; exit 2 ;;
esac
case "$BACKEND" in
  portable|avx2) ;;
  *) echo "SEER_DIAGNOSTIC_BACKEND must be portable or avx2" >&2; exit 2 ;;
esac

rm -rf "$OUT"
mkdir -p "$OUT/obj"

COMMON=(-std=c++20 -g3 -fopenmp -pthread -I"$ROOT/src" -D_GLIBCXX_ASSERTIONS)
if [[ "$BACKEND" == portable ]]; then
  COMMON+=(-DSEER_USE_PORTABLE_RNS=1)
  WEAVE="$ROOT/src/seer_weave_portable.cpp"
else
  COMMON+=(-mavx2)
  WEAVE="$ROOT/src/seer_weave_avx2.cpp"
fi

case "$MODE" in
  warnings)
    COMMON+=(-O2
      -Wall -Wextra -Wpedantic -Wconversion -Wno-sign-conversion
      -Wformat=2 -Wundef -Wimplicit-fallthrough -Wnull-dereference
      -Wmissing-field-initializers -Wmisleading-indentation -Wunused-parameter)
    ;;
  asan)
    COMMON+=(-O1 -fno-omit-frame-pointer -fno-optimize-sibling-calls
      -fsanitize=address -fsanitize-address-use-after-scope)
    ;;
  ubsan)
    COMMON+=(-O1 -fno-omit-frame-pointer -fno-optimize-sibling-calls
      -fsanitize=undefined -fno-sanitize-recover=undefined)
    ;;
esac

compile() {
  local source="$1" object="$2"
  "$CXX" "${COMMON[@]}" -c "$source" -o "$OUT/obj/$object"
}

compile "$ROOT/src/seer_year_core.cpp" year_core.o
compile "$ROOT/src/seer_calendar_core.cpp" calendar_core.o
compile "$WEAVE" weave.o
compile "$ROOT/src/pastafarian_year_batch.cpp" year_batch_main.o
compile "$ROOT/src/seer_year_locator.cpp" year_locator_main.o
compile "$ROOT/src/seer_year_structure.cpp" year_structure_main.o
compile "$ROOT/src/seer_engine_service.cpp" engine_service_main.o

LINK=(-fopenmp -pthread -lgmp)
if [[ "$MODE" == asan ]]; then LINK=(-fsanitize=address "${LINK[@]}"); fi
if [[ "$MODE" == ubsan ]]; then LINK=(-fsanitize=undefined -fno-sanitize-recover=undefined "${LINK[@]}"); fi

"$CXX" "$OUT/obj/year_core.o" "$OUT/obj/calendar_core.o" "$OUT/obj/weave.o" \
  "$OUT/obj/year_batch_main.o" "${LINK[@]}" -o "$OUT/seer_year_batch"
"$CXX" "$OUT/obj/year_core.o" "$OUT/obj/year_locator_main.o" \
  "${LINK[@]}" -o "$OUT/seer_year_locator"
"$CXX" "$OUT/obj/year_core.o" "$OUT/obj/calendar_core.o" "$OUT/obj/weave.o" \
  "$OUT/obj/year_structure_main.o" "${LINK[@]}" -o "$OUT/seer_year_structure"
"$CXX" "$OUT/obj/year_core.o" "$OUT/obj/calendar_core.o" "$OUT/obj/weave.o" \
  "$OUT/obj/engine_service_main.o" "${LINK[@]}" -o "$OUT/seer_engine_service"

printf 'Diagnostic build complete: compiler=%s mode=%s backend=%s out=%s\n' \
  "$CXX" "$MODE" "$BACKEND" "$OUT"
