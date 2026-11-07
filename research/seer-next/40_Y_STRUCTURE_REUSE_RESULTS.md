# Seer Next — Y structure reuse measured outcome

Date: 2026-11-07. Source commit: `48d7fc7e6ddfdb789c643cc612a8d906eb58d4f5`. [Completed successful CI 42366626496](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42366626496). Full raw JSON: [y-struct-reuse.json](results/ci-48d7fc7e6ddf/y-struct-reuse.json). Runner AMD EPYC 7763 64-Core Processor, Linux x64.

## Exact comparison and scope

6 contexts: calculation JDN 2461290 and 2461400 × years 4999/5000/5001; two trials × three fresh native service modes (unchanged Seer, 4/2 direct-Y memo, and 4/2 memo plus structure reuse) × three successive complete Y exports per process = **108 exact JSON replies**. All candidate replies were deep-equal to original Seer. Six additional zero/tiny/cache interop scenarios with exact counter assertions passed; complete repeated full-year Y4999 passed under effective Linux RLIMIT_AS=536870912 bytes, VmPeak=457000KiB, VmHWM=73272KiB. This cap limits virtual address space, **not physical RAM**.

| Sum across 12 contexts | Original Seer | 4/2 direct memo | 4/2 memo + structure reuse |
|---|---:|---:|---:|
| First Y | 1773.144ms | 1554.407ms | 1563.320ms |
| Second Y | 1664.451ms | 80.572ms | 61.235ms |
| Third Y | 1652.033ms | 80.352ms | 64.240ms |
| All three Y | 5089.627ms | 1715.330ms | 1688.796ms |
| Maximum observed VmPeak | 493192KiB | 457000KiB | 457000KiB |
| Maximum observed VmHWM | 72780KiB | 73264KiB | 73304KiB |

Compared with the existing 4/2 memo control, structure reuse was **0.57% slower cold** (6/12 matched cold pairs quicker, 6 slower), **24.00% faster** for the second Y and **20.05% faster** for the third. Warm requests combined improved approximately **22.03%**; all-three workload improved **1.55%**. Direct service-level year structure calls fell from exactly four to exactly one. The additional structural vectors are *not* included in the BatchRecord-only memo payload budget; measured peak RSS was 40KiB higher in the opt-in arm, which is not a general memory bound or a statistically resolved change.

## Decision

**Do not adopt as default.** Confirmed elimination of redundant structure computations and a measured warm-path optimization, but not a useful cold first-query win. The dominant cold computation remains the RNS weave. Keep all results and the opt-in switch as research evidence. Do not generalize to other architectures, years, memory caps, process concurrency or end-to-end applications.
