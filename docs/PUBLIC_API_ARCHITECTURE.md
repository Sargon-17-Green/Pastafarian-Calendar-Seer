# Hosted Public API architecture and production contract

Status: **authority for the hosted-service layer; pre-launch**
Contract revision: **1.0**
API path family: **/v1**
Last architecture audit: **2026-09-18**

This document is the source of truth for how the existing Pastafarian Calendar Seer HTTP v1 API may be exposed as a hosted public HTTPS service. It does **not** redefine the calendar, replace the Seer query layer, or create a second implementation of calendar semantics.

The hosted service is a deployment, policy, reliability, security, and operations layer over the existing Seer HTTP API. A caller must be able to use the core service with ordinary HTTPS alone: no npm package, Node runtime, native binary, Docker image, browser helper, or Seer installation is required on the client.

## 1. Authority boundaries

Calendar semantics remain governed by the canonical calendar authority and the verified Seer implementation. This document must never be used to change calendar arithmetic, canonical indices, the calculation-day model, observer semantics, Gregorian/JDN semantics, or the Foundation.

For the hosted service, the authority order is:

1. canonical calendar authority for calendar meaning;
2. OpenAPI plus referenced JSON Schemas for the wire contract;
3. this document for public-hosting, compatibility, privacy, reliability, and deployment policy;
4. provider configuration and operational runbooks for implementation details that do not contradict the above.

If these sources disagree, the disagreement is a defect to fix. A gateway, CDN, WAF, load balancer, SDK, web application, or hosting provider is never allowed to silently reinterpret Seer semantics.

The Seer Foundation JDN is exactly `-13334246`. The separate linear-day value `-15055671` is **not** a Seer JDN and must not be used as one by the hosted layer.

## 2. Audit snapshot used for this contract

The contract was drafted from the live repository, not a historical baseline. At the audit point:

| Item | Observed state |
| --- | --- |
| `origin/main` / HEAD | `7654bb017fb6a73dd128b32bdbe1b5663217f1a5` |
| package version on `main` | `0.2.1` |
| package tag observed | `v0.2.1` -> `a8a90d4479432a1c73ef74ee4be55d367089a02c` |
| npm `latest` | `0.2.1` |
| GHCR version tags | `0.2.1`, `v0.2.1` |
| GHCR v0.2.1 top-level digest observed | `sha256:cf0787f37c1c4fdea71c44fe64272478b3895322cff435b24f455eef1a505e99` |
| latest published GitHub Release | `v0.1.4` |
| v0.2.1 final GitHub Release workflow | cancelled; no published v0.2.1 GitHub Release observed |
| exact production gate horizon | `-100000..100000` gates |
| public exact JDN domain | `(-63473948, 36828783]` |
| verified container architectures | `linux/amd64`, `linux/arm64` |
| locale catalog observed | `en`, `he`; default `en` |

This table is an audit record, not a moving alias for "current production". In particular, the partial v0.2.1 cross-channel state above is **not** a valid hosted-production release identity under this contract.

Historical audit note: at the 2026-09-18 snapshot, final adversarial QA was still changing `main`. That QA later completed for release v0.2.2; the dated evidence is preserved at `docs/history/releases/FINAL_QA_REPORT_2026-09-18.md`. The table above remains a frozen audit snapshot rather than current release identity. The hosted service itself remains pre-launch until the launch gates in this contract are satisfied.

## 3. Service identity and hostname model

The Hosted Public API is one canonical HTTPS origin exposing the supported HTTP v1 query contract and public machine-readable assets. It is stateless with respect to user requests and delegates all calendar work to the existing Seer query/runtime stack.

A final DNS name is intentionally **TBD** until the hosting/domain workstream.

| Name | Contract |
| --- | --- |
| canonical production hostname | project-controlled custom hostname, to be selected later |
| staging hostname | separate project-controlled staging hostname, to be selected later |
| provider/internal hostname | implementation detail; never a documented client dependency |

Public examples should use `https://<canonical-api-host>/...` until DNS is selected. Clients must depend only on the canonical hostname. Provider URLs, instance addresses, load-balancer hostnames, and preview URLs are non-contractual.

Production and staging must be distinct. Production must not be used as the routine test environment.

Core capabilities must work through ordinary HTTP alone from `curl`, PowerShell `Invoke-RestMethod`, browser `fetch()`, or any ordinary HTTP client. Future SDKs are convenience wrappers only.

## 4. Current HTTP surface and hosted-public decision

The audit reconciled code, OpenAPI, JSON Schemas, and tests:

| Method | Route | Public? | Expensive? | Cacheable? | Anonymous? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/v1/now` | yes | variable | no shared cache by default | yes | time-dependent |
| GET/POST | `/v1/date` | yes | variable | conditional; currently no-store | yes | simple or structured query |
| POST | `/v1/batch` | yes | yes/amplified | conditional; currently no-store | yes | many independent queries |
| POST | `/v1/range` | yes | yes/amplified | conditional; currently no-store | yes | JSON/NDJSON/CSV response |
| GET | `/v1/year/{year}` | yes | yes | conditional; currently no-store | yes | `include=days` can be large |
| POST | `/v1/reverse` | yes | yes | conditional; currently no-store | yes | complete canonical tuple |
| GET | `/v1/calculation-day` | yes | bounded/variable | conditional; currently no-store | yes | time-dependent if `at` omitted |
| GET | `/v1/locales` | yes | no | yes | yes | locale discovery |
| GET | `/v1/meta` | yes | no | yes | yes | capabilities and release identity |
| GET | `/v1/status` | yes | must be cheap | no | yes | public high-level readiness only |
| GET | `/openapi.json` | yes | no | yes | yes | OpenAPI 3.1 |
| GET | `/openapi.yaml` | yes | no | yes | yes | OpenAPI 3.1 |
| GET | `/schemas/*.schema.json` | yes | no | yes | yes | referenced JSON Schemas |

The repository web application and browser client may share a deployment, but `/`, `/web/*`, and `/client/*` are not part of this Hosted Public API contract. No admin/control-plane operation belongs under public `/v1`.

## 5. Authentication and anonymous-use policy

Core v1 access is anonymous by default. A basic date query must not require an API key, account, cookie, or login.

Future authentication may be added for higher quotas, trusted services, or other policy tiers. It must not change calendar semantics or canonical output for the same semantic request, and it must not become required for ordinary public v1 without an explicit service-policy migration.

There is no user-account state in v1. Request IDs are not credentials.

Anonymous does not mean unlimited. Numerical quotas, concurrency limits, public body limits, and per-class weights are intentionally TBD until measured on production-like infrastructure.

## 6. Resource classes

Rate limiting and capacity planning must use measured cost rather than a flat "one request = one unit" rule.

- **Static metadata:** locales, meta, OpenAPI, schemas.
- **Readiness:** public status; bounded and cheap by hosted contract.
- **Interactive query:** now, date, calculation-day; may be cache hit or exact-runtime work.
- **Exact structural:** reverse and year; native exact capabilities, potentially materially more expensive.
- **Aggregate:** batch and range; cost grows with item count and may amplify exact work.

Current core defaults are implementation ceilings, not hosted-public promises: the query layer allows up to 10,000 batch items and 10,000 range items, and the HTTP adapter defaults to a 1 MiB request body. The hosted service may be stricter.

Workstream 2/rate-limiting must set limits from measured CPU time, latency distributions, memory, response size, concurrency behavior, cold/warm behavior, and abuse potential.

## 7. Versioning and compatibility

The URL path `/v1` versions the HTTP/wire contract, not the mathematical truth of the calendar.

Changes normally allowed within v1, when documented and released, include:

- adding a new route;
- adding a locale without changing canonical fields;
- expanding the exact supported domain while preserving every previously supported answer;
- extending intentionally extensible metadata such as `/v1/meta`;
- adding provenance detail where the schema already permits it;
- adding a new typed error code for a genuinely new condition without repurposing an old code;
- adding an opt-in capability that leaves existing defaults unchanged;
- changing caching, engine layout, worker topology, CPU architecture, hosting provider, or implementation without changing semantic/wire results.

Most response schemas are closed with `additionalProperties: false`. Therefore adding an "optional" field to one of those objects is **not** automatically backward-compatible: it would invalidate strict clients. A closed response shape must not grow silently inside v1.

Changes that normally require a new path version such as `/v2` include changing an existing field's meaning/type, adding fields to closed response shapes, adding a new required input, removing/renaming routes or content types, changing exact-integer representation, changing BCE/CE representation, changing canonical index meaning, or incompatibly changing calculation-day defaults, default observer, default locale, deterministic validation, or status mapping.

A canonical-correction exception is necessary: if Seer is proven wrong relative to the normative calendar, v1 is not required to preserve the wrong answer. A correction must be tied to a new immutable release, documented as a canonical correction, covered by semantic regression tests, publicly identifiable through runtime metadata, and never deployed as an unidentifiable silent rewrite.

Service-policy changes such as requiring authentication, breaking existing browser CORS, moving the canonical hostname, or introducing a formal SLA are not made harmless merely by naming the calendar path `/v2`; they require an explicit service-policy migration.

## 8. Production release and runtime identity

Production must never mean "whatever is latest on main". Every production deployment is pinned to one immutable verified artifact identity. Startup from `git pull main` is forbidden.

For launch, `GET /v1/meta` must let a caller answer: **Which Seer release is production currently running?** The hosted extension must expose at least:

- `apiVersion`;
- `packageVersion`;
- `releaseTag`;
- `commit`;
- `engineFingerprint`;
- `supportedFeatures`.

These values are public-safe. They must not contain filesystem paths, process IDs, provider instance IDs, private hostnames, secrets, or raw configuration.

In production, package version, release tag, commit, and immutable runtime artifact must identify the same selected release. The engine fingerprint must identify the exact semantic engine/data closure used by that deployment.

`/v1/meta` now exposes this identity additively within v1. `packageVersion` comes from the installed/source package manifest. Released npm/package artifacts carry an injected immutable `release-identity.json`; released containers inject the same version/tag/commit tuple at image build and require it at startup. A source checkout may resolve its full Git commit and the matching exact `v<packageVersion>` tag without exposing repository paths.

`engineFingerprint` is the SHA-256 identity of the exact native Seer engine inputs and gate data used by the cache-compatibility contract. `supportedFeatures` is an allow-listed public capability set. `artifactMode` distinguishes source, package, and container execution.

The rolling cache remains a separate mutable performance artifact. When a compatible mounted cache index is present, `cacheRevision` is the SHA-256 identity of that index; otherwise it is `null`. It is never substituted for `commit` or `engineFingerprint`, and cache producer metadata is not exposed through this endpoint. Production identity projection is allow-listed and never includes filesystem paths, process IDs, hostnames, secrets, or raw environment/configuration.

## 9. Public exact domain

At the audited release line the exact domain is finite:

```text
minimumJdnExclusive = -63473948
maximumJdnInclusive =  36828783
```

This is an implementation horizon, not a normative calendar limit. Gate indices themselves are not a public calendar contract.

Clients may rely on the supported range disclosed by `/v1/meta`, typed out-of-domain behavior, and preservation of prior supported answers when the horizon expands. The hosted layer must not convert a domain error into an infrastructure failure. No HTTP request may trigger gate generation.

## 10. Calculation-day, clock, observer, and locale semantics

Calculation day and target day remain independent. When no explicit calculation selector is supplied, the service resolves the active calculation day from the request instant and observer rules already defined by Seer.

A production request captures the current instant **exactly once** and reuses it for every implicit-time decision in that logical request. The hosted layer must not substitute a civil UTC/local calendar date for this calculation: it delegates to the existing Seer day-boundary semantics. Batch likewise uses one captured instant. The current HTTP/query implementation already has this property; gateways and retries must preserve it.

A transparent retry can cross a calculation-day boundary. Time-dependent requests therefore must not be blindly replayed as a new application request unless the logical request instant is pinned or the caller supplied an explicit calculation selector.

Production system time must be synchronized by a reliable platform time source. Internal handling is UTC/absolute-instant based; server local timezone must not change results. Material clock drift is an operational incident.

The default observer remains `kisurra`. It must never be changed from caller IP, CDN POP, hosting region, browser locale, inferred timezone, or GeoIP. Latitude/elevation remain documented compatibility no-ops unless a future API version changes that contract.

Localization is presentation-only. At the audit point `en` and `he` are supported, with `en` default. `GET /v1/locales` is the discovery source.

HTTP v1 uses explicit locale only. `Accept-Language` is not negotiated. No gateway/CDN may infer locale from geography. `presentation=canonical` remains language-independent.

## 11. Content types, exact integers, and Gregorian representation

Official POST request media type is `application/json`.

Official response media types are:

- `application/json` for core operations;
- `application/x-ndjson` for `POST /v1/range`;
- `text/csv` for `POST /v1/range`;
- the existing JSON/YAML media types for OpenAPI assets.

NDJSON and CSV are deliberate public formats because they are implemented and tested through HTTP negotiation. Unsupported request media types return typed `415`; unacceptable response negotiation returns typed `406`.

Exact integer policy is unchanged: safe-range JSON integers may be numbers where allowed, while arbitrary exact values use canonical decimal strings and unbounded response values remain decimal strings. Proxies, analytics, caches, and gateways must not coerce them through floating-point parsing.

BCE/arbitrarily large Gregorian dates use the existing structured proleptic Gregorian representation. The hosted layer must not pass arbitrary years through JavaScript `Date`, provider date parsers, SQL date types, or equivalent bounded civil-date types.

## 12. CORS and direct browser use

Direct browser `fetch()` is a first-class public use case.

The current anonymous surface is read/query-only, has no cookies, and accepts no credentials. For that surface wildcard anonymous CORS is acceptable, subject to these constraints:

- `Access-Control-Allow-Credentials` must not be enabled with wildcard origin;
- allowed methods remain the public query methods plus `OPTIONS`;
- allowed request headers stay explicitly bounded;
- production must expose `X-Request-ID` and `Retry-After` to browser callers when present;
- future authenticated/credentialed routes require a separate origin/credential review.

CORS is not authorization.

## 13. Request IDs

Every production request receives a server-generated opaque correlation ID.

Requirements:

- response header `X-Request-ID`;
- structured logs and downstream correlation where practical;
- safe for public disclosure;
- independent of IP address, dates, account identity, or request payload;
- never an authentication token or secret.

The concrete ID format is an implementation detail if collision resistance is operationally adequate.

## 14. Error model

The hosted service preserves typed Seer errors. For example, `TARGET_OUT_OF_SUPPORTED_DOMAIN` must not become a generic internal error.

The public envelope remains `{"error":{"code":"...","message":"...","field":"optional","details":{}}}`.

**Semantic/request errors** mean the request reached the Seer contract and is malformed, ambiguous, unsupported, or outside semantic support.

**Policy/resource errors** mean an otherwise meaningful operation is refused/stopped by public-service policy. Hosted codes should distinguish at least `REQUEST_TOO_LARGE` (413), `RATE_LIMITED` (429), `REQUEST_TIMEOUT` (504), `SERVICE_OVERLOADED` (503), and `MAINTENANCE` (503). Exact final names may be refined before launch without collapsing these categories.

**Infrastructure/internal failures** use a hosted infrastructure code where possible. Unexpected application bugs are `500 INTERNAL_ERROR` with a public-safe message. Raw exceptions and stack traces never appear in the client response.

`SEER_UNAVAILABLE` remains the Seer/runtime condition already defined by the query layer; it must not become a catch-all for gateway/provider failures.

## 15. HTTP status policy

| Status | Public meaning |
| ---: | --- |
| 200 | success |
| 204 | successful CORS preflight where applicable |
| 400 | malformed, ambiguous, unknown, or mode/request-shape error |
| 404 | unknown public route/resource |
| 405 | method not allowed |
| 406 | unacceptable response representation or supported-locale negotiation failure |
| 413 | body or single-operation expansion exceeds configured limit |
| 415 | unsupported request media type |
| 422 | syntactically valid but semantically invalid/out-of-domain input |
| 429 | rate/concurrency quota refusal |
| 500 | unexpected application defect |
| 503 | unavailable, overloaded, or maintenance |
| 504 | hosted processing/gateway deadline exceeded |

Existing operation-specific mappings remain authoritative where more precise. Changing the mapping of an existing deterministic error is compatibility-sensitive.

Gateway-generated errors should use the same JSON error envelope whenever the gateway permits it.

## 16. Idempotency and retry semantics

All current operations are read-only with respect to server state. POST is used for structured bodies, not mutation.

That does not make every request deterministic across retries: omitted calculation selectors depend on the captured current time.

Client guidance:

- 400/404/405/406/413/415/422: do not automatically retry unchanged;
- 429: obey `Retry-After` or documented backoff;
- transient 503/504: only bounded retry with backoff;
- expensive POSTs must never be retried indefinitely;
- callers requiring reproducibility should supply an explicit calculation selector.

Infrastructure retry budgets must be small and must preserve logical request-time semantics.

## 17. Timeout semantics

Keep four concepts distinct: caller timeout, gateway timeout, application processing deadline, and public resource-policy maximum.

The application deadline should normally expire before the outer gateway deadline so a typed JSON `504 REQUEST_TIMEOUT` can be returned instead of an opaque provider response.

The exact native fallback currently has a 120-second implementation default. This is **not** a public latency promise or a chosen hosted deadline.

Hosted deadline values are TBD after platform benchmarks. When a caller disconnects or a deadline expires, downstream/native work should be cancelled where the runtime permits it so orphan computations do not continue unnecessarily.

## 18. Reliability and latency model

Initial service class: **best-effort public service**. There is no contractual SLA at launch unless a later explicit document creates one.

Engineering requirements still include monitoring, automatic process/container restart, readiness/liveness handling, alertable failure and latency signals, staging verification, and an immutable rollback target.

A numerical engineering availability target is **TBD** for the hosting/capacity workstream. It must be labeled an engineering objective, not a legal SLA.

No universal millisecond latency guarantee is established here. Capacity planning must measure at least:

- static metadata;
- cached/simple interactive date;
- exact cache-miss date;
- reverse;
- year without and with `include=days`;
- representative and maximum-permitted ranges and batches;
- warm and cold replicas;
- amd64 and ARM64 if both remain hosting candidates.

The public experience should distinguish interactive from aggregate requests. All v1 work remains finite synchronous request/response work; this contract creates no asynchronous job API.

## 19. Status, liveness, and readiness

These are different concepts.

Public `GET /v1/status` is anonymous and exposes only high-level state conforming to the status schema: `ok`, `degraded`, or `unavailable` as implemented. It must not expose paths, PIDs, worker IDs, memory size, internal hostnames, provider instance IDs, stack traces, secrets, or queue internals.

Infrastructure **liveness** is provider-private and answers whether the process/container should be restarted. It must not execute an exact calendar query.

Infrastructure **readiness** is provider-private and answers whether a replica can accept real work, including required engine availability. It must be bounded and cheap.

The repository now implements that separation. Docker health uses provider-private `GET /_health/live`; it checks only that the HTTP process can answer and never touches the calendar engine or rolling cache. Provider-private `GET /_health/ready` and public `GET /v1/status` use the same bounded health snapshot, with a short application deadline. The exact-runtime check is non-semantic: when the persistent engine service is required it sends only the cheap `S` protocol command; otherwise it verifies the one-shot runtime and required gate files without executing a conversion. Rolling-cache state is checked independently with bounded reads. Because the cache is optional by contract, an absent unconfigured cache does not degrade an exact-only replica. A stale or corrupt cache, or an explicitly configured cache location that is absent, yields `degraded` while a usable exact runtime remains available; an unavailable or nonresponsive required exact runtime yields `unavailable`. Only the coarse `status` value is returned; engine responses, paths, PIDs, queue state, and other internals are never exposed.

## 20. Cache and compression contract

Caching is an optimization and never alters semantics. Current behavior is conservative: query responses/status are `no-store`; locales/meta/OpenAPI/schemas use short public caching.

Hosted caching may evolve only if:

- `/v1/now` and implicit-time requests are not given long shared caching;
- cache keys include every value capable of changing output;
- calculation semantics, observer, target, locale, presentation, include set, response media type, API contract revision, and engine/release identity cannot collide;
- batch order/IDs and range parameters are part of response identity;
- authenticated identity does not change the semantic cache key merely because a key exists;
- cached semantic content from a previous engine/release is not reused after a semantic change without explicit proof;
- cache state remains optimization data, not authoritative user state.

Static contract assets may use stronger caching only when a release-specific URL or validator makes that safe. Unversioned `/openapi.*`, `/schemas/*`, `/v1/locales`, and `/v1/meta` must not be treated as immutable across deployments.

Normal HTTP compression such as gzip or Brotli is allowed. After decompression, payload semantics and bytes must be those of the negotiated representation, and caches must vary correctly on content encoding.

## 21. Privacy baseline

Collect the minimum operational data needed to run the service safely.

Default structured application logs may contain timestamp, route template, method, HTTP status, latency, request ID, coarse resource class, deployment/release identity, and coarse outcome/error code.

By default application logs must **not** persist full request bodies, exact queried dates merely because a user requested them, arbitrary request JSON, custom observer longitude merely because supplied, cookies, authorization headers, API keys, or secrets.

Edge infrastructure may necessarily see source addresses for routing/abuse/security. The application should not persist full IP addresses by default. If abuse prevention needs a network identifier, prefer the minimum useful form such as truncation or short-lived pseudonymization, subject to the later security/privacy design.

Exact retention duration is **TBD**. The criterion is the shortest period justified by reliability/security needs and documented before launch. "Keep forever because storage is cheap" is not an acceptable policy.

Anonymous v1 does not set a user-tracking cookie as part of this contract.

## 22. Logging and observability

Logs are structured, with request ID as the primary cross-layer correlation key.

Internal logs may retain stack traces for unexpected failures under the retention policy. Public responses never contain raw stack traces or exception objects.

Metrics should aggregate counts, latency, resource class, cache behavior, saturation, and typed failure categories without requiring storage of exact user queries.

An observability vendor is a later implementation choice. Any outbound telemetry exception must be explicit and must not silently export request payloads.

## 23. Security boundary and outbound network

Every public request is untrusted input.

Baseline constraints:

- no shell interpolation from request data;
- no arbitrary file lookup from request data;
- no user-controlled native-binary or module path;
- no locale-to-filesystem path construction;
- no provider metadata endpoint exposed through the app;
- no raw exception leakage;
- bounded headers, query strings, and bodies at the edge;
- no numeric transformation that mutates exact-integer strings.

A detailed threat model, WAF design, abuse controls, dependency policy, and penetration testing belong to later workstreams; they may not weaken these constraints.

A normal Seer query does not require Internet access. Preferred production policy is no unrestricted outbound Internet from the query tier. Required exceptions for platform DNS, monitoring, or telemetry must be explicit and minimal. Runtime correctness must never depend on downloading code, locale packs, gate data, schemas, or calendar authority material on demand.

## 24. Statelessness and horizontal scaling

Public queries do not create durable user state.

Allowed replica-local state includes immutable runtime assets, loaded native engine data, warm calculation-day/year-chain state, rolling/generated performance caches, safe semantic response caches, and operational metric buffers.

Such state is an optimization. Correctness must not require sticky sessions or route a caller back to one replica.

The service must support more than one replica. The design must not assume one global process forever.

The current persistent native engine serializes requests inside one service process and maintains local calculation-day context. Capacity planning may therefore scale using replicas/processes/workers instead of introducing global mutable calendar state.

A future shared cache remains optional for correctness and must obey semantic cache keys.

## 25. Deployment immutability and environments

Production runs from an immutable verified artifact:

- preferably an OCI image by immutable digest when container hosting is selected; or
- another immutable release artifact with equivalent identity if workstream 2 selects a non-container host.

Forbidden production pattern: `git pull main on boot`.

Every rollout must identify artifact, commit, release, and engine fingerprint, and have an explicit rollback artifact.

The repository verifies `linux/amd64` and `linux/arm64` containers. Architecture choice is a capacity/cost decision, not a semantic fork.

At minimum there are separate **staging** and **production** environments. Staging must be close enough to production to verify the real runtime, gateway behavior, CORS, deadlines, compression, caching, health checks, release identity, and rate limits.

## 26. Feature flags and maintenance

A general feature-flag platform is unnecessary at this stage. Experimental or unverified capabilities are not advertised as production-supported. A hidden flag must not change calendar semantics for identical public input.

Planned maintenance should fail clearly rather than by random connection reset. Preferred behavior is HTTP 503 with typed `MAINTENANCE`, preserved request ID, and `Retry-After` when a useful estimate exists.

## 27. OpenAPI and schema authority

`/openapi.json` and `/openapi.yaml` remain public machine contracts.

Requirements:

- JSON and YAML representations must be semantically identical;
- every public API route must be represented;
- every documented JSON response must use an appropriate schema;
- transport errors already generated by the HTTP adapter must be documented;
- hosted gateway errors (429/504/overload/maintenance) must be added before launch when their final codes are implemented;
- referenced JSON Schemas remain public under `/schemas/`;
- schemas are immutable within a release;
- a schema change requires a code release and documentation update;
- production must never hot-edit a schema independently of running code.

The OpenAPI contract version is independent of npm package version. An implementation release may remain HTTP v1-compatible.

## 28. No public admin API

Public `/v1` must not acquire cache-purge, engine-reload, worker-inspection, process-control, secret-rotation, provider-diagnostic, or deployment-mutation operations.

Operational controls belong to provider control planes, private/loopback tooling, or a separately secured administrative plane.

## 29. Direct use and GET/POST policy

Public documentation must eventually contain copy-paste examples for at least `curl`, PowerShell `Invoke-RestMethod`, and browser `fetch()`.

GET is appropriate for simple, safe, idempotent, URL-sized requests. Complex structured requests remain POST. Large JSON input must not be pushed into query strings merely to make it GET.

SDKs are optional conveniences and may not become prerequisites for any core v1 capability.

## 30. Public project notice

Public docs should state concisely:

- best-effort service status unless a formal SLA is later published;
- API version policy;
- source repository;
- issue-reporting path;
- security-reporting path once established by the security workstream.

Source repository: `https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer`.

The repository issue tracker is the ordinary issue path. A dedicated private security-reporting path is not established by this document and is a launch TODO. Do not invent a legal privacy/security policy merely to fill that field.

## 31. Launch gates

The Hosted Public API is not launch-ready until all of the following are true:

1. final independent/adversarial QA is complete on the release candidate;
2. a stable immutable release has been selected for production;
3. package/tag/commit/GitHub Release and selected runtime artifact identity are mutually consistent;
4. the staged production artifact passes exact-runtime smoke on the architecture actually used;
5. `/v1/meta` exposes safe production release identity;
6. production request IDs are implemented end-to-end;
7. anonymous rate, concurrency, body, batch, and range limits are measured and documented;
8. application and gateway deadlines are measured and documented;
9. public status is separated from or proven suitable for provider health probing;
10. CORS, compression, and cache behavior are verified through real browser and HTTP clients;
11. structured logging and retention defaults satisfy the privacy baseline;
12. staging and production are separate;
13. gateway-generated public errors use the defined safe shape where feasible;
14. production runs from an immutable artifact, never a moving branch.

A green workflow, published package, or container tag alone is insufficient evidence for launch.

## 32. Decisions intentionally deferred

The following are deliberately TBD rather than invented:

- final production and staging domains;
- hosting provider and regions;
- amd64/ARM64 production mix;
- replica/worker counts and autoscaling;
- anonymous rate/concurrency quotas;
- public batch/range limits if stricter than core defaults;
- public request-body limit;
- interactive and aggregate deadlines;
- engineering availability objective;
- network-metadata/log retention duration;
- DDoS/WAF provider and rules;
- observability vendor;
- cache provider/topology;
- provider-private liveness/readiness mechanism;
- TLS/DNS provider;
- outbound telemetry exceptions;
- paid/high-volume plan design, if ever needed.

Each numerical limit must come from measured production-like evidence, not round numbers chosen for appearance.

## 33. Fixed inputs for workstream 2

Hosting/cost/capacity selection must treat these as fixed:

- anonymous public core v1;
- direct browser and shell access;
- synchronous finite request/response model;
- no durable user-session state;
- horizontal-replica compatibility;
- immutable deployment artifact;
- exact-native runtime for the full service;
- verified `linux/amd64` and `linux/arm64` container options;
- replica-local persistent-engine warm state;
- finite exact domain disclosed through metadata;
- separate static, readiness, interactive, exact-structural, and aggregate resource classes;
- typed rate/deadline/overload behavior;
- staging/production separation;
- no runtime Internet dependency for calendar correctness;
- no formal contractual SLA yet.

Workstream 2 must return measured cost/capacity evidence sufficient to fill the TBD quota, deadline, concurrency, architecture, and engineering-availability choices without altering calendar semantics.

## 34. Change control

Downstream workstreams must not silently override this authority.

Every material future change should identify whether it is:

- calendar-semantic;
- HTTP wire-contract;
- hosted service-policy;
- operational implementation only.

If a hosting choice cannot satisfy a MUST in this document, resolve the conflict explicitly here before production deployment.

## 35. Contract summary

```text
PUBLIC API CONTRACT: existing Seer HTTP v1, exposed as anonymous HTTPS; no new calendar implementation
HOSTNAME MODEL: canonical project hostname + separate staging hostname; provider URLs non-contractual; exact names TBD
AUTH MODEL: anonymous core v1; future keys only for higher/trusted tiers
VERSIONING: stable /v1 wire contract; breaking closed-schema/semantic wire changes normally require /v2
PUBLIC ROUTES: now, date, batch, range, year, reverse, calculation-day, locales, meta, status, OpenAPI, schemas
RESOURCE CLASSES: static metadata, readiness, interactive, exact structural, aggregate
PRIVACY BASELINE: structured minimal operational metadata; no full payload/query logging by default; retention TBD
RELIABILITY MODEL: best-effort public service; monitored/restartable; no contractual SLA; engineering target TBD
DEPLOYMENT MODEL: immutable verified artifact, staging before production, horizontally scalable, stateless user requests
OPEN QUESTIONS FOR WORKSTREAM 2: host/provider/regions/architecture/capacity/quotas/deadlines/availability/retention/cache/health/TLS-DNS
```
