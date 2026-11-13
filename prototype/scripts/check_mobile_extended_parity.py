#!/usr/bin/env python3
"""Deterministic cross-year and negative-date mobile-vs-service differential suite.

The independent public service owns year-range segmentation; the mobile API
under test may choose an optimized single-year contiguous fast path.
Every returned integer field must agree, with full record order preserved.
"""
from __future__ import annotations

import json
from pathlib import Path
import random
import subprocess
import sys
import time

FIELDS = (
    "targetJdn", "year", "cutletIndex", "dayInCutlet",
    "monthIndex", "dayInMonth", "cutletCount", "monthCount",
)
SEED = 20261114


def cases() -> list[tuple[str, int, int, int]]:
    known = [
        ("year5000_start_cross", 2461290, 2458958, 7),
        ("year5000_end_cross", 2461290, 2463005, 7),
        ("year5000_start_inside", 2461290, 2458961, 7),
        ("year5000_end_inside", 2461290, 2463001, 7),
        ("month_view_42", 2461290, 2461269, 42),
        ("cutlet_boundary", 2461290, 2459237, 6),
        ("month_first_appearance", 2461290, 2459117, 6),
        ("month_last_appearance", 2461290, 2462906, 6),
        ("single", 2461290, 2461290, 1),
        ("next_year", 2461290, 2463008, 7),
        ("earlier_epoch", 2448536, 2448532, 9),
        ("negative_epoch", -13334246, -13334249, 7),
        ("negative_other_calc", -13333246, -13333346, 4),
    ]
    anchors = [
        (2461290, 2458961),
        (2461290, 2459239),
        (2461290, 2463007),
        (2461290, 2461290),
        (-13334246, -13334246),
        (2448536, 2448536),
    ]
    rng = random.Random(SEED)
    for i in range(12):
        calculation, anchor = anchors[i % len(anchors)]
        start = anchor + rng.randint(-45, 45)
        length = rng.choice((2, 3, 5, 7, 12))
        known.append((f"seeded_{i:02}", calculation, start, length))
    return known


def invoke(command: list[str], *, stdin: str | None = None, cwd: Path | None = None) -> dict:
    result = subprocess.run(
        command,
        input=stdin,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"command exit={result.returncode}: {command[0]} "
            f"stdout={result.stdout[-700:]!r} stderr={result.stderr[-700:]!r}"
        )
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError(f"no output: {command[0]} stderr={result.stderr[-400:]!r}")
    return json.loads(lines[0])


def normalized(response: dict, count: int) -> list[dict[str, int]]:
    records = response.get("records")
    if not isinstance(records, list) or len(records) != count:
        raise AssertionError(f"record count {len(records) if isinstance(records, list) else 'missing'} != {count}")
    return [{field: record[field] for field in FIELDS} for record in records]


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: check_mobile_extended_parity.py MOBILE_DUMP ENGINE_SERVICE DATA_DIR", file=sys.stderr)
        return 2
    mobile = Path(sys.argv[1]).resolve()
    service = Path(sys.argv[2]).resolve()
    data = Path(sys.argv[3]).resolve()
    pos = data / "gates_100k_u16.bin"
    neg = data / "gates_negative_100k_u16.bin"
    start_time = time.monotonic()
    suites = cases()
    for name, calc, first, count in suites:
        try:
            m = invoke([str(mobile), str(pos), str(neg), str(calc), str(first), str(count)])
            s = invoke([str(service)], stdin=f"R\t{calc}\t{first}\t{count}\nX\n", cwd=data)
            left, right = normalized(m, count), normalized(s, count)
            if left != right:
                for i, (a, b) in enumerate(zip(left, right)):
                    if a != b:
                        raise AssertionError(
                            "field mismatch: " + json.dumps(
                                {"case": name, "offset": i, "calc": calc,
                                 "start": first, "mobile": a, "service": b},
                                ensure_ascii=False,
                            )
                        )
                raise AssertionError("unexpected parity mismatch")
        except Exception as error:
            print(f"SEER_MOBILE_EXTENDED_PARITY_FAIL case={name} calc={calc} "
                  f"start={first} count={count} error={error}", file=sys.stderr)
            return 1
        print(f"SEER_MOBILE_EXTENDED_CASE_PASS case={name} count={count}", flush=True)
    print(f"SEER_MOBILE_EXTENDED_PARITY_PASS cases={len(suites)} "
          f"seed={SEED} elapsed_s={time.monotonic()-start_time:.2f}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
