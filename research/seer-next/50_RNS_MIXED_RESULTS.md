# Mixed R/Y/D cold-probe initializer reuse — completed outcome

2026-11-07. Research source commit `094aadc6cc51f07242345129ca0a1a69b1a7689a`. Completed [CI 42397155947](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42397155947), SUCCESS. Raw [rns-mixed-wire.json](results/ci-094aadc6cc51/rns-mixed-wire.json). Runner: AMD EPYC 9V45 96-Core Processor / Linux x64.

## Exact validation

Two calculation JDNs × two trials × 18 mixed R/Y/D commands × five modes = **360 complete native wire JSON replies**. Every research variant matched unchanged Seer; the native hybrid, cold probe without reuse, 1-slot thread-local reuse and 2-slot thread-local reuse were independently checked. Four first R queries A/B/A/B had exact expected hit patterns in each probe. Another 18 original-Seer and 18 two-slot probe requests were compared under *effective* RLIMIT_AS=536870912 bytes; all passed full equality. The capped native `D` worker count was **1**, not 2. Two D workers had failed previously at native command index 8 with `Resource temporarily unavailable` in completed CI 42395106652; that parallel capped profile remains **unaccepted**.

| Arm, 72 requests over four contexts | Total wall (ms) | Max VmPeak (KiB) | Max VmHWM (KiB) | Total RNS initializer cache hits |
|---|---:|---:|---:|---:|
| Unchanged Seer | 9566.780 | 464904 | 92928 | n/a |
| Original-weave research hybrid | 9029.393 | 413992 | 94076 | n/a |
| Experimental cold probe, cache off | 8110.520 | 677144 | 106892 | 0 |
| Cold probe, per-thread 1 slot | 7211.647 | 683604 | 160636 | 16 |
| Cold probe, per-thread 2 slots | 6218.392 | 654844 | 180976 | 38 |

For the experimental cold-probe comparable variants, two-entry reuse improved total wall **23.33%** versus no reuse, but observed peak physical memory increased **69.3%**, and uncapped virtual-address peaks exceeded 512MiB. These are sampled high-water observations across processes, not same-process instantaneous pairwise differences or a portable RAM guarantee. Under cap with serial D, max VmPeak was **414008KiB**, VmHWM **130928KiB**, and all 18 two-slot mixed commands passed; that cap is virtual address space only.

## Decision

The mixed full-wire correctness gate passes, but **keep thread-local 1-slot reuse disabled by default and 2-slot mode opt-in**. Memory growth from immutable year-specific RNS initializers retained by multiple worker threads may erase throughput benefits under strict physical memory budgets. The next research question is whether **one process-wide, mutex-controlled, shared immutable RNS engine cache** prevents duplication while retaining hit patterns. No production merge or acceptance based only on entry count is authorized.
