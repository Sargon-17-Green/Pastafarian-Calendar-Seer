# Seer Next decision log

| Date | ID | Decision | Evidence | Status |
|---|---|---|---|---|
| 2026-11-06 | N-000 | Separate research branch from exact main SHA; preserve production untouched. | Git parent SHA in README, commit history. | ADOPTED |
| 2026-11-06 | N-001 | Define explicit resource/workload profiles and compare Pareto candidates, not a single universal 'speed' value. | Different cold, warm, memory, disk, throughput objectives. | ADOPTED as research method |
| 2026-11-06 | N-002 | Language/ISA undecided; first eliminate algorithmic work, then benchmark compiled kernels and hand-written assembly where justified. | No verified comparative compiler/ISA measurement yet. | RESEARCH POLICY |
| 2026-11-06 | N-003 | Investigate redundant structure/weave work on repeated same-c internal-year target requests. | `compute_segment`, `handleRange` source inspection. | PROBE REQUIRED |
| 2026-11-06 | N-004 | Keep OPT-07 weighted transition maps as non-production. | Existing `docs/OPT07_TRANSITION_MAP_RESEARCH.md`. | DO NOT ADOPT unless new evidence |
| 2026-11-06 | N-005 | Do not extrapolate performance from prior Seer releases to pinned main SHA; no fabricated baseline numbers. | Current commit differs from historical QA/benchmarks. | ADOPTED |
| 2026-11-06 | N-006 | Predictive tomorrow-calculation precomputation is opt-in and accounted against budgets. | `c` changes canonical computation; unbounded automatic work unacceptable. | DESIGN REQUIREMENT |

Future entries must include candidate SHA, commands/results or a proof reference, adoption criteria, counterexamples, and rollback path.
