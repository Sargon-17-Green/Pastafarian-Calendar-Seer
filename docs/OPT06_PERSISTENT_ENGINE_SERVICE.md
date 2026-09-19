# OPT-06 — persistent exact engine service

OPT-06 moves the exact native backend from “one process per exact query” to a reusable line-oriented service while preserving the existing public query, CLI, HTTP, JSON, naming, error and provenance contracts.

## Native lifetime

`seer_engine_service` loads `FGates` and `fast_stones()` once. It keeps an LRU of calculation-day contexts keyed by the exact `c`. Each context owns a contiguous `YearChain` anchored canonically at year 5000. A target/year outside the covered interval extends only from the nearest covered edge:

- earlier years: repeated canonical `PREVIOUS` (`fadj(..., false)`) from the front;
- later years: repeated canonical `NEXT` (`fadj(..., true)`) from the back.

The implementation never assumes NEXT and PREVIOUS are inverses, and it never shares a year chain between different calculation days.

The default native LRU holds 8 calculation days (`SEER_SERVICE_MAX_CALCS` can change this for tests/deployment). Eviction discards only the derived year-chain cache; exact constant data remains process-local and immutable.

## Protocol

The service reads tab-delimited commands on stdin and emits one JSON line per command:

- `R <calcJdn> <targetStartJdn> <count>` — exact contiguous records, with the same payload shape and engine revision as `seer_year_batch`;
- `Y <calcJdn> <year> <includeDays>` — exact year structure, with the same payload shape and engine revision as `seer_year_structure`;
- `S` — internal diagnostics for tests/benchmarks only.

Requests are processed serially inside the service. That serialization is the synchronization boundary for concurrent callers that would otherwise try to extend the same year chain.

## JavaScript integration

`query/exact-engine.mjs` prefers `seer_engine_service` when present and falls back to the pre-OPT-06 process binaries if the service is unavailable. A module-level service registry is keyed by SHA-256 of:

1. the service binary;
2. `gates_100k_u16.bin`;
3. `gates_negative_100k_u16.bin`.

The registry is bounded (default 4 identities). Multiple request-scoped providers therefore reuse the same native service only when engine/data identity is exactly the same. Registry insertion/eviction is synchronous after identity resolution, so concurrent callers cannot create an untracked extra service for one identity.

### Per-request deadlines and recovery

`timeoutMs` applies to each persistent-service request as well as to the one-shot fallback binaries. The deadline starts when the request is queued for the persistent child.

The wire protocol is FIFO and intentionally has no request IDs. Therefore a timeout cannot safely be handled by dropping only one waiter: a later response from the same child could otherwise be mistaken for the next request. Any timeout, malformed JSON/non-object response, unsolicited response, stream I/O failure, or child exit marks that entire child generation unusable. The JavaScript client then rejects and clears every queued/in-flight waiter for that child, removes it from the registry, closes its pipes and kills the process. A later request creates a fresh child; bytes arriving from the retired child are never eligible to satisfy a new request.

With `SEER_REQUIRE_ENGINE_SERVICE=1`, a persistent-service timeout is surfaced as `SeerQueryError` with code `SEER_UNAVAILABLE` and `details.serviceFailure === "timeout"`. With fallback allowed, the failed service attempt is discarded and the existing one-shot exact path is tried instead.

The persistent transport is resource-bounded: an unterminated stdout line is capped at 32 MiB, stderr keeps only the last 8192 characters, and writes stop when `stdin.write()` reports backpressure until the corresponding `drain` event. Timers are cleared when waiters settle or when a child is retired.

The request queue itself is bounded as well. `SEER_SERVICE_QUEUE_MAX` defaults to 64 pending wire requests. If that queue is full, the request fails as `SEER_UNAVAILABLE` with `details.serviceFailure === "overloaded"`; overload is never converted into a one-shot child-process fallback.

A separate process-wide exact admission gate protects both persistent and one-shot execution. `SEER_EXACT_CONCURRENCY` defaults to 8 and `SEER_EXACT_QUEUE_MAX` defaults to 256. The precomputed provider also schedules independent calculation-day groups with that concurrency default while retaining target deduplication and contiguous-run coalescing. This prevents batch/range fan-out from turning the public 10,000-item logical limit into 10,000 simultaneous native jobs.

`SEER_REQUIRE_ENGINE_SERVICE=1` is test/deployment-only and disables fallback. `SEER_TEST_SERVICE_SPAWN_COUNTER_FILE` and `SEER_TEST_CHAIN_COUNTER_FILE` are test-only diagnostics.

## Preserved optimizations

The service embeds the existing OPT-03 year-structure path and therefore also retains:

- OPT-04 shared immutable month-count table;
- OPT-05 direct first/last-day shortcut;
- the existing v12/RNS/weaving implementation for all cases that still require weaving.

No calendar rule is duplicated or replaced by a service-specific rule.
