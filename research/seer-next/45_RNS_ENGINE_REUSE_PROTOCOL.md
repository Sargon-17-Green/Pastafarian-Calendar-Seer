# RNS initialization reuse — immutable one-entry experimental cache

Date: 2026-11-07. Parent commit `caa4b9aa312a2b0c40bf44aae3f8c37cd4b0e15f`. Research-only. The preceding adaptive block candidate failed performance adoption despite exact output parity; see [44_ADAPTIVE_SUPERBLOCK_RESULTS.md](44_ADAPTIVE_SUPERBLOCK_RESULTS.md).

## Hypothesis and implementation

Every non-edge cold `R` request creates a new `RnsEngine` even when the same native service just processed another offset in the **same year**. Engine setup on sampled requests consumed tens of milliseconds in the earlier cold-stage traces. It constructs prime moduli, Garner prefixes, modular inverse tables and immutable per-prime-pack dynamic-programming seed states. The calculation-day-dependent rank, exact `FastState`, predictor and replay pool must **not** be reused.

Add the strictly opt-in `SEER_NEXT_COLD_RNS_ENGINE_REUSE=1` (default 0) to isolated `research/seer-next/src/seer_next_cold_weave_avx2.cpp` only. Keep a single `thread_local` `RnsEngine` initialized once and keyed by exact month-length vector, number of primes, RNS worker count and construction feature flags. A miss replaces the previous engine, a hit shares it through a read-only reference; each request still reconstructs all rank and mutating state. No cross-year or calculation-day alias is permissible. Separate research-only trace reports [hit,prime count,workers,pack count]. This is **not** part of the ordinary year/day memo, and it may consume significant additional live memory, not covered by an 8MiB `BatchRecord` payload limit.

## Validation matrix

1. Build unchanged original Seer and isolated cold probe. Five years 4997,4999,5000,5002,5003 × two calculation days × two trials = 20 contexts. Derive three interior-to-late target JDNs from unchanged Seer `Y` metadata, then send three `R` requests to each fresh native service process. Compare **every complete native R JSON** for three modes: original Seer, fixed 4 RNS/2 replay without engine reuse and the identical fixed profile with engine reuse. This produces **180** R replies in the primary A/B; additionally test **five** native R replies for forced cross-year eviction and different calculation contexts in each relevant set. The benchmark JSON reports 125 candidate and 65 reference native R replies, all exact.
2. Disable `SEER_NEXT_CACHE_BYTES` and `SEER_NEXT_DAY_CACHE_BYTES` in *all* processes to isolate engine initialization and avoid response-cache confounds. No Y full-year payload or day memo.
3. Enforce exact engine trace hit patterns: `[0,0,0]` without reuse and `[0,1,1]` for same-year reuse. A year A→B→A itinerary must miss all three times under the capacity-one invariant. Reusing month lengths across distinct calculation days remains valid only because rank, sauce and all mutable state are regenerated independently and full native reply equality is required.
4. Record cold first R, warm second R, third R, sum, spawn-to-first, observed peak virtual memory, maximum RSS, and prime/pack metadata. The new `RnsEngine` retainment cost is a **Pareto tradeoff**, not a free cache win. Failed equality, unexpected hit/miss, RSS regression outweighing latency benefit or any CI failure blocks adoption.
5. Leave original Seer, public APIs, production defaults, `main`, releases and system state unchanged. No performance number is claimed before a completed passing CI run. A single GitHub-hosted CPU is not a global latency guarantee.

## Risks

The one-entry engine is keyed by exact month-length vector rather than mere year number. Its data include large factorial/modular inverse arrays. The flag stays disabled by default and the memory increase must be measured in actual VmHWM, not just VmPeak or payload-budget counters. Native processes may limit thread count/address space differently; multi-CPU portability and hard RAM caps remain separate acceptance gates.
