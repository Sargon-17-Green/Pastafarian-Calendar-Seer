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
) : SeerCancellableNativeTransport {
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
            SeerKotlinJni.query(requireHandle(), calculationJdn, targetJdn, 0L)
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
        SeerKotlinJni.queryBatch(handle, calculationJdn, targetJdns.copyOf(), 0L)
            ?: throw SeerProtocolException("JNI batch result allocation failed")
    }

    override fun newCancellation(): SeerCancellation = lifetime.read {
        requireHandle()
        val tokenHandle = SeerKotlinJni.createCancel()
        if (tokenHandle == 0L) {
            throw SeerNativeException(SeerStatus.INTERNAL_ERROR)
        }
        SeerJniCancellation(this, tokenHandle)
    }

    override fun query(
        calculationJdn: Long,
        targetJdn: Long,
        cancellation: SeerCancellation,
    ): LongArray = lifetime.read {
        val handle = requireHandle()
        val tokenHandle = retainCancellation(cancellation)
        try {
            SeerKotlinJni.query(handle, calculationJdn, targetJdn, tokenHandle)
                ?: throw SeerProtocolException("JNI cancellable query allocation failed")
        } finally {
            SeerKotlinJni.destroyCancel(tokenHandle)
        }
    }

    override fun queryBatch(
        calculationJdn: Long,
        targetJdns: LongArray,
        cancellation: SeerCancellation,
    ): LongArray = lifetime.read {
        val handle = requireHandle()
        require(targetJdns.size in 1..SeerMobileWire.MAX_BATCH)
        val tokenHandle = retainCancellation(cancellation)
        try {
            SeerKotlinJni.queryBatch(
                handle, calculationJdn, targetJdns.copyOf(), tokenHandle,
            ) ?: throw SeerProtocolException("JNI cancellable batch allocation failed")
        } finally {
            SeerKotlinJni.destroyCancel(tokenHandle)
        }
    }

    private fun retainCancellation(cancellation: SeerCancellation): Long {
        require(cancellation is SeerJniCancellation && cancellation.owner === this) {
            "Cancellation token belongs to a different Native backend"
        }
        return cancellation.retainForCall()
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
 * A ref-counted Native token. JNI obtains its own retain before each query;
 * closing the Kotlin token during a running call cannot free the native
 * object prematurely. cancel() never acquires the client's query lock, so it
 * can interrupt active native work.
 */
internal class SeerJniCancellation(
    internal val owner: SeerJniTransport,
    private var nativeHandle: Long,
) : SeerCancellation {
    @Synchronized
    override fun cancel() {
        SeerKotlinJni.cancel(requireHandle())
    }

    @Synchronized
    override fun reset() {
        SeerKotlinJni.resetCancel(requireHandle())
    }

    @Synchronized
    internal fun retainForCall(): Long {
        val handle = requireHandle()
        SeerKotlinJni.retainCancel(handle)
        return handle
    }

    private fun requireHandle(): Long =
        nativeHandle.takeIf { it != 0L }
            ?: throw IllegalStateException("Seer cancellation token is closed")

    @Synchronized
    override fun close() {
        val handle = nativeHandle
        if (handle != 0L) {
            nativeHandle = 0L
            SeerKotlinJni.destroyCancel(handle)
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

    external fun createCancel(): Long
    external fun retainCancel(handle: Long)
    external fun destroyCancel(handle: Long)
    external fun cancel(handle: Long)
    external fun resetCancel(handle: Long)

    external fun query(
        handle: Long,
        calculationJdn: Long,
        targetJdn: Long,
        cancellationHandle: Long,
    ): LongArray?

    external fun queryBatch(
        handle: Long,
        calculationJdn: Long,
        targetJdns: LongArray,
        cancellationHandle: Long,
    ): LongArray?

    external fun provenance(handle: Long): Array<String>?
}
