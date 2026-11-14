package org.pastafarian.seer.kotlin.smoke;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;

import org.pastafarian.seer.kotlin.SeerCancellation;
import org.pastafarian.seer.kotlin.SeerNativeException;
import org.pastafarian.seer.kotlin.SeerRecord;
import org.pastafarian.seer.kotlin.SeerStatus;
import org.pastafarian.seer.kotlin.android.SeerAndroid;
import org.pastafarian.seer.kotlin.android.SeerAndroidClient;

/**
 * Minimal consumer of the packaged Android AAR. Java source deliberately
 * verifies that a normal Android app can link the Kotlin public API without
 * importing Seer's raw C ABI, implementation sources or test fixtures.
 */
public final class SmokeActivity extends Activity {
    private TextView status;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        status = new TextView(this);
        status.setText("Seer Kotlin SDK: checking Native ABI");
        setContentView(status);
        // Verify the production Android facade refuses to initialize its
        // blocking native backend on the actual UI thread. This does not
        // merely inspect Looper constants; it calls the real SDK entrypoint.
        try {
            SeerAndroid.INSTANCE.open(getApplicationContext(), 2, 8);
            String failure = "SEER_KOTLIN_ANDROID_SMOKE_FAIL: UI-thread Native open was permitted";
            Log.e("SeerKotlinSmoke", failure);
            status.setText(failure);
            return;
        } catch (IllegalStateException expected) {
            // A generic IllegalStateException caused by a different bug is
            // NOT proof that the main-thread safety guard executed.
            if (!"Blocking Seer operations must run off the Android UI thread"
                    .equals(expected.getMessage())) {
                String failure = "SEER_KOTLIN_ANDROID_SMOKE_FAIL: unexpected UI exception: "
                        + expected.getMessage();
                Log.e("SeerKotlinSmoke", failure, expected);
                status.setText(failure);
                return;
            }
            Log.i("SeerKotlinSmoke", "SEER_KOTLIN_ANDROID_UI_THREAD_GUARD_PASS");
        }
        Thread worker = new Thread(this::runSmoke, "seer-kotlin-android-smoke");
        worker.start();
    }

    /**
     * Validates both Gate files' on-disk recovery, without using hidden or
     * privileged Android APIs. Each file is modified *after* the previous
     * Native context has closed, then the SDK must rewrite the exact original
     * authenticated payload and return the unchanged canonical result.
     */
    private void assertGateSelfHealing(SeerRecord canonical) throws Exception {
        final File directory = new File(
                getApplicationContext().getNoBackupFilesDir(), "seer-kotlin");
        final String[] files = {
                "gates_100k_u16.bin",
                "gates_negative_100k_u16.bin"
        };
        for (String filename : files) {
            File gate = new File(directory, filename);
            if (!gate.isFile() || gate.length() != 200_000L) {
                throw new IllegalStateException("Staged Gate missing or wrong length: " + filename);
            }
            byte[] original = sha256(gate);
            try (RandomAccessFile raf = new RandomAccessFile(gate, "rw")) {
                raf.seek(4096L);
                int oldByte = raf.read();
                if (oldByte < 0) throw new IllegalStateException("Gate read failed");
                raf.seek(4096L);
                raf.write(oldByte ^ 0xFF); // Same size, different SHA-256.
                raf.getFD().sync();
            }
            if (Arrays.equals(original, sha256(gate))) {
                throw new IllegalStateException("Gate mutation failed: " + filename);
            }
            try (SeerAndroidClient reopened = SeerAndroid.INSTANCE.open(
                    getApplicationContext(), 2, 8)) {
                if (!Arrays.equals(original, sha256(gate))) {
                    throw new IllegalStateException("Gate not repaired byte-exactly: " + filename);
                }
                if (!canonical.equals(reopened.queryBlocking(-13_334_246L, -13_334_246L))) {
                    throw new IllegalStateException("Seer result changed after Gate repair");
                }
            }
        }
    }

    private static byte[] sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) {
                digest.update(buffer, 0, count);
            }
        }
        return digest.digest();
    }

    private void runSmoke() {
        String verdict;
        try {
            SeerRecord canonical;
            try (SeerAndroidClient client = SeerAndroid.INSTANCE.open(
                getApplicationContext(), 2, 8)) {
            long calculation = -13_334_246L;
            SeerRecord single = client.queryBlocking(calculation, calculation);
            canonical = single;
            long[] targets = {calculation, calculation + 1L, calculation + 2L};
            List<SeerRecord> batch = client.queryBatchBlocking(calculation, targets);
            if (single.getTargetJdn() != calculation ||
                    batch.size() != targets.length ||
                    !batch.get(0).equals(single)) {
                throw new IllegalStateException("Seer single/batch record mismatch");
            }
            for (int i = 0; i < targets.length; i++) {
                if (batch.get(i).getTargetJdn() != targets[i]) {
                    throw new IllegalStateException("Seer target ordering mismatch: " + i);
                }
            }
            // SeerAndroid.open() already verifies ABI 1 and source provenance.
            if (client.provenance().getSourceCommit().length() != 40) {
                throw new IllegalStateException("Missing pinned Native provenance");
            }
            try {
                client.queryBlocking(Long.MIN_VALUE, calculation);
                throw new IllegalStateException("Invalid calculation JDN was accepted");
            } catch (SeerNativeException error) {
                if (error.getStatus() != SeerStatus.CALCULATION_OUT_OF_DOMAIN) throw error;
            }
            if (!single.equals(client.queryBlocking(calculation, calculation))) {
                throw new IllegalStateException("Native context unusable after domain error");
            }
            try (SeerCancellation cancellation = client.newCancellation()) {
                cancellation.cancel();
                try {
                    client.queryBlocking(calculation, calculation, cancellation);
                    throw new IllegalStateException("Native cancellation was not observed");
                } catch (SeerNativeException error) {
                    if (error.getStatus() != SeerStatus.CANCELLED) throw error;
                }
                cancellation.reset();
                if (!single.equals(client.queryBlocking(calculation, calculation, cancellation))) {
                    throw new IllegalStateException("Native cancellation reset mismatch");
                }
            }
            } // Close original native context before corrupting any Gate file.
            assertGateSelfHealing(canonical);
            Log.i("SeerKotlinSmoke", "SEER_KOTLIN_ANDROID_GATE_RECOVERY_PASS");
            verdict = "SEER_KOTLIN_ANDROID_SMOKE_PASS";
        } catch (Throwable error) {
            verdict = "SEER_KOTLIN_ANDROID_SMOKE_FAIL: "
                    + error.getClass().getSimpleName() + ": " + error.getMessage();
        }
        final String output = verdict;
        if (output.startsWith("SEER_KOTLIN_ANDROID_SMOKE_PASS")) {
            Log.i("SeerKotlinSmoke", output);
        } else {
            Log.e("SeerKotlinSmoke", output);
        }
        runOnUiThread(() -> status.setText(output));
    }
}
