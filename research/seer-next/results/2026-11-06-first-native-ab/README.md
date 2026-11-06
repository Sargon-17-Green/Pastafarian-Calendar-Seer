# Seer Next first native candidate A/B — 2026-11-06

**Status: encouraging experimental result — not production accepted.**

- Run: [GitHub Actions 42286721393](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42286721393); job: `128129334615`; artifact: [13538545301](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42286721393/artifacts/13538545301).
- Research commit tested: `620202516cb79b7c8fc2e4238600cba4d452b23d`.
- Reference implementation source frozen at `7f1b3098332d891a9ea6cf8e31383d4fd39141cf`. Source and native binary SHA-256 values are in `ab.json`.
- Environment: Linux x64 / AVX2, `AMD EPYC 7763 64-Core Processor`, `4` vCPU, Node `v24.22.2`. Both native engines built in the same GitHub-hosted job with the same optimize/ISA flags.
- Workload: `c=2461290`, 32 identical one-target `R 2461290 2460984 1` requests. A candidate full-year table is built on the **second** query and stored in a per-(c,year) payload cache of at most 8MiB.
- Negative control: candidate with `SEER_NEXT_CACHE_BYTES=0`.
- Independent saved-sum checks: four numeric dates in canonical Year 5000, including first/last days, full payload parity against the unchanged service for every tested request.
- Baseline service's first request: 116.359 ms; candidate: 106.439 ms. Baseline second request: 103.607 ms; candidate full-materialization request: 123.761 ms.

## Results

| Metric | Baseline | Candidate | Outcome |
|---|---:|---:|---:|
| Warm post-second request p50 (30 queries) | 103.026723 ms | 0.088505 ms | 1164.08x faster |
| Total time for 32 repeated queries | 3315.042 ms | 233.025 ms | 14.23x faster |
| Weave calculations, 32 repeated queries | 32 | 2 | Reduced from 32 to 2 |
| Weave events after six more same-year boundary/sparse queries | 34 total | 2 total | All six were already materialized |
| Cache-disabled candidate (32 queries) | — | 103.809 ms p50 | 32 weave events, baseline-like |

The exact numerical answers matched across baseline/candidate/zero-cache control for this workload. All asserts passed.

## Scope limits

1. This was one sequential A/B run on one host, with a fixed calculation day and known Year 5000. It establishes an impressive *warm repeat* result, **not** a general 1000x calendar computation speedup or a lower bound on possible performance.
2. The full-year table costs time on request 2, included in the 32-query total. This experiment does not yet characterize when this precomputation is wasteful for single-use or sparse workloads.
3. Year 5000 in these test vectors has **4047 days**; its `BatchRecord` payload would be approximately 161,880 bytes if `sizeof(BatchRecord)==40`, excluding container metadata, RNS construction, allocator overhead and process RSS. No measured RAM/CPU/energy results have been obtained. The current 8MiB setting is a **payload budget**, not a hard memory ceiling.
4. The candidate is based on a copy of the baseline native service, not a new foundational mathematical algorithm. This is an initial optimizable architecture layer; more ambitious cold/exact arithmetic research remains necessary.
5. The sample does not establish conformance across all calculations, years, Foundation vicinity, negative dates, error contracts, or concurrency. Do not merge to `main`; keep the candidate in the isolated research path.

## Next experiment and acceptance gate

Measure CPU, peak RSS, cache eviction, multiple calculation days, far years, range and reverse parity, and a mixed workload that includes only one request per year. Extend independent canonical fixtures, alternate baseline/candidate order and gather repeated trials. Then consider a learned/analytical materialization threshold that accounts for real measured build cost, variable target offsets, future reuse, and memory opportunity cost.
