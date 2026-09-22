# API query layer — Stage 3

## Public entry points

`query/index.mjs` is the semantic entry point for non-HTTP integrations.

```js
import {
  queryDate,
  queryNow,
  queryBatch,
  queryRange,
  queryCalculationDay,
  queryYear,
} from './query/index.mjs';
```

## Batch

A batch captures the request instant once. Each item is resolved with that same instant unless it specifies an explicit calculation selector. Validation failures are per-item; malformed batch envelopes and duplicate IDs reject the whole batch.

## Range

`calculationMode: "fixed"` is the default and retains one calculation day for every target.

`calculationMode: "same-as-target"` sets `c=t` independently for every result. When an absolute `start` is supplied, unrelated calculation/observer input is pruned before validation. If boundaries are requested, longitude becomes relevant again.

`endInclusive` must be exactly reachable from `start` using `stepDays`; the implementation never silently truncates the range.

## Calculation day

`queryCalculationDay()` resolves the calculation day for an instant (default: captured request instant) and effective longitude (default: Kisurra). Latitude/elevation are accepted no-ops and never appear in output.

## Year

`queryYear()` defines the complete provider-facing year contract. A provider must supply the full fixed-calculation-day structure: year bounds, cutlet structure, month lengths/name indices, and optionally the complete day sequence.

The rolling 366-day cache alone cannot prove a complete Pastafarian year for a fixed calculation day. In the current production provider chain, such requests fall through to the Stage 5/OPT-06 exact native provider; `SEER_UNAVAILABLE` is reserved for an unavailable exact runtime rather than being an inherent year-query limitation.

## Provider boundary

The query layer depends on provider capabilities rather than cache layout. The current production chain combines the rolling precomputed provider with the exact native provider, preserving the same HTTP, CLI, and application-facing semantics across cache hits and exact fallbacks.
