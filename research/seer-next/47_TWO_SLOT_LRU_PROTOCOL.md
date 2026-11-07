# Two-slot RNS initializer LRU — prerregistered exact A/B

Date 2026-11-07. Parent commit: `b83985e621ab841d62a410335b8174ca61528f2b`. Isolated research experiment, no change to released Seer or defaults. Baseline proof: [CI 42372010453](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42372010453).

## Hypothesis and key integrity

A single cached immutable `RnsEngine` speeds same-year successive R queries but deliberately evicts the previous initializer when requests alternate between two distinct year month-length vectors. The research-only option `SEER_NEXT_COLD_RNS_ENGINE_SLOTS=2` (default **1**, valid 1 or 2) adds an actual **two-entry LRU** to the existing `SEER_NEXT_COLD_RNS_ENGINE_REUSE=1` mode. Slots never hold more than two initializers, and the exact key remains (month-length vector, prime count, RNS worker count, constructor feature flags). The cache is per thread, not global, and no rank, sauce, FastState or replay mutable state is shared. A disabled reuse flag continues to bypass the initializer cache even if slots=2.

The old four-column `SEER_NEXT_COLD_RNS_ENGINE_REUSE_STAGE_FILE` trace remains unchanged for compatibility. A separate optional `SEER_NEXT_COLD_RNS_CACHE_STATS_FILE` trace records four nonnegative integers for each request: hit, current entries, cumulative evictions, configured slots. No cached byte budget is claimed; two large exact initializer tables could significantly increase resident memory.

## Acceptance matrix

1. Two calculation JDNs × two year pairs (4999/5000 and 5002/5003) × two trials = 8 contexts, each receiving four R requests alternating A/B/A/B. The original Seer full JSON replies are compared to capacity-one and capacity-two candidates, with all result caches disabled. **96 full native replies** in the primary matrix, including 64 candidate responses. Expected capacity-one hits `[0,0,0,0]`, entries `[1,1,1,1]`, evictions `[0,1,2,3]`; capacity-two hits `[0,0,1,1]`, entries `[1,2,2,2]`, evictions all zero.
2. Force three structurally distinct years A/B/C/A. Capacity-two must produce four misses and exactly two evictions, with full R JSON parity. Confirm year keys are structurally distinct using unchanged Y month metadata before testing.
3. Execute a three-request A/B/A case under *actual* Linux `RLIMIT_AS=512MiB`: compare full native JSON, require `[0,0,1]` hit pattern, read effective kernel limit and verify `VmPeak` beneath limit. **This is a virtual-address-space ceiling, not a physical-memory cap**. Failure means not ready for 512MiB-profile adoption; do not hide the failure.
4. Record first, second, third, fourth R request wall time (within the same process), spawn-to-first, memory peaks and all LRU trace values. The A/B order of candidate slot configurations is balanced. Raw evidence and archived source commit are required. Stronger warm improvements must outweigh additional retained memory on multiple future platforms before any production decision.

## Limits

A cache bounded only by entry count has **no hard byte or RSS upper bound**; the measured VmHWM could rise substantially with long years. Thread-local entries remain retained until the thread exits. The current research harness checks Linux x64 only. No unconditional improvement, release, default flip or merge is authorized.
