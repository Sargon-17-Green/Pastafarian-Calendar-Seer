#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { echo "usage: $0 EXE [engine args after calc/target...]" >&2; exit 2; }
EXE="$1"; shift
[[ -x "$EXE" ]] || { echo "not executable: $EXE" >&2; exit 2; }
EXE="$(cd "$(dirname "$EXE")" && pwd)/$(basename "$EXE")"
ARGS=("$@")
mkdir -p "$ROOT/results"
LOG="$ROOT/results/canonical-vector-check-$(basename "$EXE").log"
: > "$LOG"
{
  IFS=$'\t' read -r _header
  while IFS=$'\t' read -r name coverage calc target year steps gates len offset cutlet daycut month daymonth months nbits width; do
    out="$(cd "$ROOT/data" && "$EXE" "$calc" "$target" "${ARGS[@]}")"
    first="$(printf '%s\n' "$out" | grep -m1 '^year=')"
    for token in "year=$year" "steps=$steps" "gates=$gates" "len=$len" "offset=$offset" \
      "cutlet_idx=$cutlet" "day_cutlet=$daycut" "month_idx=$month" "day_month=$daymonth" \
      "months=$months" "Nbits=$nbits" "width=$width"; do
      [[ "$first" == *"$token"* ]] || {
        printf 'FAIL %s (%s): missing [%s]\nactual: %s\n' "$name" "$coverage" "$token" "$first" | tee -a "$LOG" >&2
        exit 1
      }
    done
    printf 'PASS %s (%s)\n' "$name" "$coverage" | tee -a "$LOG"
  done
} < "$ROOT/data/canonical_saved_sum_vectors.tsv"
echo "Canonical saved-sum vectors: PASS" | tee -a "$LOG"
