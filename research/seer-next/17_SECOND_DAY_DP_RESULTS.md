# Exact year-second-day optimization experiment — completed and not adopted

Source: CI [42307243480](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42307243480); research SHA `99dc3f9e394924abde15a0baf1eee4ce9c5bee55`; raw `results/ci-99dc3f9e3949/second-day-exact.json`. This file is an indexed analysis only; raw measurements are unchanged and preserved.

## Correctness

- 51 distinct calculation JDN contexts; the engine queried Year 5000's beginning separately for each context and requested exactly the second day.
- Full JSON replies for all 51 cases were exactly equal to unchanged Seer; 8 were checked against independent saved-sum oracle.
- Research instrumented stage traces confirmed that all 51 took the experimental DP path and avoided an RNS weave.

## Same-run latency results

| Quantity | Baseline RNS | Exact GMP dynamic recurrence |
|---|---:|---:|
| Aggregate, 51 requests | 3822.019473 ms | 3617.806761 ms |
| Median per request | 74.223047 ms | 71.057667 ms |
| Overall aggregate wall ratio | — | 1.05645× |

- The worst relative context had a 0.678× ratio, DP 117.93 ms versus baseline 79.98 ms.
- The best had a 1.946× ratio, DP 55.79 ms versus baseline 108.57 ms.
- These timings include native-service pipe request processing, not process startup. Each calculation context was unique but both services remained running. This is one CI-host sample, not a confidence interval.

**Decision:** exact recurrence is correct for tested cases but yields inconsistent and small aggregate benefit, with no proven hard-RAM improvement. **DO NOT ADOPT** as default or market a cold-algorithm speedup. Retain in an opt-in isolated research binary and keep the counterexample from the earlier invalid formula.

Future research should seek a provably cheaper prefix-count representation, exact combinatorial recurrences with certified error bounds, or reduction of RNS table construction without new per-request bigint DP overhead. Any new approach must pass correctness before performance claims.
