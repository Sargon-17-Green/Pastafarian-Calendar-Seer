# OPT-01 — request-scoped cache snapshot and shared loading

Base inspected: `0ed1fa9c5f67d3249625b814f8f4a8266c112f09`.

This optimization keeps the public query/HTTP/CLI contract unchanged. It changes only cache loading and the lifetime of the default precomputed provider inside `queryBatch` and `queryRange`.

## Behavior

- One `index.json` snapshot is loaded per default provider instance.
- A batch/range creates one default provider for the whole request.
- Each calculation-day cache file is loaded, parsed, validated and SHA-256 checked at most once per request provider.
- Concurrent requests for the same calculation-day cache share the same pending load.
- Records are addressed directly by `targetJdn - targetStartJdn`; no record scan is introduced.
- Loaded index/cache structures are recursively frozen before consumers receive references.
- Missing cache coverage remains a `RangeError`, so the Stage-5 exact fallback still handles a genuine cache miss.
- Corrupt JSON, descriptor mismatch or checksum mismatch is not a cache miss and is surfaced as `SEER_UNAVAILABLE` by the precomputed provider.
- No cross-request cache is added in OPT-01; therefore no stale cross-request version can be retained by this optimization.

## Publication/version consistency

The request provider pins one index snapshot. Each referenced cache file is checked against the descriptor SHA-256 from that snapshot before parsing. A concurrently published file that does not match the pinned index is rejected rather than mixed into the response. A later request receives a new provider and may observe the new index.

## Local preflight performed while preparing the delta

Synthetic fixture tests: 4/4 PASS.

Covered:

1. 366 records from one calculation day -> exactly one index read + one day-cache read.
2. 32 concurrent duplicate loads -> shared pending load, still two file reads total.
3. Missing coverage remains `RangeError`; checksum corruption is a non-RangeError verification failure.
4. Replacing `index.json` after the first lookup does not change the snapshot used by that request context.

Local alternating seven-run fixture benchmark (not an HTTP benchmark and not a performance promise):

- old-style independent lookup median: 205.782 ms
- shared request context median: 0.642 ms
- observed ratio in that fixture: ~320.8x

The benchmark intentionally includes first-load cost in every candidate iteration and alternates baseline/candidate order. Run `node bench/opt01-cache-request-context.mjs` on the target machine for an environment-specific result.

## Repository verification after application

Run at minimum:

```sh
node --test precompute/test/cache-request-context.test.mjs
node --test precompute/test/*.test.mjs query/test/*.test.mjs http/test/*.test.mjs
node precompute/validate-generated.mjs
node bench/opt01-cache-request-context.mjs
```

The included `verify-opt01.yml` also builds the exact native engines, runs the API contract tests, and executes these checks on GitHub Actions.
