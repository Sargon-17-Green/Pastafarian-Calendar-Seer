# Public product benchmark suite

This suite measures the shipped Seer query and HTTP surfaces rather than isolated prototype kernels.

It is intentionally **informational before the first baseline**: no latency, CPU, RSS, throughput, or regression threshold is encoded. Correctness failures still fail the run; performance numbers do not.

## Coverage

The runner exercises cached date lookup, exact cache misses, `c=t`, Foundation vicinity, far-past and far-future dates, reverse lookup, year structure with and without `days`, batch, fixed range, same-as-target range, in-process HTTP overhead, fresh-process cold exact queries, steady warm persistent-service exact queries, and HTTP concurrency/queue behavior.

Steady-state cases perform explicit warmups. Fresh-process measurements are reported separately and never mixed into steady-state distributions. Cache-hit measurements require a verified rolling cache directory; CI generates and validates one before benchmarking.

## Metrics

Every result records the Git commit, package/runtime identity, engine fingerprint, requested native backend, Node/compiler/OS/CPU/memory metadata, workload shape, and sample count. Per-operation distributions report wall time and Node CPU time. Linux also reports aggregate CPU and RSS for the benchmark process tree, which includes the persistent native engine service. Windows currently labels CPU/RSS scope as Node-only; wall-time numbers still include native work.

Percentiles are emitted only when sample counts support them: p50 always, p95 at 20 or more samples, and p99 at 100 or more samples. This is a reporting rule, not a performance gate.

## Run locally

Build the exact runtime and prepare a rolling cache first:

```text
npm run build:native
node precompute/generate-cache.mjs --output-dir=.cache-build/bench
node precompute/validate-generated.mjs --generated-dir=.cache-build/bench
npm run bench:product -- --generated-dir=.cache-build/bench
```

Useful controls are `--samples`, `--cheap-samples`, `--heavy-samples`, `--cold-samples`, `--warmup`, `--concurrency`, and `--output`.

Use `--smoke` only for harness/integration verification. It keeps the same public surfaces but shrinks batch/range/fan-out shapes and concurrency request counts; smoke results are not baseline-comparable to full results. Pull requests use smoke mode, while `main` pushes and manual workflow runs use the full workload.

The concurrency series keeps one far-future calculation day warm and varies non-contiguous exact target days. This exercises HTTP/admission/service queue behavior without accidentally turning the concurrency benchmark into hundreds of unrelated cold year-chain constructions. The separate same-as-target range remains the deliberate calculation-day fan-out case.

Compare two completed result files without introducing pass/fail policy:

```text
npm run bench:compare -- baseline.json candidate.json
```

## CI matrix

`.github/workflows/product-benchmark.yml` runs the public-product suite on Linux amd64 AVX2, Linux amd64 portable, Linux arm64 portable, and Windows x64 portable. Artifacts are machine-readable JSON plus a Markdown summary. The workflow has no performance threshold until an empirical baseline has been reviewed.

OPT-07 weighted transition maps remain **DO NOT ADOPT**. This suite does not reopen OPT-07; reconsideration requires new measured evidence that is relevant to a product-level hotspot.
