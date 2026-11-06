# Seer Next isolated S4+S2 hybrid candidate

**Unverified until its own CI passes.** This version is a separate native executable; the original Seer and the preceding S2-only candidate remain unchanged.

S4 key `(calculationJdn c, targetJdn t)` stores one immutable eight-field native result for a single-day request. In-memory LRU is capped by both `MAX_DAY_KEYS=2048` and `SEER_NEXT_DAY_CACHE_BYTES` (default 64KiB, supported range 0..1MiB), counting **record payload only**. It cannot be reused for a different calculation day. Any hit bypasses RNS weaving and does not increment the year's S2 promotion counter.

S2 uses the previous `(c,year)` full-year table with a separate payload cap `SEER_NEXT_CACHE_BYTES`. The S2 `SEER_NEXT_PROMOTE_AFTER` counter now effectively measures misses not covered by S4 on one-day queries, rather than all requests. Its threshold can be raised to avoid over-precomputing under uncertain reuse.

A new, hybrid-only `M` diagnostic reports both cache occupancies, hit counts, builds and evictions. Production `S`, `R`, `Y`, `D` replies are unchanged, including their error envelopes. `R count>1` still follows S2 and the exact original engine; S4 currently only caches a one-day segment.

**Limitations:** day and year budgets bound payload, not heap metadata, year-chain growth, intermediate RNS or total process RSS. An S2 entry can duplicate a day record in S4; this is an explicit experimental simplification to be revisited. These are not hard memory guarantees. No future-date prefetch is enabled.

Hypothesis: two identical early-year requests will avoid the second full-year construction and reduce total wall time relative to S2-only; repeated alternation across several c should reuse single records without nine full-year constructions. New matrix measurements must independently verify this. Do not infer general calendar speedup from these workload slices.
