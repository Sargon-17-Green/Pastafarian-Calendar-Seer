# Certified double fast path for RNS fraction reset — hosted A/B

> **HISTORICAL — SUPERSEDED SEMANTIC VALIDATION.** This report predates the 2026-09-10 saved-sum correction.
> Any claim below that old Seer-to-Seer equality, the old gate corpus, or the old full-date vectors established
> canonical correctness is superseded. Historical performance/source-layout observations are retained unchanged.
> Current semantic evidence is described in `HISTORICAL_VALIDATION_NOTICE.md` and `docs/CONFORMANCE.md`.

This delta does **not** change the default implementation. It compares the currently adopted AVX2 backend against a candidate that accelerates only the carry calculation inside `frac_state_vector()` / `uv_reset()`.

The candidate first sums `y_i/p_i` in IEEE binary64. It accepts that carry only when the binary64 result is at least `2e-9` away from the nearest integer boundary. Otherwise it recomputes the same layer through the pre-existing compensated `long double` path.

For at most 1050 terms, a deliberately loose forward-error bound for rounded divisions plus sequential binary64 summation is below about `1.3e-10`; therefore the `2e-9` acceptance margin is over an order of magnitude larger. Boundary cases do not use the fast path.

Local validation before packaging:
- full semantic equality on six canonical conversion witnesses;
- worst-weave RNS reconstruction and fraction validation pass;
- midpoint + five deterministic random ranks across SB 64/128/256/512 pass;
- diagnostic run: 199451 fast carry decisions, 26170 fallbacks (~88.4% fast / ~11.6% fallback);
- local 10-round interleaved reset medians improved roughly 35–42% on same-end, far and forward workloads.

Run GitHub Action **Seer AVX2 certified-frac reset A-B** with the defaults (7 repetitions, 2 s cooldown). Timing occurs before the heavy exact self-test.
