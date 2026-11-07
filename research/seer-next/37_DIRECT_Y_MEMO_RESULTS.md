# Direct Y full-year record memo: reproducible warm speedup

Source: [completed CI 42363472716](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42363472716), source research commit `44c11b2fb985da6aa99c7f67f3c5851092d224f1`. Runner AMD EPYC 9V45 96-Core Processor, Linux x64. Raw [y-export-direct-memo.json](results/ci-44c11b2fb985/y-export-direct-memo.json).

## Scope and exact parity

Years 4999/5000/5001 under two calculation JDNs (2461290 and 2461400), two trials each. Each of the four modes — unchanged Seer, hybrid 3/3, hybrid 4/2 with no direct-Y memo and hybrid 4/2 with direct-Y memo — responded to three successive complete full-year Y calls within a fresh process. **144 full JSON responses** checked, with every day record matching the original. The memo-on mode had exactly **one table build and two table hits** after the three Y requests in all 12 contexts.

The research-only toggle `SEER_NEXT_Y_MEMO_DIRECT=1` directs explicit Y day export to the existing `yearRecords` payload-budget LRU. Its default remains 0; unchanged normal Seer and ordinary hybrid default behave as before. Day cache was disabled. Year payload budget was 8MiB, an **accounting budget for BatchRecord payload only**, not a process-RSS limit.

## Aggregate same-process wall timings (12 contexts per mode)

| Mode | First Y (cold) | Second Y | Third Y | All 36 Y calls | Max VmPeak | Max VmHWM |
|---|---:|---:|---:|---:|---:|---:|
| Original Seer | 1328.229ms | 1251.227ms | 1236.017ms | 3815.473ms | 481.63MiB | 71.17MiB |
| Hybrid 3/3 | 1339.964ms | 1233.620ms | 1233.193ms | 3806.777ms | 481.65MiB | 71.25MiB |
| Hybrid 4/2, direct memo OFF | 1198.763ms | 1081.954ms | 1072.631ms | 3353.348ms | 446.28MiB | 71.75MiB |
| **Hybrid 4/2, direct memo ON** | **1181.290ms** | **54.891ms** | **49.720ms** | **1285.900ms** | **446.06MiB** | **71.76MiB** |

The memo-on second warm Y is **19.71× faster** than the corresponding uncached 4/2 Y; third warm Y is **21.57× faster**. Across all three requests the memo-on configuration took **61.65% less total wall time**, including the first full-year build. Against unchanged Seer total wall, memo-on Y took **66.30% less**. No meaningful cold-first-query improvement is demonstrated; the observed ~1.46% first-query difference is susceptible to host noise.

The output cost (JSON formatting, pipe transfer and parsing) is included in these reported wall times. No real-world cross-process persistence, filesystem cache or web/Node API throughput claim follows. This is an isolated native service benchmark, one hosted CPU model, 12 contexts per mode.

## State integrity and resource observations

- **Zero budget**: builds=0, hits=0, keys=0, payload=0; outputs unchanged.
- **Tiny 1024B budget**: builds=0, hits=0, keys=1 without payload; outputs unchanged.
- **Y→R→Y sequence** with 8MiB: builds=1, hits=2, keys=1, correct R and Y outputs.
- **180000B single-year budget** switching Y5000→Y5001→Y5000: builds=3, evictions=2, keys=1, payload=161880B, exact replies.
- **One repeated Y4999 under 512MiB** (two full exports): complete parity, builds=1, hits=1; VmPeak=456992KiB (446.28MiB) and VmHWM=73536KiB (71.81MiB). The original test recorded configured virtual cap but did **not** independently read the kernel's effective `RLIMIT_AS`; this is addressed in the subsequent strengthened test.

## Decision

**Retain as opt-in research only**, not production/default adoption. Strong and falsifiable warm-Y acceleration in sampled workload, no evidence for cold-Y speed gain and no physical-RAM cap. The next test adds exact rather than lower-bound counters, verifies R→Y and multi-calculation-context identity separation, and records the kernel-enforced 512MiB address limit. Further portability and full-domain coverage required before any release claim.
