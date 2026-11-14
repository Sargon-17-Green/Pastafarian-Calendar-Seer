package org.pastafarian.seer.kotlin

import java.nio.file.Files
import java.nio.file.Path

private data class KnownAnswer(
    val name: String,
    val calculationJdn: Long,
    val targetJdn: Long,
    val year: Long,
    val cutletIndex: Int,
    val dayInCutlet: Int,
    val monthIndex: Int,
    val dayInMonth: Int,
    val monthCount: Int,
)

private fun loadKnownAnswers(path: Path): List<KnownAnswer> {
    val rows = Files.readAllLines(path).filter(String::isNotBlank)
    check(rows.isNotEmpty()) { "Known-answer table is empty" }
    val headers = rows.first().split('\t')
    fun column(cells: List<String>, name: String) =
        cells[headers.indexOf(name).takeIf { it >= 0 } ?: error("No TSV column $name")]
    val required = setOf("y5000-start", "same-query", "y5001-start")
    val selected = rows.drop(1).map { it.split('\t') }
        .filter { column(it, "name") in required }
        .map {
            KnownAnswer(
                name = column(it, "name"),
                calculationJdn = column(it, "calc").toLong(),
                targetJdn = column(it, "target").toLong(),
                year = column(it, "year").toLong(),
                cutletIndex = column(it, "cutlet_idx").toInt(),
                dayInCutlet = column(it, "day_cutlet").toInt(),
                monthIndex = column(it, "month_idx").toInt(),
                dayInMonth = column(it, "day_month").toInt(),
                monthCount = column(it, "months").toInt(),
            )
        }
    check(selected.map(KnownAnswer::name).toSet() == required)
    return selected
}

private fun assertKnown(record: SeerRecord, expected: KnownAnswer) {
    check(record.targetJdn == expected.targetJdn)
    check(record.year == expected.year)
    check(record.cutletIndex == expected.cutletIndex)
    check(record.dayInCutlet == expected.dayInCutlet)
    check(record.monthIndex == expected.monthIndex)
    check(record.dayInMonth == expected.dayInMonth)
    check(record.monthCount == expected.monthCount)
    check(record.cutletCount in 5..17)
}

private inline fun expectNativeStatus(
    status: SeerStatus,
    call: () -> Unit,
) {
    val thrown = runCatching(call).exceptionOrNull()
    check(thrown is SeerNativeException && thrown.status == status) {
        "Expected Native status $status; received $thrown"
    }
}

/**
 * True end-to-end host integration, not a mock:
 * Kotlin/JVM -> JNI .so -> canonical Seer C ABI -> Gate files -> exact records.
 */
fun main(arguments: Array<String>) {
    require(arguments.size == 4) {
        "Usage: POSITIVE_GATES NEGATIVE_GATES KNOWN_ANSWERS_TSV EXPECTED_GIT_SHA"
    }
    val (positive, negative, fixturePath, expectedCommit) = arguments.toList()
    val known = loadKnownAnswers(Path.of(fixturePath))
    val transport = SeerJniTransport(positive, negative, maxConcurrent = 2, maxQueued = 8)
    SeerKotlinClient(transport).use { client ->
        val provenance = client.provenance()
        check(provenance.abiVersion == 1u)
        check(provenance.packageVersion == "0.2.5")
        check(provenance.sourceCommit == expectedCommit) {
            "Native source provenance mismatch: ${provenance.sourceCommit} != $expectedCommit"
        }
        check(provenance.backend == "portable-cppint")

        // Known-answer samples span both sides of a Pastafarian year edge.
        val individual = known.map { row ->
            client.queryBlocking(row.calculationJdn, row.targetJdn).also {
                assertKnown(it, row)
            }
        }
        val calc = known.first().calculationJdn
        check(known.all { it.calculationJdn == calc })
        val targets = known.map(KnownAnswer::targetJdn).toLongArray()
        val batch = client.queryBatchBlocking(calc, targets)
        check(batch == individual) { "JNI batch differs from independent canonical queries" }

        // The Native protocol supports negative JDNs; the JVM keeps Long
        // precision and never routes these through java.util.Date.
        val negativeCalc = -13334246L
        val negativeTargets = longArrayOf(-13334246L, -13334245L, -13334244L)
        val singles = negativeTargets.map { client.queryBlocking(negativeCalc, it) }
        val negativeBatch = client.queryBatchBlocking(negativeCalc, negativeTargets)
        check(negativeBatch == singles)
        check(negativeBatch.map(SeerRecord::targetJdn).toLongArray()
            .contentEquals(negativeTargets))

        expectNativeStatus(SeerStatus.CALCULATION_OUT_OF_DOMAIN) {
            client.queryBlocking(Long.MIN_VALUE, negativeCalc)
        }
        expectNativeStatus(SeerStatus.TARGET_OUT_OF_DOMAIN) {
            client.queryBlocking(negativeCalc, Long.MIN_VALUE)
        }
        expectNativeStatus(SeerStatus.TARGET_OUT_OF_DOMAIN) {
            client.queryBatchBlocking(
                negativeCalc, longArrayOf(negativeCalc, Long.MIN_VALUE),
            )
        }
        // Even after an error, the retained C context is still usable.
        check(client.queryBlocking(negativeCalc, negativeCalc) == singles.first())

        // Real Native token: the cancellation flag must propagate through
        // JNI to the C ABI, and reset must restore a usable context.
        client.newCancellation().use { token ->
            token.cancel()
            expectNativeStatus(SeerStatus.CANCELLED) {
                client.queryBlocking(negativeCalc, negativeCalc, token)
            }
            expectNativeStatus(SeerStatus.CANCELLED) {
                client.queryBatchBlocking(
                    negativeCalc, longArrayOf(negativeCalc, negativeCalc + 1), token,
                )
            }
            token.reset()
            check(client.queryBlocking(negativeCalc, negativeCalc, token) == singles.first())
        }

        val closedToken = client.newCancellation()
        closedToken.close()
        check(runCatching {
            client.queryBlocking(negativeCalc, negativeCalc, closedToken)
        }.exceptionOrNull() is IllegalStateException)
        check(client.queryBlocking(negativeCalc, negativeCalc) == singles.first())
        println(
            "SEER_KOTLIN_REAL_JNI_PASS abi=1 commit=$expectedCommit" +
                " knownAnswers=${known.size} negativeBatch=${negativeBatch.size}" +
                " exactFieldParity=true domainErrors=true cancellation=true lifecycle=true"
        )
    }

    // The public transport must reject calls after the typed client's close().
    check(runCatching { transport.query(-13334246L, -13334246L) }.isFailure)
    transport.close() // idempotent
}
