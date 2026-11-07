# Out-of-sample D cap policy falsification — completed result

Date: 2026-11-07. Research source `575f668f89908d42a33341f8d0c95e757fba2b27`. Completed [CI 42410751536](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42410751536) SUCCESS. Raw [d-policy-holdout.json](results/ci-575f668f8990/d-policy-holdout.json). Host AMD EPYC 9V74 80-Core Processor, Linux x64.

## Independent sample and numerical parity

Six predeclared calculation JDNs (2461007, 2461159, 2461247, 2461481, 2461593, 2461759), paired independently with years 4997–5003 and all distinct from earlier tuning calculation JDNs 2461290/2461400. Each group runs nine mixed R/Y/D commands against unchanged Seer and across research hybrid, thread-local two-slot RNS cold probe and shared-process two-slot RNS cold probe, at effective 512,768,1024MiB caps.

**54/54 fresh candidate processes fully accepted**, zero RESOURCE_LIMITED attempts. **486/486 full JSON candidate replies** exactly equal to original Seer, from 54 full original oracle replies. Effective Linux kernel `RLIMIT_AS`, VmPeak under cap, expected D dispatch choice (1 worker at 512MiB, 2 at 768/1024MiB), and all required RNS cache diagnostic counters/hits were validated.

| RLIMIT_AS | Regular hybrid accepted | Cold probe thread-local accepted | Cold probe process-shared accepted | Thread-local peak VmHWM | Shared-process peak VmHWM |
|---|---:|---:|---:|---:|---:|
| 512MiB | 6/6 | 6/6 | 6/6 | 146908KiB | 147432KiB |
| 768MiB | 6/6 | 6/6 | 6/6 | 269152KiB | 210304KiB |
| 1024MiB | 6/6 | 6/6 | 6/6 | 268904KiB | 201416KiB |

At 768MiB, process sharing lowered the maximum sampled physical high-water by **21.86%** versus thread-local across independent candidate processes; at 1024MiB, by **25.10%**. The process scope was slightly slower in the comparable cold-probe aggregate at these caps: 17739.448ms vs 17471.349ms at 768MiB, and 17636.199ms vs 17386.328ms at 1024MiB. These are separate process maxima and sums across six cases, not paired physical-memory measurements at the same instant. Under 512MiB the single-worker scope offers no consistent RSS improvement.

## Decision and next risk

The attempt to falsify the 512/768MiB heuristic with six unseen contexts **did not find a counterexample**, but does not prove general safety. In particular, the test created a fresh native process for every context/cap/scope. Long-lived services can retain allocator arenas, caches, and worker-related address-space reservations across many distinct calculation contexts even when each new process individually passes. Therefore keep the D policy and immutable RNS cache **research-only, default OFF**, and run a long-lived alternating-context LRU/virtual-address stress study before any policy promotion.
