# Pastafarian Calendar ג€” Seer

> **The Monster performs. The Seer sees.**

The **Seer** is an experimental high-performance engine for the Pastafarian Calendar.
It is deliberately **not** a spaghetti implementation and it does **not** reenact the
Flying Spaghetti Monster's prescribed liturgy step by step.

This is not an approved shortcut. **The Monster does not authorize the Seer.** Asked for
a Pastafarian date, the Seer somehow already knows the answer it was not supposed to
know without performing the liturgy.

Operationally, the implementation in this repository uses precomputation, algebraic
shortcuts, specialized integer representations, SIMD, fixed algorithm data, and other
optimizations. Those methods are intentionally outside the Monster's liturgy; the only
computational requirement is that the final result exactly match the result defined by
the Pastafarian Calendar specification.

## Correctness contract

The Seer is **not normative**.

- The current Scroll defines what is true.
- The historical spaghetti implementation (the **Monster**) performs the prescribed work.
- The **Seer** is an accelerated implementation that predicts the same answer without reproducing the same computational history.
- Test-only exact/reference oracles are verification tools, not authorities over the Scroll.
- Agreement between multiple Seer implementations is not enough when they may share a common bug.

If the Seer disagrees with the normative calendar, **the Seer is wrong**.

### Canonical saved-sum correction ג€” 2026-09-10

The 12 final Sauce post-stirs use `R = SAVE(sum(oldBowls) + 149*r)` both to choose the bowl permutation
and as the additive sum term inside `u`. All six new bowls in a stir read one common old-bowl snapshot.
The former v3/v12 paths incorrectly used the raw old-bowl sum inside `u`; that common-mode error and
all derived semantic witnesses are superseded. See `docs/CONFORMANCE.md`, `docs/DATA_PROVENANCE.md`,
and `HISTORICAL_VALIDATION_NOTICE.md`.

The corrected positive 40,000-gap corpus has SHA-256
`2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb`. The canonical negative 40,000-gap corpus has SHA-256
`90a5cf809f19f62a87327b733d21572d739b83a383969765582cfb31cfb2b9ab`.

## Current state

The repository retains the **2026-09-03 cold-conversion performance prototype** under `prototype/`,
with the saved-sum semantic correction layered onto that prototype state. Above it, the repository now
has a verified shared query API, CLI, HTTP v1 adapter, exact cache-miss/year provider, and the persistent
OPT-06 native engine service. API Stage 6 packages those existing layers for stable Node application and
service deployment without changing calendar semantics.

The current prototype includes C++20, specialized arithmetic for `M = 2^127 - 1`, generated positive and negative 40,000-gap canonical gate corpora, a fixed 720-permutation
bowl-order table, exact 320-bit
month-length dynamic programming, RNS/CRT weave counting and prefix unranking, AVX-512IFMA and portable
backends, and no memoization or predictive precomputation across separate queries.

Known limitations include the finite bundled gate horizon, English-only presentation, and the native
build/toolchain requirements for exact out-of-cache computation.
The public Node/HTTP contract is stable at v1; this does not make the Seer normative.

## Application and HTTP API

API Stage 6 exposes stable ESM package entry points: import `pastafarian-calendar-seer` for the shared
query API or `pastafarian-calendar-seer/http` for the HTTP handler/server. The package also installs the
`pastafarian-seer` and `pastafarian-seer-http` commands. It has no npm runtime dependencies.

Reverse conversion is available as `queryReverse(...)`, the `pastafarian-seer reverse` command, and
`POST /v1/reverse`. Reverse requests require the complete canonical tuple: year, cutlet index/day, and
month index/day. The calculation day remains an independent input, and the two coordinate systems are
cross-checked before a target JDN is returned.

Exact out-of-cache operation requires the native runtime. On a supported Linux/WSL deployment run
`npm run build:native`; the build selects AVX2 when available and otherwise uses the exact portable scalar RNS backend. Set `SEER_RNS_BACKEND=avx2` or `portable` to force a backend, and set `SEER_REQUIRE_ENGINE_SERVICE=1` when the persistent OPT-06 service is a hard deployment requirement. See `docs/DEPLOYMENT_STAGE6.md`.

## Build and conformance

On Linux/WSL, run the semantic gate before treating benchmark output as meaningful:

```bash
cd prototype
bash ./scripts/check_saved_sum_conformance.sh
bash ./scripts/build_portable.sh
bash ./scripts/run_portable_selftest.sh 1
bash ./scripts/check_portable_vectors.sh
bash ./scripts/run_benchmark_portable.sh 3
```

The portable and IFMA backends require a GCC-compatible C++20 environment with OpenMP, GMP/GMPXX, and
Boost headers. The IFMA baseline additionally requires AVX-512F/DQ/BW/VL + AVX-512IFMA.

See `prototype/STATUS.md`, `prototype/README.md`, `docs/PORTABLE_BACKEND.md`, and `ROADMAP.md`.

## Repository map

```text
docs/                 identity, architecture, conformance, and data provenance
prototype/            current experimental cold-conversion engine
  src/                C++20 benchmark engine
  data/               generated/fixed algorithm data and canonical vectors
  scripts/            build, conformance, and benchmark runners
  tools/              CPU probe and independent conformance/oracle tools
  results/            generated output (ignored by Git)
ROADMAP.md             path from benchmark prototype to usable Seer engine
LICENSE                MIT license granted by Sargon-17-Green
NOTICE.md              explicit liturgical non-authorization by the Monster
```

## Related project

The Seer exists beside, not inside, the Pastafarian Calendar's spaghetti history:
`Sargon17-Green/Pastafarian-Calendar` contains the specification/historical implementations and
independent language branches. The separation is intentional. Optimizing the Seer must not clean up,
rewrite, or silently bypass the liturgical history preserved by the Monster.

Rג€™amen.
