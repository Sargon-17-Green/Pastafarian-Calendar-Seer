# Seer Next — experimental architecture A: hierarchical exact reuse

Status: design, **not implemented, not adopted**. Date: 2026-11-06.

## Source-derived observation

In the baseline `prototype/src/seer_calendar_core.cpp`, `compute_segment` calculates `fast_sauce(calc, yearStart)` and `build_nonweave` on every call. It then calls `weave_month_prefix` for the requested prefix, except for an end-day shortcut. The portable and AVX2 implementations of `weave_month_prefix` build RNS engine state, residue/count tables, rank, approximate predictor and replay pool **per call**; they do not hold an independently reusable cross-request full-year result. The persistent service already caches *year boundary chains*, not full structures or day sequences. Do not conflate these different caches.

## Immutable identity and cache key

Use exact `Key=(semantic-engine-fingerprint, gate-corpus-fingerprints, canonical calculation JDN c, year number Y, year boundary pair a,b)`. The final pair is a consistency check, not a substitute for `c`. Per-target records use an additional `target JDN` or offset. A state computed for `c` is never silently used for `c+1`, nor for a different engine/gate revision. Rolling cache remains verified, separate and optional.

## Architecture variants to measure

1. **S0 / no derived cache**: current behavior; best control for fresh requests and smallest RAM.
2. **S1 / structure only**: keep the exact `fast_sauce` and `YBStructResult` for selected `(c,Y)`. Avoid repeated exact structural selection; weave prefix still computed on demand. Exact cost, object footprint and table construction must be measured.
3. **S2 / full year materialization**: store `vector<BatchRecord>` and index directly by zero-based day offset. This avoids repeatedly building the RNS engine and replaying prefix on warm cache hits. Full-year build cost is charged separately.
4. **S3 / checkpoints**: store only independently validated restartable weave states every `q` days; reconstruct at most `q-1` steps. Feasibility remains unknown because RNS, CRT certification, rank state and predictor must be safely serializable without changing semantics. Never assume a month label prefix alone is sufficient to restart.
5. **S4 / selective per-day records**: cache one exact day at a time; compact under random sparse access but does not reduce cost of the *first* calculation of a new day.

The best policy may combine S1/S2/S4 rather than enforce one global setting. Checkpoints S3 are a research candidate, not an existing feature.

## Memory estimate, not an RSS measurement

Baseline C++ `BatchRecord` has two 64-bit fields and six 32-bit fields. Under ordinary 8-byte alignment, the payload is **40 bytes** per record, to be checked at compile time using `sizeof(BatchRecord)`. The documented maximum year duration is 5778 days, so the contiguous record payload would require at most `5778*40=231120 bytes` (~225.7 KiB), excluding allocator/vector capacity, LRU bookkeeping, structure state, process memory and transient RNS computation. Peak *construction* RSS can be much higher; a strict memory policy must budget peak, not only resident payload.

Because all data in a given year is immutable for a fixed identity/c, a completed table can be safely shared read-only across concurrent readers after atomic publication. Concurrent construction must be coalesced or explicitly kept isolated, never expose partially produced results.

## Explicit policies

- `one-shot`: no persistence, no prefetch; minimize launch+compute and binary footprint.
- `latency`: capped derived-data resident LRU with configurable MB budget; enable S2 only on sufficient reuse.
- `memory`: hard RSS/working-set cap, prefer S0/S1 or selective S4, with strict fail-fast when reservation fails.
- `storage`: no persistent derived cache unless explicitly budgeted.
- `throughput`: permit parallel independent `c` workloads while preserving per-key construction consistency.
- `predictive`: precompute for *the future canonical calculation-day JDN*, determined from the same astronomical day-boundary rules, not by naively incrementing civil date. Opt-in, cancelable, bounded in CPU, I/O, RAM and disk, with lower scheduling priority than foreground requests.

## Proposed first implementation experiment

Build an **isolated experimental native service binary** whose public command/JSON protocol matches the baseline; do not modify production binaries or shipped API. Add an internal optional, size-bounded LRU for S2 with counters for hit/miss/build/eviction. Compare against the unchanged native service using the same input commands, same gates, same compiler/backend, same known-answer fixtures and independent oracle. First test correctness under eviction, `c` alternation, year boundaries and engine restart; only then benchmark repeated target and random same-year positions. Capture warm hit speed, cold regression from table construction, peak RSS, total CPU, cache size and process startup.

Before selecting a threshold, estimate real `B,r,h` on each representative year/target. Apply the restricted online theorem only if its constant-cost assumptions are adequately approximated; otherwise optimize with measured regret or a budgeted heuristic and report no competitive guarantee.

## Rejected shortcuts

- Cache keyed solely by target day: semantically unsafe.
- Reuse one year's weave across different calculation days without formal equivalence proof: unsafe.
- Assume binary-lifting over the *already materialized* year chain helps warm lookup: rejected in OPT-07.
- Rewrite the entire engine in assembly before isolating measured bottlenecks: no supporting evidence.
- Call an A/B result "10x faster" without fixed hardware, identical input and full correctness checks: invalid inference.

## Evidence discipline

Benchmark results and environment metadata belong in `research/seer-next/results/`. A failed CI run belongs in the decision log. Completed measured results must be recorded by run ID and commit SHA; queued/in-progress jobs are neither PASS nor BLOCKED.
