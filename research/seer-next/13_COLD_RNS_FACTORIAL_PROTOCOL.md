# Experimental cold RNS factorial — no production adoption

This is a reproducible experiment protocol for the independent `seer_next_cold_probe_service` compiled with `seer_next_cold_core.cpp` and `seer_next_cold_weave_avx2.cpp`; all original Seer sources remain unchanged.

The first cold-stage measurements (GitHub Actions run 42299829284; permanent `results/ci-050e569ad33f/cold-stages.json`) established approximate exact-structure cost of 1.6–1.8ms and RNS weave costs of 54–133ms per fresh-process query. Two independent trials each covered first and last year days, early, interior, late, Foundation, shifted calculation day and neighboring year. **No speedup was proved by profiling alone.**

This second trial is narrower and decomposes the real AVX2 `weave_month_prefix` into RNS prime sizing, `RnsEngine` construction, CRT/rank selection, predictor/pool setup, and exact replay (with nested predictor/certification/reset/fallback counters). The instrumentation appends tab-delimited fields only under `SEER_NEXT_COLD_WEAVE_STAGE_FILE`. It does not alter RNS branching, arithmetic, or public records.

Run 2 full cold-process trials each on second-day, mid-year, penultimate and Foundation for five explicit `(RNS OpenMP workers,replay workers)` settings: (1,1), (2,1), (3,1), (1,3), (3,3). Each full JSON reply must match the unmodified baseline; record process VmPeak and wall time. The `SEER_NEXT_COLD_RNS_THREADS` / `SEER_NEXT_COLD_REPLAY_THREADS` knobs are **only** in the research-instrumented core; shipped engine, ordinary hybrid cache and its service API remain untouched. Both are validated as integers 1..8.

All absolute wall times and virtual-memory observations are host- and workload-dependent; insufficient basis exists for one universal best worker setting. Do not apply threading changes to normal Seer until separately tested on additional CPUs, portable build, concurrency and memory pressure. Retain the raw diagnostics and negative results.
