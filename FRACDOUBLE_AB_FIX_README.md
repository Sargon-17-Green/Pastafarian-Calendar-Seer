# Certified-frac A/B runner fix

> **HISTORICAL — SUPERSEDED SEMANTIC VALIDATION.** This report predates the 2026-09-10 saved-sum correction.
> Any claim below that old Seer-to-Seer equality, the old gate corpus, or the old full-date vectors established
> canonical correctness is superseded. Historical performance/source-layout observations are retained unchanged.
> Current semantic evidence is described in `HISTORICAL_VALIDATION_NOTICE.md` and `docs/CONFORMANCE.md`.

Target HEAD when prepared: `2340bbcde65b5c4c41a9e7d1195e00f221208299`.

This delta fixes one runner bug only:

- `prototype/scripts/run_fracdouble_ab.py`
- replace `time.sleep(cooldown)` with `time.sleep(cool)`.

The previous workflow reached and passed all six full-vector exactness checks, then failed before timing with `NameError: name 'cooldown' is not defined`.

After overlaying this delta, rerun **Seer AVX2 certified-frac reset A-B** with the defaults (7 repetitions, 2-second cooldown).
