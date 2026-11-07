# Long-lived native service / RNS two-slot cache churn — preregistered acceptance/falsification

Date 2026-11-07. Parent research commit `01a01c65cff906c996e969f5b866ab7bbbdbba62`; previous independent new-context full-wire study completed SUCCESS [CI 42410751536](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42410751536). See [62_D_POLICY_HOLDOUT_RESULTS.md](62_D_POLICY_HOLDOUT_RESULTS.md).

## Motivation and frozen contexts

All previous 54 holdout candidate trials used **fresh native processes** and returned 486 complete original-equal R/Y/D wire replies. That does not exercise a **single long-lived service** repeatedly changing year structures, exhausting and evicting the two immutable RNS initializer cache entries, or reusing the allocator after transient D threads. This study tests the missing lifetime dimension, with intentional real kernel virtual-address-space limits.

Freeze exactly three previously valid holdout calendar contexts: `2461007` years 4997/5001, `2461247` years 4999/5003, and `2461593` years 4998/5003. For each context, run the same nine exact native commands as the holdout, including R A/B/A/B, D day windows 5 forward/9 backward/13 forward, Y metadata and final R. The **27-command combined script is repeated three full rounds** in the *same native process*, without reopening the process or clearing its initializer cache, so **81 requests per process**. Source original Seer returns **27 unique independent oracle replies** and is then itself replayed in one **81-request long-lived source process** to check original determinism under identical repetitions.

## Candidate matrix

A separate experimental native cold-probe process is started for each cap **512MiB and 768MiB** × two-entry RNS initializer scope **thread-local** and **process-shared**: 4 candidate processes, up to **324 complete candidate native JSON replies**, each compared by deep equality to the corresponding original Seer oracle. All result/day/year caches are disabled; RNS/replay worker profile 4/2, OpenMP worker/stack limits 4/8/2M. Opt-in `SEER_NEXT_D_CAP_POLICY=1` with D requested=3 must choose one worker under 512MiB and two at 768MiB, from the **effective kernel RLIMIT_AS**, not the environment request.

For each fully accepted process, require all 81 full JSON replies, kernel `/proc/PID/limits` exactly equal to requested RLIMIT_AS, VmPeak within that cap, physical VmHWM recorded at the end of **each completed 27-command round** and at process end, exact four-field RNS cache/scope trace schemas with matching hit totals and the first A/B/A/B hit pattern `[0,0,1,1]`, evidence of at least one LRU eviction after alternating more than two initializer keys, and **27 D worker selection trace rows** each containing (requested=3, selected=1/2, effective cap bytes, D count=5/9/13). The shared-process cache remains `shared_ptr<const RnsEngine>` pinned across concurrent eviction; these tests do not prove a byte limit or the absence of all data races.

Recognized allocation/thread creation failures are **`RESOURCE_LIMITED`** and recorded at the first failing command after every earlier completed reply matches original; they are never counted as full acceptance. Unexpected native errors, timeouts, protocol mismatches or trace/memory assertion failures are fatal rather than `RESOURCE_LIMITED`. The CI data-completeness gate records outcomes for all four trials without pretending a completed experiment means the policy survived. Never revise original acceptance conditions after seeing the result.

## Interpretation

Compare per-round VmPeak/VmHWM and final high-water, accumulated latencies and cache-hit/eviction totals for long-lived local vs shared cache. A 512MiB Linux `RLIMIT_AS` virtual address-space bound is not a RAM/RSS bound, and an 81-request service does not prove the policy safe for all workloads or hardware. No production, released Seer, original algorithm, normal hybrid or default settings modifications.
