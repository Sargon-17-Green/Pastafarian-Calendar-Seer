# Seer Kotlin SDK — Android and JVM experimental distribution

**Status:** draft, not merged or released; **verified on Android 35 x86_64 emulator; not yet tested on physical ARM64 hardware**. The canonical C++ engine remains the *only* calendar algorithm. Kotlin transports typed parameters and native results.

## Files

- `src/main/kotlin/.../SeerMobileWire.kt` — pure Kotlin ABI-v1 status/result/provenance codec. Validates length, JDN ordering, integer range and version.
- `src/main/kotlin/.../SeerKotlinClient.kt` — thread-safe typed client, single and batch calls, reference-safe close and cancellable overloads.
- `src/main/kotlin/.../SeerJniTransport.kt` and `src/main/cpp/seer_kotlin_jni.cpp` — real JNI bridge to the existing C ABI, not a second converter.
- `src/android/kotlin/.../SeerAndroid.kt` — Android worker-thread guard, SHA-256-verified offline Gate staging in app-private storage, Native revision and ABI validation.
- `tools/build_aar.py` — deterministic, fail-closed AAR packager. Enforces Gate hash, ELF CPU architecture, required Kotlin classes and exact source provenance.
- `android-consumer-smoke/` — separate Java Android app that consumes **only the packaged AAR**; CI builds debug and minified release variants.

## Typed JVM API

The platform backend needs the two existing Gate files as local paths. Blocking calls must not execute on the Android UI thread.

```kotlin
SeerKotlinClient(SeerJniTransport(positivePath, negativePath)).use { client ->
    val one = client.queryBlocking(calculationJdn, targetJdn)
    val batch = client.queryBatchBlocking(
        calculationJdn, longArrayOf(targetJdn, targetJdn + 1L)
    )
    client.newCancellation().use { token ->
        // Another thread may call token.cancel() during this native call.
        val result = client.queryBlocking(calculationJdn, targetJdn, token)
    }
}
```

A successful result preserves all eight C ABI fields without any index-base reinterpretation. Non-OK codes throw `SeerNativeException`; malformed JNI records or unsupported ABI versions throw `SeerProtocolException`. Cancellation tokens are retained by an active Native call, so concurrently closing a token cannot free it prematurely. `reset()` is intended only between calls.

## Android AAR (unreleased)

CI produces an *experimental* `seer-kotlin-android-abi1-UNRELEASED.aar` with:

- `classes.jar` for Kotlin and the Android worker-only wrapper;
- `jni/arm64-v8a/` and `jni/x86_64/` each containing `libseer_mobile.so` and `libseer_mobile_kotlin_jni.so`;
- `assets/seer-kotlin/` with two pinned Gate files and `build-info.properties`;
- Android manifest, AAR metadata and an R8 keep rule for JNI methods.

**minSdk 26**. No armeabi-v7a or iOS distribution is claimed from this Android artifact. The package includes no background daemon, network access, account or advertisements.

For a Kotlin-based Android consumer, include the AAR file in the app's `libs` folder:

```kotlin
dependencies {
    implementation(files("libs/seer-kotlin-android-abi1-UNRELEASED.aar"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.4.20")
}
```

Then use the Android factory on a worker thread:

```kotlin
SeerAndroid.open(applicationContext).use { client ->
    val one = client.queryBlocking(calculationJdn, targetJdn)
    val many = client.queryBatchBlocking(calculationJdn, targetJdns)
}
```

`SeerAndroid.open` copies the verified Gates into `context.noBackupFilesDir/seer-kotlin/` and compares the embedded C++ Native commit, package version and ABI against the metadata inside **the same AAR**. No files are downloaded. Blocking queries, context opening and context closing reject calls from the Android main thread. A token's `cancel()` may be invoked from another thread, including the UI.

**Trust limitation:** this self-consistency check is not a digital signature. App signing, trusted artifact delivery, and final source-lock policy remain the distributing application's responsibility.

## Reproducible verification

- Pure JVM wire/client test: `.github/workflows/verify-seer-kotlin-wire.yml`, cross-checking C status definitions.
- True Kotlin/JVM → JNI → canonical C++ → Gate test: `.github/workflows/verify-seer-kotlin-jni.yml`, including saved canonical answers, negative dates, batch parity, invalid-domain responses and cancellation.
- Proven real-JNI passing run: [43586490367](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43586490367).
- Proven JNI cancellation and both Android ABI binary builds: [43587083926](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43587083926).
- **Shared-client multithreaded JNI regression (x86_64 verified; ARM64 pending):** `SeerJniIntegrationSmoke.kt` starts four JVM workers simultaneously against one typed client and one Native context, comparing sixteen three-result batches and sixteen singles against serial exact known answers. The real x86_64 host job in [run 43617208625](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43617208625) passed and logged `SEER_KOTLIN_REAL_JNI_CONCURRENCY_PASS workers=4 rounds=4 batchAndSingle=true`. The separate **Linux ARM64** job requires the identical sentinel from the same JAR; do not claim ARM64 concurrency success until that job completes.
- **Real hardware ARM64 Linux Kotlin/JVM→JNI→C++ pass:** [run 43609371664](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43609371664), ARM64 job 132491570224, artifact **14119880467**. The job used the **same JVM integration JAR** compiled by the x86_64 host job, built the Native/JNI bridge with AArch64 g++, verified the ELF architecture and exports, and passed exact canonical known answers, negative JDN, batch parity, domain errors, cancellation and lifecycle tests. Sentinel: `SEER_KOTLIN_ARM64_HARDWARE_JNI_PASS native=aarch64 kotlinJVM=true canonicalGates=true`. **This is a Linux ARM64 hardware gate, not an Android ARM64 device/emulator run.**
- First successfully assembled AAR with ZIP integrity and Gate hashes: [43589017830](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43589017830), artifact `seer-kotlin-android-aar-unreleased`, AAR SHA-256 `8eb0a04a318f5d65dfdd1920332bfe09cc8bccbc61541cb63064da619b21f42e`.
- **Android AAR consumer APKs verified:** [run 43589890205](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43589890205) built both Debug and minified Release APKs with AGP 9.3.1 and Gradle 9.5.0, verified JNI libraries and metadata in the resulting APKs, and emitted `SEER_KOTLIN_ANDROID_CONSUMER_APK_PASS`.
- **Android emulator execution verified:** [run 43596448053](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43596448053), Android 35 x86_64 emulator, built and installed the debug APK consuming the packaged AAR. Android logcat recorded `I/SeerKotlinSmoke(2132): SEER_KOTLIN_ANDROID_SMOKE_PASS` at 2026-11-14T13:02:02Z; the CI script recorded `SEER_KOTLIN_ANDROID_EMULATOR_PASS abi=x86_64 sdk=35 JNI=real Gates=verified`. This attests actual JNI/native loading, offline Gate verification, ordered 3-target batch, domain-error handling/recovery and cancellation/reset. The matching run's host JNI and Android APK build jobs also passed. Evidence artifact `seer-kotlin-android-aar-unreleased`, ID **14114328403**. **A passing x86_64 emulator is not physical ARM64-device acceptance.**

### R8 Release runtime acceptance (separate gate)

A diagnostic release APK is now **R8-minified and signed with the Gradle debug/test key only**, allowing actual emulator installation and testing. This is not a production certificate, public Android release, App Store deliverable, or acceptable SDK signing policy.

The updated \`sdk/kotlin/tools/run_android_emulator_smoke.sh\` accepts both the debug and release APK and runs them **sequentially with a full uninstall between variants**. The fresh app-private storage forces Gate re-staging and digest verification for each variant; the script separately requires both the real JNI calculation/cancellation smoke and the exact Android main-thread safety exception. A final \`SEER_KOTLIN_ANDROID_EMULATOR_PASS\` now additionally identifies \`variants=debug,release\`. The workflow archives distinct \`debug-logcat.txt\` and \`release-logcat.txt\` along with install evidence.

**Debug and R8-minified Release were both executed successfully** on an Android 35 x86_64 emulator in [CI run 43600218062](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43600218062). Both installations were separated by an uninstall/reinstall; the real app logged `SEER_KOTLIN_ANDROID_SMOKE_PASS` and `SEER_KOTLIN_ANDROID_UI_THREAD_GUARD_PASS` independently for each variant. The CI gate recorded `SEER_KOTLIN_ANDROID_VARIANT_PASS variant=debug JNI=real R8=no` and `... variant=release JNI=real R8=yes`. Its AAR evidence artifact ID is **14116436662**.
 
**Android Gate corruption-recovery verified in both Debug and R8 Release.** In [CI run 43608692510](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43608692510), the app deliberately changed one byte in each staged private Gate file *after closing the native context*; the SDK detected the digest mismatch, rewrote byte-for-byte identical authenticated content and returned the original canonical result after reopening. Both independent app sessions emitted `SEER_KOTLIN_ANDROID_GATE_RECOVERY_PASS` plus the standard JNI and UI-thread sentinels. Evidence artifact ID **14118824655**, containing separate Android logcats for both variants.

### Real physical Android ARM64 — Native ABI acceptance without APK installation

**Native C ABI PASS on a real Android 16 / API 36 ARM64 phone** on 2026-11-14. [CI run 43612593919](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/43612593919) produced test payload artifact **14120203445**, containing an Android NDK ARM64 executable, matching canonical libseer_mobile.so, two authentic Gates, provenance pin and SHA-256 manifest. A one-shot authorized ADB shell test copied the **four** payload files into a unique directory under /data/local/tmp, verified their SHA-256 digests *on the phone*, ran canonical known answers, batch parity, negative-JDN behavior, domain error/recovery and cancellation/reset, received exit code 0 and native PASS, and removed the temporary directory. No existing app was installed, replaced, cleared or modified. The private full runner evidence archive is on the authorized Windows test host; this public repository deliberately omits the user's hardware serial and email details.

Reproduce the same test using only the checked-in tool (requires Python 3, authorized ADB, and the ZIP artifact downloaded from the CI run):

~~~bash
python3 sdk/kotlin/tools/run_android_arm64_native_device.py \
  --artifact-zip seer-arm64-android-physical-native-smoke-unreleased.zip \
  --verify-only
python3 sdk/kotlin/tools/run_android_arm64_native_device.py \
  --artifact-zip seer-arm64-android-physical-native-smoke-unreleased.zip \
  --serial CHOSEN_ADB_SERIAL \
  --output-dir seer-arm64-evidence
~~~

The tool creates/deletes only its own uniquely named remote temporary directory. It performs **no APK installation**, no root operation, and no phone security-policy changes. CI exercises `--verify-only` against the freshly compiled payload; the physical run requires an explicitly chosen serial.

An independent attempt to install the diagnostic Kotlin SDK APK on the physical phone was blocked by the device's install policy: `INSTALL_FAILED_USER_RESTRICTED`. Do **not** override that policy as a workaround. **This physical-device PASS validates Seer Native C ABI only. Kotlin/JNI actually running under Android on the phone remains unverified** despite passing on the x86_64 Android emulator and native Linux ARM64.

The AAR build uses an exact 40-character Git checkout SHA for the Native source, emits SHA-256 for every package member and archives evidence. In pull-request CI, this may refer to the *test merge commit* rather than the branch tip.

Local pure JVM test, without JNI or Android:

```bash
kotlinc \
  sdk/kotlin/src/main/kotlin/org/pastafarian/seer/kotlin/SeerMobileWire.kt \
  sdk/kotlin/src/main/kotlin/org/pastafarian/seer/kotlin/SeerKotlinClient.kt \
  sdk/kotlin/src/test/kotlin/org/pastafarian/seer/kotlin/SeerMobileWireSmoke.kt \
  sdk/kotlin/src/test/kotlin/org/pastafarian/seer/kotlin/SeerKotlinClientSmoke.kt \
  -include-runtime -d seer-kotlin-wire-tests.jar
java -jar seer-kotlin-wire-tests.jar
```

Required sentinels: `SEER_KOTLIN_WIRE_PURE_PASS` and `SEER_KOTLIN_CLIENT_PURE_PASS`.

## Outstanding release gates

1. Android 35 x86_64 emulator passed Debug/R8 JNI, Gate self-healing and UI-thread safety. Native Kotlin/JNI passed on Linux ARM64 hardware. **Physical Android ARM64 Native C ABI also passed without APK installation.** Still required: real Android ARM64 **Kotlin/JNI runtime** with an authorized install path, App integration, and device-specific profiling. An APK install attempt was blocked by the phone's policy; do not bypass it.
2. Restore the **private App repo's CI**, which continues to fail before jobs begin (App issue #53). Reconcile the experimental App batch viewport PR #56 and cancellation-lifetime PR #54 after full executable integration tests.
3. Publish a versioned, pinned and signed SDK build only after Android consumer/device acceptance, compatibility and redistribution checks. AAR compilation is not an installable application or a public SDK release.
4. Preserve Seer's Native batch optimizations in draft PRs #53 and #54 until separate correctness and performance acceptance. This Kotlin SDK branch currently builds from Seer's **main** and does not claim the prototype 19–42× Native acceleration in the app.

No production merge, installed-app replacement or permanent device change has been performed; the physical Native shell fixture was removed after its run.
