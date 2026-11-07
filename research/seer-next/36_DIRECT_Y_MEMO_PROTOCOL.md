# Direct Y memoization with existing record-budget accounting (opt-in)

Date: 2026-11-07. **Experimental contract; no production adoption.** Baseline evidence [CI 42362308090](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42362308090) proved that three repeated Y exports cause no year-cache builds or hits.

## Modification

In the isolated research hybrid service, add `SEER_NEXT_Y_MEMO_DIRECT=1` (default 0). If enabled and `Y calc year 1` is requested, call the existing `yearRecords(calc,y,true)` with explicit full-year intent. It uses the already validated canonical `compute_full_year_days` implementation and existing LRU/payload accounting, but bypasses `SEER_NEXT_PROMOTE_AFTER` because a Y request already requires all days. First Y builds the table; subsequent Y replies read it without recomputing; subsequent R requests can use the same entry. If the cache budget is zero, too small, or the year is out of the memo's 5778-day bound, Y falls back to the old full-year computation without changing the output.

The default Y behavior, ordinary R promotion threshold, diagonal D computation, Seer production sources and main branch remain unchanged. The year cache `payloadBytes` is only record payload, not process memory.

## Acceptance matrix

- 6 canonical contexts × 2 trials × four service modes (unchanged reference, default hybrid 3/3, uncached hybrid 4/2, opt-in cached 4/2) × three Y replies per process = **144 complete Y JSON responses** in 48 fresh native processes. All must match the original Seer; candidate memo state after three Y: builds 1, hits 2 and keys 1, with payloadBytes within budget.
- R-after-Y interoperability: full Y then R into same cached year, then repeated Y. Verify exact replies and memo hits across paths.
- Zero (0B) and tiny (1024B) budgets: no successful full-year memo allocation, but all Y/R replies still exactly match.
- One-year-only payload budget (180000B): switch between years 5000 and 5001 and require two LRU evictions with three correct direct builds.
- Real Linux `RLIMIT_AS=512MiB` under year 4999 on the opt-in 4/2 profile: compare first and repeated complete Y JSON to original Seer, record VmPeak and VmHWM; treat failures as explicit negative evidence, never as correct output.
- Record raw latency, diagnostic counters and memory. A passing correctness test establishes no global performance guarantee. Do not conflate record budget and RSS or promise 512MiB minimum on every host.

## Completed first test — CI 42363472716

The 144 complete Y JSON replies passed, including 12 sampled contexts (two trials × three years × two calculation-day contexts). Full-year memo builds=1 and hits=2 after three Y calls in every test context. Second warm export totals were 1081.954ms (without memo) vs 54.891ms (with opt-in), a 19.71× improvement on this AMD EPYC 9V45 run; third warm export totals 1072.631ms vs 49.720ms (21.57×). First cold Y stayed near 1.2s total across 12 requests, with no evidenced meaningful improvement. 512MiB repeated-Y and initial Y→R interoperability passed. See [37_DIRECT_Y_MEMO_RESULTS.md](37_DIRECT_Y_MEMO_RESULTS.md).

After this first run the test harness was strengthened: exact memo counts (not >=), reverse R→Y interoperability, same-number year in distinct calculation contexts, and reading kernel RLIMIT_AS directly. These additional assertions are NOT part of run 42363472716; they require a new completed CI run.
