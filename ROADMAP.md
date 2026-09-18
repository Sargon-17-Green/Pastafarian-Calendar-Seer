# Roadmap

The current repository begins with a performance prototype. The next steps should improve
usability and reproducibility **without importing spaghetti doctrine into the Seer**.

1. **Freeze and reproduce the current benchmark baseline**
   - retain fixed benchmark vectors and hashes;
   - add repeatable conformance fixtures;
   - pin provenance for generated gate data.

2. **Complete the calendar domain needed by production callers**
   - package negative-gate support;
   - verify far-past/far-future walking across the full supported domain;
   - harden difficult weave-edge ranks.

3. **Separate engine from benchmark CLI**
   - extract a stable library-facing conversion function;
   - keep benchmark instrumentation outside the semantic core;
   - return canonical numeric indices, not localized strings, from the core.

4. **Portable backend ג€” initial implementation present**
   - preserve the AVX-512IFMA backend unchanged;
   - maintain the scalar/portable RNS implementation for machines without IFMA;
   - run exact self-tests and bundled vector checks on GitHub-hosted runners;
   - use hosted measurements to decide whether a dedicated AVX2 layer is worthwhile.

5. **Automate conformance**
   - differential tests against an independent exact reference;
   - fixed witnesses plus randomized/adversarial cases;
   - no semantic dependency from the reference back into the Seer.

6. **Presentation and service layers — v1 implemented**
   - shared query API and CLI;
   - dependency-free HTTP v1 service;
   - installable Node package and persistent-service deployment path (API Stage 6);
   - reverse conversion for a complete canonical Pastafarian tuple;
   - browser/website integration foundation: dependency-free fetch client, CORS-capable HTTP API, and a no-build runnable browser example;
   - reproducible x86-64 Linux container deployment with generic portable exact runtime and persistent-service smoke;
   - remaining product work: additional locales and site-specific production UI integration.

A faster answer is useful only if it remains the same answer.
