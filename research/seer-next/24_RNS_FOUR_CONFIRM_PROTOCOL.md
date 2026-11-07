# Experimental 4/1 RNS confirmation and exact service profiles

Date: 2026-11-07. This is an **experiment protocol**, not a speedup claim.

## Preconditions

Earlier 48-sample [CI 42344670319](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42344670319) found 4 RNS/1 replay worker usually competitive with 3/3, with 4/1 VmPeak about 445MiB vs 3/3 ~470MiB on one runner. Individual contexts differed, and each combination was observed only twice.

The separate research hybrid service now recognizes `SEER_NEXT_EXECUTION_PROFILE=experimental4` as **4 RNS workers + 1 replay worker** for R queries and Y full-year calculations. Existing latency (3/3), balanced (3/1) and memory (1/1) profiles remain unchanged. Diagonal D keeps its established single-worker inner computation. Normal Seer sources and main are untouched.

## Confirmation

1. Run 6 independent cold-process trials each on four representative dates: early second-day, mid-year, penultimate and Foundation. Compare `3/3, 3/1, 4/1, 4/3` with the same unmodified Seer reference; 96 candidate runs in total. All 96 full JSON replies must match. Record actual VmPeak, VmHWM, stage timings and wall time.
2. Run a separate wire-level parity test with the unchanged Seer for `experimental4`, `latency`, `memory`, over 15 calls per profile, including R single/ranges, Y structure and Y full-year days, and positive/negative D diagonal requests. Disable both caches for a direct execution comparison.
3. Preserve all raw result JSON in the research branch on completed CI. Analyze per-context medians/dispersion and resource tradeoffs; no unqualified universal performance or Windows claim.

**Decision gate:** Only consider experimental4 as a candidate for latency-oriented users when it survives correctness checks and has a stable benefit without unacceptable VmPeak/RSS. It is intentionally not the default and no merge is authorized.

## Completed first confirmation — CI 42346477835

The 96 full native cold comparisons passed across six trials of four contexts and four worker settings, on an AMD EPYC 9V45 GitHub runner. All 45 complete R/Y/D service replies passed across three execution profiles. Raw data: `results/ci-3bac030f32dc/rns-four-confirm.json` and `experimental4-parity.json`.

Aggregate wall for 24 requests in each configuration: 3/3 = 2105.050 ms; 3/1 = 2183.490 ms; 4/1 = 1910.450 ms; 4/3 = 1870.566 ms. Thus 4/1 reduced total wall by 9.24% versus 3/3, while 4/3 reduced it by 11.14% but with greater maximum virtual address-space use (~549MiB vs ~445MiB for 4/1). Measured max process VmPeak for 3/3 was ~470MiB; physical RSS highs were ~37–38MiB for all. The 4/1 profile was faster than 3/3 in all four contexts **in this run**, but earlier two-run AMD EPYC 7763 Foundation results did not show that relationship. No universal performance ordering is claimed.

**Decision:** retain experimental4 as opt-in, no change to latency (3/3) default. The next cross-year CI evaluates whether this pattern generalizes beyond the four fixed target contexts.
