# Exact compute profiles: latency / balanced / memory

**Research-only feature. Not a general hardware-independent tuning or a global memory guarantee.**

The independent S4+S2 hybrid native service recognizes environment variable `SEER_NEXT_EXECUTION_PROFILE` with explicit choices:

| Profile | RNS/OpenMP workers | Replay workers | Other |
|---|---:|---:|---|
| `latency` (default) | 3 | 3 | Matches original pre-profile behavior |
| `balanced` | 3 | 1 | Reduces replay thread overhead and virtual reservations |
| `memory` | 1 | 1 | Also caps diagonal outer parallelism to one worker |

The profile is used for single-day/range `R` and year `Y includeDays=1`; diagonal mode already computed each record with `ExecutionParams{1,512,1}` and now limits outer worker concurrency in memory mode. All changes affect scheduling only and are expected to preserve exact output. They MUST still pass full-response differential, independent oracle and resource checks. Production `main` remains unchanged.

## Source evidence before implementation

GitHub [run 42301507472](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42301507472), SHA `6796fd5cb3e06cbf927db23c0e1193df951d01b0`, raw `results/ci-6796fd5cb3e0/cold-rns-workers.json`, compared five worker configurations on four cold inputs with 2 trials each (40 comparisons). On the AMD EPYC 9V45 GitHub runner:

- Mid-year single record: 3/3 averaged 96.917ms and VmPeak ~415704KiB; 3/1 averaged 92.537ms and ~308164KiB; 1/1 averaged 145.923ms and ~39632KiB.
- Penultimate day: 3/3 averaged 106.717ms vs 3/1 105.955ms, at the same virtual-memory differences.
- Foundation: 3/3 averaged 128.233ms, while 3/1 averaged 144.664ms. **Balanced was slower** on that input; it is not a universally faster default.
- Single-worker RNS construction was roughly 95–160ms vs 3-worker RNS construction ~44–71ms, while replay computation also varied with target offset.

These are very small-sample results on virtualized hardware. Performance policy is *opt-in* and defaults to preexisting 3/3.

## Hard address-space limit policy

When `SEER_NEXT_MAX_VIRTUAL_BYTES` is supplied, Linux installs RLIMIT_AS before Seer's service construction. Previously, 64MiB with 3/3 could produce an uncaught `std::bad_alloc` and SIGABRT. This change explicitly **refuses startup below 512MiB unless memory profile is selected**. This 512MiB cutoff is a conservative experimental refusal threshold motivated by previous measured 415–481MiB VmPeak, not a proof of the memory required for any arbitrary calculation.

New CI acceptance tests:

1. 2GiB cap with `latency`, perform three requests and verify `/proc` effective limit and VmPeak.
2. 64MiB cap with `memory`, perform three requests including a full-year S2 build, verify native service survives and VmPeak stays within 64MiB.
3. 64MiB cap with `latency`, require an explicit startup refusal without uncaught bad_alloc/abort.

A passing CI establishes only those measured test cases. No global supported-domain RAM bound, safe lower bound, cgroup RSS control, Windows Job Object or crash isolation is claimed.
