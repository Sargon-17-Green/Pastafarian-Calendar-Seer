#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Canonical authority gate: independent exact reference, raw-mutant discriminator,
# regenerated gate corpus, and independent full-calendar vectors.
bash "$ROOT/scripts/check_saved_sum_conformance.sh"

# Build the A/B executables used below if they are not already present.
[[ -x "$ROOT/build/sauce_dump_v3" && -x "$ROOT/build/sauce_dump_v12" \
   && -x "$ROOT/build/seer_avx2_v3_split" && -x "$ROOT/build/seer_avx2_v12_split" ]] \
  || bash "$ROOT/scripts/build_sauce_v12.sh"
mkdir -p "$ROOT/results"

# v3 <-> v12 is regression evidence only; it is not the semantic oracle.
"$ROOT/build/sauce_dump_v3" "$ROOT/results/sauce-v3-5000.dump"
"$ROOT/build/sauce_dump_v12" "$ROOT/results/sauce-v12-5000.dump"
cmp "$ROOT/results/sauce-v3-5000.dump" "$ROOT/results/sauce-v12-5000.dump"
DUMP_SHA="$(sha256sum "$ROOT/results/sauce-v3-5000.dump" | awk '{print $1}')"
[[ "$DUMP_SHA" == '4d9f799a284e15c7dd8abe340ef8b9cde4fce7d9dfb757c7adf67d22d7b7a3e6' ]]
sha256sum "$ROOT/results/sauce-v3-5000.dump" "$ROOT/results/sauce-v12-5000.dump" \
  | tee "$ROOT/results/sauce-v12-dump-sha256.txt"

# Each real A/B calendar executable must independently match the canonical TSV.
bash "$ROOT/scripts/check_canonical_vectors.sh" "$ROOT/build/seer_avx2_v3_split" 4 512 2
bash "$ROOT/scripts/check_canonical_vectors.sh" "$ROOT/build/seer_avx2_v12_split" 4 512 2

echo "Sauce v12 saved-sum validation: PASS"
