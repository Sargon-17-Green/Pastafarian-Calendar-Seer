# Sauce v12 default adoption

This delta promotes the already validated Sauce v12 implementation to the Seer default while preserving Sauce v3 as an explicit regression reference.

## Why `year_fast_bench_v3.cpp` keeps its historical filename

All existing IFMA, AVX2 and portable entry points include this filename. Replacing only its Sauce include makes the adoption atomic and path-compatible: no public/source path needs to move, and all default backends receive the same signed Sauce implementation.

The old v3 implementation is preserved verbatim as `year_fast_bench_v3_reference.cpp`. The A/B build script is updated so its `v3` binary still compiles that preserved reference rather than accidentally comparing v12 with itself.

## Signed evidence behind the promotion

Hosted EPYC A/B run 33757873769:

- 5,000 deterministic full Sauce dumps: v3 and v12 identical SHA-256 `cb943f2f3e978afc8a4a02074bd745192f005c6e3228f3bb1a63f253bd0a5c9f`.
- 40,000 canonical positive gate gaps: `bad=0`, min 42, max 963, sum 20,176,753.
- Six full calendar vectors: all equal.
- AVX2 exact RNS self-test: PASS.
- 3,576-year walk median: 119.775 ms -> 101.768 ms (~15.0% faster).
- 1,002-year forward walk median: 33.503 ms -> 28.566 ms (~14.7% faster).

The `Seer v12 default adoption check` workflow verifies that the historical default include now resolves to v12, that the preserved v3 reference still exists, and that the AVX2 default equals explicit v12 and preserved v3 semantically on six vectors; the workflow also rebuilds the portable default and runs its canonical vector suite.
