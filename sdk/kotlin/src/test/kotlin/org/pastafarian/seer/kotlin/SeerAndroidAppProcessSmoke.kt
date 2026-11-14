package org.pastafarian.seer.kotlin

import java.io.File

/**
 * Executes the real Kotlin SDK/JNI bridge on Android's ART under the *adb shell*
 * UID via app_process, without PackageManager and without installing an APK.
 *
 * CLI: ROOT POSITIVE_GATE NEGATIVE_GATE EXPECTED_COMMIT
 *
 * This is an engineering test, not the app's Android Context wrapper. Do not
 * mistake it for signed APK distribution, Android app sandbox or UI validation.
 */
object SeerAndroidAppProcessSmoke {
    @JvmStatic
    fun main(args: Array<String>) {
        try {
            require(args.size == 4) { "Expected ROOT POSITIVE_GATE NEGATIVE_GATE COMMIT" }
            val (root, positive, negative, commit) = args.toList()
            require(Regex("[0-9a-f]{40}").matches(commit)) { "Invalid commit" }
            check(File(positive).isFile && File(negative).isFile) { "Missing Gate assets" }
            check(File(positive).length() == 200000L && File(negative).length() == 200000L) {
                "Gate payload length mismatch"
            }
            val native = File(root, "libseer_mobile.so").canonicalFile
            val jni = File(root, "libseer_mobile_kotlin_jni.so").canonicalFile
            check(native.isFile && jni.isFile) { "Missing native/JNI shared objects" }
            // Preload via absolute trusted, digest-verified temporary paths.
            // The JNI object also invokes loadLibrary, resolved by LD_LIBRARY_PATH.
            System.load(native.path)
            System.load(jni.path)

            val calc = 2461290L
            val targets = longArrayOf(2458961L, 2461290L, 2463008L)
            val known = arrayOf(
                longArrayOf(2458961L, 5000L, 5L, 1L, 5L, 1L, 37L),
                longArrayOf(2461290L, 5000L, 14L, 337L, 39L, 69L, 37L),
                longArrayOf(2463008L, 5001L, 1L, 1L, 46L, 1L, 27L),
            )
            SeerJniTransport(positive, negative, maxConcurrent = 2, maxQueued = 8).use { transport ->
                SeerKotlinClient(transport).use { client ->
                    val provenance = client.provenance()
                    check(provenance.abiVersion == 1u) { "Wrong C ABI" }
                    check(provenance.sourceCommit == commit) { "Wrong Native commit" }
                    check(provenance.packageVersion == "0.2.5") { "Wrong package version" }
                    check(provenance.backend == "portable-cppint") { "Wrong backend" }

                    fun assertFields(r: SeerRecord, expected: LongArray) {
                        check(
                            r.targetJdn == expected[0] && r.year == expected[1] &&
                                r.cutletIndex.toLong() == expected[2] &&
                                r.dayInCutlet.toLong() == expected[3] &&
                                r.monthIndex.toLong() == expected[4] &&
                                r.dayInMonth.toLong() == expected[5] &&
                                r.monthCount.toLong() == expected[6] &&
                                r.cutletCount in 5..17
                        ) { "Canonical field mismatch for JDN ${r.targetJdn}" }
                    }

                    val singles = targets.mapIndexed { index, t ->
                        client.queryBlocking(calc, t).also { assertFields(it, known[index]) }
                    }
                    val batch = client.queryBatchBlocking(calc, targets)
                    check(batch == singles) { "Batch/serial field parity failure" }

                    val negativeCalc = -13334246L
                    val negativeTargets = longArrayOf(negativeCalc, negativeCalc + 1, negativeCalc + 2)
                    val negativeSingles = negativeTargets.map { client.queryBlocking(negativeCalc, it) }
                    check(client.queryBatchBlocking(negativeCalc, negativeTargets) == negativeSingles)
                    check(negativeSingles.map { it.targetJdn } == negativeTargets.toList())

                    fun expectStatus(status: SeerStatus, action: () -> Unit) {
                        val error = runCatching(action).exceptionOrNull()
                        check(error is SeerNativeException && error.status == status) {
                            "Expected native $status; actual: $error"
                        }
                    }
                    expectStatus(SeerStatus.CALCULATION_OUT_OF_DOMAIN) {
                        client.queryBlocking(Long.MIN_VALUE, negativeCalc)
                    }
                    expectStatus(SeerStatus.TARGET_OUT_OF_DOMAIN) {
                        client.queryBlocking(negativeCalc, Long.MIN_VALUE)
                    }
                    check(client.queryBlocking(negativeCalc, negativeCalc) == negativeSingles.first())

                    client.newCancellation().use { token ->
                        token.cancel()
                        expectStatus(SeerStatus.CANCELLED) {
                            client.queryBlocking(negativeCalc, negativeCalc, token)
                        }
                        token.reset()
                        check(client.queryBlocking(negativeCalc, negativeCalc, token) == negativeSingles.first())
                    }
                    println(
                        "SEER_ANDROID_ARM64_APP_PROCESS_JNI_PASS abi=1 source=$commit " +
                            "knownAnswers=3 negativeBatch=3 domainErrors=true " +
                            "cancellation=true runtime=ART noInstall=true"
                    )
                }
            }
        } catch (error: Throwable) {
            System.err.println("SEER_ANDROID_ARM64_APP_PROCESS_JNI_FAIL: " + error)
            error.printStackTrace()
            throw error
        }
    }
}
