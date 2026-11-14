#!/usr/bin/env bash
# Real, bounded emulator smoke for the APK consuming the Seer Kotlin AAR.
set -euo pipefail
if [[ "$#" != 3 ]]; then
  echo "usage: $0 CONSUMER_DEBUG_APK CONSUMER_R8_RELEASE_APK EVIDENCE_DIRECTORY" >&2
  exit 2
fi
DEBUG_APK="$(realpath "$1")"
RELEASE_APK="$(realpath "$2")"
OUT="$(realpath -m "$3")"
mkdir -p "$OUT"
test -s "$DEBUG_APK"
test -s "$RELEASE_APK"
: "${ANDROID_SDK_ROOT:?ANDROID_SDK_ROOT must reference CI Android SDK}"
SDKMANAGER="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$ANDROID_SDK_ROOT/emulator/emulator"
ADB="$ANDROID_SDK_ROOT/platform-tools/adb"
AVD_NAME="seer_sdk_kotlin_ci_35"

"$SDKMANAGER" "emulator" "platform-tools" "system-images;android-35;google_apis;x86_64"
# Explicit AVD_HOME keeps avdmanager and the emulator in the same isolated
# directory. A Bash here-string avoids pipefail/SIGPIPE false failures when
# avdmanager does not consume its optional custom-hardware answer.
# AVD image data can be several GB. Never put it in the evidence/artifact
# directory; keep the emulator profile in ephemeral runner storage.
export ANDROID_AVD_HOME="${RUNNER_TEMP:-/tmp}/seer-sdk-kotlin-avds"
mkdir -p "$ANDROID_AVD_HOME"
echo "SEER_EMULATOR_STAGE=avd_create"
if ! "$AVDMANAGER" create avd --force --name "$AVD_NAME" \
    --package "system-images;android-35;google_apis;x86_64" \
    --device pixel_5 <<<"no" > "$OUT/avd-create.log" 2>&1; then
  cat "$OUT/avd-create.log" >&2
  echo "SEER_ANDROID_AVD_CREATE_FAIL" >&2
  exit 1
fi
echo "SEER_EMULATOR_STAGE=avd_list"
"$EMULATOR" -list-avds > "$OUT/avd-list.txt" 2>&1 || {
  cat "$OUT/avd-list.txt" >&2
  echo "SEER_ANDROID_AVD_LIST_FAIL" >&2
  exit 1
}
if ! grep -Fx "$AVD_NAME" "$OUT/avd-list.txt"; then
  echo "AVD creation reported success but emulator does not list it" >&2
  cat "$OUT/avd-create.log" "$OUT/avd-list.txt" >&2
  ls -la "$ANDROID_AVD_HOME" >&2 || true
  echo "SEER_ANDROID_AVD_UNLISTED_FAIL" >&2
  exit 1
fi

ACCEL=off
# Hosted CI runners may expose /dev/kvm but not grant the runner user
# permission to access it. Enable KVM on this disposable runner only:
# full software x86 emulation can otherwise take longer than the smoke gate.
if [[ -c /dev/kvm ]]; then
  if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
    sudo chmod a+rw /dev/kvm
  fi
  if [[ -r /dev/kvm && -w /dev/kvm ]]; then ACCEL=on; fi
fi
if [[ "$ACCEL" == off ]]; then
  echo "SEER_EMULATOR_KVM_UNAVAILABLE software fallback" >&2
else
  echo "SEER_EMULATOR_KVM_ENABLED"
fi
{
  echo "Host=$(uname -a)"
  echo "Acceleration=$ACCEL"
  "$EMULATOR" -version > "$OUT/emulator-version.txt" 2>&1
  sed -n '1,3p' "$OUT/emulator-version.txt"
  sha256sum "$DEBUG_APK" "$RELEASE_APK"
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

run_variant() {
  local variant="$1"
  local apk="$2"
  local prefix="$OUT/$variant"
  local log="$prefix-logcat.txt"
  echo "SEER_ANDROID_VARIANT_STAGE=$variant"
  # Force a clean new application install for EACH variant, so the R8 release
  # cannot reuse the debug variant's already verified and staged Gate files.
  "$ADB" uninstall org.pastafarian.seer.kotlin.smoke \
    > "$prefix-uninstall.txt" 2>&1 || true
  "$ADB" install -r "$apk" > "$prefix-install.txt"
  "$ADB" logcat -c
  "$ADB" shell am start \
    -n org.pastafarian.seer.kotlin.smoke/.SmokeActivity \
    > "$prefix-start.txt"

  local verdict=""
  for attempt in $(seq 1 90); do
    "$ADB" logcat -d -v brief -s 'SeerKotlinSmoke:I' '*:S' \
      > "$log" 2>&1 || true
    if grep -F 'SEER_KOTLIN_ANDROID_SMOKE_FAIL' "$log"; then
      echo "SEER_KOTLIN_ANDROID_VARIANT_FAIL $variant application reported failure" >&2
      return 1
    fi
    if grep -F 'SEER_KOTLIN_ANDROID_SMOKE_PASS' "$log"; then
      verdict=PASS
      break
    fi
    sleep 4
  done
  if [[ "$verdict" != PASS ]]; then
    echo "SEER_KOTLIN_ANDROID_VARIANT_FAIL $variant no verdict in bounded polling" >&2
    return 1
  fi
  if ! grep -F 'SEER_KOTLIN_ANDROID_UI_THREAD_GUARD_PASS' "$log"; then
    echo "SEER_KOTLIN_ANDROID_VARIANT_FAIL $variant missing UI-thread guard" >&2
    return 1
  fi
  if ! grep -F 'SEER_KOTLIN_ANDROID_GATE_RECOVERY_PASS' "$log"; then
    echo "SEER_KOTLIN_ANDROID_VARIANT_FAIL $variant missing Gate self-healing verdict" >&2
    return 1
  fi
  echo "SEER_KOTLIN_ANDROID_VARIANT_PASS variant=$variant JNI=real R8=$([[ "$variant" == release ]] && echo yes || echo no)"
}
run_variant debug "$DEBUG_APK"
run_variant release "$RELEASE_APK"
echo "SEER_KOTLIN_ANDROID_EMULATOR_PASS abi=x86_64 sdk=35 JNI=real Gates=verified variants=debug,release"
