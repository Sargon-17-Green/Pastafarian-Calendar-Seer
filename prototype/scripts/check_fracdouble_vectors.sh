#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$ROOT/prototype/build"
cd "$BUILD"
calc=2461290
for target in 2461247 2461290 2462913 2464579 -12829630 6788193; do
  a=$(./fracdouble_base "$calc" "$target" 4 512 2 | head -n1)
  b=$(./fracdouble_candidate "$calc" "$target" 4 512 2 | head -n1)
  if [[ "$a" != "$b" ]]; then
    echo "target=$target equal=NO"
    echo "base=$a"
    echo "candidate=$b"
    exit 1
  fi
  echo "target=$target equal=YES"
done
echo "Fracdouble full-vector exactness: PASS"
