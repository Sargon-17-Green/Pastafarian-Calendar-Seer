# Experimental42 second-host and constrained-address verification

Source: completed [run 42358871316](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42358871316), commit `f734953dba546f7547ce9a2fa78710c79ef725dd`, Linux x64 runner CPU Intel Xeon Platinum 8370C. Raw: [results/ci-f734953dba54](results/ci-f734953dba54/README.md).

## Exact response and resource gates

- 108/108 full JSON replies matched unchanged original Seer: 27 inputs per execution profile (`experimental42`, `experimental4`, `latency`, `memory`). The check covered R (scalar/ranges, years 4999–5001), Y (year 5000 structure and days), and D (both directions).
- In the actual Linux `RLIMIT_AS` test, `experimental42` succeeded on 3 long-year **R** requests at a requested 512MiB limit. Effective limit confirmed 536870912 bytes. Peak VM 456996KiB = 446.29MiB; resident high-water 73312KiB = 71.59MiB. **This is not a hard RSS cap**.
- The independent 64MiB memory-profile test succeeded on 3 requests and one full-year cache build, while an attempted 64MiB latency configuration was explicitly refused at startup. Existing 2GiB latency cap succeeded.
- The full-year 4999 and 5001 output **under 512MiB** was not covered by this run; that is the next test.

## Cross-host cold performance

| Configuration | Intel total, 36 cases | Observed max VmPeak |
|---|---:|---:|
| 3/3 default | 5649.083ms | 482.03MiB |
| 4/1 | 7170.900ms | 446.29MiB |
| **4/2** | **5012.103ms** | **446.29MiB** |
| 4/3 | 5280.642ms | 557.46MiB |
| 4/4 | 4812.806ms | 701.47MiB |

Relative to 3/3, 4/2 reduced sampled aggregate latency by **11.28%**, retaining 35.74MiB lower observed VmPeak. However 4/4 was ~3.98% faster than 4/2 and used ~255MiB more virtual space. On the earlier AMD EPYC 9V74 run (42356282646), 4/2 had ~15.30% lower total latency than 3/3 and was the fastest of all five profiles. CPU-host and scheduling differences remain material.

**Decision:** 4/2 merits opt-in research use and further robustness tests; not a production/default replacement. A fast hosted result cannot guarantee Windows behavior, low-concurrency CPU efficiency, or a hard physical-memory limit.
