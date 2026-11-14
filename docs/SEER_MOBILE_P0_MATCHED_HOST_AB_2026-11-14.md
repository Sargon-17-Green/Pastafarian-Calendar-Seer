# Seer mobile P0 — paired Linux baseline/candidate evidence (2026-11-14)

**Status:** completed reproducible **host** diagnostic, not physical Android P0 acceptance or p95.

## Exact identities

- GitHub Actions run: [43578667600](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43578667600)
- Raw artifact: **seer-p0-matched-linux-ab-evidence**, artifact ID **14107409125**; files: \`environment.txt\` and \`ab-results.ndjson\`.
- Baseline Seer commit: \`47827be5506aa9ba7b348c7cf6d486f9947938bf\` (before mobile batch optimization).
- Candidate checked out as PR merge commit: \`d84748beb6339734ae43eb73542f36030d83ecb5\` (PR #54, stacked on PR #53, at this run).
- Linux x86_64, Ubuntu clang **18.1.3**, options \`-std=c++20 -O2 -DNDEBUG -DSEER_MOBILE_CPPINT=1 -DSEER_NO_OPENMP=1 -pthread\`. Both engines were compiled **on the same GitHub runner** using the same flags and the exact *candidate* benchmark source.
- Gate SHA-256: positive \`4d45f05acc6eb4dee6e53757a8c1f94da2f3de0fe4d4659b0745f15e05b147a8\`; negative \`40bfbd7d76209c258fb7d4739f1ef9b10ac8bb38eb4f26690c1048aee0e4f884\`.
- Provenance of both unsigned host executables reports ABI 1, version 0.2.5, backend portable-cppint, build commit **unknown**. The source identities are verified by the Git checkout and environment manifest, not the embedded provenance string.

## Procedure

1. Compile baseline and candidate Native C ABI benchmark and independent dump executables with identical compiler flags.
2. Use fixed calculation JDN **2461290** and three target centers: **2461290** (same-year), **2458961** (start-of-year 5000), **2463008** (first day after year 5000).
3. For **each** center, independently compute a 42-record range with both the baseline and candidate dump binaries. Compare **every field of every record**: targetJdn, year, cutletIndex, dayInCutlet, monthIndex, dayInMonth, cutletCount and monthCount. Any mismatch fails the workflow.
4. For each center, run benchmark processes in balanced order **baseline→candidate→candidate→baseline**. Each process warms up each sample shape once, then records one 1-target, one 7-target and one 42-target call. Context construction is not included in sample timings. Each variant therefore has **2 measured samples per shape**.
5. Preserve full raw output, version/commit identity, compiler and binary hashes in the workflow artifact.

The comparison covers **126 canonical records in total** (42 × three centers). All 126 records matched field for field. The program emitted three \`P0_AB_PARITY_PASS\` lines and \`P0_AB_COMPLETE\`, and the job concluded **success**.

## Matched host latency (median of two samples)

All values below are in milliseconds. Ratios are baseline / candidate. These are *diagnostic medians*, not statistically reliable p50/p95 population estimates.

| Target center | Shape | Baseline ms | Candidate ms | Ratio |
|---|---|---:|---:|---:|
| 2461290, same year | 1 | 296.174 | 294.834 | 1.00× |
| 2461290, same year | 7 | 2035.278 | 291.720 | 6.98× |
| 2461290, same year | 42 | 12359.088 | 292.421 | **42.26×** |
| 2458961, year start | 1 | 0.089 | 0.082 | not meaningful: edge shortcut |
| 2458961, year start | 7 | 1899.733 | 850.830 | 2.23× |
| 2458961, year start | 42 | 17417.971 | 812.709 | **21.43×** |
| 2463008, year end | 1 | 0.101 | 0.092 | not meaningful: edge shortcut |
| 2463008, year end | 7 | 791.828 | 377.412 | 2.10× |
| 2463008, year end | 42 | 6945.185 | 364.412 | **19.06×** |

The complete individual runs (not rounded medians) remain in \`ab-results.ndjson\`. Each 42-target case was checked against the *original compiled C ABI*, not only against the separate canonical service that shares the same underlying algorithms.

## Interpretation and limitations

- **Supported:** same-runner, matched-compiler evidence strongly favors the optimized Native batch across normal and year-crossing month windows, with full per-record parity on the three tested windows.
- **Not supported:** claim of all-date mathematical correctness, thermal or energy improvement, long-run p95, Android hardware speed, Kotlin/JNI overhead, UI frame-time improvement, App Store/Play Store readiness.
- **Statistical limitation:** only two measured samples per variant and shape; environment shared but no CPU pinning/thermal stabilization. Single-query boundary results invoke the special canonical edge shortcut and must not be used as typical single-query speed.
- **Source-version limitation:** this evaluates an experimental PR merge, not a released Seer SDK. Do not update the application's pinned Seer source lock without independent acceptance.

## Next gates

1. Generate and inspect a larger **balanced physical ARM64 paired A/B distribution**, recording temperature, sustained CPU/energy behavior, input coverage and cancellation latency; 30+ per workload where practical.
2. Restore the private app CI runner/permissions issue (App issue #53), then execute the Kotlin-versus-direct-JNI harness and exact gate/AAR install checks in App PR #50.
3. Extend the Kotlin adapter and UI to actually **use batch conversion** in calendar viewports. The current provider-neutral \`PastafarianRepresentationProvider\` interface exposes only single-day \`represent()\`. Without integration, fast Native batch may remain unused by multi-day screens.
4. Retain strict canonical diff/known-answer, sanitized ABI and fuzz gates; merge only a fully verified native release.

**No merge or production app modification has been made.**
