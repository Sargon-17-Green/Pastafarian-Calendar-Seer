# Hybrid cache eviction regression — experiment 2026-11-06

This test is **not** a hard process-memory limit and not a proof of the full canonical calendar. Its goal is to cover behavior omitted by the initial hybrid CI: tiny S4 payload capacity and repeated S2 evictions across calculation days.

Five deterministic phases run in fresh baseline and hybrid native service pairs with complete JSON response equality:

1. Both caches disabled: no S2 builds, no S4 stores.
2. 80-byte S4 day-record payload budget: exactly two 40-byte day slots; repeated hits and multiple evictions required.
3. S2 budget 180000 bytes with promotion after the first year miss: several calculation days should trigger full-year builds and LRU evictions.
4. Both S2 and S4 enabled together: ensure S4 hits, S4 eviction and S2 promotion coexist without altered answers.
5. Multi-day ranges around year boundaries: equality with baseline under warmed caches.

The candidate's research-only `M` diagnostics are asserted after each phase; year/day payload and entry counts must stay within declared bounds. The parent uses `R` replies only for user-facing parity, leaving production Seer source and protocols unchanged.

**Limitations:** metadata allocation, RNS temporary state, CPU time, peak RSS, disk footprint and concurrency are not bounded by these controls. Experimental conclusions require a completed GitHub Actions run with logged evidence. Results are archived through the existing research-branch mechanism.
