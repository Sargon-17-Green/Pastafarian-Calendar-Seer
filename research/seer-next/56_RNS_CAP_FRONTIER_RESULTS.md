# Linux RLIMIT_AS frontier for D worker concurrency — completed evidence

2026-11-07. Research source SHA `6e2fab5e9f21cc6318a52ac164bbe655dc85539d`. Completed [CI 42403588914](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42403588914), SUCCESS. Raw archived [rns-cap-frontier.json](results/ci-6e2fab5e9f21/rns-cap-frontier.json). Host AMD EPYC 9V74 80-Core, Linux x64.

## Matched native correctness and resource classification

Two independent calculation JDNs (2461290 and 2461400) × 4 RLIMIT_AS values (512, 768, 1024, 1280MiB) × 3 D worker counts (1/2/3) × 2 immutable RNS initializer cache scopes (thread/process) = **48 independent candidate process trials**, each with 8 mixed R/Y/D requests. Full native JSON for each completed reply compared to unchanged Seer, using 16 original oracle replies. **37 trials completed all 8 replies** and were classified `ACCEPTED`; **11 trials ended in `RESOURCE_LIMITED`** at a documented command due to OS thread/memory errors. The 37×8+28 partially completed replies give **324 matching candidate replies**. No failed-resource trial is treated as fully passed. All 12 preregistered acceptance gates (for two calcs × two scopes × D=1 at 512, D=2 at 768, D=3 at 1280) passed.

| D workers | Local two-slot RNS at 512/768/1024/1280MiB | Process-shared two-slot RNS at 512/768/1024/1280MiB | Lowest tested universally accepted cap (both JDNs) |
|---|---|---|---|
| 1 | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS | 512MiB |
| 2 | FAIL / PASS / PASS / PASS | ONE PASS + ONE FAIL / PASS / PASS / PASS | 768MiB |
| 3 | FAIL / FAIL / PASS / PASS | FAIL / FAIL / PASS / PASS | 1024MiB |

The observed D=2/process-scoped successful 512MiB case had VmPeak=516252KiB, very near the 524288KiB address-space limit; a second JDN failed at D request index 2 with `Resource temporarily unavailable`, confirming that a single successful allocation is not a safety proof. For D=2 under 768MiB, sample max VmPeak reached 681492KiB (thread mode), 625724KiB (process mode), with sampled max VmHWM 269080KiB/198948KiB respectively. D=3 at 1024MiB passed on both JDNs and both scopes with max sampled VmPeak near 993MiB, which is a narrow margin to the cap.

Some resource failures occurred through `std::bad_alloc` and SIGABRT; after process exit a `/proc/PID/limits` snapshot was sometimes unavailable. Those are resource-limited *attempts*, not independently verified exact effective kernel limits, and no virtual-memory thresholds are proven outside the tested hardware or work classes.

## Decision

A research-only opt-in D scheduler may use the **effective kernel address limit** to choose one worker below 768MiB or two at larger finite limits, subject to the requested worker count and hardware. This is not an allocation guarantee, memory byte cap, or production-safe policy. Do not select three workers by default based on these samples: they were slower than two in the preceding matched D-heavy benchmark. Keep original Seer and all defaults unchanged; validate the scheduler's native exact wire responses, deterministic trace, and capped host behavior in a separate CI experiment.
