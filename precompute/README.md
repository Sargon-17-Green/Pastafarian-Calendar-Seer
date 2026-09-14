# Seer Venus-boundary rolling-year precomputation

This layer precomputes Seer answers so a user query never launches the expensive calendar engine.

## Canonical day boundary

The calculation day changes at the **topocentric lower meridian transit of the center of Venus** for Kisurra.
The astronomical implementation is pinned to Pastafarian Calendar `1.4.1`, model
`venus-lower-transit-jpl-approx-1`.

Kisurra is pinned to latitude `31.8383`, longitude `45.481`, elevation `0 m`.
The vendored source provenance is recorded in `provenance.json`.

The solved boundary is a floating-point Julian Date. Because JavaScript `Date` has millisecond resolution and
may TimeClip a fractional millisecond downward, `generated/index.json` activates a cache at the **ceiling
millisecond** of the solved JD. This can delay activation by less than 1 ms but can never activate it before the
astronomical root. GitHub cron is likewise rounded upward to the first UTC minute not earlier than the event.

## Cache horizon

At every maintenance run the repository contains caches for three calculation days:

- active calculation day `c`;
- `c + 1`;
- `c + 2`.

Each cache contains a rolling **366-target-day year**, starting at that calculation JDN. The next maintenance
run normally reuses the two still-valid caches and computes the newly entering `c + 2` cache as one batch.
A changed engine fingerprint invalidates and rebuilds all three.

Only these three current cache files remain in the checked-out tree. Git history retains older committed versions.

## Query contract

`precompute/cache-lookup.mjs` reads the exact precomputed boundary index, selects the calculation day, and
returns the record by array offset. `precompute/query.mjs <target_jdn>` is a thin query entry point that uses this
lookup automatically; callers do not name, warm, or otherwise manage cache files. There is deliberately **no compute-on-miss fallback**. A missing or stale
cache is an operational failure that must be caught by CI/maintenance, not paid by an end user.

## Self-scheduling

`.github/workflows/precompute-seer-cache.yml` contains two generated cron entries. Every successful run computes
the next two Venus lower-transit instants and rewrites those entries. Cron has minute resolution, so each entry is
the ceiling UTC minute after the exact event. The cache index itself holds millisecond boundary instants; query
switching does not depend on the GitHub job starting promptly.

The workflow modifies a file under `.github/workflows/`. Configure repository secret
`SEER_AUTOMATION_TOKEN` with a fine-grained PAT or GitHub App token that has **Contents: write** and
**Workflows: write** for this repository. The normal `GITHUB_TOKEN` is intentionally not relied upon for this
self-modification.

After first installing this delta, run the workflow once with `workflow_dispatch`. That bootstraps the three cache
files and rewrites the two schedule entries from the actual execution instant. Thereafter the Venus schedule is
self-maintaining.

## Local commands

```bash
node --test precompute/test/*.test.mjs
prototype/scripts/build_year_batch.sh
prototype/scripts/check_year_batch_vector.sh
node precompute/generate-cache.mjs
node precompute/validate-generated.mjs
node precompute/query.mjs <target_jdn>
```

The native executable must run with `prototype/data` as its working directory because the current Seer prototype
opens `gates_u16.bin` from the working directory. `generate-cache.mjs` handles this automatically.
