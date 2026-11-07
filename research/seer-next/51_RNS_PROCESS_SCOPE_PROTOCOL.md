# Process-shared immutable RNS initialization — independent research protocol

Date 2026-11-07. Baseline: completed mixed CI 42397155947, report [50_RNS_MIXED_RESULTS.md](50_RNS_MIXED_RESULTS.md), raw [rns-mixed-wire.json](results/ci-094aadc6cc51/rns-mixed-wire.json).

## Hypothesis

The existing RNS initializer LRU is `thread_local`, so two simultaneously active D workers can independently retain large factorial/inverse/precomputation tables for structurally identical years. The measured thread-local 2-slot mixed workload was 23.33% faster than disabled reuse but sampled VmHWM increased from 106892KiB to 180976KiB. Try a separate, strictly opt-in `SEER_NEXT_COLD_RNS_ENGINE_SCOPE=process`, with reuse explicitly enabled, leaving `scope=thread` and reuse-disabled original behavior unchanged. This is research-only in `research/seer-next/src/seer_next_cold_weave_avx2.cpp`, not in Seer production or the ordinary research hybrid.

The process cache has a mutex-protected LRU of one/two **immutable** `RnsEngine` initializer records, keyed by exact month-length vector, prime count, RNS workers and constructor flags. Construction occurs under the lock to prevent duplicate concurrent expensive initialization and nested worker team allocation. The returned `shared_ptr<const RnsEngine>` is pinned until a caller's full weave completes so concurrent eviction cannot dangle references. All rank/sauce/approximation/replay threads/FastState and other mutable request state remain local. The slot limit does **not** enforce a process RAM or byte limit; temporarily pinned evicted engines can exceed two live objects.

## Tests and decision gates

1. Two calculation-day contexts × two trials × 18 commands of exact mixed R/Y/D wire requests. Compare unchanged original, previous thread-local 2-slot engine and new process-shared 2-slot engine in fresh native processes. All response/day/year memo controls off; RNS=4/replay=2 and 2 D dispatcher workers in uncapped runs. Total **216 complete original/candidate native R/Y/D replies**, all must match original in complete JSON.
2. Validate first A/B/A/B R queries have `[0,0,1,1]` RNS cache hits for both variants; require two independent four-field trace streams with matching first four hits and total hits, integer entries and evictions. Additional D worker traces are produced across concurrently scheduled threads and may be interleaved: do not falsely require per-line global order in files written independently.
3. Repeat the same 18 commands with unchanged Seer, thread-local candidate and process-shared candidate under a real effective Linux RLIMIT_AS=512MiB with **D dispatcher serialized to one worker**, since a two-worker capped mixed configuration already failed in CI 42395106652. This adds **54 native wire replies**. Confirm kernel effective limit and VmPeak ≤ limit, no loss of full parity. **Do not** report success of 2-worker capped D.
4. Measure 72 uncapped requests per arm, first/total wall, peak VmPeak and VmHWM. Report cache hits and all memory increases. Admit that global construction serialization may degrade contention latency even if peak memory drops.
5. Reject as general default if any full JSON mismatch, cache race, malformed or incomplete trace, 512MiB failure, missing CI evidence or significant memory regression. A successful isolated Linux x64 run is insufficient for portability, a RAM hard cap, concurrency-stress certification or release.

Any further memory-budget work must separately measure **live bytes** including GMP allocations, thread stacks, and other process state; two entries are not an enforceable RSS limit.
