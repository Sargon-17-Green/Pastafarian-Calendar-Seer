# Withdrawn hypothesis: an invalid closed-form second-day shortcut

**REJECTED — DO NOT USE OR ADOPT.** Corrected on 2026-11-06 after failed independent native differential CI.

The original version of this document assumed the exact month weave requires only that the **first occurrence** of month labels be in order. It proposed

[
N_{mathrm{first-only}} =
\frac{T!}{\prod_i(l_i-1)!\;\prod_i \sum_{j=i}^{m-1}l_j}
]

and a second-day repeat count `N*(l0-1)/(T-1)`.

**This is NOT the Seer canonical legal-word count.** The native logic in `prototype/src/seer_weave_avx2.cpp` also prevents completing a later active month before earlier active months: `legal()` rejects a month `m` when `rem[m]==1 && m!=low`. Both first and **last** occurrences are ordered.

### Minimal counterexample

For month lengths `(2,2)` there are exactly two legal words under both constraints:

- `0011`
- `0101`

The original formula predicts three, because it includes `0110`, whose month 1 ends before month 0 and is therefore illegal. The canonical `ExactTable` recurrence gives **N=2**.

For lengths `(3,2)`, first-only counts six, while the canonical first-and-last legal words number three.

### Actual failed experiment

GitHub Actions run [42306463421](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42306463421) at research SHA `8061a8c396fd95a23162e19ecbbceb697d0b0a6b` completed **FAILURE**, with full-JSON differential mismatch for `calculationJdn=-13334241, targetJdn=-13335188` (second day of its located Year 5000): candidate selected month index 24/day 2, while the unchanged Seer selected month index 22/day 1. This was a **real semantic mismatch in the experimental shortcut**, not a test harness fault. No production source or release was changed.

The earlier small brute-force exercise enumerated words constrained **only by first occurrences**; it was not a valid proof of the canonical problem. The error was caught before adopting the optimization.

### Correct follow-up

See [16_SECOND_DAY_DP_EXPERIMENT.md](16_SECOND_DAY_DP_EXPERIMENT.md). A new isolated candidate computes the exact canonical dynamic recurrence and the correct 1-based canonical rank. Its speedup is unknown until CI comparisons complete; it is not assumed faster than the existing RNS engine.
