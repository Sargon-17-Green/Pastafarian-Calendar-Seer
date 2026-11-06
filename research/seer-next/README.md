# Seer Next — first-principles exact-engine research

**Status (2026-11-06): PHASE 0 / research initiated; no speedup asserted or implementation adopted.**

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

0. Freeze baseline identity; inventory implementation, independent oracle, platform support and existing measurements. **In progress.**
1. Measure the unchanged starting Seer with pinned, reproducible cold/warm/repeat/range/batch/concurrency workloads, full output parity and process-tree resource accounting.
2. Derive exact dependencies and cost model; prove safe invariants and conditional lower bounds only where supported. Seek algorithmic elimination of work before instruction-level acceleration.
3. Build a standalone candidate engine and differential oracle harness; first experiment: reuse of year structure, weaving checkpoints, and materialized records under hard cache budgets. No production adoption.
4. Explore direct random access to the canonical weave, alternative exact arithmetic and transitions, layout/NUMA/vectorization, persistent state, structured on-disk checkpoints, and background preparation of a future calculation day.
5. Benchmark candidates on the same pinned environments, accepting **Pareto** improvements and rejecting regressions or unproven equivalence. Compare Rust/C++/C/Assembly or mixed backends on evidence.
6. Introduce policy-based selection and bounded fallback only after exhaustive correctness and resource tests. Keep every measurement, decision, proof, counterexample and negative result in this directory.
7. Release separately after all existing Seer compatibility and release gates pass; never replace `main` by assumption.

## Artifacts and decision rules

- [00_BASELINE.md](00_BASELINE.md): fixed SHA, code-level findings, evidence vs inference.
- [01_MODEL_AND_BOUNDS.md](01_MODEL_AND_BOUNDS.md): mathematical cost model, proven statements, open questions.
- [02_EXPERIMENT_PROTOCOL.md](02_EXPERIMENT_PROTOCOL.md): measurement design, correctness gate, reporting.
- [DECISIONS.md](DECISIONS.md): research decisions and reversals.

For every experiment, retain its source, exact environment, command, raw measurements, summary, correctness artifacts, and reason to adopt/reject. Do not commit large generated data, secrets, or transient toolchains. A green run alone is not a benchmark result.
