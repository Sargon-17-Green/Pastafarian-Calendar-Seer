#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-g++}"
mkdir -p "$ROOT/build" "$ROOT/results"
COMMON=(-O2 -std=c++20 -I"$ROOT/src" -I"$ROOT/tools")

# Independent exact Boost/cpp_int reference vs each real fast Sauce header.
"$CXX" "${COMMON[@]}" -DSAUCE_HEADER='"sauce_fast127_v3.hpp"' \
  "$ROOT/tools/saved_sum_conformance.cpp" -o "$ROOT/build/saved_sum_conformance_v3"
"$CXX" "${COMMON[@]}" -DSAUCE_HEADER='"sauce_fast127_v12.hpp"' \
  "$ROOT/tools/saved_sum_conformance.cpp" -o "$ROOT/build/saved_sum_conformance_v12"
"$ROOT/build/saved_sum_conformance_v3" | tee "$ROOT/results/saved-sum-v3.log"
"$ROOT/build/saved_sum_conformance_v12" | tee "$ROOT/results/saved-sum-v12.log"

grep -q 'rawSumMutant=KILLED' "$ROOT/results/saved-sum-v3.log"
grep -q 'rawSumMutant=KILLED' "$ROOT/results/saved-sum-v12.log"
grep -q 'call_order=A-B-A:PASS' "$ROOT/results/saved-sum-v3.log"
grep -q 'call_order=A-B-A:PASS' "$ROOT/results/saved-sum-v12.log"

# Regenerate all derived positive gate data from the independent exact reference.
"$CXX" -O2 -std=c++20 -fopenmp -I"$ROOT/tools" \
  "$ROOT/tools/generate_gates_saved_sum.cpp" -o "$ROOT/build/generate_gates_saved_sum"
"$ROOT/build/generate_gates_saved_sum" "$ROOT/results/gates_u16.regenerated.bin" \
  | tee "$ROOT/results/gates-regeneration.log"
cmp "$ROOT/results/gates_u16.regenerated.bin" "$ROOT/data/gates_u16.bin"
GATE_SHA="$(sha256sum "$ROOT/data/gates_u16.bin" | awk '{print $1}')"
[[ "$GATE_SHA" == '2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb' ]]

# Calibration: the same independent reference, deliberately switched to the historical mutant,
# must reproduce the old corpus exactly. This proves the provenance of the superseded fixture.
"$ROOT/build/generate_gates_saved_sum" "$ROOT/results/gates_u16.raw-mutant.bin" --raw-mutant \
  | tee "$ROOT/results/gates-raw-mutant-calibration.log"
OLD_SHA="$(sha256sum "$ROOT/results/gates_u16.raw-mutant.bin" | awk '{print $1}')"
[[ "$OLD_SHA" == '57d20ac6653e9cbd1d33a5e591bb6b65a39bc0c6ec90b3af1b978d3f7ec6fdbc' ]]

# The two corrected fast headers must also regenerate the checked-in independent corpus exactly.
for ver in v3 v12; do
  "$CXX" "${COMMON[@]}" -DSAUCE_HEADER='"sauce_fast127_'"$ver"'.hpp"' \
    "$ROOT/tools/gate_validate_saved_sum.cpp" -o "$ROOT/build/gate_validate_$ver"
  "$ROOT/build/gate_validate_$ver" "$ROOT/data/gates_u16.bin" | tee "$ROOT/results/gates-fast-$ver.log"
done

# Independent full-calendar oracle against checked-in canonical saved-sum vectors.
"$CXX" "${COMMON[@]}" "$ROOT/tools/canonical_vector_oracle.cpp" \
  -o "$ROOT/build/canonical_vector_oracle"
{
  IFS=$'\t' read -r _header
  while IFS=$'\t' read -r name coverage calc target year steps gates len offset cutlet daycut month daymonth months nbits width; do
    out="$("$ROOT/build/canonical_vector_oracle" "$ROOT/data/gates_u16.bin" "$calc" "$target")"
    for token in "year=$year" "steps=$steps" "gates=$gates" "len=$len" "offset=$offset" \
      "cutlet_idx=$cutlet" "day_cutlet=$daycut" "month_idx=$month" "day_month=$daymonth" \
      "months=$months" "Nbits=$nbits" "width=$width"; do
      [[ "$out" == *"$token"* ]] || { echo "oracle vector mismatch: $name missing [$token]" >&2; exit 1; }
    done
    printf '%s\t%s\tPASS\n' "$name" "$coverage"
  done
} < "$ROOT/data/canonical_saved_sum_vectors.tsv" | tee "$ROOT/results/canonical-vector-oracle.log"

echo 'Saved-sum canonical conformance: PASS'
