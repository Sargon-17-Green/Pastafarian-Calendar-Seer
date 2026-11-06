# Exact second-day calendar month shortcut — a conditional closed-form theorem

Date: 2026-11-06. **Research-only, opt-in in the isolated cold-probe executable. Not adopted to production.**

## Formal counting setup

Let `m >= 2` month labels be `0,1,...,m-1`, with positive prescribed multiplicities `l_0,...,l_{m-1}` and total `T = Σ l_i >= 2`. A valid month-label sequence is a permutation of this multiset in which the **first occurrence of each label is in numerical order**: the first 0 precedes the first 1, which precedes the first 2, and so on. Its first label is always 0. The native baseline's `ExactTable` and `initial_struct` use this ordering, and `yb_fast_choose_bi(sauce, 4, 32, N)` supplies the canonical **1-based exact rank** in the set of legal sequences.

Define suffix counts `S_i = Σ_{j=i}^{m-1} l_j`.

## Lemma 1 — legal word count

The number of valid words is

[
N = rac{T!}{left(prod_{i=0}^{m-1}(l_i-1)!ight)left(prod_{i=0}^{m-1}S_iight)}.
]

**Proof.** There are `T! / Π l_i!` distinct multiset permutations. In a uniformly random permutation, the probability that label 0 appears before all other labels is `l_0/T`, because each label has `l_i` exchangeable initial slots. Conditional on label 0 being first among all labels, the relative first-occurrence order of the remaining labels is independently governed by the same weighted-first-selection rule: next label 1 is first among labels 1..m-1 with probability `l_1/S_1`; continue recursively. Thus probability of first occurrences in the fixed order is `Π (l_i/S_i)`. Multiply by the multinomial count and cancel `l_i` against `l_i!` to obtain the formula. QED.

The numerator is divisible by the product denominator, as it counts whole words; an implementation checks exact division and fails closed if inconsistent.

## Lemma 2 — exactly two choices for the second day

Under the same ordering rule, the first two symbols are either `00` or `01` (the latter opens the next month). Their exact counts are

[
C_{00} = N rac{l_0-1}{T-1},quad C_{01} = N-C_{00}.
]

**Proof.** In a uniformly random valid sequence, delete the first 0. The remaining original multiset consists of `l_0-1` zeros plus all other labels. The ordering constraint among the first occurrences of labels 1..m-1 is invariant under repositioning the remaining zeros, so for each valid arrangement of nonzero labels, the zeros are distributed uniformly among the available remaining positions. Consequently the probability that the second position is occupied by a zero is `(l_0-1)/(T-1)`. If it is not zero, the ordering constraint forces the first new label to be 1. Multiply by `N`. QED.

In the native baseline's lexicographic order, all second-symbol 0 words precede all second-symbol 1 words. Hence the canonical rank selects 0 iff `rank <= C_00`; otherwise it selects 1. We can compute the month index, its day number (2 for month 0, 1 for month 1), and the cutlet position at zero-based offset 1 **without constructing RNS tables or replaying a weave**.

## Implementation controls and acceptance

- The shortcut exists **only** in `seer_next_cold_core.cpp` and is activated by `SEER_NEXT_SECOND_DAY_SHORTCUT=1`. The normal hybrid, preexisting full-year candidate and production core are unchanged.
- It uses arbitrary-precision integer arithmetic for `T!`, each `(l_i-1)!`, suffix products, `N`, `C_00` and `yb_fast_choose_bi`. No floating point comparisons or approximate acceptance.
- It applies only to `R` with one target at the second day of its located year and with the original edge-shortcut-disabling flag unset. All other calls take the unchanged algorithm.
- CI must compare **complete JSON replies** against the unchanged native service for multiple calculation days, separately check selected cases against the independent saved-sum oracle, assert the shortcut path was taken, and retain raw same-host latency samples. A passing CI provides test evidence; the proof applies under the explicitly stated valid-word/rank assumptions.

## Limits

This lemma optimizes one specific position, not general random access. It does not establish how to obtain a full year quickly, handle third/subsequent positions, or reduce asymptotic complexity for an arbitrary internal-day query. The next research step is an exact prefix-count dynamic algorithm for a small fixed number of initial days, bounded by measured cost rather than expanding an unproven shortcut.
