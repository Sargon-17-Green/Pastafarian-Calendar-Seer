# Hosted Public API hosting selection

Status: **DECIDED after live-provider adjudication; Render Free is the zero-payment launch provider**

Pricing / product facts rechecked: **2026-09-21**

This document is the Stage-2 hosting decision for the Hosted Public API defined in
[`PUBLIC_API_ARCHITECTURE.md`](./PUBLIC_API_ARCHITECTURE.md). It does not perform a
production deployment.

## Hard constraint

The service must remain deployable **without adding a payment method at any time**.
A provider that requires a card, billing account, or paid subscription is
ineligible even when it advertises a free compute allowance.

The launch is therefore classified as a **public beta / community service with no
SLA**. A zero-payment managed tier is not being represented as guaranteed
production infrastructure.

## Final decision

**PRIMARY:** Render Free Web Service.

**SECONDARY / short-lived compatibility target:** Back4app Web Deployment Free.

Back4app is no longer a launch fallback because the live account gate exposed a
temporary public URL that is explicitly limited to 60 minutes unless the service
is upgraded.

## Live-provider adjudication: Back4app Free

A real Back4app deployment was performed against
`hosting/back4app-targetarch-fix` with no payment method and the Free plan
(0.25 vCPU, 256 MB RAM).

The first build exposed a Docker compatibility issue: Back4app/Kaniko did not
inject Docker BuildKit's automatic `TARGETARCH` argument. A minimal Dockerfile
compatibility fix was prepared so an empty `TARGETARCH` falls back to `amd64`
while explicit Buildx `amd64` / `arm64` values remain authoritative.

The corrected live build then passed all of the following provider-side gates:

- repository fetch;
- Docker multi-stage build;
- native toolchain installation;
- GMP / Boost / OpenMP dependencies;
- exact native runtime build as amd64 portable;
- package self-test;
- runtime image creation;
- image push;
- container launch;
- provider HTTP health check on port 8080;
- deployment release.

Observed live memory after release was about 47 MB inside the 256 MB Free limit.

The provider-side build log also recorded the package self-test as PASS and the
runtime as built successfully.

### Durability failure

The resulting Free deployment was shown by the live Back4app dashboard as:

- status: `Available`;
- plan: Free;
- public `*.b4a.run` URL;
- **Temporary URL**;
- **URL is temporary and will be live for 60 minutes**;
- **Upgrade for a Permanent URL**.

That fails the hard zero-payment requirement for a durable public API endpoint.
The Back4app documentation still describes a free `b4a.run` address and custom
domains, but the live account entitlement is the controlling evidence for this
selection. Back4app remains useful for short-lived Docker compatibility tests,
not for the launch endpoint.

## Why Render Free is primary

Current Render documentation confirms:

- no payment is required for the first Free deployment;
- a Free Web Service is supported;
- Docker deployments are supported;
- every Web Service receives a public `onrender.com` subdomain;
- managed TLS is provided;
- Free Web Services can be used without a payment method;
- if usage would otherwise incur charges and no payment method exists, Render
  suspends/disables service or builds rather than charging;
- Free Web Services spin down after 15 minutes without inbound HTTP/WebSocket
  traffic;
- a subsequent request wakes the service, with roughly one minute documented
  spin-up time;
- Free services cannot scale beyond one instance;
- 750 Free instance-hours are available per workspace per calendar month;
- the filesystem is ephemeral.

Render currently offers Oregon, Ohio, Virginia, Frankfurt, and Singapore.
`frankfurt` is the preferred initial region for this Israel-centered launch
evaluation because it is the nearest listed region geographically; the actual
provider-side latency still must be measured before broad publication.

## Required runtime model

Each service instance runs:

1. one Node.js HTTP server;
2. one persistent `seer_engine_service` child process;
3. the exact native runtime compiled with the portable RNS backend;
4. immutable generated gate/cache data embedded in the image.

No database or persistent disk is correctness-critical.

Heavy exact work should be admitted at concurrency 1. One persistent engine
serializes the expensive path and horizontal scaling is unavailable on the
zero-cost plan.

## Initial launch shape

| Property | Decision |
| --- | --- |
| Provider | Render Free Web Service |
| Region | Frankfurt |
| Runtime | Docker / Linux |
| CPU | 0.15 CPU |
| Memory | 512 MB |
| HTTP processes | 1 |
| Engine processes | 1 persistent exact engine |
| Heavy exact concurrency | 1 |
| Instances | 1 |
| Horizontal scaling | unavailable on Free |
| Idle behavior | spins down after 15 minutes without inbound traffic |
| Wake behavior | about one minute documented |
| Public URL | stable provider `*.onrender.com` URL |
| TLS | provider-managed |
| Persistent storage | none |
| Database | none |
| Writable filesystem | ephemeral only |
| Native exact implementation timeout | 120 s default; not the hosted public deadline |
| Hosted application deadline | TBD from live Render timeout measurement |
| Kubernetes | no |

The existing Dockerfile already binds `HOST=0.0.0.0` and exposes port 8080.
Render provides a `PORT` environment variable for Web Services, and the server
already consumes `PORT`.

## Measured compatibility evidence

### Back4app-envelope local simulation

A Linux cgroup-v2 simulation at 0.25 CPU / 256 MiB showed representative heavy
exact queries in roughly 3.3-6.9 seconds across runs, a 10,000-result range in
about 22.3 seconds, and peak range memory around 136.6 MiB.

The live Back4app deployment subsequently confirmed that the real provider could
build and launch the same runtime within the Free memory envelope.

### Render-envelope local simulation

A local compatibility simulation using the same portable runtime at
`CPUQuota=10%` and `MemoryMax=512M` produced representative exact latencies:

- 10.965 s
- 9.101 s
- 8.887 s

A cheap query took about 0.006 s and peak memory was about 81.8 MiB.

This is compatibility evidence only. Shared-provider CPU scheduling, cold wake
behavior, and network latency must be measured on Render itself.

## Capacity model

For the Render Free launch, plan conservatively for **3-5 heavy exact
requests/minute while the instance is warm**, with only one heavy exact request
admitted to the engine at a time.

The theoretical warm sequential rate from the local 0.1-CPU samples is higher
than the conservative envelope, but shared-host variability and HTTP overhead
justify headroom.

Cheap/cache/static routes should have separate rate limits and should not inherit
the heavy-exact capacity number.

There is no zero-cost horizontal scaling assumption. Sustained overload must
produce explicit bounded queueing / 429 / 503 behavior rather than billable
scale-out.

Cold availability is materially different from warm throughput: after 15 minutes
idle, the next request may wait about a minute for the service to wake.

## Cost model

| Metric | Render Free launch |
| --- | ---: |
| Idle monetary cost | $0 |
| Typical monetary cost | $0 while within included Free usage |
| Compute cost / 1,000 exact queries | $0 monetary |
| Free instance hours | 750/workspace/month |
| Paid overage assumption | none; no payment method is allowed |

If monthly included usage is exhausted, availability may stop until the quota
resets. That is acceptable for this no-SLA beta but must be documented publicly.

## Docker compatibility finding

The Back4app live gate uncovered a provider-neutral Docker portability defect:
not every Docker builder injects BuildKit's automatic `TARGETARCH`.

The compatibility branch now uses an amd64 fallback only when `TARGETARCH` is
empty. GitHub CI validates explicit amd64 and arm64 container builds so the
fallback must never override a Buildx-provided architecture.

## Workstream 3 live-provider gates for Render

Before calling the Hosted Public API launch-ready:

1. Create one Render Free Web Service with **no payment method**.
2. Select `frankfurt` and Docker deployment from the repository.
3. Confirm the stable `onrender.com` HTTPS URL.
4. Confirm the Dockerfile builds and the exact native runtime starts.
5. Record actual runtime architecture.
6. Use a cheap non-calendar liveness endpoint for frequent health checks.
7. Measure warm representative exact latency and memory.
8. Measure a four-request exact concurrency burst.
9. Measure the 10,000-result range.
10. Measure cold wake after at least 15 minutes idle.
11. Establish the provider ingress/request timeout and choose a shorter
    application deadline.
12. Confirm restart/redeploy behavior and ephemeral-state loss.
13. Confirm no billing or payment method is requested anywhere in the flow.
14. Define explicit overload/rate-limit behavior before broad publicity.

## Rejected / non-selected options

- **Back4app Free:** Docker/runtime compatibility PASS, but the live account
  exposes only a 60-minute temporary URL without upgrade; unsuitable for a
  durable zero-payment public endpoint.
- **Google Cloud Run:** technically strong, but requires a billing account /
  payment method.
- **Koyeb:** current policy requires a credit card.
- **Hugging Face Docker Spaces:** current Docker/Gradio creation path is tied to
  a paid plan.
- **Cloudflare Containers:** paid Workers feature.
- **Zeabur managed shared hosting:** current Free path does not provide the
  required managed zero-payment container service.
- **Kubernetes:** unjustified complexity for one stateless API.

## Render live-provider evidence — 2026-09-21

A real Render Free Web Service deployment was created from commit
`465328804e3caad8d34ddb05013ac5622694f967` on
`hosting/back4app-targetarch-fix`.

Observed provider-side evidence:

- Docker build: PASS;
- target/native architecture: `amd64`;
- RNS backend: `portable`;
- all four exact native binaries built successfully;
- package self-test: PASS;
- Render set `WEB_CONCURRENCY=1`;
- HTTP server bound successfully to `0.0.0.0:10000`, confirming use of Render's injected `PORT`;
- deploy status: `Deploy succeeded | Live`;
- stable provider URL issued:
  `https://seer-hosting-eval-render.onrender.com`;
- initial deploy duration shown by Render: 1m42s;
- no payment method was requested during creation/deployment.

This closes the build/startup/stable-URL subset of the Render live gate. The
remaining gates are on-provider request/latency/concurrency/range/cold-wake/timeout
measurements plus restart/ephemeral-state verification and overload policy.

The captured Deploy page does not re-display the service region, so the selected
Frankfurt region remains configuration evidence from service creation rather than
a fact independently re-proven by this deploy log capture.

## Render live performance measurements — 2026-09-21

The live Frankfurt Render Free Web Service was exercised through its public HTTPS URL.

Representative fixed exact date query
(`calculationJdn=2342550`, `targetJdn=1093452`) returned HTTP 200 in all five
sequential runs: 8.294s, 7.571s, 7.916s, 7.202s, and 7.895s
(p50 7.895s; mean 7.776s).

A four-request simultaneous burst to the same exact query completed at
8.455s, 16.317s, 24.614s, and 32.615s, total 32.640s. The incremental service
intervals were 8.455s, 7.862s, 8.297s, and 8.001s, confirming the expected
single heavy-exact queue/serialization behavior on the live provider.

A 10,000-result fixed-calculation range returned HTTP 200 in 36.726s with
2,395,061 UTF-8 bytes. It returned exactly 10,000 results, from target JDN
1093452 through 1103451 inclusive. This also proves that the currently observed
provider ingress path permits at least a 36.7-second request; the actual timeout
boundary remains to be measured.

Cold wake after idle was also measured on the public liveness endpoint. The first
request after the >=15-minute idle window returned HTTP 200 with
`{"status":"ok"}` in 13.765s. This is the live-provider measurement used for
planning; Render's documentation describes wake-up as taking roughly a minute,
but the observed service wake was materially faster.

Provider-side peak memory cannot be read from Render's Application Metrics panel on
the Free compute plan: the live dashboard requires an upgrade to any paid compute
plan for memory/CPU graphs. The live UI nevertheless exposes the enforced limits:
512 MB memory and 0.15 CPU.

The memory gate is therefore closed as a **bounded pass** under the zero-payment
constraint: the five sequential exact requests, four-request exact burst, and
10,000-result range all completed without OOM/restart while the service was
subject to the 512 MB limit. Exact peak memory remains intentionally unknown
rather than paying or contaminating the Docker compatibility branch with
temporary instrumentation.


## Post-restart validation — 2026-09-21

Render confirmed that the service restarted successfully without creating a new
deploy record. After restart, the public liveness endpoint returned HTTP 200 with
`{"status":"ok"}`; `/v1/meta` reported package version `0.2.3`,
`artifactMode=container`, and the same engine fingerprint as before restart:
`02fc6de6a659bcdc110e91e044f4b4ca7835d9a1964e04f31c7fbdef886bfd11`.

The representative exact query
(`calculationJdn=2342550`, `targetJdn=1093452`) returned the same semantic
result — Year 4710, Horn day 663, Well day 57 — in 7.862s.

Therefore restart/ephemeral-state independence is a PASS: correctness and public
identity did not depend on state retained by the previous instance.

### Provider HTTP timeout

Render's current official documentation states that Web Service HTTP responses can
take up to 100 minutes. The live 10,000-result range also established a provider
lower bound of 36.726s without interruption.

The Seer exact engine already has a 120,000 ms operation deadline. This is
intentionally far shorter than Render's 6,000,000 ms HTTP response ceiling.
Admission waiting is handled separately by the hosted overload/queue policy.

### Live overload finding

The first live overload test used six simultaneous representative `/v1/date`
requests after configuring the internal exact engine with concurrency 1 and queue
limit 2. All six requests still returned HTTP 200, completing at 8.785s, 17.560s,
21.068s, 25.758s, 31.867s, and 41.163s.

This is a failed overload-policy gate, not a correctness failure. The root cause
is architectural: HTTP-originated date queries can be batched/coalesced by the
precomputed provider before they reach exact-engine admission. Therefore
`SEER_EXACT_QUEUE_MAX` is not an upper bound on HTTP waiters.

Remediation is isolated in Draft PR #37,
`hosting/render-http-overload-admission`. It adds an opt-in HTTP-layer gate with
`SEER_HTTP_EXACT_CONCURRENCY` and `SEER_HTTP_EXACT_QUEUE_MAX`, preserves the
existing default when unset, returns typed HTTP 503/`SEER_UNAVAILABLE` on
overflow, and keeps liveness/readiness/meta endpoints outside the heavy queue.
Live re-validation is required before this gate can be closed.

### Live overload remediation PASS

The HTTP-layer admission remediation from Draft PR #37 was deployed to the live
Render Free service at commit
`69cc3191d197885ef9b5b508387cb847edf4fdba`.

With `SEER_HTTP_EXACT_CONCURRENCY=1` and
`SEER_HTTP_EXACT_QUEUE_MAX=2`, a six-request simultaneous burst produced the
intended bounded behavior: three requests were rejected rapidly with HTTP 503 at
0.347s, 0.389s, and 0.391s. Each returned typed
`SEER_UNAVAILABLE` with `admissionFailure=overloaded`, `layer=http`,
`maxConcurrency=1`, and `maxQueue=2`.

The three admitted requests returned HTTP 200 at 6.220s, 14.027s, and 17.625s.
This closes the live overload gate: the zero-payment Render instance now fails
fast under excess exact load instead of accumulating an unbounded set of HTTP
waiters.

## Stage-2 conclusion

The hosting selection is now based on real provider execution rather than only
pricing pages and local simulation.

Back4app proved the image can run in a very small managed container, but its live
Free URL entitlement is too short-lived. Render Free is therefore the selected
zero-payment launch provider, subject to the Render live-provider gates above.
