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

4. **Add a portable backend**
   - preserve the AVX-512IFMA backend;
   - add a correct scalar/portable implementation for machines without IFMA;
   - verify backend parity before comparing performance.

5. **Automate conformance**
   - differential tests against an independent exact reference;
   - fixed witnesses plus randomized/adversarial cases;
   - no semantic dependency from the reference back into the Seer.

6. **Add presentation and service layers only after the core contract stabilizes**
   - localization by canonical index;
   - CLI suitable for ordinary users;
   - optional HTTP API;
   - website/application integration.

A faster answer is useful only if it remains the same answer.
