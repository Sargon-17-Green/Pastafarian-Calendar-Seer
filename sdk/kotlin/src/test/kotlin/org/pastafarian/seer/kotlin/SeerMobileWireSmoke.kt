package org.pastafarian.seer.kotlin

private inline fun <reified T : Throwable> expects(block: () -> Unit): T {
    try {
        block()
    } catch (error: Throwable) {
        check(error is T) { "Expected ${T::class}, got ${error::class}" }
        return error
    }
    error("Expected ${T::class}")
}

private fun record(jdn: Long): LongArray =
    longArrayOf(jdn, 5000L, 5L, 1L, 4L, 1L, 7L, 50L)

/**
 * Dependency-free host contract regression. Compile both this file and
 * src/main/SeerMobileWire.kt with kotlinc; run via the Kotlin/JVM launcher.
 */
fun main() {
    check(SeerMobileWire.ABI_VERSION == 1u)
    check(SeerMobileWire.MAX_BATCH == 4096)
    check(SeerMobileWire.RECORD_WIDTH == 8)

    val one = SeerMobileWire.decodeSingle(longArrayOf(0L) + record(2461290L), 2461290L)
    check(one == SeerRecord(2461290L, 5000L, 5, 1, 4, 1, 7, 50))

    val targets = longArrayOf(-200L, 0L, 2458961L, 2463007L, 2463008L)
    val raw = longArrayOf(0L) +
        targets.flatMap { record(it).asIterable() }.toLongArray()
    check(SeerMobileWire.decodeBatch(raw, targets).map { it.targetJdn }.toLongArray()
        .contentEquals(targets))

    expects<SeerProtocolException> { SeerMobileWire.decodeSingle(longArrayOf(), 42L) }
    expects<SeerProtocolException> {
        SeerMobileWire.decodeSingle(longArrayOf(0L) + record(1L), 2L)
    }
    expects<SeerProtocolException> {
        SeerMobileWire.decodeBatch(raw, longArrayOf(1L, 2L))
    }
    expects<SeerProtocolException> {
        SeerMobileWire.decodeBatch(raw, targets.reversedArray())
    }
    check(expects<SeerNativeException> {
        SeerMobileWire.decodeBatch(longArrayOf(2L), targets)
    }.status == SeerStatus.CALCULATION_OUT_OF_DOMAIN)
    expects<SeerProtocolException> {
        SeerMobileWire.decodeBatch(longArrayOf(222L), targets)
    }
    expects<SeerProtocolException> {
        SeerMobileWire.decodeBatch(longArrayOf(2L, 0L), targets)
    }
    expects<SeerProtocolException> {
        SeerMobileWire.decodeBatch(
            longArrayOf(0L, 1L, 5000L, Int.MAX_VALUE.toLong() + 1, 1L, 1L, 1L, 1L, 1L),
            longArrayOf(1L),
        )
    }

    val provenance = SeerMobileWire.decodeProvenance(
        arrayOf("1", "0.2.5", "a1b2c3d4", "portable-cppint")
    )
    check(provenance.abiVersion == 1u && provenance.sourceCommit == "a1b2c3d4")
    expects<SeerProtocolException> {
        SeerMobileWire.decodeProvenance(arrayOf("2", "0.2.5", "rev", "portable-cppint"))
    }
    expects<SeerProtocolException> {
        SeerMobileWire.decodeProvenance(arrayOf("1", "", "rev", "portable-cppint"))
    }
    println("SEER_KOTLIN_WIRE_PURE_PASS status, length, ordering, numeric ranges, ABI, provenance")
}
