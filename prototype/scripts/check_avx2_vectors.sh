#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXE="$ROOT/build/pastafarian_cold_bench_avx2"
THREADS="${THREADS:-4}"
SB="${SB:-512}"
[[ -x "$EXE" ]] || bash "$ROOT/scripts/build_avx2.sh"
cd "$ROOT/data"
check(){
  local name="$1" calc="$2" target="$3" expected="$4"
  echo "=== $name ==="
  local out
  out="$($EXE "$calc" "$target" "$THREADS" "$SB")"
  echo "$out"
  grep -Fq "$expected" <<<"$out" || { echo "semantic vector mismatch: $name" >&2; exit 1; }
}
check same-start 2461290 2461247 'year=5000 steps=0 gates=31260:31266 len=3333 offset=0 cutlet_idx=11 day_cutlet=1 month_idx=12 day_month=1 months=29'
check same-query 2461290 2461290 'year=5000 steps=0 gates=31260:31266 len=3333 offset=43 cutlet_idx=11 day_cutlet=44 month_idx=7 day_month=2 months=29'
check same-mid 2461290 2462913 'year=5000 steps=0 gates=31260:31266 len=3333 offset=1666 cutlet_idx=8 day_cutlet=201 month_idx=12 day_month=63 months=29'
check same-end 2461290 2464579 'year=5000 steps=0 gates=31260:31266 len=3333 offset=3332 cutlet_idx=9 day_cutlet=785 month_idx=46 day_month=123 months=29'
check far-past-3576y 2461290 -12829630 'year=1424 steps=3576 gates=992:1004 len=5601 offset=3135 cutlet_idx=10 day_cutlet=1 month_idx=8 day_month=64 months=47'
echo 'AVX2 calendar vectors: PASS'
