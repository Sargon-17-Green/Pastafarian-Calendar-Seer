#!/usr/bin/env python3
import json
import os
import pathlib
import re
import shutil
import struct
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BUILD = ROOT / "build"
FOUNDATION = -13334246

def exe(name):
    suffix = ".exe" if os.name == "nt" else ""
    return BUILD / (name + suffix)

def load_positions(name, negative=False):
    raw = (DATA / name).read_bytes()
    gaps = struct.unpack(f"<{len(raw)//2}H", raw)
    out = [FOUNDATION]
    for gap in gaps:
        out.append(out[-1] - gap if negative else out[-1] + gap)
    return out

POS = load_positions("gates_100k_u16.bin")
NEG = load_positions("gates_negative_100k_u16.bin", negative=True)

FIELDS = ("year", "cutletIndex", "dayInCutlet", "monthIndex", "dayInMonth", "cutletCount", "monthCount")

def runtime(cwd, calc, target):
    p = subprocess.run(
        [str(exe("seer_year_batch")), str(calc), str(target), "1"],
        cwd=cwd, text=True, capture_output=True, timeout=90,
    )
    if p.returncode:
        raise AssertionError(f"runtime failed {calc}->{target}: {p.stderr or p.stdout}")
    record = json.loads(p.stdout)["records"][0]
    return tuple(record[k] for k in FIELDS)

def oracle(calc, target, legacy_radius=None):
    args = [
        str(exe("canonical_vector_oracle")),
        str(DATA / "gates_100k_u16.bin"),
        str(calc), str(target),
        "--negative-gates=" + str(DATA / "gates_negative_100k_u16.bin"),
    ]
    if legacy_radius is not None:
        args.append(f"--legacy-radius={legacy_radius}")
    p = subprocess.run(args, cwd=DATA, text=True, capture_output=True, timeout=90)
    if p.returncode:
        raise AssertionError(f"oracle failed {calc}->{target}: {p.stderr or p.stdout}")
    values = dict(re.findall(r"([A-Za-z_]+)=(-?\d+(?::-?\d+)?)", p.stdout))
    return (
        int(values["year"]), int(values["cutlet_idx"]), int(values["day_cutlet"]),
        int(values["month_idx"]), int(values["day_month"]),
        int(values["cutlets"]), int(values["months"]),
    )

extended = [
    ("first-positive", POS[40000] + 1),
    ("first-negative", NEG[40000]),
    ("positive-50000", POS[50000] + 1),
    ("negative-50000", NEG[50000] + 1),
    ("positive-75000", POS[75000] + 1),
    ("negative-75000", NEG[75000] + 1),
    ("positive-99900", POS[99900] + 1),
    ("negative-99900", NEG[99900] + 1),
]
for name, day in extended:
    actual = runtime(DATA, day, day)
    expected = oracle(day, day)
    assert actual == expected, (name, day, actual, expected)

legacy_to_extension = [
    ("legacy-to-first-positive", POS[40000], POS[40000] + 1),
    ("legacy-to-second-positive", POS[40000], POS[40001] + 1),
    ("legacy-to-first-negative", NEG[40000] + 1, NEG[40000]),
    ("legacy-to-second-negative", NEG[40000] + 1, NEG[40001] + 1),
]
for name, calc, target in legacy_to_extension:
    actual = runtime(DATA, calc, target)
    expected = oracle(calc, target, legacy_radius=40000)
    assert actual == expected, (name, calc, target, actual, expected)

with tempfile.TemporaryDirectory(prefix="seer-legacy-gates-") as tmp:
    legacy = pathlib.Path(tmp)
    shutil.copy2(DATA / "gates_u16.bin", legacy / "gates_100k_u16.bin")
    shutil.copy2(DATA / "gates_negative_u16.bin", legacy / "gates_negative_100k_u16.bin")
    old_pos = load_positions("gates_u16.bin")
    old_neg = load_positions("gates_negative_u16.bin", negative=True)
    indices = (-39999, -35000, -20000, -1, 0, 1, 20000, 35000, 39999)
    checked = 0
    for index in indices:
        calc = (old_pos[index] + 1) if index >= 0 else (old_neg[-index] + 1)
        for delta in (0, 1, -1):
            target = calc + delta
            if not (old_neg[40000] < target <= old_pos[40000]):
                continue
            full = runtime(DATA, calc, target)
            old = runtime(legacy, calc, target)
            assert full == old, (index, delta, calc, target, full, old)
            checked += 1
    assert checked == 27, checked

print("Gate-domain independent differential: PASS")
print(f"extended_oracle_cases={len(extended)}")
print(f"legacy_to_extension_oracle_cases={len(legacy_to_extension)}")
print("old_domain_differential_cases=27")
