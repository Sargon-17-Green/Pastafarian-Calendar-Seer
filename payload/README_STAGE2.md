# Pastafarian Calendar Seer — Stage 2 query-layer delta

This is a cumulative local delta for `Sargon-17-Green/Pastafarian-Calendar-Seer`.

It installs the corrected v1 contract plus the first shared query layer. It does not commit or push anything.

## Apply

1. Extract this ZIP next to your local `Pastafarian-Calendar-Seer` repository, or inside its parent directory.
2. Double-click `RUN_UPDATE.cmd` on Windows.
3. The updater locates the repository, verifies the file it replaces, copies the delta, runs Node tests, and writes timestamped files under `logs/`.

You may instead pass the repository path:

```powershell
powershell -ExecutionPolicy Bypass -File .\UPDATE.ps1 -RepoRoot C:\path\to\Pastafarian-Calendar-Seer
```

## Safety

- No Git commit/push is performed.
- The only existing repository file replaced by this stage is `precompute/cache-lookup.mjs`.
- If tests fail, the updater rolls back the changed/created files from this stage.
- Re-running an already-applied delta is supported.
