#!/usr/bin/env python3
"""Fail-closed unit tests for the deterministic Seer Kotlin Android AAR packager.

Uses tiny dummy ELF headers for the *packager tests only*. These are not
runnable native libraries and are never published, installed or distributed.
The real ABI/JNI CI separately builds actual Native binaries with the NDK.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACKAGER = Path(__file__).with_name("build_aar.py")
DATA = ROOT / "prototype" / "data"
NAMES = (
    "org/pastafarian/seer/kotlin/SeerMobileWire.class",
    "org/pastafarian/seer/kotlin/SeerKotlinClient.class",
    "org/pastafarian/seer/kotlin/SeerJniTransport.class",
    "org/pastafarian/seer/kotlin/android/SeerAndroid.class",
    "org/pastafarian/seer/kotlin/android/SeerAndroidClient.class",
)
GATES = ("gates_100k_u16.bin", "gates_negative_100k_u16.bin")
LIBS = ("libseer_mobile.so", "libseer_mobile_kotlin_jni.so")
COMMIT = "0123456789abcdef0123456789abcdef01234567"


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def mock_elf(machine: int) -> bytes:
    # ELF64 little-endian, e_machine only; fake packaging fixture, not code.
    blob = bytearray(64)
    blob[:6] = b"\x7fELF\x02\x01"
    struct.pack_into("<H", blob, 18, machine)
    return bytes(blob)


def make_classes(path: Path, omit: str | None = None) -> None:
    with zipfile.ZipFile(path, "w") as archive:
        for name in NAMES:
            if name != omit:
                archive.writestr(name, b"fixture-class-not-runnable")


def package(
    classes: Path,
    native: Path,
    gates: Path,
    destination: Path,
    commit: str = COMMIT,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable, str(PACKAGER),
            "--classes-jar", str(classes),
            "--native-root", str(native),
            "--gates-root", str(gates),
            "--source-commit", commit,
            "--package-version", "0.2.5",
            "--output", str(destination),
            "--manifest-out", str(destination.with_suffix(".json")),
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def expect_failure(result: subprocess.CompletedProcess[str], expected: str) -> None:
    if result.returncode == 0 or expected not in result.stderr:
        raise AssertionError(
            f"Expected fail-closed packager error containing {expected!r}; "
            f"exit={result.returncode}, out={result.stdout!r}, err={result.stderr!r}"
        )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="seer-aar-packager-test-") as temporary:
        root = Path(temporary)
        native = root / "native"
        gates = root / "gates"
        gates.mkdir()
        for name in GATES:
            shutil.copyfile(DATA / name, gates / name)
        for abi, machine in (("arm64-v8a", 183), ("x86_64", 62)):
            directory = native / abi
            directory.mkdir(parents=True)
            for lib in LIBS:
                (directory / lib).write_bytes(mock_elf(machine))
        classes = root / "classes.jar"
        make_classes(classes)

        first = root / "first.aar"
        second = root / "second.aar"
        for output in (first, second):
            result = package(classes, native, gates, output)
            if result.returncode != 0 or "SEER_KOTLIN_ANDROID_AAR_PASS" not in result.stdout:
                raise AssertionError(f"Expected positive packager fixture: {result}")
        assert digest(first.read_bytes()) == digest(second.read_bytes())
        with zipfile.ZipFile(first) as aar:
            assert aar.testzip() is None
            assert set(aar.namelist()) == set(
                json.loads(first.with_suffix(".json").read_text())["files"]
            )
            for abi in ("arm64-v8a", "x86_64"):
                for lib in LIBS:
                    assert f"jni/{abi}/{lib}" in aar.namelist()
        manifest = json.loads(first.with_suffix(".json").read_text())
        assert manifest["aar_sha256"] == digest(first.read_bytes())
        assert manifest["source_commit"] == COMMIT

        expect_failure(package(classes, native, gates, root / "bad-commit.aar", commit="bad"),
                       "source-commit")
        corrupted = native / "x86_64" / LIBS[0]
        corrupted.write_bytes(mock_elf(183))
        expect_failure(package(classes, native, gates, root / "wrong-machine.aar"),
                       "Native ELF machine mismatch")
        corrupted.write_bytes(mock_elf(62))
        corrupted.write_bytes(b"not an ELF header")
        expect_failure(package(classes, native, gates, root / "bad-elf.aar"),
                       "Not an ELF native binary")
        corrupted.write_bytes(mock_elf(62))

        gate = gates / GATES[0]
        gate_bytes = bytearray(gate.read_bytes())
        gate_bytes[0] ^= 1
        gate.write_bytes(gate_bytes)
        expect_failure(package(classes, native, gates, root / "corrupt-gate.aar"),
                       "Gate validation failed")
        shutil.copyfile(DATA / GATES[0], gate)

        make_classes(classes, omit=NAMES[0])
        expect_failure(package(classes, native, gates, root / "missing-class.aar"),
                       "Missing SDK classes")

    print("SEER_KOTLIN_AAR_PACKAGER_TEST_PASS deterministic, ELF machine, Gate SHA, classes, revision")


if __name__ == "__main__":
    main()
