# Seer Next — cold-stage and virtual-address-space experiment (pre-registered)

Date: 2026-11-06. This file is a **protocol**, not evidence that the changes work. Results must come from a completed CI run and durable raw JSON.

## Isolated timing probe

`src/seer_next_cold_core.cpp` copies the unchanged canonical `prototype/src/seer_calendar_core.cpp` and adds research-only `SEER_NEXT_COLD_STAGE_FILE` timestamps around:

1. `fast_sauce(calc,yearStart)`: structure seed.
2. `build_nonweave`: exact cutlet/month structure.
3. `weave_month_prefix`: exact RNS-based month position prefix, skipped by established first/last-year-day shortcut.
4. Record assembly.

The separate executable `seer_next_cold_probe_service` is compiled with this instrumented core. Original engine and ordinary hybrid research build are not replaced. Every one-shot test spawns a fresh baseline process and a fresh probe process, invokes one `R` query, checks **full JSON parity**, then reads one-stage TSV trace. Two trials span year edges, second day, mid and late positions, shifted calculation day, Foundation and another year. CPU frequency and GitHub runner noise can affect wall times; stage timings are in-process and exclude service startup, I/O and year-anchor cost.

## Research-only hard virtual-memory control

The hybrid service now supports `SEER_NEXT_MAX_VIRTUAL_BYTES`. A nonzero valid value (64MiB..1TiB) is applied using Linux `setrlimit(RLIMIT_AS)` before constructing Seer's service and gate corpus; if the platform is not Linux, the nonzero option fails explicitly. A zero/unset value leaves the original behavior unchanged.

**This is not a direct hard RSS limit.** RLIMIT_AS bounds total per-process address space (thread stacks, native mappings and memory reservations) rather than physically resident memory. Linux loader mappings exist before `main`; this initial state and child processes are outside this single-process guarantee. The CI measures effective `/proc/<pid>/limits` and `VmSize/VmPeak`. A 2GiB run must return correct numeric records. A 64MiB run may either compute successfully or explicitly fail; both outcomes are recorded without claiming a safe service under 64MiB. An exact memory.max cgroup or equivalent Windows Job Object remains a distinct project task.

## Acceptance and negatives

- Production `main` unchanged; only isolated candidate and research files updated.
- Cold timestamps must never be treated as speedups without full response parity and same-run baseline wall measurements.
- Explicitly report if a cold location has zero time in weave, as year-edge shortcuts already exist.
- Do not adopt any candidate on the strength of a single GitHub runner's cold timing.
- Preserve errors and negative outcomes; distinguish virtual-memory limits from cache payload budgets, actual RSS and memory reservations.
