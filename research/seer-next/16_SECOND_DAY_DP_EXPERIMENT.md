# Exact canonical second-day counts using the reference dynamic recurrence

**Status: correct in 51 native tests and 8 independent oracle cases; mixed latency. DO NOT ADOPT as the default algorithm.**

This replaces the rejected first-occurrence-only closed form [15_SECOND_DAY_EXACT_THEOREM.md](15_SECOND_DAY_EXACT_THEOREM.md). The Seer weave enforces both ordered first occurrences and ordered last occurrences of month labels. The derivation below is a transparent specialization of **existing reference code** `ExactTable`, not a novel general theorem about all possible calendar algorithms.

Let `l[0..m-1]` be the positive canonical month lengths. Define `p_h = Σ_{i=0}^{h}(l_i-1)`. The original `prototype/src/seer_weave_avx2.cpp` class `ExactTable` specifies:
- Terminal row: `f[m-1][q] = 1` at all referenced `q` (the allocated row covers `0..p[m-1]+1`).
- For `h=m-2,...,0`, `n=l[h+1]`, `q=1,...,p_h+1`:
  [
  f[h][q] = \sum_{r=0}^{q-1} \binom{n+r-2}{r}\, f[h+1][n+r].
  ]
- Exact full count `N = f[0][l0]`.

The one-step first branch (next month label 0) comprises `C00=f[0][l0-1]` legal completions; the only alternative is to open label 1, with `C01=N-C00`. The month order is lexicographic, so a canonical 1-based rank `rank=yb_fast_choose_mpz(structSauce,4,32,N)` chooses month 0 iff `rank<=C00`, otherwise month 1. This gives the complete second-day month record with no RNS weave.

The implementation under `SEER_NEXT_SECOND_DAY_SHORTCUT=1` reproduces the reference recurrence with exact GMP `mpz_class`, two sliding DP rows, and the original GMP rank selection. It is activated *only* in the isolated research cold-probe service, for a singleton second-day request, with the baseline shortcut-disabling flag unset. All production and ordinary hybrid sources remain unchanged.

**Acceptance:** compare complete JSON across 50+ calculation-day contexts and sample the independent saved-sum oracle, assert that every candidate took the intended non-RNS path, preserve both raw wall times. A correctness pass is necessary, **not sufficient** to claim a performance improvement. O(monthCount × yearLength) big-integer DP and its transient heap may actually cost more than RNS. If not faster on a useful workload, mark the proposal DO NOT ADOPT and retain the counterexample and benchmark.

Minimal enumeration checks for lengths `(2,2)` and `(3,2)` give `(N,C00)=(2,1)` and `(3,2)`, agreeing with the recurrence. Exhaustive enumeration for 17 small multiset-length combinations with all lengths at least 2 and total at most 9 confirmed the reference dynamic counts.

## Completed measurements

GitHub Actions [42307243480](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42307243480) at SHA `99dc3f9e394924abde15a0baf1eee4ce9c5bee55`, raw `results/ci-99dc3f9e3949/second-day-exact.json`: all 51 one-target responses matched the unchanged native Seer in full, including different calculation days near the Foundation and contemporary region; 8 records additionally matched the independent saved-sum oracle. All 51 invocations took the intended research fast path without an RNS weave.

The aggregated same-run native-service-pipe wall time was 3822.019473ms original vs 3617.806761ms research DP, ratio 1.05644655× (roughly 5.34% reduction). Median individual query wall time was 74.223047ms original vs 71.057667ms research. The ratio for individual contexts ranged from 0.678× (DP 47.4% slower) to 1.946× (DP 48.6% lower latency), so there is **no general speedup**. Only one sampled run and no separate DP peak-RSS measurement; treat observed differences as exploratory, not a hardware-independent guarantee.

The wrong predecessor [15](15_SECOND_DAY_EXACT_THEOREM.md) remains permanently rejected. The correct DP remains **opt-in only** and outside the normal hybrid engine; no production adoption is justified by this dataset.
