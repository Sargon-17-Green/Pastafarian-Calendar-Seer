# Seer Next — first follow-up: cross-calculation differential and Linux peak RSS

**Evidence:** [Actions run 42287548888](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42287548888), job `128132182331`, verified success at research SHA `1f015ed33d6c253760d2229b2530690679a49261`.

## Correctness stress

- **156 sequential queries** to two independently instantiated native services: unchanged baseline and experimental per-(c,year) full-year cache.
- Nine distinct calculation-day JDNs; fixed and seeded random targets; same-day and cross-year ranges; year structure with/without days; diagonal mode; errors beyond supported domain; cache pressure with `SEER_NEXT_CACHE_BYTES=180000`.
- Every baseline and candidate **complete JSON reply matched**. Response-sequence SHA-256: `db3bc06042fd39732a8933fab4399f8f883a5b662bb0c2c43aa1bdf3b2aea8ad`.
- Independent canonical evidence remains only the known saved-sum fixture subset; differential agreement is **not proof of calendar semantic correctness** for all 156 queries.

## A/B repeated date — independent rerun, new hosted CPU

CPU reported: `AMD EPYC 9V45 96-Core Processor`, Linux x64 AVX2, Node `v24.22.2`. Note that this is a **different runner/CPU** from the first A/B; do not compare raw times across runs as though they were an architectural improvement.

| Metric | Baseline | New candidate |
|---|---:|---:|
| Native wall latency p50 after two queries (30 samples) | 82.805084 ms | 0.026280 ms |
| Warm p50 ratio (single host) | — | **3150.88×** |
| 32-request total time | 2682.659 ms | 194.211 ms |
| Total repeated-workload ratio | — | **13.81×** |
| Weaving events over 32 repeats | 32 | 2 |
| Linux native VmHWM process peak RSS | 38232 KiB | 39032 KiB |

The zero-cache control reached 38260 KiB VmHWM, 32 weave events and 82.911 ms repeated p50. The candidate peak RSS was **800 KiB higher** in this host sample, or approximately 2.09%. VmHWM is the Linux process's recorded peak resident high-water mark, **not** an enforced memory maximum or a complete allocation profile.

## Interpretation

The first A/B showed 1164.08× warm latency ratio and 14.23× total repeated-workload ratio on a different x64 host. This run independently confirms that the exact-year cache can remove most repeated work, while exhibiting a small *measured* peak-RSS increase. The new ratio, 3150.88×, is not proof of a general 3000× faster calendar engine. This is still a very narrow, already-materialized, repeat-heavy request distribution.

Measured cross-c stress and a bounded **cache payload** strengthen the experiment, but `180000`/8MiB limits do not bound native RNS construction peak RSS. Next tests should impose absolute process limits, distinguish cold/prefetch/sparse traffic, establish CPU consumption and compare larger random canonical vectors. Store negative results too.

Raw A/B and differential data with source job metadata are in the neighboring JSON files. No production source, public API or main branch was modified.
