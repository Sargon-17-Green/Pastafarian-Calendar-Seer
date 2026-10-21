# Roadmap

This roadmap lists **remaining work only**. Completed implementation stages, dated QA evidence, and superseded benchmark narratives are preserved under `docs/history/`.

## Established baseline

The repository already has:

- a shared Node query API and CLI;
- HTTP v1 and browser/remote client surfaces;
- reverse conversion;
- exact native fallback and a persistent exact engine service;
- finite bidirectional gate-domain support with the production ±100k corpus;
- a production no-build web application;
- verified Linux amd64/ARM64 container deployment;
- release-candidate orchestration and supply-chain verification;
- a public product benchmark suite covering cold/warm, cache/exact, reverse, year, batch/range, HTTP, and concurrency cases.

These are current capabilities, not future roadmap items.

## Remaining work

1. **Hosted public-service launch gates**
   - choose and configure the production/staging hosting path and canonical DNS;
   - satisfy the identity, operations, privacy, reliability, and abuse-control gates in `docs/PUBLIC_API_ARCHITECTURE.md`;
   - publish only an internally consistent release identity.

2. **Performance and capacity**
   - use `bench/product/` measurements to investigate demonstrated hotspots and regressions;
   - preserve exact semantics and typed overload behavior while improving throughput;
   - do not promote research optimizations without independent differential evidence.

3. **Platform support**
   - keep Node 20/22/24 compatibility green;
   - extend native-platform support only with real build, package, and semantic verification;
   - do not imply Windows ARM64 or macOS exact-runtime support until verified.

4. **Presentation and localization**
   - add locale packs only with documented naming/translation authority;
   - keep localization presentation-only and semantically invariant.

5. **Research promotion discipline**
   - keep experimental/high-similarity variants under `research/`;
   - retain historical evidence under `docs/history/`;
   - require explicit adoption evidence before any research path enters the production runtime closure.

A faster answer is useful only if it remains the same answer.
