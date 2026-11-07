# Seer Next isolated S4+S2 hybrid candidate

**Verified in limited CI workloads (42292756337, 42294275838, 42296969585), not production-ready.** This version is a separate native executable; the original Seer and the preceding S2-only candidate remain unchanged.

S4 key `(calculationJdn c, targetJdn t)` stores one immutable eight-field native result for a single-day request. In-memory LRU is capped by both `MAX_DAY_KEYS=2048` and `SEER_NEXT_DAY_CACHE_BYTES` (default 64KiB, supported range 0..1MiB), counting **record payload only**. It cannot be reused for a different calculation day. Any hit bypasses RNS weaving and does not increment the year's S2 promotion counter.

S2 uses the previous `(c,year)` full-year table with a separate payload cap `SEER_NEXT_CACHE_BYTES`. The S2 `SEER_NEXT_PROMOTE_AFTER` counter now effectively measures misses not covered by S4 on one-day queries, rather than all requests. Its threshold can be raised to avoid over-precomputing under uncertain reuse.

A new, hybrid-only `M` diagnostic reports both cache occupancies, hit counts, builds and evictions. Production `S`, `R`, `Y`, `D` replies are unchanged, including their error envelopes. `R count>1` still follows S2 and the exact original engine; S4 currently only caches a one-day segment.

**Limitations:** day and year budgets bound payload, not heap metadata, year-chain growth, intermediate RNS or total process RSS. An S2 entry can duplicate a day record in S4; this is an explicit experimental simplification to be revisited. These are not hard memory guarantees. No future-date prefetch is enabled.

Hypothesis: two identical early-year requests will avoid the second full-year construction and reduce total wall time relative to S2-only; repeated alternation across several c should reuse single records without nine full-year constructions. New matrix measurements must independently verify this. Do not infer general calendar speedup from these workload slices.

## Subsequent validation

CI [42296969585](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42296969585) completed successfully. Under a strict 80-byte **record-payload** day-cache budget (two 40-byte records), the candidate returned exactly the same JSON as Seer while recording 3 day hits and 4 day evictions. With 180000 bytes for S2 and S4 disabled, it built 3 full-year tables and evicted 3, with exact response parity. Combined small-budget S2+S4 and year-crossing ranges also passed. Independent oracle checks cover 11 selected records. See [the permanent raw results](results/ci-21f9558b74bc/hybrid-eviction.json).

This is evidence of LRU and payload-budget enforcement on those workloads, **not** enforcement of hard RSS, virtual address space, peak allocation, or disk budgets. More comprehensive oracle coverage and process-memory controls are future work.
