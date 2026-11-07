# Seer Next — cold RNS superblock size sweep (pre-registered)

Date: 2026-11-07. **Research-only experiment; no main/default edits or predicted winner.**

## Motivation

Completed [CI 42366626496](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42366626496) showed that removing three redundant direct year structure builds improves full-year three-call latency only 1.55%, and does not improve the cold first-Y. In [cold-stages.json](results/ci-48d7fc7e6ddf/cold-stages.json), sampled non-edge single-day R queries spent roughly 40–158ms in RNS weave and about 1.8–1.9ms constructing year structure. The exact RNS weave's `superblock` parameter controls the maximum speculative segment passed to `Unknown::process` between exact certification boundaries. A large block may reduce certification overhead; a small block may reduce rollback waste when speculation fails. Which dominates depends on year and target.

## Explicit modification

Only the isolated research cold probe's `compute_segment` accepts `SEER_NEXT_COLD_SUPERBLOCK` as an integer power of two between 32 and 4096. Empty/unset preserves the pinned existing `params.superblock` (512). Invalid nonempty values are rejected. Existing RNS and replay worker overrides remain separate. The unchanged original engine, released APIs, production sources and `main` are not modified. No cache is enabled in the tested service processes.

## Acceptance matrix

- Use unmodified Seer Y metadata to locate three years (4999/5000/5001) in two calculation JDN contexts (2461290 and 2461400), derive midpoint and penultimate-day R targets, and never invent year boundaries.
- Two trials × 12 contexts × five superblocks **64, 128, 256, 512, 1024** = **120 candidate-versus-unchanged-Seer complete native R JSON parity comparisons**, using fresh processes. Worker counts fixed at four RNS and two replay for every candidate; policy comparison order rotated deterministically. Count each row and assert deep JSON equality and valid 22-column RNS timing trace; reject on any mismatch or timeout.
- Record cold spawn-to-response wall, VmPeak, VmHWM and `rnsEngineMs`, `rankMs`, `predictorSetupMs`, `replayExecutionMs`, `predictionMs`, `replayMs`, `resetMs`, `crtMs`, certifications, exact fallbacks, splits and failed speculations.
- Evaluate matched per-input ratios, median, total and worst regression; compare resource Pareto fronts. Do **not** choose a default based on one runner or a profile-specific aggregate alone. Further repeat on other CPUs/OSes before any adoption. The current profile's 512 remains the control.

## Negative and resource boundaries

RNS instrumentation writes a trace to a uniquely named temporary file, removed by a `finally` cleanup. A single service process's `VmPeak` is **not** an RSS cap or a whole-process-tree bound. Threads' virtual stack reservations affect VmPeak. Any speedup is a property of the sampled hosted CPU and these targets only.
