# D cap scheduling holdout — preregistered attempt to falsify empirical memory cutoffs

Date 2026-11-07. Parent research commit `92bea6b80ce095a2eb50138d1eab91ba9616d8a8`. Previous precise boundary and negative-path validation: [CI 42408414804](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42408414804); [60_D_POLICY_BOUNDARIES_RESULTS.md](60_D_POLICY_BOUNDARIES_RESULTS.md).

## Question

Are cap policy thresholds inferred from only two calculation JDNs stable enough to survive **unseen calculation contexts and RNS year structures**? This study is designed to falsify that hypothesis, not to guarantee success in advance. It uses a fresh-process native original-Seer oracle and two independently built research native variants, with exact deep equality for each completed R/Y/D reply.

## Frozen independent sample

Use exactly six holdout calculation JDNs, excluding tuning JDNs 2461290 and 2461400: **2461007, 2461159, 2461247, 2461481, 2461593, 2461759**. With them use, respectively, fixed year pairs **(4997,5001), (4998,5002), (4999,5003), (4997,5002), (4998,5003), (4999,5001)**. Source metadata `Y` in untouched Seer must confirm distinct month-length initializer vectors for each pair. These choices are fixed **before** observing new outcomes and must not be replaced based on results.

Each calculation context has nine native requests: `R` year-A center, `R` year-B center, repeated `R` year-A and year-B (enabling initial two misses then two hits), `D` 5 forward, `D` 9 backward, `Y` year-B metadata-only, `D` 13 forward, final `R` year-A nearby. Obtain **54 original Seer full wire JSON oracle replies**.

For every context repeat that identical nine-command sequence in each effective Linux `RLIMIT_AS` cap of **512,768,1024MiB**, with requested D workers=3, `SEER_NEXT_D_CAP_POLICY=1`. Three experimental candidates run in separate native processes: regular research hybrid, research cold-probe 2-slot thread-local RNS cache, and research cold-probe 2-slot process-global immutable RNS cache. That is **6 × 3 × 3 = 54 independent native trials**, at most **486 complete candidate replies**.

## Rigorous outcomes and interpretations

For each completed candidate reply assert full native JSON equality with unchanged Seer, not sampled fields or hashes. An unrecognized service error, wrong JSON, wrong policy trace or wrong kernel memory proof is a **test-infrastructure or correctness failure**, not a successful run. For every fully successful process require all nine replies, actual `/proc/PID/limits` effective address-space cap exactly equal to the requested one, VmPeak within limit, three exact D worker-selection trace rows with requested=3, selected=1 at 512 or 2 at 768/1024, actual cap bytes and record counts 5/9/13. For fully successful cold-probe trials additionally require exact four-field scope/cache diagnostics, initial cache hits `[0,0,1,1]`, and equal total hit counts across the two independent trace files.

An OS `std::bad_alloc`, OpenMP thread-creation failure or native `Resource temporarily unavailable` terminates the particular trial as **`RESOURCE_LIMITED`**, recording the failing command and count of prior fully equal answers. Do **not** classify it as PASS and do **not** revise the threshold based on observed outcomes. If a failed process cannot be queried after exit, its missing kernel readback cannot be claimed as verified. The CI job must still verify completeness of the 54-trial evidence matrix, correct classification, parity of all completed responses and retained failures; overall CI study completion is not equivalent to full policy acceptance.

Reject any universal claim from six contexts even if all pass; `RLIMIT_AS` is virtual address-space, not RSS or physical RAM, and thread-local/shared two-slot initializer caches are not byte bounded. No default/production/`main` modifications.
