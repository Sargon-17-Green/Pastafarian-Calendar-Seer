# Hosted Public API hosting selection

Status: **DECIDED for zero-payment launch; live-provider compatibility gate remains**

Pricing / product facts checked: **2026-09-19**

Repository baseline: `af3596bae0cf975cc8071c879e8a1d0a42bf43c0` (`main`, package `0.2.2`).

This document is the Stage-2 hosting decision for the Hosted Public API defined in
[`PUBLIC_API_ARCHITECTURE.md`](./PUBLIC_API_ARCHITECTURE.md). It does not perform a
production deployment.

## Hard constraint added during Stage 2

The service must be deployable **without adding a payment method at any time**.
A provider that requires a credit card, billing account, or paid subscription is
therefore ineligible even if it advertises a compute free tier.

This constraint materially changes the earlier technical preference for Google
Cloud Run. Cloud Run remains a useful engineering comparison point, but it is not
an eligible launch provider under the no-payment-method rule.

## Decision

**PRIMARY:** Back4app Web Deployment / Containers, Free plan.

**FALLBACK:** Render Free Web Service.

**Launch classification:** public beta / community service, **no SLA**.

The no-payment-method constraint is incompatible with the stronger
"production-grade with guaranteed resources/SLA" interpretation of the Stage-1
contract among the managed providers verified in this workstream. Back4app itself
positions Free for testing/learning; Render explicitly says not to use Free web
services for production applications. The service must not claim an SLA while it
runs on these tiers.
## Why Back4app Free is primary

Back4app currently documents, for one Free container:

- $0 per container per month;
- no credit card required;
- 0.25 shared CPU;
- 256 MB RAM;
- 100 GB transfer;
- deployment from GitHub;
- custom Docker containers;
- USA region;
- a provider `b4a.run` URL;
- custom domains and managed SSL/TLS support;
- container CPU/RAM/network/process metrics;
- custom HTTP health checks.

It is preferred over Render Free because the Seer is CPU-bound on exact queries
and Back4app allocates 0.25 CPU versus Render Free's 0.1 CPU. Back4app also
advertises no time limit on its Free tier, whereas Render Free spins down after
15 minutes without inbound traffic and takes about one minute to spin back up.

The decision is based on both provider documentation and a local constrained
runtime simulation described below. It is **not** based on a provider-side
benchmark, because account authorization has not yet been performed.

## Required runtime model

Each container runs:

1. one Node.js HTTP server;
2. one persistent `seer_engine_service` child process;
3. the exact native runtime compiled with the portable RNS backend;
4. the immutable generated gate/cache corpus embedded in the image.

The persistent engine process is important. Exact work benefits from warm
calculation-day state and current concurrency tests show one engine worker
serializes heavy exact queries. Horizontal parallelism is unavailable on the
selected Free tier, so excess exact work must queue or be rejected by an
application-level admission policy.
## Initial launch shape

| Property | Decision |
| --- | --- |
| Provider | Back4app Web Deployment / Containers Free |
| Region | USA (the region advertised for Free) |
| Runtime architecture | Linux container; deploy current amd64 image semantics, subject to live build verification |
| CPU | 0.25 shared CPU |
| Memory | 256 MB |
| HTTP processes/container | 1 |
| Engine processes/container | 1 |
| Exact engine threads | current runtime default, but effective CPU quota is 0.25 CPU |
| Application heavy-work concurrency | 1 |
| Instances | 1 |
| Min instances | 1 logical Free container; provider idle policy must be observed live |
| Max instances | 1 on the zero-cost plan |
| Native exact fallback timeout | 120 s implementation default; **not** a public hosted deadline |
| Hosted application deadline | TBD from live-provider benchmark; must expire before the outer provider/gateway deadline |
| Provider request timeout | not documented; must be measured/verified live before choosing the hosted deadline |
| Persistent storage | none |
| Database | none |
| Writable filesystem | ephemeral only; never authoritative |
| Public URL | provider `*.b4a.run` URL initially |
| Custom domain | optional; not needed for the first launch |
| TLS | provider-managed |
| Kubernetes | no |
| ARM64 launch requirement | no |

The existing image is based on Node 24 Bookworm slim and installs GMP/OpenMP
runtime libraries. Its build stage compiles C++ and installs `libgmp-dev` and
Boost headers. Back4app documents Dockerfile-driven builds and Docker
`RUN`-based dependency installation, so this model is structurally compatible.

Two build details remain live-provider gates: Back4app does not document a build
timeout/resource guarantee, and its public docs do not state that Docker
BuildKit's automatic `TARGETARCH` argument is injected. The current Dockerfile
expects `TARGETARCH` to be `amd64` or `arm64`.
## Measured compatibility evidence

The current `main` was rebuilt and tested before the constrained benchmark:

- `npm run build:native`: PASS;
- `npm test`: PASS;
- portable rebuild matching the Dockerfile:
  `SEER_ARCH=amd64 SEER_RNS_BACKEND=portable npm run build:native`: PASS.

A Linux cgroup-v2 simulation then constrained the service to the published
Back4app Free envelope:

- `CPUQuota=25%` (0.25 CPU);
- `MemoryMax=256M`;
- swap disabled;
- one Node server + one persistent engine service;
- portable RNS backend.

Representative far exact query
(`calculationJdn=2342550`, `targetJdn=1093452`) returned HTTP 200 five times:

| Sample | Wall time |
| ---: | ---: |
| 1 | 6.938 s |
| 2 | 6.085 s |
| 3 | 6.489 s |
| 4 | 6.485 s |
| 5 | 6.085 s |

A cheap/cache date query took 0.010 s in the same run. Peak cgroup memory was
86,093,824 bytes (~82.1 MiB).

These timings are compatibility evidence, not a prediction of Back4app hardware.
The real Free plan uses shared CPU and may be slower or noisier.

A second constrained pass on the same current `main`, after rebuilding explicitly
with `SEER_ARCH=amd64 SEER_RNS_BACKEND=portable`, returned the same representative
exact query in `3.720, 4.390, 4.389, 3.800, 3.297 s`. The cheap query took
`0.085 s`, and peak cgroup memory was 115,314,688 bytes (~110.0 MiB). The spread
between the two passes reinforces that local shared-host contention is material;
capacity planning therefore uses a deliberately conservative envelope rather than
the fastest observed result.
### Calculation-day variety / LRU stress

Ten sequential exact queries using ten distinct calculation JDNs completed in:

`4.832, 5.480, 4.592, 2.483, 3.090, 5.279, 4.493, 5.692, 2.785, 2.961 s`.

Peak memory was 91,222,016 bytes (~87.0 MiB), well below the simulated 256 MB
limit.

### Concurrent exact requests

Four representative heavy exact requests issued together completed at roughly:

`5.25, 10.36, 14.95, 19.85 s`.

This confirms that heavy work should be capacity-planned as one engine worker.
Increasing HTTP concurrency does not create useful exact parallelism on one
container.

### Large range response

A `POST /v1/range` request for 10,000 canonical results returned:

- HTTP 200;
- 22.328 s wall time;
- 2,395,061 response bytes;
- 143,261,696 bytes (~136.6 MiB) peak cgroup memory.

The current range implementation materializes the response before sending it.
Even this measured large response stayed below 256 MB, but a provider-side test
is still required because allocator/runtime overhead and shared-host behavior can
differ.
## Capacity model

For the Free primary, capacity is constrained by CPU rather than monetary
metering.

A practical initial planning envelope is **5-10 heavy exact requests/minute per
container**, with one heavy request admitted to the engine at a time. This is
deliberately below the best local constrained measurements to allow for shared
CPU variability.

Cheap/cache/static routes are much faster and should not be assigned the exact
capacity number. They should nevertheless be rate-limited separately so that
abuse cannot starve exact work.

There is no zero-cost horizontal scaling assumption. If sustained demand exceeds
this envelope, the correct response under the hard payment constraint is to
apply queue/rate limits and publish capacity limitations, not to silently create
billable replicas.

## Cost model

| Metric | Back4app Free launch |
| --- | ---: |
| Idle monetary cost | $0/month |
| Typical monetary cost | $0/month while inside Free-plan limits |
| Compute cost / 1,000 exact queries | $0 monetary |
| Included transfer | 100 GB/month |
| Paid-overage assumption | none; payment method is prohibited |

"$0 per 1,000" must not be interpreted as unlimited capacity. The scarcity is
CPU time and plan quota. At roughly six seconds of engine wall time per
representative exact request, 1,000 sequential exact requests are on the order
of 100 container-minutes before shared-host variability, queueing, cold behavior,
and other traffic.
## FALLBACK: Render Free Web Service

Render is retained as the zero-payment fallback because it supports Docker web
services, managed TLS, custom domains, and can be used without a payment method.
Its documented Free compute allocation is 0.1 CPU and 512 MB RAM.

It is weaker for this workload because:

- exact calculation is CPU-bound and receives less than half Back4app's CPU
  allocation;
- it spins down after 15 minutes without inbound traffic;
- waking a spun-down Free service takes about one minute;
- Free services cannot scale beyond one instance;
- Free services receive 750 running instance-hours per workspace per month;
- Render explicitly says Free instances should not be used for production.

If no payment method exists and usage would otherwise incur a charge, Render
documents that it disables services rather than billing the user. This makes it
financially safe under the hard constraint but operationally less available.

A local compatibility simulation using the same portable runtime, `CPUQuota=10%`
and `MemoryMax=512M` produced representative exact latencies of
`10.965, 9.101, 8.887 s`; a cheap query took `0.006 s`, and peak memory was
85,807,104 bytes (~81.8 MiB). This supports Render as a functional fallback but
also confirms its materially lower exact-query throughput.

A provider-side Render benchmark is not required unless the Back4app live gate
fails.

## Rejected / non-selected options

- **Google Cloud Run:** technically the strongest measured fit from the earlier
  analysis, but its normal account/billing model conflicts with the hard
  no-payment-method constraint.
- **Koyeb:** requires a credit card for account/service use under the verified
  current policy.
- **Hugging Face Docker Spaces:** creation of Docker/Gradio Spaces is currently
  tied to a paid plan despite CPU Basic being listed as free hardware.
- **Cloudflare Containers:** Containers are currently a Workers Paid-plan
  feature.
- **Zeabur managed shared hosting:** the old Shared Cluster path is deprecated;
  its Free model is centered on managing an external/own server.
- **Kubernetes:** unjustified operational complexity for one state-free API.
## Health, lifecycle, and storage requirements for Workstream 3

The current Dockerfile health check calls `/v1/status`. That route performs
`queryApi.queryDate({})`; it is a readiness/functional probe, not a guaranteed
cheap process-liveness probe. If the rolling cache cannot answer, it can exercise
the query provider chain.

Before treating provider health checks as production-safe, add a dedicated cheap
endpoint (for example `/healthz`) that verifies process/engine-service
availability without performing an exact calendar calculation. Keep
`/v1/status` as the stronger functional readiness/status endpoint.

No persistent disk or database is required. Generated gate/cache data is
immutable image content. Engine caches are performance state only and may be lost
on restart without affecting correctness.

Graceful shutdown must stop accepting new work and terminate the child engine
cleanly. Because exact requests are deterministic/stateless, clients may retry
transport failures, but Workstream 3 must document retry semantics rather than
assuming provider draining behavior.

## Live-provider gate before public deployment

Workstream 3 must begin with a temporary or first Free deployment named
`seer-hosting-eval-back4app` (or the production service only after the same
checks are run) and record:

1. Docker build success with the current multi-stage Dockerfile;
2. observed target architecture and handling of `TARGETARCH`;
3. startup time and health-check behavior;
4. representative exact latency and memory/CPU metrics;
5. four-request exact concurrency behavior;
6. 10,000-result range behavior;
7. provider ingress/request timeout using a controlled long request or
   authoritative provider evidence, followed by selection of a shorter hosted
   application deadline;
8. restart/redeploy behavior and loss of non-authoritative local state;
9. HTTPS provider URL and TLS behavior;
10. deletion/rollback path and confirmation that no payment method was requested.

If Back4app asks for a payment method at any point, the gate fails immediately
and Render Free becomes the next candidate.
## Inputs for Workstream 3

- Treat this launch as a **zero-payment public beta**, not an SLA-backed service.
- Primary provider: Back4app Containers Free.
- Fallback provider: Render Free Web Service.
- Start with one container, one Node HTTP process, one persistent engine process.
- Admit at most one heavy exact operation to the engine at a time.
- Add cheap liveness endpoint before configuring frequent provider health probes.
- Treat the native exact fallback's 120 s as an implementation default, not a
  public latency promise or preselected hosted deadline.
- Choose the hosted application deadline only after the provider ingress/gateway
  timeout is measured; the application deadline must expire first so it can
  return the typed hosted timeout response required by the Stage-1 contract.
- Keep all authoritative data in the image; use no persistent disk or database.
- Use provider HTTPS URL initially; custom domain is optional.
- Do not add a card, billing account, paid add-on, paid replica, or paid domain.
- Add explicit 429/503 overload behavior and rate limiting before broad publicity.
- Record real Free-tier CPU, RAM, latency, startup, build, and timeout evidence.
- Keep a Render configuration path ready, but do not deploy it unless the
  Back4app gate fails.

## Provider sources checked 2026-09-19

Back4app:

- https://www.back4app.com/pricing/container-as-a-service
- https://www.back4app.com/web-deployment-platform
- https://www.back4app.com/docs-containers/get-started
- https://www.back4app.com/docs-containers/prepare-your-deployment
- https://www.back4app.com/docs-containers/troubleshooting
- https://www.back4app.com/docs-containers/release-notes

Render:

- https://render.com/docs/free
- https://render.com/docs/compute-plans
- https://render.com/docs/docker
- https://render.com/docs/tls
- https://render.com/docs/faq
