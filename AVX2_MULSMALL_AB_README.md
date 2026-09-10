# AVX2 `mul_small` A/B candidate

> **HISTORICAL — SUPERSEDED SEMANTIC VALIDATION.** This report predates the 2026-09-10 saved-sum correction.
> Any claim below that old Seer-to-Seer equality, the old gate corpus, or the old full-date vectors established
> canonical correctness is superseded. Historical performance/source-layout observations are retained unchanged.
> Current semantic evidence is described in `HISTORICAL_VALIDATION_NOTICE.md` and `docs/CONFORMANCE.md`.

This delta does **not** change the default backend. It adds an exact AVX2 candidate and a hosted A/B workflow.

Current AVX2 RNS primes are of the form `p = 2^32 - c`, with `c <= 23177`. All current `VMod::mul_small` call sites use scalar multipliers no larger than the Pastafarian maximum year length (5778). Therefore after the first pseudo-Mersenne fold, the remaining high word is exactly 0 or 1. The candidate replaces the second vector multiply in the reducer with a mask-and-add.

General 8-lane modular multiply is unchanged. Sauce v12 is unchanged. No cross-query cache, prediction, or approximation is added.

Validation in the workflow:
- primitive AVX2 `mul_small` differential checks against scalar exact modular multiplication;
- six canonical full-calendar vectors vs the adopted v12 baseline;
- cold interleaved A/B before sustained-load self-tests;
- existing exact RNS self-test after timing.

Run **Seer AVX2 mul-small A-B** with defaults first.
