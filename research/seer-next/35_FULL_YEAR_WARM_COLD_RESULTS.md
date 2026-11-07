# Complete Y exports, cold and warm: no existing memo reuse

Source: [completed CI 42362308090](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42362308090), SHA `07ad5c853435aaf05e3020f53f1da3a2c7288a5d`, runner AMD EPYC 9V74 Linux x64. Raw: [full-year-warm-cold.json](results/ci-07ad5c853435/full-year-warm-cold.json).

The experiment queried each of years 4999/5000/5001 under calculation JDN 2461290 and 2461400, two independent trials. For each case a fresh Seer reference, hybrid latency=3/3 and hybrid experimental42=4/2 received **three complete Y exports**, for **108 full JSON replies**. All the research replies matched unchanged Seer; every included day record, date boundary, calendar structure and identity was compared.

| Profile | First Y, 12 processes | Second Y | Third Y | All 36 Y requests | Max VmPeak | Max VmHWM |
|---|---:|---:|---:|---:|---:|---:|
| Original Seer | 1591.405ms | 1432.530ms | 1474.858ms | 4498.794ms | 481.63MiB | 71.29MiB |
| Hybrid 3/3 | 1582.518ms | 1449.692ms | 1453.431ms | 4485.641ms | 481.65MiB | 71.19MiB |
| Hybrid 4/2 | 1344.313ms | 1230.949ms | 1233.063ms | **3808.325ms** | **446.28MiB** | 71.87MiB |

For Y full-year exports in this experiment, 4/2 reduced aggregate wall time by **15.10%** versus 3/3. Crucially, `memo.builds=0`, `memo.hits=0`, `memo.keys=0` after all three Y calls in every candidate process, even though the year cache budget was 8MiB, threshold 2 and the day cache was disabled.

**Code-level explanation:** `SeerEngineService::handleYear` called `compute_full_year_days` directly instead of the existing `yearRecords` path for R queries. The second and third Y calls repeated arithmetic; their modest speedup relative to the first call comes from already initialized process/year metadata and ordinary warm effects, **not** year memo hits.

No memory savings should be claimed for resident RSS, and the CPU model is one virtualized host. This is a strong motivation for a new opt-in shared Y/R full-year memo experiment, but does not itself demonstrate the speedup or memory safety of that change.
