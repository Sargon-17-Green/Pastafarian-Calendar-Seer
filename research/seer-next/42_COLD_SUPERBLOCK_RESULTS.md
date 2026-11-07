# RNS cold superblock sweep — completed verified results

Date 2026-11-07. Source commit: `03db6d5c2f6caa8781a400a143ff9ce6eae0d0f4`. [Completed successful CI 42368439867](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42368439867). Full raw evidence: [cold-superblock-sweep.json](results/ci-03db6d5c2f6c/cold-superblock-sweep.json). Runner: AMD EPYC 7763 64-Core Processor, Linux x64.

## Scope and exact results

Three years 4999, 5000, 5001 × two calculation JDNs 2461290, 2461400 × midpoint and penultimate-day R targets × two trials × five fixed block sizes = **120 full native R replies**, each deep-equal to unchanged Seer. Four RNS workers and two replay workers fixed. Each size has 24 full replies. No cache.

| Fixed block | Sum wall, 24 calls (ms) | Ratio vs same baseline 3241.032ms | Mean replay execution (ms) | Mean failed splits | Mean certifications |
|---|---:|---:|---:|---:|---:|
| 64 | 3111.375 | 0.9600 | 70.420 | 0.83 | 52.33 |
| 128 | 2938.486 | 0.9067 | 63.715 | 2.25 | 28.67 |
| 256 | 2859.112 | 0.8822 | 60.417 | 2.83 | 16.25 |
| **512** | **2834.938** | **0.8747** | **59.199** | 4.08 | 11.50 |
| 1024 | 2912.962 | 0.8988 | 62.456 | 4.50 | 8.75 |

Mean internal RNS engine setup was ~42.7–43.2ms, insensitive to block size. Maximum observed VmPeak was 457004 KiB; observed maximum VmHWM was 73276–73380 KiB across profiles, not a hard memory guarantee. Across 12 input classes, the best mean block was 512 in 5, 256 in 4, 1024 in 2 and 128 in 1; 64 won none.

## Engineering decision

Do **not** replace fixed 512 as the default on these data. The block-size optimum varies by context, motivating a new **pre-registered out-of-sample** adaptive trial that uses exact current-process failure counters to adjust upcoming block lengths and makes no use of oracle labels or input identity. Statistical significance, architecture portability and improvement under application workloads remain unproven.
