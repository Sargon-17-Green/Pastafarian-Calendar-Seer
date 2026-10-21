# API exact-provider Stage 5

## Runtime path

1. Query layer resolves `(calculationJdn, targetJdn)` exactly as before.
2. `createPrecomputedProvider()` first attempts the verified rolling cache.
3. A normal cache miss invokes `prototype/build/seer_year_batch` (or `SEER_YEAR_BATCH_BIN`).
4. `/v1/year/{year}` invokes `prototype/build/seer_year_locator` (or `SEER_YEAR_LOCATOR_BIN`) to obtain exact year boundaries, then asks the same batch engine for every day of that year.
5. Cache corruption is **not** silently hidden by exact fallback; only ordinary absence/out-of-window misses fall through.

The HTTP adapter is unchanged and remains only an adapter over the query layer.

## Year structure reconstruction

The year locator includes `year_fast_bench_v12.cpp` directly with its benchmark `main` renamed, so it calls the same `fanchor`/`fadj` year-selection functions instead of reimplementing the calendar. The provider reconstructs cutlet extents and each selected month's length from the canonical day records emitted by `seer_year_batch`. This is an adapter operation over canonical records, not a second calendar algorithm.

## Current domain boundary

The native engine and bundled gate corpus remain the authority for the currently calculable domain. Inputs outside that domain fail explicitly; they are never approximated and are never reported as cache misses.
