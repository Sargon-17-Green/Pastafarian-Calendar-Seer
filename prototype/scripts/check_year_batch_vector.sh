#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/build/seer_year_batch"
[[ -x "$BIN" ]] || bash "$ROOT/scripts/build_year_batch.sh"
OUT="$(cd "$ROOT/data" && "$BIN" 2461290 2461290 1)"
node -e '
const x=JSON.parse(process.argv[1]);
const r=x.records[0];
const expected={targetJdn:2461290,year:5000,cutletIndex:14,dayInCutlet:337,monthIndex:39,dayInMonth:69,monthCount:37};
for(const [k,v] of Object.entries(expected)){if(r[k]!==v){throw new Error(`${k}: expected ${v}, got ${r[k]}`)}}
console.log("Year-batch canonical vector: PASS");
' "$OUT"
