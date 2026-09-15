# Pastafarian Calendar Seer — Stage 3 query-layer delta

This is a cumulative local delta for `Sargon-17-Green/Pastafarian-Calendar-Seer`.

It includes the corrected v1 contract and Stage 2 single-date query layer, then adds Stage 3 batch/range/calculation-day/year query-layer operations. It does not add an HTTP server, commit, or push anything.

## Apply

1. Extract this ZIP next to your local `Pastafarian-Calendar-Seer` repository, or inside its parent directory.
2. Double-click `RUN_UPDATE.cmd` on Windows.
3. The updater locates the repository, verifies every existing destination against known base hashes, copies the cumulative delta, runs tests, validates the generated cache, and writes timestamped log/result files under `logs/`.

You may instead pass the repository path:

```powershell
powershell -ExecutionPolicy Bypass -File .\UPDATE.ps1 -RepoRoot C:\path\to\Pastafarian-Calendar-Seer
```

## Safety

- No Git commit/push is performed.
- The updater accepts a clean pre-Stage-2 repository or the known Stage-2 payload state.
- Unknown local edits are not overwritten.
- If verification fails, files touched by this run are rolled back from timestamped backups.
- Re-running an already-applied Stage 3 delta is supported.

## Stage 3 behavior

- `queryBatch()` captures one request instant and returns per-item semantic failures.
- `queryRange()` supports fixed `c` and `same-as-target`, exact positive/negative steps, and exact inclusive endpoints.
- `queryCalculationDay()` exposes only effective longitude; latitude/elevation remain ignored no-ops.
- `queryYear()` is fully defined at the provider boundary. The rolling 366-day provider refuses complete-year queries rather than fabricating a partial year.
