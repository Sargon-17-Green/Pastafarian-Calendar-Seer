# Phase 0–1 experimental protocol (pre-registered 2026-11-06)

Baseline: exact git commit `7f1b3098332d891a9ea6cf8e31383d4fd39141cf`. Candidate: explicit git SHA from the research branch. Before the first measurement, archive command, platform, CPU model, feature flags, core count, OS/kernel, compiler/version/flags, Node version, native backend, native binary SHA-256, data checksums, cache snapshot SHA, and whether input is cold or warmed.

## Correctness first

1. Run the existing exact saved-sum self-test, independent canonical vectors, positive/negative gate-domain tests, oracle differential, all Node/API/HTTP compatibility tests and release-relevant checks. A candidate cannot be accepted from a native benchmark alone.
2. On every performance case, verify full numeric output and relevant response fields (not merely `targetJdn` or record count), plus error shape/domain boundaries.
3. Verify equivalence **across sequences of requests** (cache eviction, alternate c, cold/warm, corruption fallback, timeout and restart); detect state-dependent wrong answers.
4. A mismatch is a failure even if the candidate is substantially faster.

## Workload matrix

- Single cold date: same-start, same-query, same-mid, same-end, Foundation vicinity, far-past/future.
- Repeated exact `R c t 1` with fixed `c,t`; repeated alternating targets within one year; ascending/descending sparse days.
- Same `c` and sequential target range; same target with distinct `c`; diagonal `c=t` range; year structure with and without days; reverse lookup.
- Warm and cold per-calculation-day contexts, explicit eviction and context-switch patterns; fresh process vs steady resident service.
- Batches/concurrent users at varying offered load, queues and backpressure; cache hit/miss, no-cache and corrupted-cache fallback.
- Storage-constrained and memory-constrained runs, including a clearly recorded prefetch-disabled control.
- Native direct service, public Node and HTTP measured separately to isolate algorithmic and transport overhead.

## First falsifiable diagnostic experiment

Use already present test instrumentation `SEER_TEST_WEAVE_COUNTER_FILE` and `SEER_TEST_CHAIN_COUNTER_FILE`. For fixed `c=2461290`, repeat non-edge exact one-day requests for `t=2460984` and `t=2461290`; compare the full numeric records with independent saved-sum fixtures and count `year_batch_weave` events after each query. Use a resident service with a pinned native binary, then separately test a fresh child. Confirm that `Y c 5000 0` does not weave. No code optimization before the baseline output is archived.

If repeated requests produce one weave each, that establishes **execution behavior** for the tested engine configuration, not the size of any future speedup. If they do not, review the source and instrumentation before changing design.

## Timing/statistics

Record per-sample wall clock, CPU (including native child), p50/p95/p99 only at adequate sample counts, throughput, peak/steady RSS or Windows working set, disk bytes, cold startup, and allocations where possible. Warm up until stabilized; pin core/frequency conditions as feasible; alternate A/B order; report sample counts and uncertainty. Do not compare `--smoke` with full suite or Windows Node-only CPU/RSS with Linux process-tree values. Cache-hit and exact-miss workloads are separate.

Store raw machine-readable results under `research/seer-next/results/` **only when they are real runs**; include hashes and a short verdict. No invented values. Experimental artifacts must remain bounded; clean generated binaries/workspaces without deleting pre-existing files.

## Acceptance policy

A change remains experimental until: (a) independent canonical equivalence is proven/tested to the applicable scope; (b) reproducible results show improvement in at least one named profile; (c) any regressions in other profiles are explicitly documented or mitigated by dispatch/fallback; and (d) all resource budgets are respected.

Aspirational research targets: >=10x warm repeated non-edge date latency, >=3x in at least one currently expensive cold scenario, with no unsupported-domain expansion or semantic changes. **These are hypotheses and targets, not measured results or guarantees**. A failed attempt must be preserved as evidence.

The existing `bench/product/README.md` suite remains the public performance baseline. It is not replaced by an isolated microbenchmark.
