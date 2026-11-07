# Two-entry immutable RNS LRU — completed results

Date: 2026-11-07. Experiment source commit `73c4cf49b57347061567b73be1edf7200aa1e3fd`. Successful [CI 42388493020](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42388493020). Raw results: [rns-two-slot-lru.json](results/ci-73c4cf49b573/rns-two-slot-lru.json). Runner AMD EPYC 9V45 96-Core Processor, Linux x64.

## Validated scope

Two JDN calculation contexts × two year pairs (4999/5000, 5002/5003) × two trials = eight fresh-process contexts, each with four alternating R requests A/B/A/B and full JSON equality to unchanged native Seer. Main matrix: 8×4×(original Seer, one-slot RNS cache, two-slot RNS cache) = **96 full native R replies**. All cache-enabled cases had exact expected counters. One slot: hits 0,0,0,0, evictions 0,1,2,3. Two slots: hits 0,0,1,1, evictions 0,0,0,0. Additional A/B/C/A two-slot case missed all four requests and evicted twice. All complete responses were identical to original Seer.

| Sum across 8 matched A/B/A/B contexts | One slot | Two slots | Difference |
|---|---:|---:|---:|
| First request | 852.638ms | 820.258ms | -3.80% |
| Second | 822.324ms | 821.991ms | -0.04% |
| Third | 764.446ms | 395.661ms | -48.24% |
| Fourth | 728.225ms | 391.456ms | -46.25% |
| **All four** | **3167.633ms** | **2429.366ms** | **-23.31%** |
| Max observed VmPeak | 457016KiB | 457016KiB | equal in main cohort |
| Max observed VmHWM | 101124KiB | 100880KiB | same order, not a hard cap |

The separate A/B/C/A stress produced VmHWM **130868KiB**, despite only two slots; it is not directly comparable to the primary cohort because of a different workload. A full A/B/A query sequence under real Linux RLIMIT_AS=536870912 bytes passed with 2-slot hit sequence 0/0/1, VmPeak=456788KiB, VmHWM=85016KiB. `RLIMIT_AS` restricts *virtual address space*, not physical RAM.

## Decision

Keep capacity-one as the opt-in default and preserve capacity-two as a research option for alternating-year workloads. It is meaningful on the measured CPU, but memory is bounded by entry count only, not by bytes or resident-memory usage; long years and mixed application routes could behave differently. Next test must exercise the exact `R`, `Y` and `D` wire schema together, including full years and a 512MiB address-space cap, before considering a normal research-hybrid implementation or broader cache policy.
