# Process-scoped immutable RNS cache — completed results

Date: 2026-11-07. Research source SHA `5a387392faa9de95155da27e5194afad9eeaf1cd`; completed [CI 42399115078](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42399115078), SUCCESS. Runner: Intel Xeon Platinum 8573C / Linux x64. Raw [rns-process-shared.json](results/ci-5a387392faa9/rns-process-shared.json).

Two calculation JDNs × two trials × 18 mixed R/Y/D commands × original Seer and two experimental candidates = **216 complete native replies**, all exact. Another **54** complete replies covered original Seer, thread-local and process-shared cache with effective RLIMIT_AS=536870912 bytes and D dispatch serialized to **one worker**. Old per-thread two-slot mode remained the control; new scope=process mode is separately opt-in. Both start with two full cache misses then two hits in the A/B/A/B R lead-in, with full diagnostic schema verification.

| Arm (72 requests, four matched contexts) | Total wall | Peak VmPeak | Peak VmHWM | RNS hits |
|---|---:|---:|---:|---:|
| Unchanged Seer | 16270.672ms | 464904KiB | 92832KiB | n/a |
| Thread-local two slots | 10492.598ms | 685368KiB | 180852KiB | 39 |
| Process-scoped two slots | 10707.179ms | 685352KiB | 169240KiB | 36 |

Process-scoped aggregation was **2.05% slower** and had **6.42% lower maximum observed peak RSS** than the thread-local control. This is not a paired simultaneous-memory comparison; context-by-context, process-scoped peak RSS was higher once and lower three times. The process cache performed fewer RNS hits and serializes large engine construction, so the latency cost is plausible but not independently proven causal.

Under the capped serial-D trial, peak VmPeak=414016KiB in both, physical VmHWM=130984KiB thread-local versus 131072KiB process-scoped. No capped memory improvement was observed. The effective 512MiB limit was verified, but it is **virtual address space**, and 2/3-worker capped D is still unaccepted due to the earlier resource failure. Entry-count LRU is not a byte/RSS limit; `shared_ptr` pinning can keep evicted engines live temporarily.

## Decision

Keep thread-local behavior as the research default and process sharing off unless explicitly selected. Do not promote to production. The next experiment must isolate D-heavy concurrency (1/2/3 workers), where sharing may reduce duplication enough to compensate for serialized misses. Report actual CPU-dependent memory and latency without universal claims.
