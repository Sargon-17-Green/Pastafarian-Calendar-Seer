# RNS factorial scratch reuse: verified negative result

Source: [completed CI 42343786507](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42343786507), pinned experimental SHA `31e8e2b9272212060015cb8193b8582341166a04`. Raw evidence: [rns-fact-pool.json](results/ci-31e8e2b92722/rns-fact-pool.json).

The test invoked 26 distinct requests in each of 2 passes (52 request contexts). The ordinary native engine, cold research engine with per-pack factorial scratch allocation (`SEER_NEXT_RNS_FACT_POOL=0`), and cold research engine with one thread-local scratch vector per OpenMP worker (`SEER_NEXT_RNS_FACT_POOL=1`) returned fully equal JSON responses. **The shared Pascal-plan experiment was disabled in both research modes.**

| Metric | Original per-pack scratch | Thread-local scratch pool |
|---|---:|---:|
| Aggregate wall time, 52 queries | 6749.450272 ms | 6754.870807 ms |
| Ratio control / candidate | — | 0.999198 |
| Wall-time difference | — | +0.08031% (slower) |

The sum of concurrent pack-worker time for factorial/inverse calculations was slightly lower in the pooled mode (~0.9–1.5ms per query across the five tested scenario categories), but these are not wall-time differences. The modular DP and Pascal stages remained substantial; total response latency did not improve.

The *native process* RSS high-water mark varied between trials: off 61912 and 55988 KiB; on 56768 and 56968 KiB. VmPeak was nearly equal: off 481248 and 480232 KiB; on 481372 and 480360 KiB. These two process samples do not support a stable memory benefit. In general retaining scratch in a TLS buffer can increase resident storage, even if allocator churn is reduced.

**Decision:** correctness verified in sample, performance benefit absent. **DO NOT ADOPT** in default, memory, or latency profiles. Leave the experimental switch default off. Main and original engine remain unchanged.
