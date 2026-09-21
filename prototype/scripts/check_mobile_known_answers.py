#!/usr/bin/env python3
import csv
import json
import pathlib
import subprocess
import sys

if len(sys.argv) != 3:
    raise SystemExit("usage: check_mobile_known_answers.py MOBILE_DUMP DATA_DIR")

mobile = pathlib.Path(sys.argv[1]).resolve()
data = pathlib.Path(sys.argv[2]).resolve()
pos = data / "gates_100k_u16.bin"
neg = data / "gates_negative_100k_u16.bin"
fixture = data / "canonical_saved_sum_vectors.tsv"

wanted = {
    "y5000-start",
    "same-query",
    "y5001-start",
    "far-past",
    "forward",
}
rows = {
    row["name"]: row
    for row in csv.DictReader(fixture.open(encoding="utf-8"), delimiter="\t")
    if row["name"] in wanted
}
if set(rows) != wanted:
    raise SystemExit(f"known-answer fixture missing cases: {sorted(wanted - set(rows))}")

for name in sorted(wanted):
    row = rows[name]
    calc = int(row["calc"])
    target = int(row["target"])
    payload = json.loads(subprocess.check_output(
        [str(mobile), str(pos), str(neg), str(calc), str(target), "1"],
        text=True,
    ))
    record = payload["records"][0]
    expected = {
        "targetJdn": target,
        "year": int(row["year"]),
        "cutletIndex": int(row["cutlet_idx"]),
        "dayInCutlet": int(row["day_cutlet"]),
        "monthIndex": int(row["month_idx"]),
        "dayInMonth": int(row["day_month"]),
        "monthCount": int(row["months"]),
    }
    actual = {key: record[key] for key in expected}
    if actual != expected:
        print(json.dumps({"case": name, "expected": expected, "actual": actual}, indent=2))
        raise SystemExit("SEER_MOBILE_KNOWN_ANSWER_FAIL")

print(f"SEER_MOBILE_KNOWN_ANSWER_PASS cases={len(wanted)}")
