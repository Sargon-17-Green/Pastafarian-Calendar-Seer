#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import os
import random
import subprocess
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

import test_contract as contract

ROOT = Path(__file__).resolve().parents[2]
RUNNER = Path(__file__).with_name("runtime_contract_runner.mjs")
FAILURE_FIXTURE = Path(__file__).with_name("runtime_contract_failure.json")
DEFAULT_SEED = 20260920

REQUEST_SCHEMA = {
    "date": "date-request",
    "batch": "batch-request",
    "range": "range-request",
    "reverse": "reverse-request",
}
RESPONSE_SCHEMA = {
    "date": "date-response",
    "batch": "batch-response",
    "range": "range-response",
    "reverse": "date-response",
    "locales": "locales-response",
}
INCLUDES = ("structure", "boundaries", "provenance", "resolution")


def validator(name: str) -> Draft202012Validator:
    schema = contract.load_json(contract.SCHEMAS / f"{name}.schema.json")
    return Draft202012Validator(
        schema,
        registry=contract.REGISTRY,
        format_checker=contract.FORMAT,
    )


VALIDATORS = {
    name: validator(name)
    for name in set(REQUEST_SCHEMA.values())
    | set(RESPONSE_SCHEMA.values())
    | {"error-response"}
}


def schema_failures(name: str, instance) -> list[str]:
    errors = sorted(
        VALIDATORS[name].iter_errors(instance),
        key=lambda error: list(error.absolute_path),
    )
    result = []
    for error in errors:
        where = ".".join(str(part) for part in error.absolute_path) or "<root>"
        result.append(f"{where}: {error.message}")
    return result


def assert_schema(name: str, instance) -> None:
    failures = schema_failures(name, instance)
    if failures:
        raise AssertionError(f"{name} rejected instance: {failures[0]}")


def make_case(case_id: str, operation: str, request=None, *, expect_error=None):
    item = {"id": case_id, "operation": operation}
    if operation != "locales":
        item["request"] = request
    if expect_error is not None:
        item["expectError"] = expect_error
    return item


def exact_value(rng: random.Random):
    return rng.choice([
        -1000,
        0,
        1000,
        9007199254740991,
        "-9007199254740991",
        "1000000000000000000000000000000",
        "-1000000000000000000000000000000",
    ])


def valid_observer(rng: random.Random):
    return copy.deepcopy(rng.choice([
        None,
        {},
        {"preset": "kisurra"},
        {"longitude": 0},
        {"longitude": 180},
        {"longitude": -179.5},
        {"latitude": {"ignored": True}, "elevationMeters": ["ignored"]},
        {"preset": None},
        {"longitude": None},
        {"preset": None, "longitude": None},
        {"preset": None, "longitude": 12.5},
        {"preset": "kisurra", "longitude": None},
    ]))


def valid_target(rng: random.Random):
    return copy.deepcopy(rng.choice([
        {"jdn": exact_value(rng)},
        {"offsetDays": rng.choice([-10, -1, 0, 1, 10, "100000000000000000000"])},
        {"gregorian": "2026-09-20"},
        {"gregorian": "12026-09-20"},
        {"gregorian": {"era": "CE", "year": "2026", "month": 2, "day": 28}},
        {"gregorian": {"era": "BCE", "year": "762", "month": 6, "day": 7}},
    ]))


def valid_date(rng: random.Random):
    request = {}
    calculation = rng.randrange(3)
    if calculation == 0:
        request["calculation"] = {"jdn": exact_value(rng)}
    elif calculation == 1:
        request["calculation"] = {"at": "2026-09-20T09:00:00Z"}

    if rng.random() < 0.85:
        request["target"] = valid_target(rng)

    observer = valid_observer(rng)
    if observer is not None and rng.random() < 0.75:
        request["observer"] = observer

    presentation = rng.choice(["full", "canonical"])
    request["presentation"] = presentation
    if presentation == "full":
        request["locale"] = rng.choice(["en", "he"])
    elif rng.random() < 0.5:
        request["locale"] = rng.choice(["en", "he", "zz", " ", "not-a-locale"])

    selected = [name for name in INCLUDES if rng.random() < 0.35]
    if selected:
        request["include"] = selected
    return request


def valid_batch(rng: random.Random):
    defaults = {
        "calculation": {"jdn": exact_value(rng)},
        "presentation": rng.choice(["canonical", "full"]),
    }
    if defaults["presentation"] == "full":
        defaults["locale"] = rng.choice(["en", "he"])
    queries = []
    for index in range(rng.randint(1, 3)):
        item = {"id": f"q{index}", "target": valid_target(rng)}
        if rng.random() < 0.3:
            item["include"] = [rng.choice(INCLUDES)]
        queries.append(item)
    return {"defaults": defaults, "queries": queries}


def valid_range(rng: random.Random):
    request = {
        "calculation": {"jdn": exact_value(rng)},
        "start": {"jdn": rng.choice([999, "1000", "100000000000000000000"])},
        "count": rng.choice([1, 2, 3, "1", "3"]),
        "stepDays": rng.choice([-2, -1, 1, 2, "-3", "3"]),
        "calculationMode": rng.choice(["fixed", "same-as-target"]),
        "presentation": rng.choice(["canonical", "full"]),
    }
    if request["presentation"] == "full":
        request["locale"] = rng.choice(["en", "he"])
    if rng.random() < 0.5:
        request["include"] = [rng.choice(INCLUDES)]
    observer = valid_observer(rng)
    if observer is not None and rng.random() < 0.35:
        request["observer"] = observer
    return request


def valid_reverse(rng: random.Random):
    request = {
        "calculation": {"jdn": exact_value(rng)},
        "pastafarianDate": {
            "year": "5000",
            "cutlet": {"canonicalIndex": rng.choice([1, "1"]), "day": rng.choice([1, "1"])},
            "month": {"canonicalIndex": rng.choice([1, "1"]), "day": rng.choice([1, "1"])},
        },
        "presentation": rng.choice(["canonical", "full"]),
    }
    if request["presentation"] == "full":
        request["locale"] = rng.choice(["en", "he"])
    elif rng.random() < 0.4:
        request["locale"] = rng.choice(["zz", "not-a-locale", " "])
    if rng.random() < 0.5:
        request["include"] = [rng.choice(INCLUDES)]
    observer = valid_observer(rng)
    if observer is not None and rng.random() < 0.35:
        request["observer"] = observer
    return request


def generated_cases(seed: int):
    rng = random.Random(seed)
    cases = [
        make_case("locales-response", "locales"),
        make_case("gregorian-five-digit-year", "date", {
            "calculation": {"jdn": "1000"},
            "target": {"gregorian": "12026-09-20"},
            "presentation": "canonical",
        }),
        make_case("observer-null-selectors", "date", {
            "calculation": {"at": "2026-09-20T09:00:00Z"},
            "observer": {"preset": None, "longitude": None},
            "presentation": "canonical",
        }),
        make_case("reverse-resolution-shape", "reverse", {
            "calculation": {"jdn": "1000"},
            "pastafarianDate": {
                "year": "5000",
                "cutlet": {"canonicalIndex": 1, "day": 1},
                "month": {"canonicalIndex": 1, "day": 1},
            },
            "presentation": "canonical",
            "include": ["resolution"],
        }),
    ]

    for index in range(96):
        cases.append(make_case(f"date-generated-{index:03d}", "date", valid_date(rng)))
    for index in range(32):
        cases.append(make_case(f"batch-generated-{index:03d}", "batch", valid_batch(rng)))
    for index in range(32):
        cases.append(make_case(f"range-generated-{index:03d}", "range", valid_range(rng)))
    for index in range(24):
        cases.append(make_case(f"reverse-generated-{index:03d}", "reverse", valid_reverse(rng)))

    invalid = [
        ("date-duplicate-include", "date", {"calculation": {"jdn": "1000"}, "include": ["structure", "structure"]}),
        ("date-unknown-field", "date", {"calculation": {"jdn": "1000"}, "futureThing": True}),
        ("date-observer-null", "date", {"calculation": {"jdn": "1000"}, "observer": None}),
        ("date-observer-unknown", "date", {"calculation": {"jdn": "1000"}, "observer": {"mystery": 1}}),
        ("date-observer-bad-preset-type", "date", {"calculation": {"jdn": "1000"}, "observer": {"preset": 7}}),
        ("date-canonical-bad-locale-type", "date", {"calculation": {"jdn": "1000"}, "presentation": "canonical", "locale": 7}),
        ("date-noncanonical-integer", "date", {"calculation": {"jdn": "1000"}, "target": {"jdn": "01"}}),
        ("date-ambiguous-target-shape", "date", {"calculation": {"jdn": "1000"}, "target": {"jdn": "1", "offsetDays": "1"}}),
        ("date-empty-calculation", "date", {"calculation": {}}),
        ("date-year-zero-short-gregorian", "date", {"calculation": {"jdn": "1000"}, "target": {"gregorian": "0000-01-01"}}),
        ("batch-empty", "batch", {"queries": []}),
        ("batch-id-type", "batch", {"queries": [{"id": 9, "calculation": {"jdn": "1000"}}]}),
        ("batch-default-target", "batch", {"defaults": {"target": {"jdn": "1"}}, "queries": [{}]}),
        ("batch-duplicate-include", "batch", {"queries": [{"calculation": {"jdn": "1000"}, "include": ["structure", "structure"]}]}),
        ("range-both-ends", "range", {"start": {"jdn": "1"}, "count": "2", "endInclusive": {"jdn": "2"}}),
        ("range-zero-count", "range", {"start": {"jdn": "1"}, "count": "0"}),
        ("range-bad-locale-type", "range", {"start": {"jdn": "1"}, "count": "1", "presentation": "canonical", "locale": 7}),
        ("reverse-missing-date", "reverse", {"calculation": {"jdn": "1000"}}),
        ("reverse-extra-field", "reverse", {
            "calculation": {"jdn": "1000"},
            "pastafarianDate": {
                "year": "5000",
                "cutlet": {"canonicalIndex": 1, "day": 1},
                "month": {"canonicalIndex": 1, "day": 1},
            },
            "extra": True,
        }),
        ("reverse-noncanonical-integer", "reverse", {
            "calculation": {"jdn": "1000"},
            "pastafarianDate": {
                "year": "5000",
                "cutlet": {"canonicalIndex": "01", "day": 1},
                "month": {"canonicalIndex": 1, "day": 1},
            },
        }),
    ]
    for case_id, operation, request in invalid:
        cases.append(make_case(case_id, operation, request))

    semantic = [
        ("date-unsupported-locale", "date", {
            "calculation": {"jdn": "1000"}, "locale": "zz",
        }, "LOCALE_NOT_SUPPORTED"),
        ("date-unsupported-observer-preset", "date", {
            "calculation": {"at": "2026-09-20T09:00:00Z"}, "observer": {"preset": "elsewhere"},
        }, "OBSERVER_PRESET_NOT_SUPPORTED"),
        ("date-longitude-domain", "date", {
            "calculation": {"at": "2026-09-20T09:00:00Z"}, "observer": {"longitude": 181},
        }, "INVALID_LONGITUDE"),
        ("date-impossible-gregorian", "date", {
            "calculation": {"jdn": "1000"}, "target": {"gregorian": "2026-02-31"},
        }, "INVALID_GREGORIAN_DATE"),
        ("range-zero-step", "range", {
            "calculation": {"jdn": "1000"}, "start": {"jdn": "1"}, "count": "2", "stepDays": "0",
        }, "INVALID_RANGE_STEP"),
        ("range-unreachable-end", "range", {
            "calculation": {"jdn": "1000"}, "start": {"jdn": "1"}, "endInclusive": {"jdn": "2"}, "stepDays": "2",
        }, "UNREACHABLE_RANGE_END"),
        ("reverse-coordinate-domain", "reverse", {
            "calculation": {"jdn": "1000"},
            "pastafarianDate": {
                "year": "5000",
                "cutlet": {"canonicalIndex": 18, "day": 1},
                "month": {"canonicalIndex": 1, "day": 1},
            },
        }, "INVALID_PASTAFARIAN_DATE"),
    ]
    for case_id, operation, request, code in semantic:
        cases.append(make_case(case_id, operation, request, expect_error=code))
    return cases


def run_runtime(cases):
    proc = subprocess.run(
        ["node", str(RUNNER)],
        cwd=ROOT,
        input=json.dumps(cases, separators=(",", ":")),
        text=True,
        encoding="utf-8",
        errors="strict",
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"runtime runner exited {proc.returncode}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    outcomes = json.loads(proc.stdout)
    return {item["id"]: item for item in outcomes}


def validate_error(body) -> None:
    assert_schema("error-response", body)


def validate_batch_embedded_errors(body) -> None:
    for item in body.get("results", []):
        if item.get("ok") is False and "error" in item:
            validate_error({"error": item["error"]})


def runtime_rejected(case, outcome) -> bool:
    if outcome["status"] >= 400:
        return True
    if case["operation"] == "batch" and outcome["status"] == 200:
        results = outcome.get("body", {}).get("results", [])
        return bool(results) and all(item.get("ok") is False for item in results)
    return False


def check_case(case, outcome):
    operation = case["operation"]
    if operation == "locales":
        if outcome["status"] != 200:
            raise AssertionError(f"locales endpoint returned {outcome['status']}")
        assert_schema(RESPONSE_SCHEMA[operation], outcome["body"])
        return

    request_schema = REQUEST_SCHEMA[operation]
    failures = schema_failures(request_schema, case["request"])
    schema_valid = not failures
    expected_error = case.get("expectError")

    if expected_error is not None:
        if not schema_valid:
            raise AssertionError(
                f"test corpus bug: semantic-error case is schema-invalid: {failures[0]}"
            )
        if outcome["status"] < 400:
            raise AssertionError(f"expected typed error {expected_error}, got HTTP {outcome['status']}")
        validate_error(outcome["body"])
        actual = outcome["body"]["error"]["code"]
        if actual != expected_error:
            raise AssertionError(f"expected {expected_error}, got {actual}")
        return

    if schema_valid:
        if outcome["status"] != 200:
            code = outcome.get("body", {}).get("error", {}).get("code")
            raise AssertionError(
                f"schema-valid request was rejected: HTTP {outcome['status']} code={code}"
            )
        assert_schema(RESPONSE_SCHEMA[operation], outcome["body"])
        if operation == "batch":
            validate_batch_embedded_errors(outcome["body"])
            failed = [item for item in outcome["body"].get("results", []) if item.get("ok") is not True]
            if failed:
                raise AssertionError(f"schema-valid batch item was rejected: {failed[0]}")
        return

    if not runtime_rejected(case, outcome):
        raise AssertionError(
            f"schema-invalid request was silently accepted; schema failure: {failures[0]}"
        )
    if outcome["status"] >= 400:
        validate_error(outcome["body"])
    else:
        assert operation == "batch"
        assert_schema(RESPONSE_SCHEMA[operation], outcome["body"])
        validate_batch_embedded_errors(outcome["body"])


def write_failure(seed, case, outcome, error):
    operation = case["operation"]
    failures = []
    if operation in REQUEST_SCHEMA:
        failures = schema_failures(REQUEST_SCHEMA[operation], case.get("request"))
    payload = {
        "seed": seed,
        "case": case,
        "schemaFailures": failures,
        "outcome": outcome,
        "failure": str(error),
    }
    FAILURE_FIXTURE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"REPRO_FIXTURE={FAILURE_FIXTURE}", file=sys.stderr)
    print(
        f"REPLAY: {sys.executable} {Path(__file__).name} --replay {FAILURE_FIXTURE}",
        file=sys.stderr,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=int(os.environ.get("SEER_CONTRACT_SEED", DEFAULT_SEED)))
    parser.add_argument("--replay", type=Path)
    args = parser.parse_args()

    if args.replay:
        payload = json.loads(args.replay.read_text(encoding="utf-8"))
        cases = [payload.get("case", payload)]
        seed = payload.get("seed", args.seed)
    else:
        FAILURE_FIXTURE.unlink(missing_ok=True)
        seed = args.seed
        cases = generated_cases(seed)

    outcomes = run_runtime(cases)
    for case in cases:
        outcome = outcomes.get(case["id"])
        if outcome is None:
            error = AssertionError("runtime runner omitted case outcome")
            write_failure(seed, case, None, error)
            raise error
        try:
            check_case(case, outcome)
        except Exception as error:
            write_failure(seed, case, outcome, error)
            raise

    print(f"RUNTIME_CONTRACT_CORPUS_PASS seed={seed} cases={len(cases)}")


if __name__ == "__main__":
    main()
