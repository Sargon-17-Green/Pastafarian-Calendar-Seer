# Mobile contiguous-range optimization across canonical year boundaries

Status: **experimental, unverified, do not merge**.

This extension is stacked on `experiment/seer-mobile-contiguous-batch-20261113`, which implements a single-year fast path and a deterministic 25-case reference comparison.

## Algorithm

For a strictly ascending contiguous array of target JDNs and a valid fixed calculation JDN:

1. Resolve the canonical year of the first target with `target_year`.
2. Repeatedly process `[cursor, min(last, year.b)]` using the existing exact `compute_segment` implementation.
3. Advance to the next exact year with `fadj(calculation_jdn, gates, stones, year, true)` only when required.
4. Validate segment lengths, the number and order of returned targets, and cancellation before exposing any output record.
5. Preserve the original per-target path for sparse, reverse-ordered, duplicate or invalid input; if an eligible fast path cannot complete, preserve existing per-target error semantics.

The algorithm has no cross-request cache, new native threads, network dependency or change to ABI v1. It is a pure request-scoped optimization. At most 4,096 target entries are admitted by the existing C ABI.

## Correctness contract

- Year boundary witnesses: the year-5000 first day is JDN 2458961 and last day is 2463007, for calculation JDN 2461290; assert direct single-record parity for short ranges spanning both boundaries.
- Run existing C ABI tests, cancellation and queue invariants under AddressSanitizer and UndefinedBehaviorSanitizer.
- Run `check_mobile_extended_parity.py`, including cross-year ranges, negative-era cases, seeded varied contiguous intervals and a 42-day month view, comparing every numeric record field with the separate public `seer_engine_service` range path.
- Retain fixed canonical known-answer vectors; the comparison service shares core algorithms and is **not** a truly independent implementation.
- Inputs crossing outside the loaded Gate corpus must still fail with the same status as the original implementation.

## Performance contract

No new performance claim is authorized until paired A/B tests using the *same Android ARM64 device*, the same canonical gate hashes, fixed CPU/backend configuration, and preferably balanced/randomized run order. Test 42-day ranges *within* a year and *across* its boundary. Measure cold/warm path, latency distribution (at least 30 runs), thermal throttling, peak RSS, and cancellation latency. Confirm no material regression for single calls.

The earlier within-year optimized experiment reduced a single 42-day sample from 25,275.3ms to 603.8ms on a Xiaomi 2407FPN8EG; that is not evidence of this new cross-year path. The distinct experimental branch and PR must remain isolated until its own verification finishes.

## Release gate

A versioned native release, exact source provenance, Android AAR packaging, Kotlin client parity, and physical device validation are required before the app updates its pinned Seer source SHA. Do not modify the canonical calendar or publish a new Kotlin SDK based on unverified results.
