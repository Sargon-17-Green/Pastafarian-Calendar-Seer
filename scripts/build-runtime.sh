#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash prototype/scripts/build_year_batch.sh
bash prototype/scripts/build_year_locator.sh
bash prototype/scripts/build_year_structure.sh
bash prototype/scripts/build_engine_service.sh

for bin in seer_year_batch seer_year_locator seer_year_structure seer_engine_service; do
  test -x "prototype/build/$bin" || {
    echo "missing runtime binary after build: prototype/build/$bin" >&2
    exit 1
  }
done

echo "Pastafarian Calendar Seer exact runtime built successfully."
