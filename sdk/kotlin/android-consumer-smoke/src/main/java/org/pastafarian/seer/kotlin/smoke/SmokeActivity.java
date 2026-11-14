package org.pastafarian.seer.kotlin.smoke;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;

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
            Log.i("SeerKotlinSmoke", "SEER_KOTLIN_ANDROID_UI_THREAD_GUARD_PASS");
        }
        Thread worker = new Thread(this::runSmoke, "seer-kotlin-android-smoke");
        worker.start();
    }

    private void runSmoke() {
        String verdict;
        try (SeerAndroidClient client = SeerAndroid.INSTANCE.open(
                getApplicationContext(), 2, 8)) {
            long calculation = -13_334_246L;
            SeerRecord single = client.queryBlocking(calculation, calculation);
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
