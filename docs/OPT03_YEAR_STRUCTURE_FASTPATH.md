# OPT-03 — year structure without weaving its days

Dependency: OPT-02.

The native batch source already owns the canonical non-weave year builder `yb_build_nonweave`. OPT-03 reuses that exact function through a new `seer_year_structure` executable; it does not reimplement cutlet/month selection rules.

## Fast path

`seer_year_structure <calc_jdn> <year> 0`:

1. locates the requested year once;
2. computes `fast_sauce(c, a+1)` once;
3. calls the existing `yb_build_nonweave` once;
4. emits year boundaries, cutlets and structural months;
5. never constructs `RnsEngine` and never decodes a weave.

With the third argument `1`, the same process continues from the already-built structure into the weave and emits the complete day sequence. It does not invoke a separate locator process and does not rebuild the non-weave structure.

The JavaScript exact engine prefers this executable when present. If an older environment has not built it yet, the Stage-5 locator+batch route remains as a compatibility fallback; the OPT-03 verification workflow builds the new executable and verifies the fast path explicitly.

## Verification

Local JS fixture: 2/2 PASS. A fake year-structure binary succeeded while deliberately-dead locator/batch binaries proved they were not touched.

Repository CI additionally:

- builds `seer_year_structure` against the current native engine;
- runs year 5000 without days with `SEER_TEST_WEAVE_COUNTER_FILE` and requires zero weave-counter writes;
- runs the same year with days and requires exactly one weave-counter write;
- requires structure fields from the no-days and days forms to be identical;
- compares every emitted day with the canonical `seer_year_batch` output for the same `c` and exact year boundaries;
- runs the full Node/cache/API contract suite.

`SEER_TEST_WEAVE_COUNTER_FILE` is test-only instrumentation in the native process and is never included in product query/HTTP responses.
