#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-g++}"
mkdir -p "$ROOT/build"

"$CXX" -O2 -std=c++20 -I"$ROOT/src" \
  "$ROOT/tools/short_selection_o1_test.cpp" \
  -lgmpxx -lgmp -o "$ROOT/build/short_selection_o1_test"
"$ROOT/build/short_selection_o1_test"

production=(
  "$ROOT/src/pastafarian_year_batch.cpp"
  "$ROOT/src/sauce_fast127_v12.hpp"
)
if grep -nE 'while[[:space:]]*\([^)]*>[[:space:]]*lim\)' "${production[@]}"; then
  echo "production short-selection rejection walk remains" >&2
  exit 1
fi
echo "production short-selection rejection walks: none"
