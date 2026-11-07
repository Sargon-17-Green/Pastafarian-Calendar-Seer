# D-cap policy boundary/default/negative test — completed evidence

Date 2026-11-07. Source commit `edf21ed3c3c2c99b014b738209548333c539dcc9`. Completed [CI 42408414804](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42408414804), SUCCESS. Archived [d-cap-policy-boundaries.json](results/ci-edf21ed3c3c2/d-cap-policy-boundaries.json). CPU AMD EPYC 9V74 80-Core Processor, Linux x64.

## Verified results

For two calculation JDNs, seven predefined settings and both research native services (ordinary hybrid and independent cold probe), **28 complete mixed R/Y/D native trials** returned 8 complete wire JSON replies each, all equal to unchanged original Seer (**224 candidate replies against 16 original references**). Every finite address-space cap was verified from `/proc/PID/limits`; sampled VmPeak remained within the cap. Unlimited cases actually observed an unlimited kernel limit, not a substituted finite value.

| Scenario | Effective cap | Requested D in environment | Actual D workers | Evidence |
|---|---:|---:|---:|---|
| One MiB below threshold | 767MiB | 3 | 1 | PASS in both services/JDNs |
| Exactly at threshold | 768MiB | 3 | 2 | PASS |
| Explicit request smaller than policy allowance | 1024MiB | 1 | 1 | PASS |
| Unlimited cap, policy enabled | unlimited | 3 | 3 | PASS |
| Memory execution profile | 768MiB | 3 | 1 | PASS; profile overrides request before dispatch |
| Policy explicitly disabled | unlimited | 3 | 3 | PASS; no policy trace |
| No policy environment variable | unlimited | 3 | 3 | PASS; no policy trace |

Four negative tests, two malformed values (`2` and `invalid`) for each research executable, returned native D protocol errors with the intended `SEER_NEXT_D_CAP_POLICY must be 0 or 1` message. Native R queries immediately before and after the rejected D call remained fully equal to original.

## Limits and decision

The experiment proves the native boundary logic, not the safety of the heuristic for every calendar/corpus/window on every runner. It confirms no unrequested changes to `SEER_DIAGONAL_THREADS`, memory profile semantics, or default/disabled policy. Keep `SEER_NEXT_D_CAP_POLICY` OFF by default; preserve production and `main`. Before suggesting release, test out-of-sample calendar contexts and resource budget failures explicitly.
