# Seer shared query layer — Stage 3

Stage 3 extends the shared query layer introduced in Stage 2. It does not add an HTTP server.

Added public query-layer operations:

- `queryBatch(request, options)`
- `queryRange(request, options)`
- `queryCalculationDay(request, options)`
- `queryYear(year, request, options)`

Existing `queryDate()` and `queryNow()` remain the single-date primitives.

Important semantics:

- one request instant is captured for a whole batch/range;
- fixed ranges keep one calculation day;
- `same-as-target` ranges use `c=t` for each item;
- relevance pruning is preserved: data incapable of changing a result is not validated or returned;
- `latitude` and `elevationMeters` remain ignored no-ops;
- public canonical name indices remain one-based (`1..17`, `1..47`);
- the rolling precomputed provider exposes the structure it actually has (`cutletCount`, `monthCount`) but does not fabricate a complete Pastafarian year;
- complete-year queries require a provider with a real `year()` capability. The current rolling cache provider therefore returns `SEER_UNAVAILABLE` for `queryYear()` rather than returning a partial year.

The CLI now exposes date/now/calculation-day/range/year/batch adapters over the same query layer.
