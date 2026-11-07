# Research-only hybrid execution profile experimental42

Date: 2026-11-07. No main or release changes.

## Why 4/2?

The exact 180-case native replay-factor sweep in [run 42356282646](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42356282646) found four RNS builder workers and two replay workers competitive across three distinct adjacent calendar years. In that specific AMD EPYC 9V74 environment, aggregate latency decreased 15.30% against 3/3 (3793.881ms vs 4478.959ms). Peak process VmPeak decreased from 482.03MiB to 446.29MiB; physical VmHWM was not improved.

This implementation adds `SEER_NEXT_EXECUTION_PROFILE=experimental42` to the **isolated hybrid research service**. It maps to native `ExecutionParams{4,512,2}` for R and Y full-year calculations, but diagonal D retains its existing per-record 1/1 scheduling and existing outer worker policy. Existing `latency=3/3` (default), `balanced=3/1`, `memory=1/1`, `experimental4=4/1` remain unchanged.

## Correctness/resource gates

- Expand the current full native service R/Y/D verifier to 27 independent requests: 15 pre-existing scalar/range/year/diagonal cases, plus 12 extra R targets from original Seer Year metadata for years 4999/5000/5001 under calculation days 2461290 and 2461400. Validate inclusive `endJdn-startJdn+1` before creating targets. Check `experimental42`, `experimental4`, `latency`, `memory`: **108 complete baseline-vs-research JSON comparisons**. Cache disabled and no silent failure responses.
- Expand the Linux `RLIMIT_AS` experiment to attempt `experimental42` with a 512MiB virtual address cap on three long-year requests from the prior cross-year run. Mark this **observational**; if the process crashes or rejects allocation, record actual result, do not claim success. Continue requiring existing 2GiB latency and 64MiB memory acceptance, plus explicit 64MiB latency refusal.
- Run the existing exact independent canonical oracle and cache eviction gates again. Archive raw CI evidence and record negative findings.
- Only after evidence passes should an opt-in be considered *validated for tested Linux scope*, never a universal default. No Windows hard-RAM guarantee, merged release or main update.

## Completed integration evidence — CI 42358871316

All 108 full R/Y/D wire JSON comparisons passed, including 12 R targets derived from original Y metadata under two calculation days. The independent canonical oracle, cache-eviction gates and prior native 180-run sweep also passed. On Linux, `experimental42` completed three long-year R requests under a 512MiB `RLIMIT_AS` restriction (max VmPeak 456996KiB, max VmHWM 73312KiB), while the original 64MiB memory-profile test continued to pass.

A second hosted CPU, Intel Xeon Platinum 8370C, retained a positive but smaller 4/2 vs 3/3 total cold-time difference (5012.103ms vs 5649.083ms, 11.27% lower). However 4/4 was faster at 4812.806ms, with VmPeak 701.47MiB. This confirms the **speed/address-space tradeoff** rather than a CPU-independent speed ranking.

Decision: retain the explicit research `experimental42` opt-in; do not adopt default, merge or release. Next, validate **full-year** Y exports across multiple years under 512MiB, not only R requests. Detailed summary: [31_RNS_PROFILE42_CONFIRM_RESULTS.md](31_RNS_PROFILE42_CONFIRM_RESULTS.md).
