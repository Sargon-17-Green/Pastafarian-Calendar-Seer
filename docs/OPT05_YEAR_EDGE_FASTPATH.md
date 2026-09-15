# OPT-05 — direct year-edge date answers

For a one-day native segment that is exactly the first or last day of its located Pastafarian year, `compute_segment` now returns the canonical date directly from the already-built non-woven year structure.

First day:
- first structural cutlet, day 1;
- first structural month, day 1.

Last day:
- last structural cutlet, its full cutlet length;
- last structural month, its full month length.

The structural sauce remains `fast_sauce(c, a+1, ...)` for both endpoints. No rule is inferred for interior days.

`SEER_DISABLE_EDGE_SHORTCUT=1` is a test-only escape hatch used to compare the optimized result against the former full-weave path. `SEER_TEST_WEAVE_COUNTER_FILE` is also test-only: a normal weave appends one line before constructing `RnsEngine`; an edge shortcut appends nothing. Neither appears in product responses.

The canonical-vector CI checks `y5000-start`, `y5000-end`, and `y5001-start`, plus neighbors, `c=t` interior behavior, and a calculation day that is itself a gate.
