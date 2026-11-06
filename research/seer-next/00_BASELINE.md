# Starting Seer: source-grounded baseline inventory

Inspection date: 2026-11-06. **This is a source inspection, not a performance run.**

Pinned root commit: `7f1b3098332d891a9ea6cf8e31383d4fd39141cf`. Commit parent `main` at the time of branch creation; do not silently shift the baseline when main advances.

## Verified from source

1. `docs/ARCHITECTURE.md`: specialized modular Sauce arithmetic, precomputed bidirectional gate gaps, exact structural selection, fixed-width month-length DP, RNS/CRT weaving and prefix-only output.
2. `prototype/src/seer_year_core.cpp`: `fanchor(calc)` anchors year 5000; `fadj(calc,...,next)` obtains year-to-year transitions from exact Sauce and gated candidates. The next and previous relations are **not assumed inverse**.
3. `prototype/src/seer_engine_service.cpp` `ServiceYearChain`: a deque of located years per exact calculation day; `byYear` extends the chain and indexes by integer offset, `byTarget` extends and binary-searches. `SeerEngineService::chainFor` keeps an LRU with default maximum eight calculation-day contexts (`SEER_SERVICE_MAX_CALCS`).
4. `prototype/src/seer_engine_service.cpp` `handleRange`: each year-intersecting range invokes `compute_segment`; `handleYear` invokes `build_nonweave`, and (if requested) `compute_full_year_days`.
5. `prototype/src/seer_calendar_core.cpp` `compute_segment`: computes `fast_sauce(calc, yearStart)` and `build_nonweave` on each call. For a non-edge target it invokes `weave_month_prefix(..., lastOffset+1,...)`. There is a special one-record path for the first/last day.
6. Consequently, for repeated non-edge `R calc target 1` requests to one resident service, the **source code contains no cache of the previously computed year's weave or of the returned per-day record**. It reruns the structure and prefix calculation. The size of the performance impact is **not yet measured**; instrumentation is required.
7. `query/exact-engine.mjs`: persistent service/fallback, identity hashing and bounded admission/queues. `docs/OPT06_PERSISTENT_ENGINE_SERVICE.md`: request serialization in a child; failure/timeout retires the entire FIFO generation.
8. `docs/OPT07_TRANSITION_MAP_RESEARCH.md`: transition-map binary lifting did not improve already materialized, fixed-calculation-day lookup; its production decision remains **DO NOT ADOPT** pending new evidence.
9. `docs/ROLLING_CACHE.md`: three-day rolling, SHA-verified snapshot lives in separate `cache-data` branch, not in immutable released source. It is not a general arbitrary-year structural/weave cache.
10. `bench/product`: existing product-facing performance suite includes cold process, cache hit/miss, ranges, reverse, year structure, HTTP and concurrency. It has **no performance acceptance thresholds**.
11. `docs/CONFORMANCE.md`: source of truth is the canonical Scroll/corpus, not two agreeing Seer implementations; saved-sum rule, edge/negative domain, exact canonical vectors require independent verification.

## Known fixed benchmark coordinates, not contemporary measured timings

From `prototype/BENCHMARK_CASES.md` (independent saved-sum reference fixtures):
- Calculation JDN `2461290`, target JDN `2460984`: Year 5000, cutlet index 14 / day 31, month index 18 / day 68, 37 months.
- Calculation JDN `2461290`, target JDN `2461290`: Year 5000, cutlet index 14 / day 337, month index 39 / day 69, 37 months.
- Foundation JDN `-13334246`, not the unrelated linear-axis number sometimes used in other branches.

The gate corpora cover indices -100000..100000; do not equate that with an unlimited calculation/target-day domain. The exact public error boundary is part of the contract.

## Unresolved and required measurements

- Current tree's full platform-by-platform product baseline, with package/engine identity.
- Exact repeated non-edge weave count, cold/warm latency, malloc/RSS, parent+child CPU, and output identity.
- Relative costs of year walk, structural selection, Sauce, month DP, weave generation, copying, and serialization.
- How much of reuse is useful across calculation-day changes (do **not** assume state shared across distinct c is semantically valid).
- Expected reuse distribution in end-user workloads. Sampled synthetic workloads are not automatically representative of production.
- Whether a direct random-access weave algorithm exists that is asymptotically or practically better than prefix replay.

## Baseline protection

No changes to existing canonical fixtures, source, build scripts, workflow policy, cache-data, releases, or main under this research initiation. Every later candidate must compare with this pinned commit and independent canonical evidence.
