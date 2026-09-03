# Seer interleaved/split-thread benchmark delta

This delta does **not** change the calendar formulas or either RNS core.

It adds two benchmark entry points that allow RNS construction/count and replay to
use different thread counts, plus a hosted benchmark designed for the actual
single-cold-query objective.

## Why this delta exists

The previous hosted run was methodologically biased:

* the expensive exact self-test ran before timing;
* all scalar runs completed before all AVX2 runs;
* the same AVX2 binary produced `same-end` near 64 ms during vector validation
  but 1.1–1.4 s during the later benchmark.

That variance is much larger than the backend difference.

## New experiment

Workflow: **Seer interleaved cold benchmark**

Defaults:

* count threads: 4
* superblock: 512
* cooldown: 2 seconds
* A/B repetitions: 3

The workflow first benchmarks, before any heavy gold/oracle work.

It also runs an AVX2 replay-thread sweep for the two expensive cases:

`1, 2, 4, 2, 1`

Then it runs scalar/AVX2 in alternating order, with count=4 and replay=2.
Odd repetitions run scalar→AVX2; even repetitions run AVX2→scalar.

The correctness vector checks and exact self-test run **after** timing.

## Local smoke validation

Both split binaries were built locally and returned the same canonical five-field
outputs for `same-end` and the 3576-year far case.

On the local host, count=4/replay=2 materially improved the AVX2 candidate:

* same-end: ~42 ms total in one smoke run;
* far case: ~240 ms total in one smoke run.

These are not claims about the GitHub-hosted EPYC. The new workflow exists to
measure that machine correctly.
