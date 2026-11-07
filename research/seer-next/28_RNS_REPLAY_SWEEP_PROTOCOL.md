# RNS replay worker count 1–4: benchmark contract

Status: research-only test specification as of 2026-11-07. No production change and no claim that two replay workers are optimal.

## Why this experiment

The 144-run cross-year CI 42348089979 invalidated the earlier claim that 4 RNS / 1 replay worker universally improves cold latency: `4/1` is slower than `3/3` in long year 4999 (and 2.76% slower in aggregate). `4/3` was 5.16% faster in aggregate but had a maximum observed VmPeak of 557MiB vs 482MiB in `3/3`. The missing point is **4 RNS / 2 replay**. A four-worker replay experiment checks diminishing returns.

## Test matrix and acceptance

Use the same unmodified year metadata and JDN generation as the successful cross-year CI: three years 4999–5001 × two calculation days (2461290, 2461400) × middle/penultimate target × three trials × configurations `3/3`, `4/1`, `4/2`, `4/3`, `4/4` = **180** candidate-vs-baseline checks. Each pair executes in a fresh native service process. Disable the two memo layers; all response JSON records must exactly match the unchanged Seer, and native RNS internal stage tracing must be valid.

Record at least per-policy response wall time, RNS engine construction, replay execution, process VmPeak and VmHWM. Compare responses by context and calculation year before aggregating. The benchmark repeats previous cases deliberately to control the cohort; its principal new observation is the **not-previously-tested replay counts 2 and 4**, not statistical replication across different machines.

## Decision criteria

Classify Pareto-nondominated options across latency, observed VmPeak and VmHWM and whether replay workers 2 materially improve year 4999 while keeping VmPeak below an observed 512MiB threshold. A measured peak below that value is *not* a guarantee that an RLIMIT_AS cap succeeds on every Linux host. Keep `3/3` default, `3/1` balanced and `1/1` memory stable. Any future hybrid opt-in 4/2 or 4/3 must pass separate full-wire parity for R/Y/D and constrained-resource testing.

Retain raw negative results and all CI evidence. No merges, releases or changes to the existing original Seer engine.

## Completed outcome, CI 42356282646

All 180 complete native responses matched the original service. The best aggregate candidate on the sampled AMD EPYC 9V74 runner was `4/2`, with 3793.881ms for 36 requests, versus `3/3` 4478.959ms, `4/1` 4329.858ms, `4/3` 4189.597ms and `4/4` 4019.017ms. Observed maximum virtual space was 446.29MiB for `4/2`, vs 482.03MiB for `3/3`, 557.46MiB for `4/3`, 701.47MiB for `4/4`. RSS highs were ~71–72MiB for all these profiles. The result is only a same-host sampled A/B, not a claim for all CPUs.

Full raw evidence: [rns-replay-sweep.json](results/ci-20a47a34b248/rns-replay-sweep.json). See [29_RNS_REPLAY_SWEEP_RESULTS.md](29_RNS_REPLAY_SWEEP_RESULTS.md) for the decision record.
