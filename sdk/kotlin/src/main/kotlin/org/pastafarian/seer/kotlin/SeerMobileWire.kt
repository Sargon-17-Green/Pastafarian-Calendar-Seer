package org.pastafarian.seer.kotlin

/** Canonical Native C ABI v1 status codes. */
enum class SeerStatus(val wire: Int) {
    OK(0), INVALID_ARGUMENT(1), CALCULATION_OUT_OF_DOMAIN(2),
    TARGET_OUT_OF_DOMAIN(3), CANCELLED(4), QUEUE_FULL(5), INTERNAL_ERROR(6);

    companion object {
        fun fromWire(value: Long): SeerStatus =
            entries.firstOrNull { it.wire.toLong() == value }
                ?: throw SeerProtocolException("Unknown Seer status: ${value}")
    }
}

class SeerProtocolException(message: String) : IllegalArgumentException(message)
class SeerNativeException(val status: SeerStatus) :
    RuntimeException("Seer Native call failed: ${status}")

data class SeerRecord(
    val targetJdn: Long,
    val year: Long,
    val cutletIndex: Int,
    val dayInCutlet: Int,
    val monthIndex: Int,
    val dayInMonth: Int,
    val cutletCount: Int,
    val monthCount: Int,
)

data class SeerProvenance(
    val abiVersion: UInt,
    val packageVersion: String,
    val sourceCommit: String,
    val backend: String,
)

/**
 * Pure Kotlin transport decoder for Seer Mobile ABI 1.
 *
 * The calendar algorithm and cancellation remain entirely in the canonical
 * C++ engine. This codec never loads JNI, creates a context or calculates a
 * date. Input is the existing Android JNI representation:
 * [status, record0(8 longs), record1(8 longs), ...].
 *
 * No index base conversion occurs. The engine's wire values are preserved
 * literally, including negative dates and all eight record fields.
 */
object SeerMobileWire {
    const val ABI_VERSION: UInt = 1u
    const val MAX_BATCH = 4096
    const val RECORD_WIDTH = 8

    fun decodeSingle(raw: LongArray, requestedTargetJdn: Long): SeerRecord {
        checkStatus(raw)
        if (raw.size != RECORD_WIDTH + 1) {
            throw SeerProtocolException("Single response length must be 9; got ${raw.size}")
        }
        return decodeRecord(raw, 1).also {
            if (it.targetJdn != requestedTargetJdn) {
                throw SeerProtocolException("Single result refers to a different target JDN")
            }
        }
    }

    fun decodeBatch(raw: LongArray, requestedTargetJdns: LongArray): List<SeerRecord> {
        require(requestedTargetJdns.size in 1..MAX_BATCH) {
            "Batch target count must be 1..${MAX_BATCH}"
        }
        checkStatus(raw)
        val expected = 1 + RECORD_WIDTH * requestedTargetJdns.size
        if (raw.size != expected) {
            throw SeerProtocolException("Expected ${expected} longs, received ${raw.size}")
        }
        return List(requestedTargetJdns.size) { index ->
            decodeRecord(raw, 1 + RECORD_WIDTH * index).also { record ->
                if (record.targetJdn != requestedTargetJdns[index]) {
                    throw SeerProtocolException("Target mismatch at batch index ${index}")
                }
            }
        }
    }

    fun decodeProvenance(raw: Array<String>): SeerProvenance {
        if (raw.size != 4) {
            throw SeerProtocolException("Expected 4 provenance fields, got ${raw.size}")
        }
        val version = raw[0].toUIntOrNull()
            ?: throw SeerProtocolException("Non-numeric ABI version")
        if (version != ABI_VERSION) {
            throw SeerProtocolException("Unsupported Seer ABI version: ${version}")
        }
        if (raw.drop(1).any(String::isBlank)) {
            throw SeerProtocolException("Blank provenance identity")
        }
        return SeerProvenance(version, raw[1], raw[2], raw[3])
    }

    private fun checkStatus(raw: LongArray) {
        if (raw.isEmpty()) throw SeerProtocolException("Empty native response")
        val status = SeerStatus.fromWire(raw[0])
        if (status != SeerStatus.OK) {
            if (raw.size != 1) {
                throw SeerProtocolException("Non-OK result must contain only status")
            }
            throw SeerNativeException(status)
        }
    }

    private fun decodeRecord(raw: LongArray, start: Int): SeerRecord {
        fun intAt(offset: Int): Int {
            val value = raw[start + offset]
            if (value < Int.MIN_VALUE.toLong() || value > Int.MAX_VALUE.toLong()) {
                throw SeerProtocolException("Native int32 field ${offset} out of range")
            }
            return value.toInt()
        }
        return SeerRecord(
            targetJdn = raw[start],
            year = raw[start + 1],
            cutletIndex = intAt(2),
            dayInCutlet = intAt(3),
            monthIndex = intAt(4),
            dayInMonth = intAt(5),
            cutletCount = intAt(6),
            monthCount = intAt(7),
        )
    }
}
