# High-worker RNS constructor scaling: experimental protocol

Date: 2026-11-07. Objective: test whether assigning 4, 6, or 8 OpenMP RNS workers reduces exact cold-computation time sufficiently to justify larger process virtual address space and possibly higher CPU/RSS usage.

Previously [42301507472](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42301507472) observed a mid-year cold request taking ~145.9ms at 1 RNS / 1 replay worker, versus ~92.5ms at 3 RNS / 1 replay worker, with much larger VmPeak. The sample did not cover RNS thread counts above 3. No arithmetic changes are proposed.

Run the same separately compiled research cold-probe service from the existing benchmark:
- `(RNS,replay)=(3,3),(3,1),(4,1),(4,3),(6,1),(8,1)`.
- Four distinct cold date cases: second year day, interior, penultimate year day, and Foundation context. Two order-rotated trials, each case in a **fresh process** for baseline and candidate.
- Full native JSON response equality with unchanged Seer; report wall times, Linux VmPeak and VmHWM, RNS construction, predictor setup, rank, and replay timings for each trial and case.
- `SEER_NEXT_COLD_RNS_THREADS` and `SEER_NEXT_COLD_REPLAY_THREADS` already accept integer 1..8 in the separate research-only core. This stage changes only test policy, not the algorithm. The previously rejected Pascal-plan and factorial-pool switches remain off by default.

**Acceptance:** no adoption merely from fastest hosted run. Determine the nondominated (latency,VmPeak,VmHWM) choices and whether the benefit is stable across both trials and all four cases. Memory profile 1/1 under 64MiB remains independent and must not be weakened by any latency-mode tuning. No Windows or other architecture guarantee.
