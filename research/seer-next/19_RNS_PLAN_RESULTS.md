# RNS shared Pascal plan: verified negative performance result

Source run: https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42310523750

Source SHA: `d6def355fd9be2b3b58093096efb8effc4d8208a`, latest verified CI archival head: `2c92f960a3549f69a65d758186f6c134180f787c`.

Raw JSON: [results/ci-d6def355fd9b/rns-shared-plan.json](results/ci-d6def355fd9b/rns-shared-plan.json).

## Correctness

52 requests (two passes over 26 targets) passed complete JSON equality with original Seer in *both* research variants, with and without sharing the prime-independent Pascal plan. The full workflow completed successfully.

## Measured outcome

| Measure | Reference Seer | Independent per-pack plan (control) | Shared plan |
|---|---:|---:|---:|
| Aggregate request wall (52 requests) | 6766.895ms | 6757.755ms | 6808.212ms |

The actual same-binary ratio `off/on = 0.992589` means that the shared plan was **0.747% slower** by cumulative request wall time. Context-specific ratios (`off/on`): interior 1.0103, other interior 1.0016, late 0.9743, Foundation 1.0243, next Foundation 0.9522. One very small virtualized-host sample is insufficient to infer a universal 0.747% degradation, but it does not justify additional code complexity.

The instrumented *sum of parallel worker time* for modular DP was ~122–156ms per measured query, exceeding the Pascal stage (~37–76ms worker-time), while factorial inverses accounted for ~10–16ms worker-time. These are **sum-of-thread timings, not a wall-time budget**: multiple worker phases overlap in wall clock.

The shared plan itself is the only experimental design modification in this A/B, and its arithmetic remains identical. Given negligible/negative benefit, **DO NOT ADOPT**. Research flag defaults off; production and normal hybrid service unchanged.

Next: separately test per-thread factorial-vector scratch reuse as a memory/performance allocation hypothesis, not as an assumption of speedup.
