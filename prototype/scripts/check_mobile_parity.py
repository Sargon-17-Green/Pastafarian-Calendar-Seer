#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: check_mobile_parity.py MOBILE_DUMP ENGINE_SERVICE DATA_DIR")
mobile = pathlib.Path(sys.argv[1]).resolve()
service = pathlib.Path(sys.argv[2]).resolve()
data = pathlib.Path(sys.argv[3]).resolve()
pos = data / "gates_100k_u16.bin"
neg = data / "gates_negative_100k_u16.bin"

cases = [
    (-13334246, -13334248, 5),
    (-13333246, -13333346, 4),
    (-13335246, -13335346, 4),
    (2448536, 2448534, 5),
    (2448536, 2448536, 3),
]

def normalize(payload):
    keys = ("targetJdn","year","cutletIndex","dayInCutlet","monthIndex","dayInMonth","cutletCount","monthCount")
    return [{k:r[k] for k in keys} for r in payload["records"]]

for calc,start,count in cases:
    m = subprocess.check_output(
        [str(mobile), str(pos), str(neg), str(calc), str(start), str(count)],
        text=True,
    )
    s = subprocess.check_output(
        [str(service)],
        input=f"R\t{calc}\t{start}\t{count}\nX\n",
        cwd=data,
        text=True,
    ).splitlines()[0]
    mj, sj = json.loads(m), json.loads(s)
    if normalize(mj) != normalize(sj):
        print(json.dumps({"case":[calc,start,count],"mobile":mj,"service":sj},indent=2))
        raise SystemExit("SEER_MOBILE_PARITY_FAIL")
print("SEER_MOBILE_PARITY_PASS cases=%d" % len(cases))
