# Seer Kotlin SDK — experimental pure ABI wire contract

**Status: draft, not a released SDK.** This directory is the first portability layer toward the requested official Kotlin SDK. It deliberately contains **no alternative calendar algorithm** and is independent of Android, JNI and platform storage.

## Scope

\`SeerMobileWire.kt\` defines the complete native status enumeration and ABI-1 data types. It decodes:
- one native result: \`[status, record(8 longs)]\`;
- an ordered batch: \`[status, N × record(8 longs)]\`, for 1..4096 targets;
- native JNI provenance: \`[abiVersion, packageVersion, sourceCommit, backend]\`.

A failure status is represented by a **single long** and throws \`SeerNativeException\`, preserving the exact numeric status. Malformed successful results, unknown statuses, an incorrectly-sized response, a mismatch between returned JDN and requested JDN, an overflowing 32-bit field, or incorrect ABI provenance throw \`SeerProtocolException\` rather than silently corrupting a date.

**Indexes are passed through unchanged.** This module makes no undocumented assumption about whether a Native ordinal or index starts at zero or one; it preserves Seer's exact eight field values.

## Reproducible standalone host verification

On Linux/macOS/Windows with \`kotlinc\`, \`java\` and a JDK available, from the repository root:

\`\`\`bash
kotlinc \
  sdk/kotlin/src/main/kotlin/org/pastafarian/seer/kotlin/SeerMobileWire.kt \
  sdk/kotlin/src/test/kotlin/org/pastafarian/seer/kotlin/SeerMobileWireSmoke.kt \
  -include-runtime -d seer-kotlin-wire-tests.jar
java -jar seer-kotlin-wire-tests.jar
\`\`\`

The test must emit \`SEER_KOTLIN_WIRE_PURE_PASS\`; cases cover negative JDNs, year-5000 edges, wrong targets, malformed lengths, status and provenance mismatch, 32-bit range, and explicit error handling. The public repository workflow \`verify-seer-kotlin-wire.yml\` independently cross-checks the ABI constants in \`prototype/include/seer_mobile.h\` and runs the same Kotlin/JVM smoke on an ephemeral Ubuntu 24.04 runner.

## Outstanding work, release gates

1. Expose a stable **Native backend interface** for query, batch, cancellation, context and provenance ownership; thin Android JNI and desktop bindings should implement it.
2. Ensure all public API methods are typed and versioned, with an explicit compatibility policy; publish a buildable Kotlin JVM/Android artifact only after those steps.
3. Reconcile overlapping typed names and duplicate decoding in App's \`computation/seer-bindings\` Kotlin wrapper; the current App still uses its own code and its pinned earlier Seer commit.
4. Keep C ABI/known-answer/equivalence/security and full device/JNI tests mandatory. Passing this pure-codec CI does **not** establish JNI functionality or app UI performance.
5. Resolve the App repository's pre-job CI failure, and only then integrate this Kotlin layer into the app with exact source-version provenance and reproducible AAR checks.

The canonical C++ engine remains the only implementation of \`P(c,t)\`.
