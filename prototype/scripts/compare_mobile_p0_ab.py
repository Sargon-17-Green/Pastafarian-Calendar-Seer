#!/usr/bin/env python3
"""Compare pinned original/experimental Seer C ABI on one CI host.

This is *diagnostic* speed evidence, not physical Android evidence or p95.
It also requires field-for-field parity against an independently compiled
baseline binary for all 42 output records of each scenario.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import subprocess
import sys
from pathlib import Path

FIELDS = (
    "targetJdn", "year", "cutletIndex", "dayInCutlet",
    "monthIndex", "dayInMonth", "cutletCount", "monthCount",
)
SCENARIOS = (
    ("same-year", 2461290, 2461290),
    ("year-5000-start", 2461290, 2458961),
    ("year-5000-end", 2461290, 2463008),
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def invoke(binary: Path, *args: str, timeout: int = 180) -> dict:
    result = subprocess.run(
        [str(binary), *args],
        encoding="utf-8",
        text=True,
        capture_output=True,
        check=False,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"failed: {binary.name} rc={result.returncode} "
            f"stdout={result.stdout[-1000:]!r} stderr={result.stderr[-1000:]!r}"
        )
    lines = [ln for ln in result.stdout.splitlines() if ln.strip()]
    return {"lines": [json.loads(ln) for ln in lines], "stderr": result.stderr[-400:]}


def records(dump_binary: Path, pos: Path, neg: Path, calc: int, start: int) -> list[dict]:
    parsed = invoke(dump_binary, str(pos), str(neg), str(calc), str(start), "42")
    response = parsed["lines"][0]
    actual = response.get("records")
    if not isinstance(actual, list) or len(actual) != 42:
        raise AssertionError("malformed or wrong-length 42-target response")
    return [{key: item[key] for key in FIELDS} for item in actual]


def benchmark(
    binary: Path, pos: Path, neg: Path, calc: int, center: int
) -> tuple[dict, dict[int, float]]:
    result = invoke(binary, str(pos), str(neg), "1", str(calc), str(center), timeout=300)
    lines = result["lines"]
    identity = [x for x in lines if x.get("event") == "P0_IDENTITY"]
    samples = [x for x in lines if x.get("event") == "P0_SAMPLE"]
    end = [x for x in lines if x.get("event") == "P0_COMPLETE"]
    if len(identity) != 1 or len(samples) != 3 or len(end) != 1:
        raise AssertionError("P0 benchmark missing expected output records")
    if identity[0].get("abi") != 1:
        raise AssertionError("unexpected native ABI version")
    if (identity[0].get("calculationJdn"), identity[0].get("centerTargetJdn")) != (calc, center):
        raise AssertionError("benchmark did not run the requested input")
    durations = {}
    for sample in samples:
        count = sample["count"]
        times = sample["timesMs"]
        if count in durations or count not in (1, 7, 42) or len(times) != 1 or times[0] < 0:
            raise AssertionError("unexpected P0 sample shape")
        durations[count] = float(times[0])
    if set(durations) != {1, 7, 42}:
        raise AssertionError("missing P0 sample size")
    return identity[0], durations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-bench", type=Path, required=True)
    parser.add_argument("--candidate-bench", type=Path, required=True)
    parser.add_argument("--baseline-dump", type=Path, required=True)
    parser.add_argument("--candidate-dump", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--pairs", type=int, default=2)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.pairs not in (1, 2, 3):
        parser.error("--pairs must be 1, 2, or 3")
    pos = (args.data / "gates_100k_u16.bin").resolve()
    neg = (args.data / "gates_negative_100k_u16.bin").resolve()
    binaries = {
        "baseline": (args.baseline_bench.resolve(), args.baseline_dump.resolve()),
        "candidate": (args.candidate_bench.resolve(), args.candidate_dump.resolve()),
    }
    for path in (pos, neg, *[p for pair in binaries.values() for p in pair]):
        if not path.is_file():
            parser.error(f"missing input: {path}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def emit(writer, payload: dict) -> None:
        line = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        print(line, flush=True)
        writer.write(line + "\n")
        writer.flush()

    with args.output.open("w", encoding="utf-8") as writer:
        emit(writer, {
            "event": "P0_AB_METADATA",
            "pairs": args.pairs,
            "scope": "same Linux runner, diagnostic, not physical Android or p95",
            "gates": {"positive_sha256": digest(pos), "negative_sha256": digest(neg)},
            "binary_sha256": {
                name: {"benchmark": digest(pair[0]), "dump": digest(pair[1])}
                for name, pair in binaries.items()
            },
        })
        for scenario, calc, center in SCENARIOS:
            start = center - 21
            left = records(binaries["baseline"][1], pos, neg, calc, start)
            right = records(binaries["candidate"][1], pos, neg, calc, start)
            if left != right:
                for i, (a, b) in enumerate(zip(left, right)):
                    if a != b:
                        raise AssertionError(
                            json.dumps({
                                "event": "P0_AB_PARITY_FAIL", "scenario": scenario,
                                "target": start + i, "baseline": a, "candidate": b,
                            }, sort_keys=True)
                        )
                raise AssertionError(f"unexplained mismatch: {scenario}")
            emit(writer, {
                "event": "P0_AB_PARITY_PASS",
                "scenario": scenario,
                "records": len(left),
                "startJdn": start,
                "calculationJdn": calc,
            })

            samples: dict[int, dict[str, list[float]]] = {
                n: {"baseline": [], "candidate": []} for n in (1, 7, 42)
            }
            # AB / BA alternating mitigates (but does not eliminate) order bias.
            for pair_index in range(args.pairs):
                order = ("baseline", "candidate") if pair_index % 2 == 0 else ("candidate", "baseline")
                for name in order:
                    identity, times = benchmark(binaries[name][0], pos, neg, calc, center)
                    for n, value in times.items():
                        samples[n][name].append(value)
                    emit(writer, {
                        "event": "P0_AB_SAMPLE",
                        "scenario": scenario, "pair": pair_index + 1,
                        "variant": name, "ms": times,
                        "engine_provenance": identity,
                    })
            for count in (1, 7, 42):
                before = statistics.median(samples[count]["baseline"])
                after = statistics.median(samples[count]["candidate"])
                emit(writer, {
                    "event": "P0_AB_MEDIAN_DIAGNOSTIC",
                    "scenario": scenario, "count": count,
                    "baseline_median_ms": before,
                    "candidate_median_ms": after,
                    "ratio_baseline_over_candidate": before / after if after > 0 else None,
                    "sample_count_per_variant": args.pairs,
                    "note": "diagnostic median, not p95 or a performance regression gate",
                })
        emit(writer, {"event": "P0_AB_COMPLETE", "parity": "all 42-record scenarios equal"})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"P0_AB_FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
