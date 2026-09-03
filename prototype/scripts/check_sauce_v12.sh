#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ -x "$ROOT/build/sauce_dump_v3" ]] || bash "$ROOT/scripts/build_sauce_v12.sh"
mkdir -p "$ROOT/results"
"$ROOT/build/sauce_dump_v3" "$ROOT/results/sauce-v3-5000.dump"
"$ROOT/build/sauce_dump_v12" "$ROOT/results/sauce-v12-5000.dump"
cmp "$ROOT/results/sauce-v3-5000.dump" "$ROOT/results/sauce-v12-5000.dump"
sha256sum "$ROOT/results/sauce-v3-5000.dump" "$ROOT/results/sauce-v12-5000.dump" | tee "$ROOT/results/sauce-v12-dump-sha256.txt"
cd "$ROOT/data"
"$ROOT/build/gate_validate_v12" gates_u16.bin | tee "$ROOT/results/sauce-v12-gates.txt"
A="$ROOT/build/seer_avx2_v3_split"; B="$ROOT/build/seer_avx2_v12_split"
: > "$ROOT/results/sauce-v12-vector-compare.txt"
for target in 2461247 2461290 2462913 2464579 -12829630 6788193; do
  a="$($A 2461290 "$target" 4 512 2 | head -1)"; b="$($B 2461290 "$target" 4 512 2 | head -1)"; printf 'target=%s equal=%s\n%s\n' "$target" "$([[ "$a" == "$b" ]] && echo YES || echo NO)" "$a" | tee -a "$ROOT/results/sauce-v12-vector-compare.txt"; [[ "$a" == "$b" ]] || exit 4
done
echo "Sauce v12 validation: PASS"
