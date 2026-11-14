#!/usr/bin/env python3
"""Run Seer Kotlin/JNI under unprivileged Android ART shell, without an APK.

Only runs on an explicitly selected ADB device/serial. Never installs packages,
requests root, changes install policy or touches existing app data. Only its
unique directory under /data/local/tmp is created and removed.

Examples:
  python3 sdk/kotlin/tools/run_android_art_shell_jni.py --payload-dir DIR --abi arm64-v8a --verify-only
  python3 sdk/kotlin/tools/run_android_art_shell_jni.py --artifact-zip ARTIFACT.zip --abi arm64-v8a --serial SERIAL
  python3 sdk/kotlin/tools/run_android_art_shell_jni.py --artifact-zip ARTIFACT.zip --abi arm64-v8a --expected-model AUTHORIZED_PRODUCT_MODEL

An Android-shell ART PASS verifies JNI and typed Kotlin under the shell UID,
not the Android Context facade or a normally installed APK.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import shutil
import subprocess
import tempfile
import zipfile

FILES = ("smoke-dex.jar", "libseer_mobile.so",
         "libseer_mobile_kotlin_jni.so",
         "gates_100k_u16.bin", "gates_negative_100k_u16.bin")
PINNED = (*FILES, "source-commit.txt")
CLASS = "org.pastafarian.seer.kotlin.SeerAndroidAppProcessSmoke"
PASS = "SEER_ANDROID_APP_PROCESS_JNI_PASS abi=1 source="
CONCURRENCY_PASS = "SEER_ANDROID_ART_JNI_CONCURRENCY_PASS workers=4 rounds=4 batchAndSingle=true sharedContext=true"
RESET_GUARD_PASS = "SEER_ANDROID_ART_JNI_RESET_GUARD_PASS activeCallProtected=true"
MACHINES = {"arm64-v8a": 183, "x86_64": 62}

class Failure(RuntimeError): pass
class Blocked(Failure): pass

def checksum(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()

def read_payload(directory: Path | None, archive: Path | None, abi: str):
    if archive:
        with zipfile.ZipFile(archive) as z:
            if z.testzip() is not None:
                raise Failure("ARTIFACT_CRC_FAILURE")
            entries = {name: z.read(name) for name in z.namelist()
                       if not name.endswith("/")}
            prefix = abi + "/"
            members = {name[len(prefix):]: blob for name, blob in entries.items()
                       if name.startswith(prefix)}
            # GitHub upload-artifact may strip the common outer directory.
            if not members:
                members = {name: blob for name, blob in entries.items()
                           if "/" not in name}
    else:
        assert directory is not None
        members = {p.name: p.read_bytes() for p in directory.iterdir() if p.is_file()}
    required = set(PINNED) | {"SHA256SUMS", "build-info.txt"}
    if not required.issubset(members):
        raise Failure("MISSING_PAYLOAD_FILES:" + ",".join(sorted(required - set(members))))
    manifest = {}
    for line in members["SHA256SUMS"].decode("ascii").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", line)
        if not match:
            raise Failure("INVALID_MANIFEST_FORMAT")
        digest, name = match.groups()
        if name in manifest:
            raise Failure("DUPLICATE_MANIFEST_ENTRY")
        manifest[name] = digest
    if set(manifest) != set(PINNED):
        raise Failure("MANIFEST_MEMBERS_MISMATCH")
    for name, digest in manifest.items():
        if checksum(members[name]) != digest:
            raise Failure("PAYLOAD_SHA256_MISMATCH:" + name)
    commit = members["source-commit.txt"].decode("ascii").strip()
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise Failure("INVALID_SOURCE_COMMIT")
    info = members["build-info.txt"].decode("utf-8")
    if ("mode=android-art-shell-app_process" not in info or
        "platform=android-" + abi + "-api26-plus" not in info):
        raise Failure("BUILD_INFO_PLATFORM_MISMATCH")
    with zipfile.ZipFile(io.BytesIO(members["smoke-dex.jar"])) as z:
        if z.testzip() is not None or "classes.dex" not in z.namelist():
            raise Failure("INVALID_DEX_ARCHIVE")
        if len(z.read("classes.dex")) < 10000:
            raise Failure("DEX_SIZE_TOO_SMALL")
    for name in ("libseer_mobile.so", "libseer_mobile_kotlin_jni.so"):
        blob = members[name]
        if (len(blob) < 64 or blob[:6] != b"\x7fELF\x02\x01" or
            int.from_bytes(blob[18:20], "little") != MACHINES[abi]):
            raise Failure("ELF_MACHINE_MISMATCH:" + name)
    for name in FILES[3:]:
        if len(members[name]) != 200000:
            raise Failure("GATE_LENGTH_MISMATCH:" + name)
    return {name: members[name] for name in FILES}, manifest, commit

def adb_exe(explicit: str | None) -> str:
    if explicit:
        if not Path(explicit).is_file():
            raise Blocked("ADB_PATH_NOT_FOUND")
        return explicit
    possible = [
        Path(os.environ.get("LOCALAPPDATA", "")) /
            "Android" / "Sdk" / "platform-tools" / "adb.exe",
        Path.home() / "AppData" / "Local" / "Android" / "Sdk" / "platform-tools" / "adb.exe",
    ]
    return next((str(p) for p in possible if p.is_file()), None) or shutil.which("adb") or (
        _ for _ in ()).throw(Blocked("ADB_NOT_FOUND"))

def select_connected_device(adb: str) -> str:
    """Fail closed unless precisely one connected, authorized ADB device exists.

    The returned transport serial is used only to execute -s scoped commands
    and is never logged, archived or checked into the repository. A caller
    must also require an exact --expected-model match in Device.preflight.
    """
    try:
        p = subprocess.run([adb, "devices", "-l"], capture_output=True,
                           text=True, errors="replace", timeout=25)
    except subprocess.TimeoutExpired as exc:
        raise Blocked("ADB_DEVICE_ENUMERATION_TIMEOUT") from exc
    if p.returncode != 0:
        raise Blocked("ADB_DEVICE_ENUMERATION_FAILED")
    devices = []
    for raw in p.stdout.splitlines():
        line = raw.strip()
        if not line or line.startswith("List of devices attached"):
            continue
        fields = line.split()
        if len(fields) >= 2:
            devices.append((fields[0], fields[1]))
        else:
            raise Blocked("UNRECOGNIZED_ADB_DEVICE_LINE")
    if len(devices) != 1 or devices[0][1] != "device":
        raise Blocked("EXACTLY_ONE_AUTHORIZED_CONNECTED_DEVICE_REQUIRED")
    return devices[0][0]

class Device:
    def __init__(self, adb: str, serial: str, out: Path, report: dict,
                 expected_model: str | None = None):
        self.adb, self.serial, self.out, self.report = adb, serial, out, report
        self.expected_model = expected_model
        self.remote: str | None = None
        self.created = False

    def call(self, *arguments: str, timeout: int = 60,
             label: str | None = None, check: bool = True):
        try:
            p = subprocess.run([self.adb, "-s", self.serial, *arguments],
                               capture_output=True, text=True, errors="replace",
                               timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            raise Blocked("ADB_COMMAND_TIMEOUT:" + arguments[0]) from exc
        output = (p.stdout or "") + ("\n" + p.stderr if p.stderr else "")
        if label:
            (self.out / (label + ".txt")).write_text(output, encoding="utf-8")
        if check and p.returncode != 0:
            raise Failure("ADB_COMMAND_FAILED:" + arguments[0] + ":" + output[-800:])
        return p.returncode, output

    def preflight(self, abi: str):
        p = subprocess.run([self.adb, "devices"], capture_output=True, text=True,
                           errors="replace", timeout=25)
        if p.returncode != 0 or not re.search(
                r"(?m)^" + re.escape(self.serial) + r"\s+device\s*$", p.stdout):
            raise Blocked("CHOSEN_DEVICE_NOT_CONNECTED")
        if self.expected_model is not None:
            qemu = self.call("shell", "getprop", "ro.kernel.qemu")[1].strip()
            if qemu == "1":
                raise Blocked("EXPECTED_PHYSICAL_DEVICE_IS_EMULATOR")
            model = self.call("shell", "getprop", "ro.product.model")[1].strip()
            vendor_model = self.call("shell", "getprop", "ro.product.vendor.model")[1].strip()
            if self.expected_model not in (model, vendor_model):
                raise Blocked("AUTHORIZED_PRODUCT_MODEL_MISMATCH")
            self.report["authorized_product_model_matched"] = True
        api = int(self.call("shell", "getprop", "ro.build.version.sdk")[1].strip())
        abis = self.call("shell", "getprop", "ro.product.cpu.abilist")[1].strip().split(",")
        self.report["device"] = {"api": api, "primary_abi": abis[0] if abis else ""}
        if api < 26 or abi not in abis:
            raise Blocked("WRONG_DEVICE_API_OR_ABI")
        code, app_process = self.call("shell", "ls", "/system/bin/app_process",
                                      check=False)
        if code != 0:
            raise Blocked("ANDROID_ART_APP_PROCESS_UNAVAILABLE")
        print("SEER_ANDROID_ART_DEVICE_PREFLIGHT_PASS abi=" + abi, flush=True)

    def execute(self, files: dict[str, bytes], hashes: dict, commit: str, abi: str):
        self.remote = "/data/local/tmp/seer_jni_qa_" + secrets.token_hex(6)
        if self.call("shell", "ls", "-ld", self.remote, check=False)[0] == 0:
            raise Blocked("TEMP_DIRECTORY_COLLISION")
        self.call("shell", "mkdir", self.remote)
        self.created = True
        for name, blob in files.items():
            source = self.out / name
            source.write_bytes(blob)
            self.call("push", str(source), self.remote + "/" + name, timeout=90)
            code, result = self.call("shell", "sha256sum", self.remote + "/" + name,
                                     check=False)
            if code or not result.split() or result.split()[0].lower() != hashes[name]:
                raise Failure("ON_DEVICE_SHA256_MISMATCH:" + name)
        print("SEER_ANDROID_ART_ON_DEVICE_HASH_PASS files=5", flush=True)
        remote = shlex.quote(self.remote)
        command = (
            "cd " + remote +
            " && export CLASSPATH=" + remote + "/smoke-dex.jar" +
            " && export LD_LIBRARY_PATH=" + remote +
            " && app_process /system/bin " + CLASS + " " +
            " ".join([remote,
                      remote + "/gates_100k_u16.bin",
                      remote + "/gates_negative_100k_u16.bin",
                      commit])
        )
        rc, output = self.call("shell", command, check=False,
                               timeout=180, label="art-jni-execution")
        if (rc != 0 or (PASS + commit) not in output or
                CONCURRENCY_PASS not in output or RESET_GUARD_PASS not in output):
            if "Permission denied" in output or "avc: denied" in output:
                raise Blocked("ART_SHELL_EXECUTION_RESTRICTED:" + output[-700:])
            raise Failure("ART_JNI_RUNTIME_FAILED rc=" + str(rc) + ":" + output[-1400:])
        print(RESET_GUARD_PASS, flush=True)
        print("SEER_ANDROID_ART_JNI_DEVICE_PASS abi=" + abi + " source=" + commit,
              flush=True)
        self.report["jni_result"] = "PASS"

    def cleanup(self):
        if not self.created:
            return True
        try:
            for name in FILES:
                self.call("shell", "rm", "-f", self.remote + "/" + name, check=False)
            code, out = self.call("shell", "rmdir", self.remote,
                                  check=False, label="cleanup")
            if code == 0:
                print("SEER_ANDROID_ART_DEVICE_CLEANUP_PASS", flush=True)
                return True
            self.report["cleanup_error"] = out[-500:]
        except Exception as exc:
            self.report["cleanup_error"] = str(exc)
        print("SEER_ANDROID_ART_DEVICE_CLEANUP_FAIL", flush=True)
        return False

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--payload-dir", type=Path)
    group.add_argument("--artifact-zip", type=Path)
    parser.add_argument("--abi", choices=tuple(MACHINES), required=True)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--serial", help="Explicitly selected authorized ADB device")
    parser.add_argument("--expected-model",
                        help="Exact authorized physical product model; when no serial is supplied, "
                             "selects only if exactly one ADB device is connected")
    parser.add_argument("--adb", help="Absolute or PATH-discovered ADB executable")
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if not args.verify_only and not (args.serial or args.expected_model):
        parser.error("--serial or --expected-model required for real-device execution")
    if args.expected_model is not None and (
            not args.expected_model.strip() or len(args.expected_model) > 100):
        parser.error("--expected-model must contain 1..100 nonblank characters")
    try:
        files, manifest, commit = read_payload(args.payload_dir, args.artifact_zip, args.abi)
    except (Failure, OSError, ValueError, zipfile.BadZipFile) as exc:
        print("SEER_ANDROID_ART_PAYLOAD_FAIL:" + str(exc), flush=True)
        return 1
    print("SEER_ANDROID_ART_PAYLOAD_VERIFIED abi=" + args.abi + " source=" + commit,
          flush=True)
    if args.verify_only:
        return 0
    out = args.output_dir or (
        Path.cwd() / ("seer-art-jni-evidence-" + dt.datetime.now(
            dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")))
    out.mkdir(parents=True, exist_ok=False)
    report = {"source_commit": commit, "abi": args.abi,
              "status": "STARTED", "jni_result": "NOT_RUN",
              "app_installation": False}
    device = None
    try:
        adb = adb_exe(args.adb)
        serial = args.serial or select_connected_device(adb)
        device = Device(adb, serial, out, report, expected_model=args.expected_model)
        device.preflight(args.abi)
        device.execute(files, manifest, commit, args.abi)
        report["status"] = "PASS"
    except Blocked as exc:
        report["status"] = "BLOCKED"
        report["reason"] = str(exc)
        print("SEER_ANDROID_ART_JNI_BLOCKED:" + str(exc), flush=True)
    except Exception as exc:
        report["status"] = "FAIL"
        report["reason"] = str(exc)
        print("SEER_ANDROID_ART_JNI_FAIL:" + str(exc), flush=True)
    finally:
        if device and not device.cleanup():
            report["status"] = "FAIL_CLEANUP"
        report["finished_at_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
        (out / "report.json").write_text(json.dumps(report, indent=2) + "\n",
                                         encoding="utf-8")
        for name in FILES:
            (out / name).unlink(missing_ok=True)
        print("SEER_ANDROID_ART_JNI_STATUS=" + report["status"], flush=True)
        print("SEER_ANDROID_ART_JNI_EVIDENCE=" + str(out), flush=True)
    return 0 if report["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
