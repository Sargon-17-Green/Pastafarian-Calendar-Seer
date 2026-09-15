# OPT-04 — shared month-length counting table

`YBMonthDP` no longer rebuilds coefficient rows for every year. A process-local, lazily initialized immutable table stores the symmetric half-rows for `p=0..47`; lightweight `YBMonthDP` instances only select from it. C++ function-local static initialization provides thread-safe first construction.

The positional unrank stays 1-based and calendar/sauce selection is unchanged.

The verification program does not use the shared recurrence as its oracle. It recomputes `D(p,s)` using inclusion-exclusion in unbounded `cpp_int`, checks every supported `(p,s)`, impossible ranges, symmetry and stored cells, and compares representative edge/middle/block-boundary unranking against an independent oracle unranker.

The benchmark reports first construction separately from reuse and compares reuse with a local copy of the old per-instance recurrence. CI also records RSS via `/usr/bin/time -v`. Results are diagnostics, not promises.

The table helps only while the native process persists. OPT-06 addresses persistent context reuse.
