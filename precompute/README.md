# Seer rolling-cache tooling

This directory contains tooling for the optional Venus-boundary rolling cache.

The cache is no longer committed to `main`, bundled into npm, or embedded in immutable release artifacts. The canonical exact engine remains authoritative; cache data is only a performance hint.

See [`docs/ROLLING_CACHE.md`](../docs/ROLLING_CACHE.md) for the architecture, option analysis, runtime contract, migration and recovery policy.

## Local generation

Build the batch engine, then generate into an untracked directory:

```bash
npm run build:native
node precompute/generate-cache.mjs --output-dir=.cache-build/rolling
node precompute/validate-generated.mjs --generated-dir=.cache-build/rolling
```

`generate-cache.mjs` maintains caches for the active calculation day and the next two calculation days. Each file covers 366 target days. It reuses compatible files already present in the output directory.

`refresh-plan.mjs` performs the cheap pre-build decision used by CI:

```bash
node precompute/refresh-plan.mjs --cache-dir=.cache-build/rolling
```

## Production maintenance

`.github/workflows/precompute-seer-cache.yml` uses a stable six-hour cron. It restores the `cache-data` branch, checks whether refresh is needed, generates and validates only when necessary, then advances `cache-data`.

The workflow:

- never edits itself;
- never pushes `main`;
- never uses `[skip ci]`;
- needs only `contents: write`;
- does not require `SEER_AUTOMATION_TOKEN`;
- never includes `HANDOFF_*`.

A failed run leaves the prior cache snapshot intact and the next fixed cron still exists.

## Runtime use

Set `SEER_CACHE_DIR` to a local directory containing a verified `cache-data` snapshot. No runtime network fetch occurs.

If cache data is missing, stale, corrupt, incompatible, or outside coverage, the query provider treats it as a miss and uses the exact engine. The cache therefore cannot be the source of a canonical answer when verification fails.

## Tests

```bash
node --test precompute/test/*.test.mjs
node scripts/audit-supply-chain.mjs
```
