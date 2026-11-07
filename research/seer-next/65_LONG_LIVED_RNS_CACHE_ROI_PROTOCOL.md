# 81-request long-lived cache ROI — reuse OFF versus 1/2 slots per thread/process

Preregistered 2026-11-07. Parent research SHA `bab1c998ebfb01d75884c1e4fd6a6bb5b2cc9ff5`. Grounded by completed [CI 42413422856](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42413422856), report [64_LONG_LIVED_RNS_RESULTS.md](64_LONG_LIVED_RNS_RESULTS.md) and raw archived evidence. Previous candidate cold-probe two-slot initializer caches attained only 18/288 RNS initializer hits (6.25%) in mixed long-lived context churn. Instead of assuming a two-slot cache is useful, measure its marginal value in time and physical/virtual memory against no initializer reuse.

## Frozen method

Reuse exactly three predefined JDN/years and nine-command mixed R/Y/D contexts from the prior 81-request study: JDN 2461007 (4997/5001), 2461247 (4999/5003), 2461593 (4998/5003), concatenated and replayed **three full rounds in a single native process** (27×3=81 candidate replies per native process). The unchanged Seer is an oracle for 27 unique replies and additionally must complete and match the identical 81-request replay in its own persistent process.

Repeat this same complete 81-request wire script for **each** real Linux `RLIMIT_AS` cap **512MiB and 768MiB** under the same opt-in D cap policy (D requested=3, observed selected D=1 under 512MiB and D=2 under 768MiB), RNS/replay workers 4/2, OpenMP worker/thread stack parameters 4/8/2M, and with all record/day/year memo caches off.

Five fresh-but-long-lived experimental cold-probe arms under each cap:
- `off`: `SEER_NEXT_COLD_RNS_ENGINE_REUSE=0` (no initializer cache; slots field 1 irrelevant).
- `thread1`: reuse=1, scope=thread, one initializer slot per thread.
- `thread2`: reuse=1, scope=thread, two initializer slots per thread.
- `process1`: reuse=1, scope=process, one process-global immutable initializer entry.
- `process2`: reuse=1, scope=process, two process-global immutable initializer entries.

Ten distinct candidate processes, at most **810 fully equal candidate JSON R/Y/D replies**. Each completed reply is deep-equal to unchanged original Seer. The study must NOT infer pass on a terminated candidate or drop a failing command.

## Evidence and acceptance

For **every accepted native candidate process** require 81 replies, three `/proc/PID/status` snapshots after 27/54/81 responses, actual `/proc/PID/limits` effective kernel cap and VmPeak below cap, three exact D request/window counts **per context per round** (27 native D policy records), two independent cache/scope diagnostic files with four integer fields per RNS call and exactly matching total hit count, and expected first four R initializer hit patterns: `[0,0,0,0]` for no reuse or one slot, `[0,0,1,1]` for two slots. When reuse off, trace cache entry count/hits/evictions remain zero; with reuse on, at least one eviction must occur after alternating multiple year keys. Traces may originate in concurrent D threads and have different per-thread/global counter semantics.

If a native allocation or OS thread creation fails, classify only that attempt `RESOURCE_LIMITED`, log exact failing command and number of previously matching wire replies; do **not** count it as success. Unrecognized errors, protocol mismatches and missing memory/trace evidence are fatal. CI data-quality acceptance checks that all ten trials were attempted and accurately classified, not that every cap succeeds.

Compare process RSS high-water, virtual-address peaks and cumulative wire timings between OFF/1/2 initializer slots **within the same cap** and separately between scopes. Samples are one host, not causal or universal proofs; entry-count bounding does NOT enforce byte/RSS ceilings. No production/release, `main`, ordinary hybrid or default cache changes.
