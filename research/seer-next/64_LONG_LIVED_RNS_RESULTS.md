# Long-lived RNS initializer cache and cap-aware D policy — completed results

2026-11-07. Research source `155597b5350a11a79929a0fc5cc5951b3434b4a0`. Completed [CI 42413422856](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42413422856), SUCCESS. Raw [long-lived-rns-d-policy.json](results/ci-155597b5350a/long-lived-rns-d-policy.json). Linux x64 host Intel Xeon Platinum 8573C.

## Exact evidence

Three fixed JDN contexts 2461007/2461247/2461593, with independent year pairs 4997/5001, 4999/5003 and 4998/5003, each supplied nine mixed R/Y/D requests. Repeat the **27 commands three times in the SAME process**, not fresh native service per round. The unchanged original Seer returned **27 unique oracles** and additionally **81/81 correct replies** in its own long-lived replay. Four candidate cold probes (512MiB and 768MiB effective `RLIMIT_AS` × two-entry thread-local/process-global immutable RNS cache) returned **324/324 complete original-equal JSON wire replies**. **All four completed/accepted** and no native resource exhaustion occurred. Linux kernel `/proc/PID/limits` and `VmPeak` below limit checked at 27,54,81 replies and completion. Each candidate had 27 exact D scheduler trace rows and 288 RNS cache trace records.

| Effective RLIMIT_AS | Cache scope | 81-request wall sum (ms) | VmPeak high water (KiB) | VmHWM RSS high water (KiB) | RNS hits / traces |
|---|---|---:|---:|---:|---|
| 512MiB | thread-local 2 slots | 37689.321 | 413536 | 150784 | 18 / 288 |
| 512MiB | process-wide 2 slots | 37331.476 | 413536 | 151704 | 18 / 288 |
| 768MiB | thread-local 2 slots | 35384.710 | 639772 | 276072 | 18 / 288 |
| 768MiB | process-wide 2 slots | 35358.161 | 694160 | 203828 | 18 / 288 |

At effective 512MiB, cap-aware D selected one worker; 768MiB selected two. At 768MiB, process-global immutable initializer sharing reduced observed peak RSS by **26.17%** (72244KiB ≈70.55MiB difference) relative to thread-local, while total native wall was within 0.08%. Yet both retained two-slot caches produced **only 18 RNS constructor hits in 288 constructor trace rows** (**6.25%**). `thread_local` maximum eviction counter was 150 at 768MiB, whereas process-wide global counter reached 268. These counters are NOT equivalent sums over all threads, so comparing their magnitude directly is invalid.

## Decision

Full wire correctness and 81-request process lifetime are accepted **for this experimental workload only**. The two-slot RNS initializer cache has a very low hit rate under three changing year/calendar contexts; process sharing materially reduces resident memory under parallel D at 768MiB, but its retained cache itself may be unnecessary. Compare against disabling initializer reuse entirely and single-entry variants under exactly the same long-lived 81-request script and caps before retaining any initializer-cache policy by default. `RLIMIT_AS` bounds virtual addresses, not physical RAM; RNS cache slot count is not a byte limit. No changes to released Seer, research ordinary hybrid or defaults.
