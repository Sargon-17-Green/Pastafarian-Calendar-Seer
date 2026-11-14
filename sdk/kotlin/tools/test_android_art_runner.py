#!/usr/bin/env python3
"""Offline fail-closed contract tests for the Android ART/JNI device runner.

No ADB command is executed: Device.call is replaced by a deterministic fake.
The tests validate the gate used for real-Android results, not phone execution.
"""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "run_android_art_shell_jni.py"
spec = importlib.util.spec_from_file_location("seer_art_runner_under_test", SOURCE)
assert spec is not None and spec.loader is not None
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

COMMIT = "0" * 40
FILES = {name: ("fixture:" + name).encode("ascii") for name in runner.FILES}
HASHES = {name: hashlib.sha256(data).hexdigest() for name, data in FILES.items()}
PASS_TEXT = runner.PASS + COMMIT
VALID = "\n".join((PASS_TEXT, runner.CONCURRENCY_PASS, runner.RESET_GUARD_PASS))


class FakeDevice(runner.Device):
    def __init__(self, out: Path, program_output: str, exit_code: int = 0,
                 corrupt_sha: bool = False, cleanup_fails: bool = False):
        super().__init__("never-executed-adb", "TEST_SERIAL", out, {})
        self.program_output = program_output
        self.exit_code = exit_code
        self.corrupt_sha = corrupt_sha
        self.cleanup_fails = cleanup_fails
        self.calls = []

    def call(self, *arguments, timeout=60, label=None, check=True):
        self.calls.append(tuple(arguments))
        if arguments[:3] == ("shell", "ls", "-ld"):
            return 1, "no such temporary directory"
        if arguments[:2] == ("shell", "mkdir"):
            return 0, ""
        if arguments[0] == "push":
            return 0, ""
        if arguments[:2] == ("shell", "sha256sum"):
            name = Path(arguments[2]).name
            value = "0" * 64 if self.corrupt_sha else HASHES[name]
            return 0, value + "  " + arguments[2] + "\n"
        if arguments[:2] == ("shell", "rm"):
            return 0, ""
        if arguments[:2] == ("shell", "rmdir"):
            return (1, "simulated cleanup failure") if self.cleanup_fails else (0, "")
        if arguments[0] == "shell" and "app_process " in arguments[1]:
            return self.exit_code, self.program_output
        raise AssertionError("Unexpected device command: " + str(arguments))


class ArtRunnerFailClosedTests(unittest.TestCase):
    def exercise(self, output: str, exit_code: int = 0,
                 corrupt_sha: bool = False, cleanup_fails: bool = False):
        with tempfile.TemporaryDirectory(prefix="seer-art-runner-unit-") as tmp:
            device = FakeDevice(Path(tmp), output, exit_code, corrupt_sha, cleanup_fails)
            failure = None
            try:
                device.execute(FILES, HASHES, COMMIT, "arm64-v8a")
            except Exception as error:
                failure = error
            cleaned = device.cleanup()
            return device, failure, cleaned

    def test_positive_requires_every_real_program_verdict(self):
        device, failure, cleaned = self.exercise(VALID)
        self.assertIsNone(failure)
        self.assertTrue(cleaned)
        self.assertEqual(device.report["jni_result"], "PASS")
        self.assertTrue(any("app_process " in c[1] for c in device.calls
                            if c and c[0] == "shell" and len(c) > 1))

    def test_missing_reset_guard_is_failure(self):
        _, error, cleaned = self.exercise(VALID.replace(runner.RESET_GUARD_PASS, ""))
        self.assertIsInstance(error, runner.Failure)
        self.assertTrue(cleaned)

    def test_missing_concurrency_verdict_is_failure(self):
        _, error, cleaned = self.exercise(VALID.replace(runner.CONCURRENCY_PASS, ""))
        self.assertIsInstance(error, runner.Failure)
        self.assertTrue(cleaned)

    def test_missing_exact_source_identity_is_failure(self):
        _, error, cleaned = self.exercise(VALID.replace(COMMIT, "f" * 40))
        self.assertIsInstance(error, runner.Failure)
        self.assertTrue(cleaned)

    def test_nonzero_art_exit_cannot_pass(self):
        _, error, cleaned = self.exercise(VALID, exit_code=1)
        self.assertIsInstance(error, runner.Failure)
        self.assertTrue(cleaned)

    def test_permission_denial_is_blocked_not_success(self):
        _, error, cleaned = self.exercise("avc: denied", exit_code=1)
        self.assertIsInstance(error, runner.Blocked)
        self.assertTrue(cleaned)

    def test_corrupt_device_sha_prevents_art_execution(self):
        device, error, cleaned = self.exercise(VALID, corrupt_sha=True)
        self.assertIsInstance(error, runner.Failure)
        self.assertFalse(any("app_process " in c[1] for c in device.calls
                             if c and c[0] == "shell" and len(c) > 1))
        self.assertTrue(cleaned)

    def test_failed_cleanup_never_counts_as_complete(self):
        device, failure, cleaned = self.exercise(VALID, cleanup_fails=True)
        self.assertIsNone(failure)
        self.assertFalse(cleaned)
        self.assertIn("jni_result", device.report)

    def test_empty_response_cannot_pass(self):
        _, error, cleaned = self.exercise("")
        self.assertIsInstance(error, runner.Failure)
        self.assertTrue(cleaned)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=2)
    if not result.result.wasSuccessful():
        raise SystemExit(1)
    print("SEER_ANDROID_ART_RUNNER_FAIL_CLOSED_TEST_PASS cases=9")
