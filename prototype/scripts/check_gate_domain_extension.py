#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import struct
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BUILD = ROOT / "build"
FOUNDATION = -13334246
OLD_N = 40000
NEW_N = 100000

OLD_POS_SHA = "2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb"
OLD_NEG_SHA = "90a5cf809f19f62a87327b733d21572d739b83a383969765582cfb31cfb2b9ab"
NEW_POS_SHA = "4d45f05acc6eb4dee6e53757a8c1f94da2f3de0fe4d4659b0745f15e05b147a8"
NEW_NEG_SHA = "40bfbd7d76209c258fb7d4739f1ef9b10ac8bb38eb4f26690c1048aee0e4f884"

def load(name, count):
    raw = (DATA / name).read_bytes()
    assert len(raw) == count * 2, (name, len(raw))
    return raw, struct.unpack(f"<{count}H", raw)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

old_p_raw, old_p = load("gates_u16.bin", OLD_N)
old_n_raw, old_n = load("gates_negative_u16.bin", OLD_N)
new_p_raw, new_p = load("gates_100k_u16.bin", NEW_N)
new_n_raw, new_n = load("gates_negative_100k_u16.bin", NEW_N)

assert sha(old_p_raw) == OLD_POS_SHA
assert sha(old_n_raw) == OLD_NEG_SHA
assert sha(new_p_raw) == NEW_POS_SHA
assert sha(new_n_raw) == NEW_NEG_SHA
assert new_p_raw[:len(old_p_raw)] == old_p_raw
assert new_n_raw[:len(old_n_raw)] == old_n_raw
assert min(new_p) >= 42 and max(new_p) <= 963
assert min(new_n) >= 42 and max(new_n) <= 963

pos = [FOUNDATION]
neg = [FOUNDATION]
for gap in new_p:
    pos.append(pos[-1] + gap)
for gap in new_n:
    neg.append(neg[-1] - gap)

assert pos[40000] == 6732954
assert pos[40001] == 6733782
assert neg[40000] == -33409717
assert neg[40001] == -33410555
assert pos[100000] == 36828783
assert neg[100000] == -63473948

def runtime_path():
    suffix = ".exe" if os.name == "nt" else ""
    return BUILD / f"seer_year_batch{suffix}"

def run(calc, target):
    binary = runtime_path()
    p = subprocess.run(
        [str(binary), str(calc), str(target), "1"],
        cwd=DATA, text=True, capture_output=True, timeout=60,
    )
    if p.returncode:
        raise AssertionError(f"runtime failed {calc}->{target}: {p.stderr or p.stdout}")
    return json.loads(p.stdout)["records"][0]

if runtime_path().exists():
    golden = [
        (6732954, 6732954, (5000, 14, 109, 10, 112, 7, 47)),
        (-33409716, -33409716, (5000, 12, 1, 20, 1, 7, 37)),
        (6732955, 6732955, (5000, 0, 1, 37, 3, 6, 39)),
        (-33409717, -33409717, (5000, 3, 838, 12, 38, 6, 43)),
        (6732954, 6732955, (5001, 9, 1, 32, 1, 7, 30)),
        (-33409716, -33409717, (4999, 3, 838, 8, 122, 6, 36)),
    ]
    for calc, target, expected in golden:
        r = run(calc, target)
        actual = (
            r["year"], r["cutletIndex"], r["dayInCutlet"],
            r["monthIndex"], r["dayInMonth"], r["cutletCount"], r["monthCount"],
        )
        assert actual == expected, (calc, target, actual, expected)

print("Gate-domain extension verification: PASS")
print(f"positive100k_sha256={NEW_POS_SHA}")
print(f"negative100k_sha256={NEW_NEG_SHA}")
print(f"positive_boundary={pos[40000]},{pos[40001]},{pos[100000]}")
print(f"negative_boundary={neg[40000]},{neg[40001]},{neg[100000]}")
