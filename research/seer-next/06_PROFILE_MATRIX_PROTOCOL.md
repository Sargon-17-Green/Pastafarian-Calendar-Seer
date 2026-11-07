# Seer Next — profile matrix: experiment design

This is a *pre-registered experiment*, not a result. The primary risk in the first successful cache experiment is that it only measures reuse, while a table built after two requests may hurt sparse or short-lived workloads. A fixed two-request promotion policy is not presumed generally optimal.

The Linux-only profiler `scripts/profile_policies.mjs` creates fresh native processes for each baseline and candidate comparison (alternating order across trials). Each paired process sees exactly the same sequence; full JSON is checked before reporting any numbers. It records wall latency, launch-to-first-result, native process CPU ticks (via `/proc/<pid>/stat`) and native peak resident memory (`VmHWM` from `/proc/<pid>/status`). Linux kernel CPU ticks are coarse, so small-sample CPU ratios may be unreliable.

Workloads: 1, 2, 4, 16, and 32 repeats at Year 5000's early/interior/late offsets; 18 different calculation days (no reuse); a two-pass nine-calculation-day cycle; eight sparse same-year target dates. Cache policies: disabled, promote after two with 8MiB payload, promote after eight with 8MiB payload, and promote after two with 180000-byte payload. Two independent trials create 144 paired comparisons. All percentages/latencies reported must come from the actual raw output, not forecasts.

Caveats: the cache limit caps **record payload**, not metadata or peak construction RSS; CPU accounting omits some process startup ticks because it begins immediately after spawn; memory footprints include RNS and other baseline state. These are independent ephemeral GitHub-hosted runner results, not hardware-controlled CPU-frequency experiments. An `M` command is added **only to the isolated candidate** to expose hit/build/eviction/key/payload statistics; native baseline wire/API remains unchanged.

Criteria: detect whether any profile is substantially slower; verify that no output diverges; reject claims of broad general improvement from repeat-only cases. The result will guide a bounded online promotion policy or a more selective per-day cache rather than prematurely rewriting the arithmetic in assembly.
