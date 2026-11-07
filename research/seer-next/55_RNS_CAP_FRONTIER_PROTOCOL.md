# Real Linux virtual-address-space frontier of parallel D

Preregistered 2026-11-07. Parent research SHA `bd7c02d579fe28df56b8018a35cf264cedbf29d2`. Original Seer is unchanged. Completed previous exact worker matrix: [CI 42401300070](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42401300070), report [54_RNS_D_WORKER_RESULTS.md](54_RNS_D_WORKER_RESULTS.md).

## The open safety/optimization question

Previous D=2 and D=3 measurements were **uncapped** and can exceed 512MiB virtual address space even though physical RSS is lower: D=2 experimental max VmPeak about 635–637MiB and D=3 about 993MiB on one host. The only successful capped experiment so far serialized D to one worker. To avoid a false claim that a two-entry immutable cache enforces a byte ceiling, directly test the native kernel `RLIMIT_AS` under multiple caps and D dispatcher counts.

## Exact matrix and failure taxonomy

Use two original-Seer calculation contexts JDN 2461290/2461400, deriving exact distinct-year 4999/5000 R targets from original Y metadata. For each context, generate **8 fixed mixed commands**: two R from distinct years, D windows of 6/9/12 (positive/negative directions), another R, year 5000 Y metadata, and a closing R. Get 8 complete original Seer oracle responses per context = **16 source replies**.

For each calculation context run candidates with RNS initializer scope `thread` or `process`, D dispatcher counts **1,2,3**, and real virtual-space limits **512,768,1024,1280MiB**. There are **48 fresh native candidate trials**, 8 full native answers per completely successful trial. Keep RNS=4/replay=2, OpenMP thread/stack limits equal to the preceding tests, both RNS caches at two entries and other record/day/year memos off. Alternate scope order to control ordering effects.

**Acceptance is strict:** for every `ACCEPTED` trial, require eight *complete* responses deep-equal to unchanged Seer, two initial cache misses, valid independent four-column cache and scope diagnostics, observed `/proc/PID/status` VmPeak not exceeding cap, and **actual effective kernel limit** read from `/proc/PID/limits`. A recognized native allocation or thread-resource error under an attempted cap is recorded as `RESOURCE_LIMITED` with the exact failing command index and number of prior fully equal replies; it is never a PASS, never counted as full parity, and is not silently retried without the cap. Timeouts, incorrect JSON or other unexpected native errors are fatal rather than an admissible resource-limited result. Resource-limited entries may lack process metrics if the kernel has already terminated that process; do not then claim the cap was independently verified.

Predeclared positive thresholds require all following to pass in **both scopes and both JDN contexts**: D=1 at 512MiB, D=2 at 768MiB, and D=3 at 1280MiB. The 1024MiB test is exploratory for D=3. If any positive gate fails, write raw evidence before throwing a CI failure; **do not revise the gate after observing it**. Report attempts, successful trials, resource-limited trials, each limit's lowest fully accepted worker profile and peak RSS/virtual memory for successful attempts.

This experiment identifies *virtual address-space* feasibility, not a physical RAM cap, a guaranteed cross-platform safe configuration or a production runtime decision. No changes to original Seer, public defaults, normal hybrid, or experimental RNS algorithms.
