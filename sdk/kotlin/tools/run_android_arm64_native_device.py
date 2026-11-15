#!/usr/bin/env python3
"""Offline, no-install Seer C ABI test on a chosen physical Android ARM64 device.

Examples:
 python tools/run_android_arm64_native_device.py --payload-dir DIR --verify-only
 python tools/run_android_arm64_native_device.py --artifact-zip ARTIFACT.zip --verify-only
 python tools/run_android_arm64_native_device.py --artifact-zip ARTIFACT.zip --serial SERIAL

The caller chooses the exact ADB serial. This tool never installs APKs, changes
phone security settings, calls GitHub APIs or modifies any existing app. It
creates a unique directory beneath /data/local/tmp, uses only this directory,
and removes only its four own files. An Android shell restriction is reported as
BLOCKED, never bypassed.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import tempfile
import zipfile

FILES = ("seer_arm64_device_smoke", "libseer_mobile.so",
         "gates_100k_u16.bin", "gates_negative_100k_u16.bin")
HASHED = (*FILES, "source-commit.txt")
PASS_PREFIX = "SEER_ARM64_ANDROID_NATIVE_PASS abi=1 source="

class SmokeError(Exception):
    pass

class SmokeBlocked(SmokeError):
    pass


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def load_payload(directory: pathlib.Path | None, archive: pathlib.Path | None):
    if archive:
        with zipfile.ZipFile(archive) as source:
            if source.testzip() is not None:
                raise SmokeError("PAYLOAD_ZIP_CRC_ERROR")
            members = {name: source.read(name) for name in source.namelist()}
    else:
        assert directory
        members = {p.name: p.read_bytes() for p in directory.iterdir() if p.is_file()}
    required = set(HASHED) | {"SHA256SUMS", "build-info.txt", "dependencies.txt"}
    if not required.issubset(set(members)):
        raise SmokeError("MISSING_PAYLOAD_MEMBERS:" + ",".join(sorted(required-set(members))))
    manifest = {}
    for row in members["SHA256SUMS"].decode("ascii").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", row)
        if not match:
            raise SmokeError("INVALID_SHA256SUMS_FORMAT")
        h, name = match.groups()
        if name in manifest:
            raise SmokeError("DUPLICATE_SHA256SUMS_NAME")
        manifest[name] = h
    if set(manifest) != set(HASHED):
        raise SmokeError("SHA256SUMS_ENTRIES_MISMATCH")
    for name, h in manifest.items():
        if sha256(members[name]) != h:
            raise SmokeError("SHA256_MISMATCH:" + name)
    commit = members["source-commit.txt"].decode("ascii").strip()
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise SmokeError("INVALID_SOURCE_COMMIT")
    meta = members["build-info.txt"].decode("utf-8")
    if "abi=1\n" not in meta or "platform=android-arm64-api26-plus\n" not in meta:
        raise SmokeError("BUILD_INFO_MISMATCH")
    for name in ("seer_arm64_device_smoke", "libseer_mobile.so"):
        blob = members[name]
        if (len(blob) < 64 or blob[:6] != b"\x7fELF\x02\x01" or
                int.from_bytes(blob[18:20], "little") != 183):
            raise SmokeError("NOT_AARCH64_ELF64:" + name)
    needed = members["dependencies.txt"].decode("utf-8")
    if "Shared library: [libseer_mobile.so]" not in needed:
        raise SmokeError("EXECUTABLE_NOT_LINKED_TO_CANONICAL_LIB")
    return {name: members[name] for name in FILES}, manifest, commit


def locate_adb(explicit: str | None):
    if explicit:
        exe = pathlib.Path(explicit)
        if not exe.is_file():
            raise SmokeBlocked("ADB_EXE_NOT_FOUND")
        return str(exe)
    possible = [pathlib.Path(os.environ.get("LOCALAPPDATA", "")) /
                "Android" / "Sdk" / "platform-tools" / "adb.exe",
                pathlib.Path.home()/"AppData"/"Local"/"Android"/"Sdk"/"platform-tools"/"adb.exe"]
    return next((str(p) for p in possible if p.is_file()), None) or shutil.which("adb") or (_ for _ in ()).throw(SmokeBlocked("ADB_NOT_FOUND"))


class Device:
    def __init__(self, adb: str, serial: str, output: pathlib.Path, report: dict):
        self.adb, self.serial, self.output, self.report = adb, serial, output, report
        self.remote = None
        self.created = False

    def run(self, *args: str, label: str | None = None,
            timeout: int = 45, check: bool = True):
        try:
            proc = subprocess.run([self.adb, "-s", self.serial, *args],
                capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=timeout)
        except subprocess.TimeoutExpired as error:
            raise SmokeBlocked("ADB_TIMEOUT:" + " ".join(args[:3])) from error
        output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
        if label:
            (self.output / (label + ".txt")).write_text(output, encoding="utf-8")
        if check and proc.returncode:
            raise SmokeError("ADB_EXIT_%d:%s:%s" % (proc.returncode, " ".join(args[:3]), output[-500:]))
        return proc.returncode, output

    def preflight(self, required_package: str | None):
        proc = subprocess.run([self.adb, "devices"], capture_output=True,
            encoding="utf-8", errors="replace", text=True, timeout=30)
        (self.output / "adb-devices.txt").write_text(proc.stdout + proc.stderr, encoding="utf-8")
        if not re.search(r"(?m)^"+re.escape(self.serial)+r"\s+device\s*$", proc.stdout):
            raise SmokeBlocked("CHOSEN_ADB_DEVICE_UNAVAILABLE")
        api = int(self.run("shell", "getprop", "ro.build.version.sdk")[1].strip())
        abi = self.run("shell", "getprop", "ro.product.cpu.abilist")[1].strip()
        self.report["device"] = {"api": api, "abi": abi}
        if api < 26 or "arm64-v8a" not in abi.split(","):
            raise SmokeBlocked("NOT_ANDROID_ARM64_API26_PLUS")
        if required_package:
            code, listed = self.run("shell", "pm", "list", "packages", required_package,
                                    check=False)
            if code or ("package:" + required_package) not in listed.splitlines():
                raise SmokeBlocked("REQUIRED_EXISTING_PACKAGE_MISSING")
        print("SEER_ARM64_NATIVE_DEVICE_PREFLIGHT_PASS api=%d abi=%s" % (api, abi), flush=True)

    def execute(self, payload: dict[str, bytes], hashes: dict[str, str], commit: str):
        self.remote = "/data/local/tmp/seer_qa_" + secrets.token_hex(6)
        self.report["remote_directory"] = self.remote
        code, _ = self.run("shell", "ls", "-ld", self.remote, check=False)
        if code == 0:
            raise SmokeBlocked("UNEXPECTED_REMOTE_DIR_EXISTS")
        self.run("shell", "mkdir", self.remote)
        self.created = True
        for name, blob in payload.items():
            source = self.output / name
            source.write_bytes(blob)
            self.run("push", str(source), self.remote + "/" + name,
                     timeout=90, label="push-" + name)
            self.run("shell", "chmod", "700" if name == FILES[0] else "600",
                     self.remote + "/" + name)
            code, result = self.run("shell", "sha256sum", self.remote + "/" + name,
                                    label="sha256-" + name, check=False)
            if code or not result.split() or result.split()[0].lower() != hashes[name]:
                raise SmokeError("REMOTE_SHA256_MISMATCH:" + name)
        print("SEER_ARM64_NATIVE_TRANSFER_VERIFIED files=4", flush=True)
        cmd = ("cd " + self.remote + " && LD_LIBRARY_PATH=. ./seer_arm64_device_smoke " +
               "gates_100k_u16.bin gates_negative_100k_u16.bin " + commit)
        code, result = self.run("shell", cmd, timeout=180, label="device-result", check=False)
        if code or (PASS_PREFIX + commit) not in result:
            if "Permission denied" in result or "avc: denied" in result:
                raise SmokeBlocked("PHONE_NATIVE_EXECUTION_DENIED:" + result[-450:])
            raise SmokeError("PHONE_NATIVE_CHECK_FAILED:" + result[-1000:])
        print("SEER_ARM64_ANDROID_NATIVE_PHYSICAL_PASS source=" + commit, flush=True)
        self.report["native_result"] = "PASS"

    def cleanup(self):
        if not self.created:
            return True
        try:
            for name in FILES:
                self.run("shell", "rm", "-f", self.remote + "/" + name,
                         check=False, timeout=30)
            code, result = self.run("shell", "rmdir", self.remote,
                                    check=False, timeout=30, label="cleanup")
            if code == 0:
                self.created = False
                print("SEER_ARM64_NATIVE_DEVICE_CLEANUP_PASS", flush=True)
                return True
            self.report["cleanup_error"] = result[-400:]
        except Exception as error:
            self.report["cleanup_error"] = str(error)
        print("SEER_ARM64_NATIVE_DEVICE_CLEANUP_FAIL", flush=True)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--payload-dir", type=pathlib.Path)
    source.add_argument("--artifact-zip", type=pathlib.Path)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--serial", help="exact authorized adb serial (required for physical run)")
    parser.add_argument("--adb", help="explicit adb binary; otherwise SDK/PATH lookup")
    parser.add_argument("--require-existing-package", help="optional other package whose presence is required; never modified")
    parser.add_argument("--output-dir", type=pathlib.Path)
    args = parser.parse_args()
    if not args.verify_only and not args.serial:
        parser.error("--serial is required unless --verify-only is set")
    try:
        payload, manifest, commit = load_payload(args.payload_dir, args.artifact_zip)
    except (OSError, ValueError, zipfile.BadZipFile, SmokeError) as error:
        print("SEER_ARM64_ANDROID_NATIVE_PAYLOAD_FAIL:" + str(error), flush=True)
        return 1
    print("SEER_ARM64_ANDROID_NATIVE_PAYLOAD_VERIFIED source=" + commit, flush=True)
    if args.verify_only:
        return 0

    output = args.output_dir or pathlib.Path.cwd() / (
        "seer-arm64-device-evidence-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    output.mkdir(parents=True, exist_ok=False)
    report = {"source_commit": commit, "status": "STARTED", "native_result": "NOT_RUN"}
    device = None
    try:
        adb = locate_adb(args.adb)
        device = Device(adb, args.serial, output, report)
        device.preflight(args.require_existing_package)
        device.execute(payload, manifest, commit)
        report["status"] = "PASS"
    except SmokeBlocked as error:
        report["status"] = "BLOCKED"
        report["reason"] = str(error)
        print("SEER_ARM64_ANDROID_NATIVE_PHYSICAL_BLOCKED:" + str(error), flush=True)
    except Exception as error:
        report["status"] = "FAIL"
        report["reason"] = str(error)
        print("SEER_ARM64_ANDROID_NATIVE_PHYSICAL_FAIL:" + str(error), flush=True)
    finally:
        if device and not device.cleanup():
            report["status"] = "FAIL_CLEANUP"
        report["end_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        for name in FILES:
            (output / name).unlink(missing_ok=True)
        print("SEER_ARM64_ANDROID_NATIVE_PHYSICAL_STATUS=" + report["status"], flush=True)
        print("SEER_ARM64_ANDROID_NATIVE_EVIDENCE=" + str(output), flush=True)
    return 0 if report["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
