# Research D-cap policy — completed CI results

Date: 2026-11-07. Source commit `8ea448509459590752a54a9ce7ff1c6885c8dccf`. Completed [CI 42406140551](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42406140551), SUCCESS. Raw [d-cap-policy.json](results/ci-8ea448509459/d-cap-policy.json). CPU AMD EPYC 7763 64-Core Processor, Linux x64.

## Verification

Two calculation JDNs × effective Linux `RLIMIT_AS` 512/768/1024MiB × per-thread/process-wide 2-slot initializer scopes × native dispatcher with static fixed worker count versus opt-in kernel-aware policy = **12 paired contexts**, **24 native candidate processes**, **192 complete R/Y/D replies** equal in complete JSON to **16 original Seer oracle replies**. Every case verified actual `/proc/PID/limits` address-space cap and sampled VmPeak below that limit. Every policy `D` trace had requested=3, selected=1 at 512MiB or 2 at 768/1024MiB, actual kernel cap bytes, D record counts [6,9,12].

| Real RLIMIT_AS | Initializer scope | Static 8-wire aggregate (ms) | Opt-in policy aggregate (ms) | Relative change |
|---|---|---:|---:|---:|
| 512MiB | Thread-local | 7390.418 | 7408.998 | +0.25% |
| 512MiB | Process-shared | 7387.575 | 7342.180 | -0.61% |
| 768MiB | Thread-local | 6784.842 | 6835.135 | +0.74% |
| 768MiB | Process-shared | 6866.405 | 6913.173 | +0.68% |
| 1024MiB | Thread-local | 6776.655 | 6779.115 | +0.04% |
| 1024MiB | Process-shared | 6959.661 | 7014.243 | +0.78% |

All timings are sums across **two calculation contexts** per row on one CI runner, not confidence intervals. No generalized speedup is established; reading `RLIMIT_AS` and capping D dispatch is mainly a policy-safety research hypothesis. Validated threshold 768MiB is motivated by the earlier narrow frontier, not a universal guarantee for any D workload. Even a successful virtual address-space bound is not a physical RAM byte limit.

## Decision

Retain policy `SEER_NEXT_D_CAP_POLICY=0` (or absent) as default; no production or `main` changes. Before considering any broader runtime use, independently validate the exact threshold boundary, unlimited-kernel behavior, request count 1, memory execution profile, disabled/absent defaults and malformed policy errors in both research native service builds. These are next research gates, not proof of deployability.
