# Cold and repeated Y full-year export: benchmark contract

Date: 2026-11-07. Research-only, unchanged original Seer and unchanged default 3/3 hybrid service. Source evidence for the selected years: completed [CI 42360658075](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42360658075), where all six full-year Y exports matched the original and succeeded under 512MiB virtual address space using explicit experimental42. That earlier experiment did **not** time exports.

## Mechanism under test

In the current experimental hybrid service, `handleYear` invokes `compute_full_year_days(...)` directly for each `Y calc year 1` request. The existing `yearRecords()` memoization for `R` requests is not called by `handleYear`. Consequently **a warm Y request is not automatically a year-cache hit**. The service may still benefit from OS caches and previously initialized year metadata, and only real measurements can quantify that. Both candidate modes use an 8MiB full-year record budget and promote-after-2 cache policy for comparability, with day cache disabled.

## Measurement

- Six exact contexts: years 4999–5001 for each calculation JDN 2461290 and 2461400.
- Two independent trials. For each of 12 context/trial combinations, spawn a fresh unchanged Seer baseline, hybrid `latency=3/3`, and hybrid `experimental42=4/2`. Each service process receives **three complete Y exports of the same year**, totaling 36 processes and **108 full-year Y responses**.
- For every reply, assert complete parsed JSON equality to the unchanged Seer reference, inclusive year start/end, and every day record. Record SHA256, per-request wall time, spawn-to-first result, maximum process VmPeak and RSS VmHWM, and candidate memo build/hit counters.
- Candidate order is reproducibly shuffled using seed 20261107. Baseline is always collected first so candidate replies can be directly compared.
- Do **not** infer year-cache use from a shorter warm response. Count memo hits and builds explicitly. No claim that 4/2 wins on Y until completed results.
- This is a Linux x64 CI experiment with no physical RAM cap in the timing run. The separate 512MiB observed cap test is retained; not rerun here. Worker allocation and Y repeat behavior may differ across hosts.

## Decision criteria

Do not adopt any default change solely based on two hosted trials. If repeated Y full-year exports repeatedly compute without memo hits, consider an **explicit opt-in whole-Y result reuse** with bounded record memory, complete-R/Y parity under eviction, and controlled 512MiB space. A warm-Y reuse change must not worsen one-shot cold Y significantly, falsify the all-day JSON or assume memo payload bytes equal total process RSS.
