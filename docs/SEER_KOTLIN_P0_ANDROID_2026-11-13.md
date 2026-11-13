# Seer Kotlin / Android — P0: physical-device native baseline

**2026-11-13. Status: PARTIAL.** Physical ARM64 Native probe completed; Kotlin/JNI, UI, battery, thermal and statistical baselines are not yet completed. No app source or canonical algorithm was modified.

## Verified environment

| Item | Observed |
|---|---|
| Device | Xiaomi 2407FPN8EG |
| Android API / ABI | 36 / arm64-v8a |
| Installed QA app | org.pastafarian.calendar.app.bootstrap.qa, version 0.1.0, versionCode 1 |
| Installed APK | base.apk, 35,243,850 bytes |
| APK native contents | libseer_mobile.so and libseer_mobile_jni.so for both arm64-v8a and x86_64 |
| APK data contents | gates_100k_u16.bin and gates_negative_100k_u16.bin, 200,000 bytes each |
| Native provenance | ABI=1, package=0.2.5, sourceCommit=838cec0c50e7137409d0c4ed49c8dc288a8417fc, backend=portable-cppint |
| ARM64 engine library extracted from installed APK | 1,112,592 bytes |
| Android NDK used for probe compilation | 29.0.13113456, target API 26 |

The repository tree of the application does not include the built libraries in jniLibs; the installed QA APK **does** include them. This confirms installation content, not that the current source builds it reproducibly. The APK binary SHA-256 was not captured; the reported Seer commit is engine provenance, not an independently verified APK digest.

## Method actually executed

- Identified the phone by ADB. Located the installed QA APK with pm path --user 0, pulled a temporary copy, and extracted its ARM64 Seer library and both Gates files.
- Built prototype/tests/seer_mobile_p0_bench.cpp using Android NDK clang++, linking to the *exact libseer_mobile.so extracted from the installed APK*.
- Staged the benchmark executable, the native library, and two data files in /data/local/tmp/seer-p0-20261113. Invoked the native API with LD_LIBRARY_PATH pointing to that directory, without modifying or reinstalling the QA app.
- Configuration: max_concurrent=2, max_queued=8, weave_threads=1, superblock=512, replay_threads=1.
- Calculation day JDN=2461290. Tested 1, 7 and 42 adjacent target dates. One warmup, **two recorded repetitions per case**. Compared first and last batch results to direct single-record queries. Exit status 0.
- Measured native context creation and native calls using steady_clock. The measurement **excludes** JNI, Kotlin object construction, asset staging, process startup, UI, power and thermal effects.

## Raw evidence (milliseconds)

| Scenario | Sample A | Sample B | Mean | Mean per target |
|---|---:|---:|---:|---:|
| single | 601.931 | 600.193 | 601.062 | 601.062 |
| batch7 | 4196.637 | 4198.489 | 4197.563 | 599.652 |
| batch42 | 25306.902 | 25286.142 | 25296.522 | 602.298 |

- contextCreateMs=6.278 (Native context, *not* full Android app startup)
- Max RSS reported by getrusage for probe process: 40,236 KiB (not app RSS)
- Seer native provenance: ABI 1, version 0.2.5, commit 838cec0c50e7137409d0c4ed49c8dc288a8417fc, portable-cppint
- Result: P0_COMPLETE, validNativeBatchEndpoints=true, ADB_EXIT=0

Raw console output:

~~~json
{"event":"P0_IDENTITY","abi":1,"version":"0.2.5","commit":"838cec0c50e7137409d0c4ed49c8dc288a8417fc","backend":"portable-cppint","contextCreateMs":6.278,"reps":2}
{"event":"P0_SAMPLE","scenario":"single","count":1,"timesMs":[601.931,600.193],"p50Ms":601.931,"p95NearestRankMs":600.193,"maxRssKb":40236}
{"event":"P0_SAMPLE","scenario":"batch7","count":7,"timesMs":[4196.637,4198.489],"p50Ms":4198.489,"p95NearestRankMs":4196.637,"maxRssKb":40236}
{"event":"P0_SAMPLE","scenario":"batch42","count":42,"timesMs":[25306.902,25286.142],"p50Ms":25306.902,"p95NearestRankMs":25286.142,"maxRssKb":40236}
{"event":"P0_COMPLETE","validNativeBatchEndpoints":true}
ADB_EXIT=0
~~~

**Quality correction:** The provisional compiled probe had an incorrect p95 percentile-index formula for N=2 and used upper-middle instead of conventional even-N median. Those original p50/p95 output fields **must be ignored**. The table above uses raw values only. The committed C++ probe corrects both formulas; even with those corrections, *two repetitions cannot support a defensible p95*.

## Root cause and high-priority research

In prototype/src/seer_mobile.cpp, seer_mobile_query_batch loops over target dates and invokes compute_one for each target. It amortizes JNI crossings but does not expressly reuse intermediate results across the requested target days. The almost-linear measured runtime is consistent with that implementation.

Next: profile compute_one stages to identify calculation-day-dependent invariant work versus target-day-dependent work. Share only provably invariant work, retain deterministic semantics and differential canonical parity. JNI marshalling optimization is secondary until the native arithmetic profile is known.

## Open acceptance gates

- [x] Device ADB and 64-bit ABI confirmed
- [x] Installed APK includes Seer + JNI libs and gate assets for both ABIs
- [x] Direct native query and 7/42 batch succeed on the physical device
- [x] Provenance captured; first/last records checked for equality to direct queries
- [ ] Repeatable build and automated install/load/query from a clean source build (including SHA-256 verification)
- [ ] Kotlin/JNI same-input measured benchmark (true JNI overhead, allocations and coroutine scheduling measured separately)
- [ ] >=30 controlled repetitions, randomized A/B order, thermal/battery conditions, and second physical ARM64 device
- [ ] UI startup, month navigation, cancellation, error handling, CPU and energy measurements
- [ ] Canonical differential corpus including distant/boundary cases
- [ ] Verified packages AAR/APK and no persistent background services

**P0 remains open.** Do not declare physical Android integration completed from a native-only probe.

## Reproducing the probe

Use the source in prototype/tests/seer_mobile_p0_bench.cpp and matching prototype/include/seer_mobile.h. Compile for arm64-v8a Android with the NDK, linking against the precise Seer native library under test. On device put that library, the executable and the two verified gate files in one staging directory and run:

~~~sh
LD_LIBRARY_PATH=/data/local/tmp/seer-p0-20261113 \
  /data/local/tmp/seer-p0-20261113/seer_mobile_p0_bench \
  /data/local/tmp/seer-p0-20261113/gates_100k_u16.bin \
  /data/local/tmp/seer-p0-20261113/gates_negative_100k_u16.bin 2
~~~

The compiled benchmark receives the positive gate path, the negative gate path and a repetition count (default 3, allowed 1..60); it does not change calendar state or install any persistent service. For a new run, record binary hashes and a full environmental manifest before cleaning the temporary directory.
