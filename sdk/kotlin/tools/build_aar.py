#!/usr/bin/env python3
"""Assemble an unreleased, reproducible Android AAR for the Seer Kotlin SDK.

The Kotlin classes and canonical Native .so files MUST have already compiled.
No network, compiler, date converter or Android phone is used by this packager.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

ABIS = ("arm64-v8a", "x86_64")
LIBS = ("libseer_mobile.so", "libseer_mobile_kotlin_jni.so")
GATES = {
    "gates_100k_u16.bin": "4d45f05acc6eb4dee6e53757a8c1f94da2f3de0fe4d4659b0745f15e05b147a8",
    "gates_negative_100k_u16.bin": "40bfbd7d76209c258fb7d4739f1ef9b10ac8bb38eb4f26690c1048aee0e4f884",
}
MANIFEST = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
    'package="org.pastafarian.seer.kotlin">\n'
    '  <uses-sdk android:minSdkVersion="26" />\n'
    '</manifest>\n'
).encode()
META = (
    "aarFormatVersion=1.0\n"
    "aarMetadataVersion=1.0\n"
    "minCompileSdk=26\n"
    "minAgpVersion=7.0.0\n"
).encode()
R8 = (
    "# JNI symbol names are fixed in seer_kotlin_jni.cpp.\n"
    "-keep class org.pastafarian.seer.kotlin.SeerKotlinJni { *; }\n"
).encode()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_file(path: Path) -> bytes:
    if not path.is_file():
        raise ValueError(f"Missing input: {path}")
    return path.read_bytes()


def info(name: str) -> zipfile.ZipInfo:
    item = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    item.compress_type = zipfile.ZIP_DEFLATED
    item.external_attr = 0o644 << 16
    item.create_system = 3
    return item


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classes-jar", required=True, type=Path)
    parser.add_argument("--native-root", required=True, type=Path)
    parser.add_argument("--gates-root", required=True, type=Path)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--package-version", default="0.2.5")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--manifest-out", type=Path)
    args = parser.parse_args()

    if not re.fullmatch("[0-9a-f]{40}", args.source_commit):
        parser.error("--source-commit must be the exact 40-character Git checkout SHA")
    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}", args.package_version):
        parser.error("invalid --package-version")

    jar = require_file(args.classes_jar)
    with zipfile.ZipFile(io.BytesIO(jar)) as classes:
        names = set(classes.namelist())
        required = {
            "org/pastafarian/seer/kotlin/SeerMobileWire.class",
            "org/pastafarian/seer/kotlin/SeerKotlinClient.class",
            "org/pastafarian/seer/kotlin/SeerJniTransport.class",
            "org/pastafarian/seer/kotlin/android/SeerAndroid.class",
            "org/pastafarian/seer/kotlin/android/SeerAndroidClient.class",
        }
        if missing := required - names:
            raise ValueError(f"Missing SDK classes in classes.jar: {sorted(missing)}")

    members: dict[str, bytes] = {
        "AndroidManifest.xml": MANIFEST,
        "classes.jar": jar,
        "R.txt": b"",
        "proguard.txt": R8,
        "META-INF/com/android/build/gradle/aar-metadata.properties": META,
    }
    for abi in ABIS:
        for library in LIBS:
            path = args.native_root / abi / library
            payload = require_file(path)
            if not payload.startswith(b"\x7fELF"):
                raise ValueError(f"Not an ELF native binary: {path}")
            if len(payload) < 20 or payload[4:6] != b"\x02\x01":
                raise ValueError(f"Native binary must be 64-bit little-endian ELF: {path}")
            expected_machine = {"arm64-v8a": 183, "x86_64": 62}[abi]
            actual_machine = struct.unpack_from("<H", payload, 18)[0]
            if actual_machine != expected_machine:
                raise ValueError(
                    f"Native ELF machine mismatch: {path}; "
                    f"expected {expected_machine}, got {actual_machine}"
                )
            members[f"jni/{abi}/{library}"] = payload

    for gate_name, expected in GATES.items():
        path = args.gates_root / gate_name
        payload = require_file(path)
        actual = hashlib.sha256(payload).hexdigest()
        if len(payload) != 200_000 or actual != expected:
            raise ValueError(f"Seer Gate validation failed: {gate_name}")
        members[f"assets/seer-kotlin/{gate_name}"] = payload

    properties = (
        f"source_commit={args.source_commit}\n"
        f"package_version={args.package_version}\n"
        "abi_version=1\n"
        f"positive_gate_sha256={GATES['gates_100k_u16.bin']}\n"
        f"negative_gate_sha256={GATES['gates_negative_100k_u16.bin']}\n"
    ).encode()
    members["assets/seer-kotlin/build-info.properties"] = properties

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", allowZip64=True) as aar:
        for name, payload in sorted(members.items()):
            aar.writestr(info(name), payload)

    # Independent readback prevents reporting success on malformed/incomplete ZIP.
    with zipfile.ZipFile(args.output) as reread:
        if reread.testzip() is not None or set(reread.namelist()) != set(members):
            raise ValueError("AAR readback failed")
        for name, expected in members.items():
            if reread.read(name) != expected:
                raise ValueError(f"AAR member mismatch: {name}")

    manifest = {
        "format": "Seer Kotlin Android AAR diagnostic v1",
        "release_state": "UNRELEASED",
        "abi": 1,
        "source_commit": args.source_commit,
        "package_version": args.package_version,
        "aar_sha256": sha(args.output),
        "aar_size": args.output.stat().st_size,
        "files": {
            name: {"size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
            for name, payload in sorted(members.items())
        },
    }
    if args.manifest_out:
        args.manifest_out.parent.mkdir(parents=True, exist_ok=True)
        args.manifest_out.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print(
        "SEER_KOTLIN_ANDROID_AAR_PASS"
        f" sha256={manifest['aar_sha256']}"
        f" source={args.source_commit} entries={len(members)}"
        f" size={args.output.stat().st_size}"
    )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        print(f"SEER_KOTLIN_ANDROID_AAR_FAIL: {error}", file=sys.stderr)
        sys.exit(1)
