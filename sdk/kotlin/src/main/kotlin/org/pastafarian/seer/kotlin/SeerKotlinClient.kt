package org.pastafarian.seer.kotlin

import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * Platform transport for the exact Seer Native C ABI v1. Only JNI/Native
 * implementations may perform date calculation. These byte-for-byte wire
 * results must match the layout decoded by SeerMobileWire.
 *
 * The transport retains responsibility for Native context/cancellation
 * ownership while each method executes, and for keeping computation off
 * the Android main/UI thread.
 */
interface SeerNativeTransport : AutoCloseable {
    fun query(calculationJdn: Long, targetJdn: Long): LongArray
    fun queryBatch(calculationJdn: Long, targetJdns: LongArray): LongArray
    fun provenance(): Array<String>
}

/**
 * Thread-safe typed Kotlin/JVM façade with no independent calendar logic.
 *
 * Parallel calls may hold the shared read lock concurrently. close() takes
 * the exclusive write lock; it waits until active calls finish and closes
 * the supplied transport exactly once. Calls after close fail immediately.
 */
class SeerKotlinClient(
    private val transport: SeerNativeTransport,
) : AutoCloseable {
    private val lifetime = ReentrantReadWriteLock()
    private var closed = false

    fun queryBlocking(calculationJdn: Long, targetJdn: Long): SeerRecord =
        lifetime.read {
            ensureOpen()
            SeerMobileWire.decodeSingle(
                transport.query(calculationJdn, targetJdn),
                targetJdn,
            )
        }

    fun queryBatchBlocking(
        calculationJdn: Long,
        targetJdns: LongArray,
    ): List<SeerRecord> = lifetime.read {
        ensureOpen()
        require(targetJdns.size in 1..SeerMobileWire.MAX_BATCH) {
            "Target count must be 1..${SeerMobileWire.MAX_BATCH}"
        }
        // Copy before JNI: a caller must not be able to change the mapping
        // between requested JDNs and returned records during native work.
        val stableTargets = targetJdns.copyOf()
        val wire = transport.queryBatch(calculationJdn, stableTargets.copyOf())
        SeerMobileWire.decodeBatch(wire, stableTargets)
    }

    fun provenance(): SeerProvenance = lifetime.read {
        ensureOpen()
        SeerMobileWire.decodeProvenance(transport.provenance())
    }

    private fun ensureOpen() {
        check(!closed) { "SeerKotlinClient has been closed" }
    }

    override fun close() = lifetime.write {
        if (!closed) {
            // Mark closed first: even if platform cleanup raises an exception,
            // the client cannot subsequently invoke a half-destroyed context.
            closed = true
            transport.close()
        }
    }
}
