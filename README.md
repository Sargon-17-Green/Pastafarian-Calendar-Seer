# Pastafarian Calendar — Seer

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

- The calendar specification (the **Scroll**) defines what is true.
- The historical spaghetti implementation (the **Monster**) performs the prescribed work.
- The **Seer** is an accelerated implementation that predicts the same answer without
  reproducing the same computational history.
- Test-only normative/reference oracles are verification tools, not the Seer itself.

If the Seer disagrees with the normative calendar, **the Seer is wrong**.

The Seer must never become a hidden dependency of the Monster or of independent
language implementations merely so that they can pass their own conformance tests.
Differential comparison is welcome; semantic dependence is not.

## Current state

The repository currently contains the **2026-09-03 cold-conversion performance
prototype** under [`prototype/`](prototype/). It is a benchmark baseline, not yet a
stable library or public API.

The current prototype includes:

- C++20;
- specialized arithmetic for `M = 2^127 - 1`;
- a fixed corpus of 40,000 positive canonical gate gaps;
- a fixed 720-permutation bowl-order table;
- exact 320-bit month-length dynamic programming;
- RNS/CRT weave counting and prefix unranking;
- AVX-512IFMA acceleration in the original baseline;
- a separate portable scalar RNS backend for hosts without IFMA;
- no memoization or predictive precomputation across separate queries.

Known prototype limitations include:

- the bundled gate corpus does not include negative gate indices;
- output uses numeric cutlet/month canonical indices rather than localized names;
- the original high-performance backend requires AVX-512F/DQ/BW/VL + AVX-512IFMA;
- the portable backend is correct but has not yet received an AVX2-specific optimization pass;
- difficult weave-edge ranks can still cause many predictor splits;
- there is no stable library ABI/API yet.

See [`prototype/STATUS.md`](prototype/STATUS.md) and [`ROADMAP.md`](ROADMAP.md).

## Build the current prototype

The IFMA baseline and the portable backend are built separately.

### Linux / WSL

```bash
cd prototype
bash ./scripts/build_portable.sh
bash ./scripts/run_portable_selftest.sh 1
bash ./scripts/check_portable_vectors.sh
bash ./scripts/run_benchmark_portable.sh 3

# On an AVX-512IFMA machine, the preserved baseline remains available:
bash ./scripts/build.sh
bash ./scripts/run_benchmark.sh 3
```

### Windows / PowerShell

```powershell
cd prototype
.\scripts\build_portable.ps1
.\scripts\run_benchmark_portable.ps1 -Repetitions 3 -Threads 4 -Superblock 512

# On an AVX-512IFMA machine, the preserved baseline remains available:
.\scripts\build.ps1
.\scripts\run_benchmark.ps1 -Repetitions 3 -Threads 5 -Superblock 512
```

Both backends require a GCC-compatible C++20 environment with OpenMP, GMP/GMPXX, and Boost headers. The IFMA baseline additionally requires the AVX-512 feature set listed above.

See [`docs/PORTABLE_BACKEND.md`](docs/PORTABLE_BACKEND.md).

## Repository map

```text
docs/                 identity, architecture, conformance, and data provenance
prototype/            current experimental cold-conversion engine
  src/                C++20 benchmark engine
  data/               fixed algorithm data used by the prototype
  scripts/            build and benchmark runners
  tools/              CPU capability probe
  results/            generated benchmark output (ignored by Git)
ROADMAP.md             path from benchmark prototype to usable Seer engine
LICENSE                MIT license granted by Sargon-17-Green
NOTICE.md              explicit liturgical non-authorization by the Monster
```

## Related project

The Seer exists beside, not inside, the Pastafarian Calendar's spaghetti history:

- `Sargon17-Green/Pastafarian-Calendar` — specification, historical/liturgical
  implementations, and independent language branches.

The separation is intentional. Optimizing the Seer must not clean up, rewrite, or
silently bypass the liturgical history preserved by the Monster.

The software license is granted by **Sargon-17-Green**. That legal permission to use the
code does not constitute, imply, or substitute for authorization from the Flying
Spaghetti Monster. See [`NOTICE.md`](NOTICE.md).

R’amen.
