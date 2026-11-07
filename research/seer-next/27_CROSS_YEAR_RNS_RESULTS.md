# RNS 4/1 versus 4/3 across years 4999–5001

Source: [GitHub Actions 42348089979](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42348089979), research SHA `fd387c915de7bf35df0609e4860f239d87f9ed5f`.

Full raw results: [rns-cross-year.json](results/ci-fd387c915de7/rns-cross-year.json). The run was **completed SUCCESS** with 144 full JSON comparisons between the unchanged native Seer and research variants. Targets were generated via original `Y` structure results and encompass 4999, 5000, 5001 under calculation days 2461290 and 2461400, at mid-year and penultimate-year positions (12 contexts, each profile tested 3 times). All measurement runs used a fresh process.

## Aggregate results (36 queries per profile; host AMD EPYC 7763)

| RNS / replay | Total wall | Difference vs 3/3 | Maximum observed VmPeak | Maximum VmHWM |
|---|---:|---:|---:|---:|
| 3/3, default | 5110.341 ms | — | 482.03 MiB | 71.16 MiB |
| 3/1, balanced | 5578.185 ms | +9.16% time | 302.28 MiB | 71.19 MiB |
| 4/1, experimental | 5251.430 ms | +2.76% time | 446.29 MiB | 71.61 MiB |
| 4/3 | 4846.591 ms | −5.16% time | 557.46 MiB | 71.62 MiB |

The 4-worker RNS builder reduces setup time, but the answer depends on replay cost: **year 4999** showed 3/3 = 2377.75ms, 4/1 = 2654.47ms and 4/3 = 2278.12ms, while **year 5001** showed 3/3 = 1086.21ms, 4/1 = 999.84ms and 4/3 = 1008.82ms. For year 4999, mean replay execution stage was ~108.46ms in 3/3 vs ~145.15ms in 4/1 and ~113.87ms in 4/3. Thus the tradeoff is principally in the replay parallelism for long years.

Measured **4/1 won only 24 of 36** matched context/trial requests versus 3/3, whereas **4/3 won 31 of 36**. This is still a small exploratory sample and a single CPU model; do not infer stochastic dominance for every calendar year.

The 4/3 profile was only measured as a cold-core configuration, not yet exposed in the hybrid service. The previously added `experimental4` remains 4/1 opt-in, with no change to the default or memory profile. An intermediate **4/2 replay** configuration is the next test because it may recover parallel replay time without incurring all three-worker virtual-memory reservations.

## Decision

- **DO NOT ADOPT** a universal `4/1` speedup claim or change default 3/3.
- Continue opt-in `experimental4` research because it can help shorter-year workloads.
- Test replay workers 1–4 and total wall / VmPeak / VmHWM together; do not substitute a virtual memory budget for physical RSS.
