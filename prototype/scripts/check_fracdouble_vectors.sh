#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$ROOT/prototype/build"
for exe in fracdouble_base fracdouble_candidate; do
  bash "$ROOT/prototype/scripts/check_canonical_vectors.sh" "$BUILD/$exe" 4 512 2
done
echo "Fracdouble canonical saved-sum validation: PASS"
