# Seer shared query layer

This directory is the semantic adapter between calendar-result providers and user-facing adapters.

Public functions from `index.mjs`:

- `queryDate(request, options)`
- `queryNow(options)`
- `queryBatch(request, options)`
- `queryRange(request, options)`
- `queryReverse(request, options)`
- `queryCalculationDay(request, options)`
- `queryYear(year, request, options)`

The layer owns request/default semantics, exact integer handling, Gregorian/JDN conversion, observer relevance, canonical index conversion, locale-pack presentation, batch/range semantics, reverse conversion with full tuple cross-checking, and stable query errors.

Providers own only exact calendar data. `provider-precomputed.mjs` reads the rolling cache. It intentionally refuses complete-year queries because the current cache is not a complete fixed-calculation-day year source.

The CLI (`cli.mjs`) is an adapter over these functions, not a separate implementation.
