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
| 2026-11-06 | N-007 | First CI failed: probe used spaces rather than required tab-delimited native commands. | CI run 42283490299; fixed in ed36fa54. | CLOSED harness bug |
| 2026-11-06 | N-008 | Linux recomputation verified on all three architectures; Windows counters zero with likely CRLF mismatch; fix and assert exact counts. | CI run 42284571453, raw results in results/2026-11-06-smoke. | NEEDS WINDOWS RECHECK |
| 2026-11-06 | N-009 | Prove restricted 2-competitive online materialization for known variable per-request savings. | 05_VARIABLE_COST_CACHE_THEOREM.md. | PROVEN UNDER ASSUMPTIONS |
| 2026-11-06 | N-010 | Isolated native full-year table after second request passes first fixed-c A/B test: 1164.08x warm p50 and 14.23x total 32-query throughput latency reduction; zero-budget fallback correct. | CI 42286721393; results/2026-11-06-first-native-ab/ab.json and README.md. | EXPERIMENTAL ONLY — NOT ADOPTED |
| 2026-11-06 | N-011 | Follow-up native A/B passed 156 cross-c/eviction differential queries; 3150.88x warm p50 / 13.81x total repeated benchmark on a new hosted CPU, while observed VmHWM increased by 800 KiB (not a hard bound). | CI 42287548888, results/2026-11-06-second-native-ab. | EXPERIMENTAL — NOT ADOPTED |
