# Cold-conversion benchmark prototype — 2026-09-03

This directory preserves the current high-performance baseline from which the Seer
repository starts. It is a **benchmark prototype**, not a release and not yet a stable
public API.

## Included techniques

- C++20.
- Specialized arithmetic modulo `M = 2^127 - 1` on `__uint128_t` for Sauce and year walking.
- Fixed 40,000-gap positive canonical gate dataset (`data/gates_u16.bin`).
- Fixed 720-permutation table for bowl ordering.
- Exact month-length DP in 5×64 bits (320 bits) rather than general big integers.
- RNS weave counter/unrank with AVX-512IFMA, fixed primes, a `long double` predictor,
  micro-reset every 8 days, and exact CRT certification.
- Default superblock size: 512.
- Prefix-only unranking up to the target day rather than materializing the entire year.
- No memoization or predictive precomputation across separate queries.

## Requirements

- GCC/g++ with C++20 and OpenMP.
- CPU with AVX-512F, DQ, BW, VL, and AVX-512IFMA.
- GMP + GMPXX development headers/libraries.
- Boost headers (`boost/multiprecision/cpp_int.hpp`).

The build scripts run a CPU probe before building the benchmark. Do not compare timing
numbers from a build with a different backend as if they were this baseline.

## Windows / PowerShell

```powershell
.\scripts\build.ps1
.\scripts\run_benchmark.ps1 -Repetitions 3 -Threads 5 -Superblock 512
```

Each case runs as a fresh process. The CSV records both external wall time (including
process startup) and the engine's internal conversion time.

## Linux / WSL

```bash
./scripts/build.sh
./scripts/run_benchmark.sh 3
```

## Fixed benchmark cases

See [`BENCHMARK_CASES.md`](BENCHMARK_CASES.md).

The runner measures several points in Year 5000 plus a target 3,576 years in the past.
Do not draw conclusions from one timing. Compare distributions/medians and inspect at
least `walk`, `rns_count`, `prefix_total`, `replay`, and external wall time.

## Important limitation

The program currently opens `gates_u16.bin` from its working directory. The provided
benchmark runners therefore execute it from `data/`. Treat that as prototype behavior,
not a future API contract.
