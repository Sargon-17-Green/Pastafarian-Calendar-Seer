# Experimental Seer Mobile contiguous-batch acceleration

**Branch:** `experiment/seer-mobile-contiguous-batch-20261113`.  
**Status:** UNVERIFIED / DO NOT MERGE until complete CI and performance evidence.

## Problem

The mobile C ABI supports `seer_mobile_query_batch`, but the prior implementation calls `compute_one` for every target. The physical Android P0 pilot (Seer draft PR #51) observed approximately 601 ms per target and approximately 25.3 seconds for 42 targets, from only two repetitions. A batch therefore saves JNI crossings without materially amortizing the native calculation.

The underlying `seer_native::detail::compute_segment(calc, first, last, gates, stones, year, params)` can generate an *exact contiguous range within one Pastafarian year* using one structural derivation and prefix weave, rather than running it independently for every target.

## Scope of the experiment

When there are **at least two** target JDNs, the function checks whether they form a strictly increasing contiguous sequence without `int64_t` overflow. It also checks whether calculation and target bounds lie inside the loaded bidirectional Gate corpus.

Only in that case does it resolve the target year once. If the whole range belongs to the same returned year, it calls `compute_segment` once and converts every record back into the unmodified C ABI struct.

All noncontiguous, duplicate, descending, boundary-crossing and out-of-domain requests continue through the original per-item loop. If the candidate bulk derivation fails unexpectedly, the function retries the original per-item path; cancellation still returns its ordinary status.

The public ABI, status values, wire formats, package-version provenance, canonical source of truth and Android Kotlin API are unchanged.

## Correctness requirements

Results must match `seer_mobile_query` field for field, including each target JDN, year, cutlet/month indices, ordinal days and cutlet/month counts. No variation in canonical semantics is permitted.

The expanded `seer_mobile_abi_test.cpp` compares:
- seven consecutive days, 42 consecutive days;
- reversed order;
- duplicate days;
- sparse targets;
- invalid final target;
- cancellation on a contiguous batch.

The existing `check_mobile_parity.py` and `check_mobile_known_answers.py` must also pass. These tests are necessary but **not sufficient** to conclude all years/edges are covered. Before merge, extend randomized differential testing to year boundaries, negative JDNs, far-year dates and cases using the optimized branch rather than fallback.

## Performance validation

The experimental fast path targets the month-view pattern (42 adjacent dates, one calculation JDN). Compare with the unchanged Native ABI on identical arm64-v8a hardware and environment, including warm/cold paths, memory, cancellation, device temperature, battery state, and `p50`/`p95` from at least 30 samples. A CPU-emulated Linux runner cannot establish physical ARM64 latency or energy savings.

Do **not** conclude an improvement from source inspection alone. Benchmark via `prototype/tests/seer_mobile_p0_bench.cpp` with exactly matched binaries and Gates corpora. Log SHAs, compilation options and provenance.

## Integration and release

This is an independent **stacked draft experiment** built on Seer P0 draft PR #51. It must not be merged into production solely to unblock the Kotlin module. When correct and beneficial, evaluate a versioned native engine release and update the application's exact pinned `seer-source.lock` only after the AAR, emulator tests and physical Android parity pass.

The application Kotlin/JNI diagnostic lives separately in the app's draft PR #50. It must not be used to infer performance of this still-unreleased fast path.
