# RNS workers 3 to 8: complete first-phase measurements

Source: [GitHub Actions 42344670319](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42344670319), pinned SHA `f27979727fa1f0c409a95fb8b6112cbed24e6058`.
Raw results: [rns-worker-scaling.json](results/ci-f27979727fa1/rns-worker-scaling.json).

The run completed SUCCESS. 48 separately executed native RNS configurations, two repetitions of four calendar contexts and six worker pairs, matched the unchanged Seer replies in full JSON. This is a sampled correctness check, not an all-domain proof.

## Mean cold wall milliseconds, by context

| RNS/replay | Second year day | Mid-year | Penultimate | Foundation | Approx. VmPeak, mid-year |
|---|---:|---:|---:|---:|---:|
| 3/3 | 74.09 | 113.08 | 143.21 | 176.47 | 470MiB |
| 3/1 | 71.23 | 122.68 | 142.06 | 203.51 | 301MiB |
| 4/1 | 60.67 | 110.71 | 129.56 | 178.40 | 445MiB |
| 4/3 | 64.01 | 110.42 | 131.03 | 161.65 | 548MiB |
| 6/1 | 59.19 | 110.53 | 129.85 | 179.90 | 563MiB |
| 8/1 | 62.04 | 110.89 | 131.68 | 177.97 | 638MiB |

The 4-worker `RnsEngine` construction stage took about 42–43ms for Year 5000, compared with about 54ms for 3-worker configurations. The full response speedup was smaller because predictor/replay work still contributes heavily. Going from four to six or eight RNS workers did not materially shorten full response latency, but increased virtual-memory reservations and RSS on this host.

**Important tradeoff:** 4/1 was faster than 3/3 on three contexts but marginally slower on Foundation. 4/3 was fastest on Foundation with higher memory use. 3/1 minimized virtual-space use among these four compared configurations, while previously validated 1/1 remains the separate 64MiB memory profile. These are means of only two measurements per policy/context, so they do NOT justify changing the default.

## Decision

Retain `latency=3/3`, `balanced=3/1`, and `memory=1/1` unchanged. Permit a new *explicit research-only* 4/1 variant to be assessed with six repetitions and direct full-wire protocol checks; do not label it universally optimal or production ready.
