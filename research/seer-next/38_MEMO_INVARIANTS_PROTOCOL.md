# Direct-Y memo invariant gates and effective address-space enforcement

Precondition: completed CI 42363472716 passed 144 full Y JSON responses, 19.71× second-warm Y speedup on one AMD EPYC 9V45 runner, and observed LRU behavior. This is a test-strengthening phase; no modifications to the calendar engine.

Extend `profile_y_export_direct_memo.mjs` as follows:
- Require **exact** builds/hits/evictions/key counts in every interop test, rather than lower bounds. Do not accept surplus builds or evictions as success.
- Verify `R(c,t1)`, `R(c,t2)`, then `Y(c,5000,1)` with cache promotion threshold 2: one full-year table built by R, followed by exactly one Y cache hit, with complete native output equality.
- Verify `Y(c1,5000,1)`, `Y(c2,5000,1)`, then `Y(c1,5000,1)`: memo must have two keys, two builds, one hit, zero evictions with the 8MiB budget; every result must equal original Seer. No cross-calculation cache-key alias.
- In capped repeated Y4999, read `/proc/<pid>/limits` and verify the effective kernel `RLIMIT_AS` ≤536870912 bytes; separately verify VmPeak beneath that limit. This is still virtual address space and does not enforce resident physical memory.
- Correct the spawn-to-first timer so it starts before the native process is created.
- Preserve the original 144 full-Y checks, all 12 context-specific build/hit assertions and both memory metrics.

Decision: CI green only after all exact tests and complete JSON parity; do not change default memo opt-in, external release, or `main`.
