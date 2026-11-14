package org.pastafarian.seer.kotlin

import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * JNI transport for the existing Seer Mobile C ABI v1, not a calendar engine.
 *
 * Reads two existing Gate files and uses the canonical native library. Its
 * public calls are protected against concurrent close(), even when invoked
 * directly rather than through SeerKotlinClient.
 *
 * Android callers must construct and invoke this blocking transport on a
 * background thread, never the UI thread. No files are written or downloaded.
 */
class SeerJniTransport(
    positiveGatePath: String,
    negativeGatePath: String,
    maxConcurrent: Int = 2,
    maxQueued: Int = 8,
) : SeerNativeTransport {
    private val lifetime = ReentrantReadWriteLock()
    private var nativeHandle = 0L

    init {
        require(positiveGatePath.isNotBlank()) { "Positive Gate file path is blank" }
        require(negativeGatePath.isNotBlank()) { "Negative Gate file path is blank" }
        require(maxConcurrent > 0) { "maxConcurrent must be positive" }
        require(maxQueued >= 0) { "maxQueued must not be negative" }
        nativeHandle = SeerKotlinJni.create(
            positiveGatePath, negativeGatePath, maxConcurrent, maxQueued,
        )
        if (nativeHandle == 0L) {
            throw SeerNativeException(SeerStatus.INTERNAL_ERROR)
        }
    }

    override fun query(calculationJdn: Long, targetJdn: Long): LongArray =
        lifetime.read {
            SeerKotlinJni.query(requireHandle(), calculationJdn, targetJdn)
                ?: throw SeerProtocolException("JNI single result allocation failed")
        }

    override fun queryBatch(
        calculationJdn: Long,
        targetJdns: LongArray,
    ): LongArray = lifetime.read {
        val handle = requireHandle()
        require(targetJdns.size in 1..SeerMobileWire.MAX_BATCH) {
            "Batch must contain 1..${SeerMobileWire.MAX_BATCH} target JDNs"
        }
        SeerKotlinJni.queryBatch(handle, calculationJdn, targetJdns.copyOf())
            ?: throw SeerProtocolException("JNI batch result allocation failed")
    }

    override fun provenance(): Array<String> = lifetime.read {
        SeerKotlinJni.provenance(requireHandle())
            ?: throw SeerProtocolException("JNI provenance is unavailable")
    }

    private fun requireHandle(): Long =
        nativeHandle.takeIf { it != 0L }
            ?: throw IllegalStateException("SeerJniTransport is closed")

    override fun close() = lifetime.write {
        val handle = nativeHandle
        if (handle != 0L) {
            nativeHandle = 0L
            SeerKotlinJni.destroy(handle)
        }
    }
}

/**
 * Symbols exactly match sdk/kotlin/src/main/cpp/seer_kotlin_jni.cpp.
 * The library name is different from the private App's legacy JNI adapter.
 */
internal object SeerKotlinJni {
    init {
        System.loadLibrary("seer_mobile_kotlin_jni")
    }

    external fun create(
        positiveGatePath: String,
        negativeGatePath: String,
        maxConcurrent: Int,
        maxQueued: Int,
    ): Long

    external fun destroy(handle: Long)

    external fun query(
        handle: Long,
        calculationJdn: Long,
        targetJdn: Long,
    ): LongArray?

    external fun queryBatch(
        handle: Long,
        calculationJdn: Long,
        targetJdns: LongArray,
    ): LongArray?

    external fun provenance(handle: Long): Array<String>?
}
