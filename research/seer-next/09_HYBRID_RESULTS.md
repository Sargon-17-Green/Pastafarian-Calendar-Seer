# Seer Next — Hybrid S4+S2 experiment, 2026-11-06

Evidence: [GitHub Actions run 42292756337](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42292756337); [artifact 13540607978](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42292756337/artifacts/13540607978). The artifact ZIP retains both complete 144-pair S2 profile-matrix.json and 72-pair S4+S2 profile-hybrid.json, along with the original full-year A/B and 156-query differential outputs. SHA tested: `5e51a676758671f549a099dcfcb518af788c370b`.

**All compared native JSON responses matched baseline in all paired workloads.** The hybrid profile has one trial per scenario/policy (72 pairs) and must not be treated as statistically definitive. Linux x64 / AVX2: AMD EPYC 7763 host, Node v24.22.2. CPU and Linux VmHWM recorded alongside wall latency. A different host means do not compare absolute latency numbers to the first 144-pair run as though its differences were caused by our code changes.

## Paired baseline/hybrid total wall-time ratios

| Workload | S4 single-day LRU + S2 promote-after-2 |
|---|---:|
| Two requests for one early-year date | **1.883×** |
| Four requests for same interior-year date | **3.800×** |
| Sixteen repeated interior-year requests | **14.971×** |
| Thirty-two repeated interior-year requests | **28.141×** |
| Nine calculation days, two visits each | **1.973×** |
| Eight sparse same-year dates | **3.253×** |
| A single interior-year request | 0.854× (slower in this single trial; more repetitions needed) |
| Eighteen distinct calculation days | 1.007× (roughly unchanged) |

For 32 repeated same-date requests, `dayHits=31`, `dayStores=1`, `fullYearBuilds=0`, under the default 64KiB S4 payload budget. For nine calculation-day contexts visited twice each, `dayHits=9`, `dayStores=9`, `fullYearBuilds=0` (S2-only had built nine unhelpful tables). An S4 exact day record has 40B of native record payload (plus significant container metadata), so this strategy reduces work without paying for complete-year tables in these targeted profiles.

For eight sparse dates in one year, the hybrid built one S2 full-year table and registered two S2 hits and four S4 hits; one-day records and whole-year tables can coexist.

**Important control interpretation:** the profile policy labeled `disabled` sets `SEER_NEXT_CACHE_BYTES=0` and therefore disables **S2 only**. S4 retains the default 64KiB day cache. It must **not** be interpreted as a completely cache-free hybrid baseline. The unchanged Seer service on the other side of each pair remains cache-free in these experimental cache layers.

## Next correctness and operational work

- Confirm selected records against an *independent saved-sum canonical oracle*, not only original Seer; include Foundation vicinity and year crossings.
- Preserve raw CI JSON in the research branch rather than relying indefinitely on artifact retention.
- Build an actual maximum RSS allocator/worker budget — current limits are only cache-payload limits.
- Add one-shot and broad-domain cold optimizations, and test cost-aware promotion rules and stochastic workload distributions.

**Do not merge this experimental service into the production Seer.** Neither global correctness nor Pareto dominance across platforms has been demonstrated.
