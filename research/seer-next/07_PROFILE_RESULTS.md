# Seer Next — Policy-matrix findings, 2026-11-06

**Evidence:** [GitHub Actions 42291180195](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42291180195), source `893eb9772abe737d73b3a60a9faee482177f5de5`, artifact [13540091895](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42291180195/artifacts/13540091895). The artifact contains the full **213,074-byte** `profile-matrix.json` including all per-trial, per-policy timings, CPU metrics, VmHWM and native cache stats. GitHub Actions artifacts expire under repository retention policy.

144 paired comparisons: 18 scenarios × 4 policies × 2 trials. The unchanged Seer and candidate received exactly identical commands and **full JSON outputs matched** in every pair. Linux x64 / AVX2 runner: AMD EPYC 9V45, four logical CPUs. Run included one-shot/2/4/16/32 queries at early/interior/late year offsets, 18 distinct calculation-day contexts, nine repeated calculation-day contexts and eight sparse targets.

## Selected total wall-time ratios (baseline / candidate; two trials)

| Workload | Promote full year on 2nd query | Promote on 8th query |
|---|---:|---:|
| Interior target ×1 | 0.943, 0.984 | 1.000, 0.921 |
| Early target ×2 | **0.752, 0.744** (slower) | 0.996, 0.969 |
| Interior target ×4 | 1.826, 1.824 | 0.946, 1.022 |
| Interior target ×16 | 7.296, 6.813 | 1.940, 1.939 |
| Interior target ×32 | 14.083, 13.689 | 4.177, 3.588 |
| Eight sparse targets in one year | 3.349, 3.167 | **0.794, 0.787** (slower) |
| Nine calculation days visited twice each | **0.875, 0.899** (slower) | 0.987, 0.989 |
| Eighteen distinct calculation days | 0.993, 0.940 | 1.000, 1.018 |

An 8MiB payload budget and second-request promotion constructed **nine** distinct full years and recorded **zero warm year-table hits** in the nine-c two-pass workload. Native peak RSS rose roughly 2.4MiB in both trials, with 10–13% worse total wall time. A 180,000-byte payload limit built just two tables and evicted seven entries in this scenario; this is *not* a strict total RSS cap.

**Decision:** reject universal full-year promotion after exactly two requests. Preserve S2 as a specialized high-reuse option, and test S4 per-day memoization before any S2 promotion. This allows repeated *identical dates* to hit a small record without building a full year, while keeping S2 available for many *distinct* targets in the same year. This is a hypothesis awaiting new paired measurements, not yet an optimization win.

Unresolved: true hard RSS cap, moving computationally expensive work out of cold queries, independently certified random canonical answers, cross-platform stability, and concurrency safety.
