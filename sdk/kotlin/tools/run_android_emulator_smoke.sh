#!/usr/bin/env bash
# Real, bounded emulator smoke for the APK consuming the Seer Kotlin AAR.
set -euo pipefail
if [[ "$#" != 2 ]]; then
  echo "usage: $0 CONSUMER_DEBUG_APK EVIDENCE_DIRECTORY" >&2
  exit 2
fi
APK="$(realpath "$1")"
OUT="$(realpath -m "$2")"
mkdir -p "$OUT"
test -s "$APK"
: "${ANDROID_SDK_ROOT:?ANDROID_SDK_ROOT must reference CI Android SDK}"
SDKMANAGER="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$ANDROID_SDK_ROOT/emulator/emulator"
ADB="$ANDROID_SDK_ROOT/platform-tools/adb"
AVD_NAME="seer_sdk_kotlin_ci_35"

"$SDKMANAGER" "emulator" "platform-tools" "system-images;android-35;google_apis;x86_64"
printf 'no\n' | "$AVDMANAGER" create avd --force --name "$AVD_NAME" \
  --package "system-images;android-35;google_apis;x86_64" \
  --device pixel_5 > "$OUT/avd-create.log" 2>&1
"$EMULATOR" -list-avds | grep -Fx "$AVD_NAME"

ACCEL=off
if [[ -r /dev/kvm && -w /dev/kvm ]]; then ACCEL=on; fi
{
  echo "Host=$(uname -a)"
  echo "Acceleration=$ACCEL"
  "$EMULATOR" -version | head -n 3
  sha256sum "$APK"
} > "$OUT/environment.txt"
"$EMULATOR" -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim \
  -no-snapshot -wipe-data -gpu swiftshader_indirect \
  -memory 3072 -partition-size 2048 -accel "$ACCEL" \
  > "$OUT/emulator.log" 2>&1 &
EMULATOR_PID=$!
cleanup() {
  "$ADB" logcat -d -v time -s 'SeerKotlinSmoke:I' '*:S' \
    > "$OUT/final-seer-logcat.txt" 2>&1 || true
  "$ADB" emu kill >/dev/null 2>&1 || true
  kill "$EMULATOR_PID" >/dev/null 2>&1 || true
  wait "$EMULATOR_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

timeout 480 "$ADB" wait-for-device
booted=0
for attempt in $(seq 1 150); do
  if [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then
    booted=1
    break
  fi
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo "Emulator terminated before Android boot" >&2
    exit 1
  fi
  sleep 3
done
if [[ "$booted" != 1 ]]; then
  echo "Android emulator did not boot" >&2
  exit 1
fi

"$ADB" shell getprop ro.build.version.sdk | tr -d '\r' > "$OUT/device-api.txt"
"$ADB" shell getprop ro.product.cpu.abi | tr -d '\r' > "$OUT/device-abi.txt"
grep -Fx '35' "$OUT/device-api.txt"
grep -Fx 'x86_64' "$OUT/device-abi.txt"

"$ADB" install -r "$APK" > "$OUT/install.log"
"$ADB" logcat -c
"$ADB" shell am start \
  -n org.pastafarian.seer.kotlin.smoke/.SmokeActivity \
  > "$OUT/activity-start.log"
verdict=""
for attempt in $(seq 1 90); do
  "$ADB" logcat -d -v brief -s 'SeerKotlinSmoke:I' '*:S' \
    > "$OUT/seer-smoke-logcat.txt" 2>&1 || true
  if grep -F 'SEER_KOTLIN_ANDROID_SMOKE_FAIL' "$OUT/seer-smoke-logcat.txt"; then
    echo "SEER_KOTLIN_ANDROID_EMULATOR_FAIL application reported failure" >&2
    exit 1
  fi
  if grep -F 'SEER_KOTLIN_ANDROID_SMOKE_PASS' "$OUT/seer-smoke-logcat.txt"; then
    verdict=PASS
    break
  fi
  sleep 4
done
if [[ "$verdict" != PASS ]]; then
  echo "SEER_KOTLIN_ANDROID_EMULATOR_FAIL no verdict in bounded polling" >&2
  exit 1
fi
echo "SEER_KOTLIN_ANDROID_EMULATOR_PASS abi=x86_64 sdk=35 JNI=real Gates=verified"
