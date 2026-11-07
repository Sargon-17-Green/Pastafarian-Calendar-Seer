# RNS replay-factor sweep — completed exact A/B

Source: [completed run 42356282646](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42356282646), source commit `20a47a34b248b24fb9da587f57cd576711668131`. Raw results: [rns-replay-sweep.json](results/ci-20a47a34b248/rns-replay-sweep.json).

**Correctness:** 180 individual candidate-vs-original complete JSON reply comparisons passed on AMD EPYC 9V74 (Linux x64). They cover 3 years × 2 calculation days × middle/penultimate target × 3 trials × 5 worker pairs, one fresh process per candidate request. This is a sample, not full-domain equivalence.

## Timings and memory

| RNS/replay workers | Sum wall for 36 calls | Mean per call | Max VmPeak | Max VmHWM |
|---|---:|---:|---:|---:|
| 3/3 (default) | 4478.959 ms | 124.416 ms | 482.03 MiB | 71.29 MiB |
| 4/1 | 4329.858 ms | 120.274 ms | 446.29 MiB | 71.73 MiB |
| **4/2** | **3793.881 ms** | **105.386 ms** | **446.29 MiB** | **71.74 MiB** |
| 4/3 | 4189.597 ms | 116.378 ms | 557.46 MiB | 71.82 MiB |
| 4/4 | 4019.017 ms | 111.639 ms | 701.47 MiB | 71.75 MiB |

Compared with `3/3`, `4/2` reduced aggregate wall time by **15.296%**; it reduced time by **9.445%** compared with `4/3`, and by **12.379%** compared with `4/1`. It was faster than `3/3` and `4/3` in **35/36** matched sample/trial pairs each, and was the fastest on aggregate within each of years 4999, 5000, 5001. In the same sample, `4/2`'s average RNS construction took ~38.20ms and replay execution ~52.83ms; compared with `3/3` ~47.90ms and ~62.45ms.

The resident memory (VmHWM) was similar across candidates, ~71–72MiB, so **this is not a proven physical-RAM saving**. The maximum virtual mapping size depends on OpenMP worker threads, native stack defaults, allocator and library loading. A 512MiB observed peak cannot be turned into a guaranteed minimum address space cap for other environments.

## Engineering decision

**`4/2` is the Pareto-preferred candidate among the five tested policies in THIS run for aggregated latency and observed VmPeak**. `3/3` is slower and has higher virtual space but slightly lower observed RSS high-water mark; true three-axis dominance is not proven. `4/1` has essentially identical observed VmPeak and slightly lower RSS high-water mark, although it was slower in aggregate.

The findings contradict an earlier **single-replay-worker hypothesis** and differ from previous runs on other host CPU models. Keep native production and hybrid defaults unchanged; add `experimental42` only as explicit opt-in, gated by full wire R/Y/D parity, independent oracle regression, and Linux 512MiB long-year observations. Do not claim this is a universal fastest implementation.
