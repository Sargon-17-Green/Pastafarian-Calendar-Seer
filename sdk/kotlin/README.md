# Seer Kotlin SDK — experimental pure ABI wire contract

**Status: draft, not a released SDK.** This directory is the first portability layer toward the requested official Kotlin SDK. It deliberately contains **no alternative calendar algorithm** and is independent of Android, JNI and platform storage.

## Scope

\`SeerMobileWire.kt\` defines the complete native status enumeration and ABI-1 data types. It decodes:
- one native result: \`[status, record(8 longs)]\`;
- an ordered batch: \`[status, N × record(8 longs)]\`, for 1..4096 targets;
- native JNI provenance: \`[abiVersion, packageVersion, sourceCommit, backend]\`.

`SeerKotlinClient.kt` adds a typed, thread-safe Kotlin/JVM client based on a narrow `SeerNativeTransport` interface. It accepts raw ABI responses only from the injected transport; it never implements date conversion. It copies batch request arrays to protect request-to-response identity against concurrent caller mutation, permits parallel queries through a read lock, and serializes `close()` through an exclusive write lock so the Native transport cannot be destroyed during an active call. The concrete \`SeerJniTransport\` now connects this interface to a JNI bridge and canonical C++ engine; no second calendar algorithm exists. A token created through \`SeerKotlinClient.newCancellation()\` can interrupt single or batch JNI calls and is reference-counted across concurrent use and close. Android clients must run blocking calls off the UI thread.

A failure status is represented by a **single long** and throws \`SeerNativeException\`, preserving the exact numeric status. Malformed successful results, unknown statuses, an incorrectly-sized response, a mismatch between returned JDN and requested JDN, an overflowing 32-bit field, or incorrect ABI provenance throw \`SeerProtocolException\` rather than silently corrupting a date.

**Indexes are passed through unchanged.** This module makes no undocumented assumption about whether a Native ordinal or index starts at zero or one; it preserves Seer's exact eight field values.

## Reproducible standalone host verification

On Linux/macOS/Windows with \`kotlinc\`, \`java\` and a JDK available, from the repository root:

\`\`\`bash
kotlinc \
  sdk/kotlin/src/main/kotlin/org/pastafarian/seer/kotlin/SeerMobileWire.kt \
  sdk/kotlin/src/main/kotlin/org/pastafarian/seer/kotlin/SeerKotlinClient.kt \
  sdk/kotlin/src/test/kotlin/org/pastafarian/seer/kotlin/SeerMobileWireSmoke.kt \
  sdk/kotlin/src/test/kotlin/org/pastafarian/seer/kotlin/SeerKotlinClientSmoke.kt \
  -include-runtime -d seer-kotlin-wire-tests.jar
java -jar seer-kotlin-wire-tests.jar
\`\`\`

The test must emit \`SEER_KOTLIN_WIRE_PURE_PASS\`; cases cover negative JDNs, year-5000 edges, wrong targets, malformed lengths, status and provenance mismatch, 32-bit range, and explicit error handling. The public repository workflow \`verify-seer-kotlin-wire.yml\` independently cross-checks the ABI constants in \`prototype/include/seer_mobile.h\` and runs the same Kotlin/JVM smoke on an ephemeral Ubuntu 24.04 runner.

## Real JNI bridge and build requirements

The SDK now includes \`src/main/kotlin/org/pastafarian/seer/kotlin/SeerJniTransport.kt\` and \`src/main/cpp/seer_kotlin_jni.cpp\`. The JNI binary is **libseer_mobile_kotlin_jni.so**; the JVM loads it with \`System.loadLibrary("seer_mobile_kotlin_jni")\`. Supply the absolute paths of the two pinned Gate files when opening the transport:

\`\`\`kotlin
val client = SeerKotlinClient(
    SeerJniTransport(positiveGatePath = positivePath, negativeGatePath = negativePath)
)
client.use {
    val record = it.queryBlocking(calculationJdn, targetJdn)
    val records = it.queryBatchBlocking(calculationJdn, longArrayOf(targetJdn, targetJdn + 1))
    it.newCancellation().use { cancellation ->
        // In another thread: cancellation.cancel()
        val cancellable = it.queryBlocking(calculationJdn, targetJdn, cancellation)
    }
}
\`\`\`

The JNI transport owns exactly one native context; the typed client serializes close() with active reads. Cancellation tokens own independent, ref-counted C ABI objects, retain one reference for each in-flight query, and can be cancelled concurrently without holding the client's read/write lock. Do not reset an actively executing token; reset is intended between calls.

The independent public GitHub workflow \`verify-seer-kotlin-jni.yml\` builds the real C++ engine and JNI adapter together on Linux, runs the Kotlin code against the pinned Gates and canonical known-answer rows, verifies negative dates, batch parity, domain errors, actual native provenance and lifecycle safety. The initial real-JNI run **43586490367** passed (known-answer queries and normal lifecycle; artifact **14109813868**). A follow-up run adds cancellation coverage and cross-compiles Android ARM64/x86_64 JNI libraries; its result remains a separate gate until completed.

For Android packaging, include **both** \`libseer_mobile.so\` and \`libseer_mobile_kotlin_jni.so\` under the correct \`jniLibs/<abi>\` directory and stage both Gate files as readable local files. The JNI adapter is designed to link against the canonical Seer shared library and requires no alternative Kotlin date converter. Android cross-compilation does not itself demonstrate an installable AAR, an emulator pass or an actual device run.

## Outstanding work, release gates

1. Implement the still-missing Android/JNI backend for `SeerNativeTransport`, including strict cancellation/token lifetime, build artifact pinning, and Android main-thread prohibition. A platform-independent typed interface for query/batch/provenance and serialized close has now been introduced; cancellation remains a separate design gate.
2. Ensure all public API methods are typed and versioned, with an explicit compatibility policy; publish a buildable Kotlin JVM/Android artifact only after those steps.
3. Reconcile overlapping typed names and duplicate decoding in App's \`computation/seer-bindings\` Kotlin wrapper; the current App still uses its own code and its pinned earlier Seer commit.
4. Keep C ABI/known-answer/equivalence/security and full device/JNI tests mandatory. Passing this pure-codec CI does **not** establish JNI functionality or app UI performance.
5. Resolve the App repository's pre-job CI failure, and only then integrate this Kotlin layer into the app with exact source-version provenance and reproducible AAR checks.

The canonical C++ engine remains the only implementation of \`P(c,t)\`.
