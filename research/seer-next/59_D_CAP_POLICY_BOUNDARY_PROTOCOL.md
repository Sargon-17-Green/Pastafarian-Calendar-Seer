# D-cap policy threshold, default and invalid-setting regression — preregistered

2026-11-07. Parent research SHA `e1ebcad311829d03499aed17785e4b2da1454638`. Previous exact scheduling validation: [CI 42406140551](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42406140551), [58_D_CAP_POLICY_RESULTS.md](58_D_CAP_POLICY_RESULTS.md).

## Objective

Rule out off-by-one errors at the empirical **768MiB RLIMIT_AS cutoff**, unintended promotion to three workers at low caps, overrides of explicit user requests, changes to `memory` profile semantics, and accidental activation or output traces when `SEER_NEXT_D_CAP_POLICY` is absent/disabled. The feature stays explicitly opt-in and is not a general proof of safe memory budgets.

## Exact positive cases

For each calculation JDN 2461290 and 2461400, obtain unchanged Seer year metadata 4999/5000 and construct the same eight-command mixed R/Y/D test used for previous worker benchmarks, including three D windows (6,9,12), positive and negative steps, two distinct initializer year keys, and Y metadata. Obtain eight complete unchanged Seer oracle replies per JDN = **16 oracle replies**. For **both** research hybrid and independent cold-probe native binaries, execute seven scenarios against the same original oracle:

1. Kernel `RLIMIT_AS=767MiB`, D requested=3, policy=1 ⇒ **1** worker; verify exact kernel cap.
2. Kernel `RLIMIT_AS=768MiB`, D requested=3, policy=1 ⇒ **2** workers; verify exact kernel cap.
3. Kernel `RLIMIT_AS=1024MiB`, D requested=1, policy=1 ⇒ **1** worker (must not increase request).
4. Verified **unlimited** kernel `RLIMIT_AS`, D requested=3, policy=1 ⇒ **3** workers (must not restrict previous unlimited behavior).
5. Kernel `RLIMIT_AS=768MiB`, D requested=3, `SEER_NEXT_EXECUTION_PROFILE=memory`, policy=1 ⇒ **1** requested and selected worker, because `memory` profile overrides the environment.
6. Unlimited kernel cap, requested D=3, **policy explicitly 0** ⇒ original 3-worker dispatch semantics and **no policy trace**.
7. Unlimited kernel cap, requested D=3, **policy absent** ⇒ original 3-worker semantics and **no policy trace**.

Thus 2 JDNs × 7 scenarios × 2 native research executables × 8 R/Y/D commands = **224 complete candidate native replies**, all deep-equal to unchanged Seer. For policy=1, require exactly three four-column D trace records containing requested workers, selected workers, **effective kernel cap bytes** (zero for unlimited), and D record counts 6/9/12. For disabled/absent, require no diagnostic row. Check real `/proc/PID/limits` and process VmPeak≤limit when finite. Unlimited test must actually observe unlimited kernel `RLIMIT_AS` rather than silently replacing it with a finite cap.

## Negative tests

For each research binary send malformed policy values `2` and `invalid`. A valid R command must succeed before, a D command must return a well-formed native error `SEER_NEXT_D_CAP_POLICY must be 0 or 1`, and a second valid R must remain exactly equal to original Seer afterward. This is **four negative policy tests** in addition to the positive matrix. No invalid-setting rejection is counted as a successful D reply.

## Gate

All 28 candidate process trials must complete all 8 R/Y/D requests with full JSON parity; all trace/cap assertions and 4 malformed-policy rejection/recovery checks must pass. No Seer original, production, ordinary defaults, `main` or previous experiment acceptance criteria are modified. On failure, inspect the completed CI logs and source evidence before changing expectations.
