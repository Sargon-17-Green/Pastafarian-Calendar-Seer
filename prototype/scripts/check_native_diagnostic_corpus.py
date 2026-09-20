#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FOUNDATION = -13_334_246


def executable(build: Path, name: str) -> Path:
    plain = build / name
    exe = build / f"{name}.exe"
    return exe if exe.exists() else plain


def run(args, *, input_text=None):
    proc = subprocess.run(
        [str(x) for x in args],
        cwd=DATA,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=os.environ.copy(),
    )
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        if proc.stdout:
            sys.stderr.write(proc.stdout)
        raise RuntimeError(f"command failed with exit {proc.returncode}: {' '.join(map(str, args))}")
    return proc.stdout.strip()


def tokens(text):
    return dict(re.findall(r"([A-Za-z_]+)=([^ ]+)", text))


def oracle(oracle_bin: Path, calc: int, target: int, negative=False):
    args = [oracle_bin, DATA / "gates_u16.bin", calc, target]
    if negative:
        args.append(f"--negative-gates={DATA / 'gates_negative_u16.bin'}")
    return tokens(run(args))


def batch_record(batch: Path, calc: int, target: int):
    payload = json.loads(run([batch, calc, target, 1, 1, 64, 1]))
    if payload["schema"] != 1 or payload["targetCount"] != 1:
        raise AssertionError("unexpected batch schema/count")
    return payload["records"][0]


def compare_record(label, record, ref, target):
    expected = {
        "targetJdn": target,
        "year": int(ref["year"]),
        "cutletIndex": int(ref["cutlet_idx"]),
        "dayInCutlet": int(ref["day_cutlet"]),
        "monthIndex": int(ref["month_idx"]),
        "dayInMonth": int(ref["day_month"]),
        "cutletCount": int(ref["cutlets"]),
        "monthCount": int(ref["months"]),
    }
    if record != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {record!r}")


def check_positive_oracle_baseline(oracle_bin, rows):
    for name in ("same-query", "far-past"):
        row = rows[name]
        ref = oracle(oracle_bin, int(row["calc"]), int(row["target"]), False)
        expected = {
            "year": row["year"], "steps": row["steps"], "gates": row["gates"],
            "len": row["len"], "offset": row["offset"], "cutlet_idx": row["cutlet_idx"],
            "day_cutlet": row["day_cutlet"], "month_idx": row["month_idx"],
            "day_month": row["day_month"], "months": row["months"],
            "Nbits": row["Nbits"], "width": row["width"],
        }
        for key, value in expected.items():
            if ref[key] != value:
                raise AssertionError(f"oracle baseline {name}:{key}: expected {value}, got {ref[key]}")


def check_exact_cases(bins, oracle_bin, rows):
    cases = [
        ("same-query", int(rows["same-query"]["calc"]), int(rows["same-query"]["target"]), False),
        ("far-past", int(rows["far-past"]["calc"]), int(rows["far-past"]["target"]), False),
        ("foundation-exact", FOUNDATION, FOUNDATION, True),
        ("cross-foundation", FOUNDATION + 100, FOUNDATION - 3000, True),
    ]
    refs = {}
    for name, calc, target, negative in cases:
        ref = oracle(oracle_bin, calc, target, negative)
        record = batch_record(bins["batch"], calc, target)
        compare_record(name, record, ref, target)
        refs[name] = (calc, target, ref, record)
        print(f"diagnostic exact case {name}: PASS")
    return refs


def check_adapters(bins, witness):
    calc, target, ref, record = witness
    year = int(ref["year"])
    locator = json.loads(run([bins["locator"], calc, year]))
    expected_start = int(ref["a"]) + 1
    expected_end = int(ref["b"])
    expected_len = int(ref["len"])
    if (locator["year"], locator["startJdn"], locator["endJdn"], locator["lengthDays"]) != (
        year, expected_start, expected_end, expected_len
    ):
        raise AssertionError("locator disagrees with independent oracle")

    structure = json.loads(run([bins["structure"], calc, year, 0, 1, 64, 1]))
    if (structure["year"], structure["startJdn"], structure["endJdn"], structure["lengthDays"]) != (
        year, expected_start, expected_end, expected_len
    ):
        raise AssertionError("year structure disagrees with locator/oracle")
    if len(structure["months"]) != int(ref["months"]):
        raise AssertionError("year structure month count disagrees with oracle")
    if len(structure["cutlets"]) != int(ref["cutlets"]):
        raise AssertionError("year structure cutlet count disagrees with oracle")
    if sum(item["lengthDays"] for item in structure["months"]) != expected_len:
        raise AssertionError("year structure month lengths do not sum to year length")
    cutlets = structure["cutlets"]
    if cutlets[0]["startOffset"] != 0 or cutlets[-1]["endOffset"] != expected_len - 1:
        raise AssertionError("year structure cutlet coverage endpoints are wrong")
    for left, right in zip(cutlets, cutlets[1:]):
        if right["startOffset"] != left["endOffset"] + 1:
            raise AssertionError("year structure cutlets are not contiguous")

    service_text = run([bins["service"]], input_text=f"R\t{calc}\t{target}\t1\nX\n")
    lines = [line for line in service_text.splitlines() if line.strip()]
    if len(lines) != 1:
        raise AssertionError(f"unexpected engine-service output lines: {lines!r}")
    service = json.loads(lines[0])
    if service.get("records", [None])[0] != record:
        raise AssertionError("engine service disagrees with sanitized batch adapter")
    print("diagnostic adapter cross-check: PASS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", required=True, type=Path)
    args = parser.parse_args()
    build = args.build.resolve()
    bins = {
        "batch": executable(build, "seer_year_batch"),
        "locator": executable(build, "seer_year_locator"),
        "structure": executable(build, "seer_year_structure"),
        "service": executable(build, "seer_engine_service"),
    }
    oracle_bin = executable(build, "canonical_vector_oracle")
    for path in [*bins.values(), oracle_bin]:
        if not path.exists():
            raise SystemExit(f"missing diagnostic input: {path}")

    rows = {row["name"]: row for row in csv.DictReader(
        (DATA / "canonical_saved_sum_vectors.tsv").open(encoding="utf-8"), delimiter="\t"
    )}
    check_positive_oracle_baseline(oracle_bin, rows)
    refs = check_exact_cases(bins, oracle_bin, rows)
    check_adapters(bins, refs["same-query"])
    print("Native diagnostic exact/conformance corpus: PASS")


if __name__ == "__main__":
    main()
