# OPT-02 — real bulk use of the exact engine

Dependency: OPT-01 must already be applied.

## Implementation

- `queryBatch` and `queryRange` release item queries concurrently while retaining the public result order.
- The request-scoped precomputed provider from OPT-01 coalesces exact cache misses that become ready in the same microtask turn.
- Misses are grouped by exact calculation day `c`.
- Duplicate targets are computed once and fan out to all original waiters.
- Targets are sorted only internally; returned results keep the original request order.
- Only contiguous ascending runs are sent to `seer_year_batch`. Sparse targets are split rather than filling a large gap.
- Runs are capped at 10,000 records, matching the existing public range ceiling and native batch interface.
- Different calculation days are never merged. Therefore `same-as-target` naturally remains separate per target when each target has a distinct `c`.
- Cache hits are consumed before exact batching; only misses are sent to the native engine.
- If a bulk native run fails, that run is retried as individual exact queries so a per-item failure remains a per-item failure instead of becoming a new envelope-level error.

## Local preflight

The provider-level synthetic fixture passed 4/4 tests:

1. ten descending requested targets -> one native call for the sorted contiguous run; response order unchanged;
2. sparse and duplicate targets -> two native runs, no huge-gap expansion and no duplicate computation;
3. cache hit + exact misses -> only the misses enter the native batch;
4. forced bulk failure -> individual fallback, with one deliberately failing item remaining an item failure.

A separate repository test checks that `queryBatch` and `queryRange` execute item queries concurrently while preserving output order. That test requires the full query module and is therefore run by repository CI after application.

## Not changed

Calendar semantics, exact integer rules, presentation, canonicalIndex conversion, error JSON, batch envelope rules, range reachability rules, and the captured request instant are unchanged.
