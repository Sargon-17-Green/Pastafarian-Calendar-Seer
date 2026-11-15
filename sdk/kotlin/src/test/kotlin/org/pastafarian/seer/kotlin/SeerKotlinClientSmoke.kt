package org.pastafarian.seer.kotlin

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

private fun wireRecord(target: Long): LongArray =
    longArrayOf(target, 5000L, 5L, 1L, 4L, 1L, 7L, 50L)

private open class FakeNativeTransport : SeerNativeTransport {
    var closes = 0
    var queries = 0
    var batches = 0
    var observedTarget: LongArray? = null

    override fun query(calculationJdn: Long, targetJdn: Long): LongArray {
        queries += 1
        return longArrayOf(0L) + wireRecord(targetJdn)
    }

    override fun queryBatch(calculationJdn: Long, targetJdns: LongArray): LongArray {
        batches += 1
        observedTarget = targetJdns.copyOf()
        return longArrayOf(0L) + targetJdns.flatMap { wireRecord(it).asIterable() }.toLongArray()
    }

    override fun provenance(): Array<String> =
        arrayOf("1", "0.2.5", "test-pinned-commit", "portable-cppint")

    override fun close() {
        closes += 1
    }
}

/** Called from the dependency-free SeerMobileWireSmoke main. */
fun verifySeerKotlinClientSmoke() {
    val fake = FakeNativeTransport()
    val client = SeerKotlinClient(fake)
    check(client.queryBlocking(2461290L, 2461290L).targetJdn == 2461290L)
    check(client.queryBlocking(2461290L, -200L).targetJdn == -200L)
    val targets = longArrayOf(2463008L, 2463007L, 2458961L)
    val result = client.queryBatchBlocking(2461290L, targets)
    check(result.map { it.targetJdn }.toLongArray().contentEquals(targets))
    check(fake.observedTarget?.contentEquals(targets) == true)
    check(client.provenance().sourceCommit == "test-pinned-commit")
    check(fake.queries == 2 && fake.batches == 1)

    val empty = try {
        client.queryBatchBlocking(2461290L, longArrayOf())
        false
    } catch (_: IllegalArgumentException) { true }
    check(empty && fake.batches == 1)

    client.close()
    client.close()
    check(fake.closes == 1)
    check(runCatching { client.queryBlocking(0L, 1L) }.isFailure)
    check(fake.queries == 2)

    // The read lock must keep the transport alive while a query is active.
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)
    val transport = object : FakeNativeTransport() {
        override fun query(calculationJdn: Long, targetJdn: Long): LongArray {
            entered.countDown()
            check(release.await(5, TimeUnit.SECONDS)) { "Timed out awaiting release" }
            return super.query(calculationJdn, targetJdn)
        }
    }
    val concurrentClient = SeerKotlinClient(transport)
    val queryFailure = arrayOfNulls<Throwable>(1)
    val queryThread = Thread {
        try {
            concurrentClient.queryBlocking(2461290L, 42L)
        } catch (error: Throwable) {
            queryFailure[0] = error
        }
    }
    queryThread.start()
    check(entered.await(5, TimeUnit.SECONDS)) { "Query did not enter transport" }
    val closeStarted = CountDownLatch(1)
    val closeFinished = AtomicBoolean(false)
    val closer = Thread {
        closeStarted.countDown()
        concurrentClient.close()
        closeFinished.set(true)
    }
    closer.start()
    check(closeStarted.await(5, TimeUnit.SECONDS))
    try {
        Thread.sleep(30)
        check(!closeFinished.get()) { "Transport closed during active query" }
        check(transport.closes == 0)
    } finally {
        release.countDown()
    }
    queryThread.join(5000)
    closer.join(5000)
    check(!queryThread.isAlive && !closer.isAlive)
    check(queryFailure[0] == null) { "Query failed: ${queryFailure[0]}" }
    check(closeFinished.get() && transport.closes == 1)
    println("SEER_KOTLIN_CLIENT_PURE_PASS queries, batch ordering, provenance, one-time close, in-flight safety")
}
