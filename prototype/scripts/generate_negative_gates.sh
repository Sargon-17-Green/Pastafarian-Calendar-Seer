#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-g++}"
OUTPUT="${1:-$ROOT/results/gates_negative_u16.bin}"
BUILD="$ROOT/build"
RESULTS="$ROOT/results"
POSITIVE_SHA='2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb'
RAW_MUTANT_SHA='57d20ac6653e9cbd1d33a5e591bb6b65a39bc0c6ec90b3af1b978d3f7ec6fdbc'

mkdir -p "$BUILD" "$RESULTS" "$(dirname "$OUTPUT")"
"$CXX" -O2 -std=c++20 -fopenmp -I"$ROOT/tools" \
  "$ROOT/tools/generate_gates_saved_sum.cpp" \
  -o "$BUILD/generate_gates_saved_sum"

POS="$RESULTS/gates_positive.phase-a.bin"
RAW="$RESULTS/gates_positive_raw_mutant.phase-a.bin"
"$BUILD/generate_gates_saved_sum" "$POS" | tee "$RESULTS/gates-positive-phase-a.log"
cmp "$POS" "$ROOT/data/gates_u16.bin"
[[ "$(sha256sum "$POS" | awk '{print $1}')" == "$POSITIVE_SHA" ]]

"$BUILD/generate_gates_saved_sum" "$RAW" --raw-mutant | tee "$RESULTS/gates-raw-mutant-phase-a.log"
[[ "$(sha256sum "$RAW" | awk '{print $1}')" == "$RAW_MUTANT_SHA" ]]
"$BUILD/generate_gates_saved_sum" "$OUTPUT" --negative | tee "$RESULTS/gates-negative-phase-a.log"
[[ "$(stat -c '%s' "$OUTPUT")" == '80000' ]]
NEG_SHA="$(sha256sum "$OUTPUT" | awk '{print $1}')"
printf '%s  %s\n' "$NEG_SHA" "$(basename "$OUTPUT")" > "$OUTPUT.sha256"
printf 'negative_gate_bytes=%s\nnegative_gate_sha256=%s\n' \
  "$(stat -c '%s' "$OUTPUT")" "$NEG_SHA"

echo 'Negative-gate exact-reference generation: PASS'
