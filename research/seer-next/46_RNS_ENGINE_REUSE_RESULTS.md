# Single-entry immutable RNS engine reuse — completed result

Date 2026-11-07. Source commit `9680060a00b0005f89da49acc1028a1a6acb60c5`. Completed [CI 42372010453](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42372010453). Raw: [rns-engine-reuse.json](results/ci-9680060a00b0/rns-engine-reuse.json). Hardware: AMD EPYC 9V74 80-Core Processor, Linux x64.

## Validated test and numbers

Five years 4997/4999/5000/5002/5003 × two JDN calculation contexts × two trials = 20 contexts, each with three R queries in one process, each compared in full JSON to unchanged Seer. 60 original Seer responses + 120 baseline/candidate response comparisons in the principal matrix, plus five extra candidate R checks across year replacement and independent calculation days, totaling **125 candidate and 65 reference native R replies**. Both result caches disabled. Required exact diagnostic patterns were observed in **all 20 contexts**: disabled `[0,0,0]`, reuse `[0,1,1]`. The forced year A→B→A key sequence yielded `[0,0,0]` with capacity one. Every full native reply matched.

| Sum across 20 contexts | Original Seer | Research 4/2 no initializer reuse | Research 4/2 initializer reuse |
|---|---:|---:|---:|
| First R | 2611.937ms | 2169.545ms | 2124.082ms |
| Second R | 2369.972ms | 2036.003ms | 944.298ms |
| Third R | 2810.741ms | 2272.408ms | 1263.338ms |
| All three | 7792.650ms | 6477.956ms | 4331.718ms |
| Maximum observed VmPeak | 493576KiB | 457016KiB | 457016KiB |
| Maximum observed VmHWM | 72904KiB | 73436KiB | 73864KiB |

Relative to the **research 4/2 no-reuse** control, combined three-request wall time fell by **33.13%**, second query by **53.62%**, and third by **44.41%**. All 20 of 20 repeated second and third queries improved, while 14 of 20 first queries improved. The first-query change is within one-host measurement variation and cannot be attributed to a cache hit.

## Decision and boundaries

The initialization is expensive enough that caching identical immutable RNS constructor output is a strong candidate for *same-year repeated R workloads*. It holds large modular inverse and exact-prefix vectors beyond the existing BatchRecord cache accounting. Extra sampled peak RSS was 428KiB, but this single-host observation does **not** bound memory across years, process lifetimes or concurrent workers. Keep opt-in, never adopt globally on a single-host matrix. The follow-up tests a capacity-two LRU for alternating A/B requests, with full native parity, explicit eviction evidence and actual Linux 512MiB virtual-address limit. All original Seer and public defaults remain unchanged.
