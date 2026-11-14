package org.pastafarian.seer.kotlin.android

import android.content.Context
import android.os.Looper
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.Properties
import org.pastafarian.seer.kotlin.SeerCancellation
import org.pastafarian.seer.kotlin.SeerJniTransport
import org.pastafarian.seer.kotlin.SeerKotlinClient
import org.pastafarian.seer.kotlin.SeerProvenance
import org.pastafarian.seer.kotlin.SeerProtocolException
import org.pastafarian.seer.kotlin.SeerRecord

/**
 * Typed Android surface for the canonical Seer engine.
 *
 * All potentially blocking methods require a worker thread; cancellation
 * tokens themselves may be cancelled from another thread, including the UI.
 */
class SeerAndroidClient internal constructor(
    private val client: SeerKotlinClient,
) : AutoCloseable {
    fun queryBlocking(calculationJdn: Long, targetJdn: Long): SeerRecord {
        requireWorkerThread()
        return client.queryBlocking(calculationJdn, targetJdn)
    }

    fun queryBlocking(
        calculationJdn: Long,
        targetJdn: Long,
        cancellation: SeerCancellation,
    ): SeerRecord {
        requireWorkerThread()
        return client.queryBlocking(calculationJdn, targetJdn, cancellation)
    }

    fun queryBatchBlocking(
        calculationJdn: Long,
        targetJdns: LongArray,
    ): List<SeerRecord> {
        requireWorkerThread()
        return client.queryBatchBlocking(calculationJdn, targetJdns)
    }

    fun queryBatchBlocking(
        calculationJdn: Long,
        targetJdns: LongArray,
        cancellation: SeerCancellation,
    ): List<SeerRecord> {
        requireWorkerThread()
        return client.queryBatchBlocking(calculationJdn, targetJdns, cancellation)
    }

    fun newCancellation(): SeerCancellation {
        requireWorkerThread()
        return client.newCancellation()
    }

    fun provenance(): SeerProvenance {
        requireWorkerThread()
        return client.provenance()
    }

    override fun close() {
        requireWorkerThread()
        client.close()
    }
}

/**
 * Stages sealed, SHA-256-checked Gate assets into the application's private
 * no-backup directory. Opens a JNI transport and compares its embedded C++
 * commit/version/ABI with the manifest packaged in this *same* AAR.
 *
 * No network access, external storage permission or downloaded binaries.
 * The AAR ships a pair of .so files for each supported ABI.
 */
object SeerAndroid {
    private const val ASSET_ROOT = "seer-kotlin"
    private const val GATE_BYTES = 200_000L
    private const val POSITIVE = "gates_100k_u16.bin"
    private const val NEGATIVE = "gates_negative_100k_u16.bin"
    private const val POSITIVE_SHA256 =
        "4d45f05acc6eb4dee6e53757a8c1f94da2f3de0fe4d4659b0745f15e05b147a8"
    private const val NEGATIVE_SHA256 =
        "40bfbd7d76209c258fb7d4739f1ef9b10ac8bb38eb4f26690c1048aee0e4f884"

    fun open(
        context: Context,
        maxConcurrent: Int = 2,
        maxQueued: Int = 8,
    ): SeerAndroidClient {
        requireWorkerThread()
        val app = context.applicationContext
        val metadata = Properties()
        app.assets.open("$ASSET_ROOT/build-info.properties").use {
            metadata.load(it)
        }
        val expectedCommit = metadata.getProperty("source_commit")
            ?: throw SeerProtocolException("Missing packaged Seer source revision")
        if (!expectedCommit.matches(Regex("[a-f0-9]{40}"))) {
            throw SeerProtocolException("Malformed packaged Seer source revision")
        }
        val expectedVersion = metadata.getProperty("package_version")
            ?: throw SeerProtocolException("Missing packaged Seer version")
        if (metadata.getProperty("abi_version") != "1") {
            throw SeerProtocolException("AAR does not target Seer ABI v1")
        }

        val positive = stage(app, POSITIVE, POSITIVE_SHA256)
        val negative = stage(app, NEGATIVE, NEGATIVE_SHA256)
        val client = SeerKotlinClient(
            SeerJniTransport(
                positive.absolutePath,
                negative.absolutePath,
                maxConcurrent,
                maxQueued,
            )
        )
        try {
            val p = client.provenance()
            if (p.abiVersion != 1u ||
                p.packageVersion != expectedVersion ||
                p.sourceCommit != expectedCommit ||
                p.backend != "portable-cppint"
            ) {
                throw SeerProtocolException("Packaged Seer Native provenance mismatch")
            }
            return SeerAndroidClient(client)
        } catch (failure: Throwable) {
            try {
                client.close()
            } catch (cleanup: Throwable) {
                failure.addSuppressed(cleanup)
            }
            throw failure
        }
    }

    private fun stage(context: Context, name: String, expectedSha256: String): File {
        val directory = File(context.noBackupFilesDir, ASSET_ROOT)
        if (!directory.isDirectory && !directory.mkdirs()) {
            throw IOException("Unable to create private Seer asset directory")
        }
        val destination = File(directory, name)
        if (matchesDigest(destination, expectedSha256)) return destination

        val staged = File.createTempFile("$name-", ".part", directory)
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            var bytes = 0L
            context.assets.open("$ASSET_ROOT/$name").use { input ->
                FileOutputStream(staged).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        if (read == 0) continue
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                        bytes += read
                        if (bytes > GATE_BYTES) throw IOException("Seer Gate exceeds expected size")
                    }
                    output.fd.sync()
                }
            }
            val actual = digest.digest().toHex()
            if (bytes != GATE_BYTES || actual != expectedSha256) {
                throw SeerProtocolException("Packaged Seer Gate failed SHA-256 validation: $name")
            }
            try {
                Files.move(
                    staged.toPath(), destination.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(staged.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            return destination
        } finally {
            staged.delete()
        }
    }

    private fun matchesDigest(file: File, expectedSha256: String): Boolean {
        if (!file.isFile || file.length() != GATE_BYTES) return false
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream ->
            val buffer = ByteArray(16 * 1024)
            while (true) {
                val size = stream.read(buffer)
                if (size < 0) break
                if (size != 0) digest.update(buffer, 0, size)
            }
        }
        return digest.digest().toHex() == expectedSha256
    }

    private fun ByteArray.toHex(): String =
        joinToString(separator = "") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
}

private fun requireWorkerThread() {
    val main = Looper.getMainLooper()
    if (main != null && Looper.myLooper() === main) {
        throw IllegalStateException("Blocking Seer operations must run off the Android UI thread")
    }
}
