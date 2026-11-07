# RNS cross-year transfer test — pre-registered experimental protocol

Date: 2026-11-07. Source input: Seer Next research commit 3bac030f32dc04ab5557c41e4869241862d6c565, with completed 96-comparison confirmation run 42346477835.

**Question:** Does the 4/1 cold RNS/replay configuration remain favorable on different year structures, or was the observed ~9.24% time reduction largely specific to Year 5000 and the Foundation?

## Scope and controls

- Use unmodified Seer `Y(calc,year,includeDays=0)` replies to derive exact year beginning, end and length for years **4999, 5000, 5001**, independently for two calculation days, 2461290 and 2461400.
- For each of six such year/calculation pairs, choose two interior target days: middle of the located year and penultimate day. Each request is a fresh native process. No calendar date is inferred from arithmetic on an unverified year anchor.
- Run three trials of four configurations: `3/3`, `3/1`, `4/1`, `4/3`: **144 complete baseline/candidate paired queries**, with full JSON response equality to the unchanged native Seer. Record per-request stage timing, wall, VmPeak and VmHWM.
- Both cache layers off; experimental Pascal-plan sharing, factorial scratch pooling and second-day dynamic shortcut default off. No change to the experimental4 opt-in service profile.
- Report per-year and per-configuration ratios, compare with earlier Foundation and Year 5000 results, and retain all raw samples even if 4/1 performs worse in a different year.

These CI samples assess the proposed performance optimization, not full-domain correctness, hardware portability, process isolation or a hard physical RAM cap. No production/normal Seer changes or merges are authorized.

Implementation note (after failed harness CI 42347723479): the canonical `Y` reply uses **inclusive** `startJdn` and `endJdn`, with `lengthDays=endJdn-startJdn+1`. The earlier validation incorrectly omitted the `+1` and prevented benchmark execution. This is corrected before any profile measurements are interpreted.
