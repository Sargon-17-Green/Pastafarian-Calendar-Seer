# RNS initializer cache — mixed R/Y/D wire validation

2026-11-07; preregistered independent experiment. Research parent: `2dd85de901af3d78dad8391b86d6e60b4dfcc591`. Previous two-slot R-only experiment passed [CI 42388493020](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42388493020); see [48_TWO_SLOT_LRU_RESULTS.md](48_TWO_SLOT_LRU_RESULTS.md).

## Why a separate integration check

The initializer cache lives in the **research cold-probe** RNS weave implementation, not in the ordinary research hybrid's `prototype`-derived weave and not in released Seer. R-only speed measurements do not establish that a cached initializer is safe when `Y` complete-year, `Y` metadata-only and `D` date enumeration are interleaved with `R` range queries. In particular, even when the exact month-length vector repeats, each `weave_month_prefix` must regenerate the calculation-dependent rank and all mutable replay state; only immutable modular pack initialization is reused.

## Validation

1. Two independent calculation JDN contexts (2461290 and 2461400) × two trials. Derive 4999/5000/5001 year boundaries **from unchanged Seer**. Issue a deterministic 18-command mixed script per context, including alternating A/B/A/B R commands, R length 1/4/8, metadata-only Y, complete Y years 4999, 5000, 5001, and positive/negative D. Compare five modes, each in its own process: unchanged native Seer, ordinary research hybrid 4/2, research cold-probe 4/2 with reuse disabled, 4/2 with single initializer, 4/2 with two-entry LRU. All result/day/year caches are disabled. **360 full native R/Y/D replies** must be deep-equal to the corresponding original Seer replies.
2. Validate that the first four R calls produce initializer misses [0,0,0,0] for zero-/one-slot modes and [0,0,1,1] for the two-slot mode, and that cache trace values are integral, slot bounded, with monotonically non-decreasing eviction counters. Later R/Y/D paths may invoke multiple weaves; every actual weave emits one diagnostic row. No assumptions are made about memo hits from non-weave Y metadata.
3. Repeat the full 18-command mixed script for one calculation context with unchanged original Seer and with the research two-entry candidate under a **real effective Linux RLIMIT_AS=512MiB**. Verify full wire parity, effective cap from `/proc/PID/limits`, and maximum VmPeak ≤ cap; also record physical-memory VmHWM. This adds **36 capped/native comparison replies**, separate from the primary matrix.
4. Measure per-request cold/warm wall latency, summed full-wire time and process VmPeak/VmHWM for each arm. Report total R, Y, D replies by command type; use complete JSON deep equality, not hash-only comparisons. Record a hash only to identify raw outputs without retaining large complete Y responses in versioned artifacts.
5. No production or `main` modification, no default cache enablement, no global memory-bound claim. A green mixed test is only a portability gate, not enough to justify a release or an unconditional speedup claim.

## Risks and rejection conditions

Any full wire mismatch, wrong early initializer hit pattern, invalid cache trace, cap failure, incomplete task or non-terminating request blocks promotion. Two-entry storage is not byte bounded and retains large modular inverse/precomputation vectors. The host-specific RSS measurement is descriptive, not a constraint enforced by this cache; a separate byte-budget and concurrent-load test are required before production adoption.
