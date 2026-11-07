# D-heavy concurrency and RNS initializer scope — preregistered matrix

2026-11-07. Parent research SHA `634b87c99cf79a2016ae934f203572a608c88812`. The preceding process-shared immutable cache passed all exact mixed/capped comparisons but slowed 72-request total by 2.05% and reduced maximum observed VmHWM by 6.42%; see [52_RNS_PROCESS_SCOPE_RESULTS.md](52_RNS_PROCESS_SCOPE_RESULTS.md).

## Hypothesis

The measured shared-versus-thread-local RSS tradeoff could depend on the **number of D dispatcher workers**, because the legacy RNS cache is `thread_local` and workers may independently retain similar large immutable initializer tables; the new process-wide two-slot LRU serializes constructor misses but avoids duplicated cache entries. Vary native D workers 1, 2 and 3 without altering RNS/replay worker profile (4/2 for R and Y). Compare every candidate reply in full to the pinned unchanged Seer implementation. Primary measurements are **uncapped** so expensive mixed processing can reach its actual memory high-water mark; avoid mixing effective 512MiB virtual-address caps into concurrency comparisons.

## Protocol and acceptance

- For each of two calculation JDNs (2461290, 2461400) and two trials, run fresh-process workloads with 8 wire commands: R queries from **two structurally distinct years**, D windows of 6, 9 and 12 days with both directions, another R, metadata Y year 5000, and another R. Repeat identical command sequences for each D worker count 1/2/3 and arm (original Seer, 2-slot thread-local, 2-slot process-shared). This is 2×2×3×3×8 = **288 complete original/candidate native JSON replies**. Every reply must match original exactly, including every D date record.
- Each native invocation must record per-request wall time and a separate sum for the three D calls, peak VmPeak and VmHWM, cache-hit count, and total number of RNS trace rows. Research candidates must start with two independent-year initializer misses, report two independent four-column trace formats (scope + legacy cache), and preserve their observed total hit counts even if concurrent worker write order differs between diagnostic files.
- For 512MiB address-space acceptance, repeat the same eight-command script with unchanged original Seer and both candidates but **D worker count 1 only**. Read effective kernel `/proc/PID/limits` and require VmPeak ≤ 536870912 bytes, full reply parity and all trace checks. This contributes **24** more original/candidate native replies. This does *not* certify D=2 or D=3 under the cap.
- Do not change production Seer, `main`, public behavior, ordinary research hybrid, cache enable defaults, or existing full numerical CI gates. Any failure must be diagnosed from a completed run before claims. Memory is not byte bounded merely because the RNS LRU has two entries.

## Interpretation

Report per-worker Pareto front: additional D throughput improvement, total full-wire time and *observed* VmHWM. A process-wide mutex can remove duplicated initialization at the expense of serializing cold entries, and the winner can depend on calculation year, available threads and CPU. Do not infer a production deployment policy from a single GitHub runner.
