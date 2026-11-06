# Seer Next — first-principles exact-engine research

**Status (2026-11-06): PHASE 3 — isolated native S2 and S4+S2 candidates implemented and measured; no production adoption. Correctness is verified only for tested samples. Cold one-shot improvements and a hard process-RAM ceiling remain open.**

This is a separate research program **inside the Seer repository**. It is intentionally not a rewrite of the normative calendar. Preserve existing production behavior, public APIs, canonical semantics, released packages, and the main branch. Never substitute agreement between Seer variants for independent canonical evidence.

## Immutable starting point

- Repository: `Sargon-17-Green/Pastafarian-Calendar-Seer`.
- Starting branch: `main`; starting commit: `7f1b3098332d891a9ea6cf8e31383d4fd39141cf`.
- Starting Git tree: `228cc7685c0ced75410c9ce57718c136de68bb30`.
- Version in that tree: `pastafarian-calendar-seer@0.2.5`.
- Research branch: `research/seer-next-first-principles-2026-11-06`.
- The original code is preserved in the initial commit's parent and by Git history. No existing source or release artifact was modified to start this work.
- Treat benchmark observations from older commits as historical, **not measurements of this starting commit**.

## End goal

An exact engine that substantially outperforms the starting Seer **on well-defined workload profiles**, while preserving results, errors, supported domain, interfaces, provenance, and deterministic fallback. There cannot be one unconditional notion of 'fastest' without declaring the workload and resource constraints.

The engine may eventually use several interchangeable strategies and/or builds: one-shot, long-lived latency-optimized, throughput-oriented, memory-bounded, storage-minimal, and opt-in predictive. Assembly is an implementation option to benchmark, not a design premise.

## Research sequence

0. Freeze baseline identity; inventory implementation, independent oracle, platform support and existing measurements. **Completed for pinned baseline.**
1. Measure the unchanged starting Seer with pinned, reproducible cold/warm/repeat/range/batch/concurrency workloads, full output parity and process-tree resource accounting.
2. Derive exact dependencies and cost model; prove safe invariants and conditional lower bounds only where supported. Seek algorithmic elimination of work before instruction-level acceleration.
3. Build a standalone candidate engine and differential oracle harness; first experiment: reuse of year structure, weaving checkpoints, and materialized records under hard cache budgets. No production adoption.
4. Explore direct random access to the canonical weave, alternative exact arithmetic and transitions, layout/NUMA/vectorization, persistent state, structured on-disk checkpoints, and background preparation of a future calculation day.
5. Benchmark candidates on the same pinned environments, accepting **Pareto** improvements and rejecting regressions or unproven equivalence. Compare Rust/C++/C/Assembly or mixed backends on evidence.
6. Introduce policy-based selection and bounded fallback only after exhaustive correctness and resource tests. Keep every measurement, decision, proof, counterexample and negative result in this directory.
7. Release separately after all existing Seer compatibility and release gates pass; never replace `main` by assumption.

## Verified research checkpoints (as of 2026-11-06)

- [42296969585](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42296969585) **completed success**: original Seer vs hybrid full-response parity, 11 selected independent saved-sum oracle cases, 156 prior differential queries, 5 new resource-constrained eviction phases (28 paired requests), and repeat/memory/CPU profiles.
- Durable evidence: [results/ci-21f9558b74bc](results/ci-21f9558b74bc/README.md), including `hybrid-eviction.json`, `oracle.json`, `profile-hybrid.json`, and `profile-matrix.json`.
- [42292756337](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42292756337): experimental S4+S2 profile showed a 28.14× total-time ratio on 32 repeated identical dates and 1.97× on nine calculation-day contexts visited twice; **not a general 28× engine speed claim**.
- A 0-byte cache setting disables the relevant layer; `SEER_NEXT_CACHE_BYTES=0` alone leaves the S4 day cache enabled. Cache budgets restrict record payload only, not metadata, RNS transient allocations or total RSS.
- Three separately configurable research-only exact-computation profiles are now under experiment: `latency` (3 RNS/3 replay workers), `balanced` (3/1), and `memory` (1/1). Results and memory limits require a new completed CI run. The primary unresolved performance problem remains **cold/one-shot arithmetic**. Hard memory constraints also remain an unsolved engineering task. Do not merge to main.

- [42307243480](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42307243480): an exact GMP DP shortcut for year day 2 passed 51 full native JSON differential cases and 8 independent oracle checks. **Performance mixed, not accepted as default**: baseline 3822.019 ms vs DP 3617.807 ms in aggregate (1.0564× ratio), with individual queries from 0.678× to 1.946×. The invalid first-only alternative was retracted after CI [42306463421](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42306463421) exposed an actual wrong month.

## Artifacts and decision rules

- [00_BASELINE.md](00_BASELINE.md): fixed SHA, code-level findings, evidence vs inference.
- [01_MODEL_AND_BOUNDS.md](01_MODEL_AND_BOUNDS.md): mathematical cost model, proven statements, open questions.
- [02_EXPERIMENT_PROTOCOL.md](02_EXPERIMENT_PROTOCOL.md): measurement design, correctness gate, reporting.
- [DECISIONS.md](DECISIONS.md): research decisions and reversals.
- [10_HYBRID_EVICTION_PROTOCOL.md](10_HYBRID_EVICTION_PROTOCOL.md): deterministic tiny-budget, full-response eviction checks.
- [11_ONLINE_UNKNOWN_COST_LIMIT.md](11_ONLINE_UNKNOWN_COST_LIMIT.md): impossibility theorem under genuinely unknown request costs.

For every experiment, retain its source, exact environment, command, raw measurements, summary, correctness artifacts, and reason to adopt/reject. Do not commit large generated data, secrets, or transient toolchains. A green run alone is not a benchmark result.
