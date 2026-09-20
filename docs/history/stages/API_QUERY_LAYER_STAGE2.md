# API/query implementation status — Stage 2

This stage establishes a reusable query core before an HTTP server is added.

The existing rolling precompute format remains unchanged. `precompute/cache-lookup.mjs` gains a calculation-day-addressed lookup primitive while retaining the previous `loadCacheAnswer()` function for compatibility.

The public query layer does not expose whether a result came from a cache. Stage 2 introduced the provider boundary with precomputed data first; the current production chain now falls through to the Stage 5/OPT-06 exact native provider without changing request or response semantics.

## Canonical index correction

The C++ Seer and current generated cache store cutlet/month name-table positions as 0-based integers. The frozen English `SourceLanguageCatalog v1` defines public `canonicalIndex` values as 1..17 and 1..47. The query boundary is therefore the conversion point:

```text
public canonicalIndex = internal cache index + 1
```

No internal cache file is rewritten in this stage.
