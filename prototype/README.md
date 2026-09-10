# Cold-conversion benchmark prototype — 2026-09-03 baseline, corrected 2026-09-10

This directory preserves the current high-performance baseline from which the Seer repository starts,
with the canonical saved-sum correction layered onto it. It is a **benchmark prototype**, not a release
and not yet a stable public API.

## Included techniques

- C++20.
- Specialized arithmetic modulo `M = 2^127 - 1` on `__uint128_t` for Sauce and year walking.
- Generated 40,000-gap positive canonical gate dataset (`data/gates_u16.bin`).
- Fixed 720-permutation table for bowl ordering.
- Exact month-length DP in 5×64 bits (320 bits) rather than general big integers.
- RNS weave counter/unrank with fixed primes, a `long double` predictor, micro-reset every 8 days, and exact CRT certification.
- AVX-512IFMA, AVX2 experiments, and portable scalar-lane execution paths as already present in the baseline.
- Prefix-only unranking up to the target day.
- No memoization or predictive precomputation across separate queries.

## Canonical semantic gate

Before benchmarking or interpreting old witnesses, run:

```bash
bash ./scripts/check_saved_sum_conformance.sh
```

That check compares the real v3/v12 Sauce paths with an independent Boost `cpp_int` reference after
visible drop 46 and after every final post-stir, kills the historical `rawSumMutant`, regenerates the full
positive gate corpus, and verifies the canonical full-date vector corpus.

Current gate SHA-256:
`2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb`.

## Requirements

GCC/g++ with C++20 and OpenMP, GMP/GMPXX development libraries, and Boost headers. The portable backend
has no AVX-512 requirement. The preserved IFMA baseline requires AVX-512F, DQ, BW, VL, and AVX-512IFMA.

## Standard benchmark witnesses

See `BENCHMARK_CASES.md`. The corrected standard set contains several Year-5000 points plus a target
3,540 Pastafarian years in the past. The former 3,576-year label belonged to the superseded raw-sum
semantics and must not be reused as a canonical witness.

Each benchmark case runs as a fresh process. Compare distributions/medians and inspect at least `walk`,
`rns_count`, `prefix_total`, `replay`, and external wall time. Do not infer semantic correctness from
performance A/B agreement.

## Important limitation

The program currently opens `gates_u16.bin` from its working directory. The provided runners therefore
execute it from `data/`. The bundled gate file covers positive gate indices only. Treat both facts as
prototype behavior, not a future API contract.
