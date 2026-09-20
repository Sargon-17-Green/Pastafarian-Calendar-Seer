#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_POLICY = ROOT / "scripts" / "native_warning_policy.json"
WARNING = re.compile(r"^(?P<prefix>.*?):\s*warning:\s*(?P<message>.*)$")
LOCATION = re.compile(r"^(?P<path>.*?):(?P<line>\d+)(?::(?P<col>\d+))?$|^(?P<path_only>.*)$")
OPTION = re.compile(r"\s+\[(?P<option>-W[^\]]+)\]\s*$")


def normalize_path(prefix: str) -> str:
    prefix = prefix.replace("\\", "/")
    match = re.search(r"(prototype/.*)$", prefix)
    if match:
        return match.group(1)
    return prefix


def load_policy(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        "intentional_extensions": [
            (item["id"], re.compile(item["path_regex"]), re.compile(item["message_regex"]))
            for item in data.get("intentional_extensions", [])
        ],
        "benchmark_only_paths": [re.compile(x) for x in data.get("benchmark_only_paths", [])],
        "false_positives": [
            (item["id"], re.compile(item["path_regex"]), re.compile(item["message_regex"]))
            for item in data.get("false_positives", [])
        ],
    }


def parse_warning(line: str):
    match = WARNING.match(line.rstrip())
    if not match:
        return None
    prefix = match.group("prefix")
    message = match.group("message")
    option_match = OPTION.search(message)
    option = option_match.group("option") if option_match else None
    if option_match:
        message = message[: option_match.start()].rstrip()
    location = LOCATION.match(prefix)
    path = normalize_path(location.group("path") or location.group("path_only"))
    return {
        "path": path,
        "line": int(location.group("line")) if location.group("line") else None,
        "column": int(location.group("col")) if location.group("col") else None,
        "option": option,
        "message": message,
        "raw": line.rstrip(),
    }


def classify(item, policy):
    path = item["path"]
    message = item["message"]
    if any(pattern.search(path) for pattern in policy["benchmark_only_paths"]):
        return "benchmark-only", "benchmark-source"
    for rule_id, path_re, message_re in policy["intentional_extensions"]:
        if path_re.search(path) and message_re.search(message):
            return "intentional-extension", rule_id
    for rule_id, path_re, message_re in policy["false_positives"]:
        if path_re.search(path) and message_re.search(message):
            return "false-positive", rule_id
    return "real-warning", "unclassified"


def self_test(policy):
    samples = [
        ("prototype/src/sauce_fast127_v12.hpp:8:21: warning: ISO C++ does not support '__int128' [-Wpedantic]", "intentional-extension"),
        ("prototype/src/year_fast_bench_v12.cpp:10:3: warning: conversion may change value [-Wconversion]", "benchmark-only"),
        ("prototype/src/seer_calendar_core.cpp:10:3: warning: conversion may change value [-Wconversion]", "real-warning"),
        ("cc1plus: warning: command-line warning", "real-warning"),
    ]
    for raw, expected in samples:
        item = parse_warning(raw)
        if item is None:
            raise AssertionError(f"failed to parse warning: {raw}")
        got, _ = classify(item, policy)
        if got != expected:
            raise AssertionError(f"{raw}: expected {expected}, got {got}")
    print("native warning classifier self-test: PASS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("log", nargs="?")
    parser.add_argument("--policy", default=str(DEFAULT_POLICY))
    parser.add_argument("--json-out")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    policy = load_policy(Path(args.policy))
    if args.self_test:
        self_test(policy)
        return 0
    if not args.log:
        parser.error("log is required unless --self-test is used")

    warnings = []
    for raw in Path(args.log).read_text(encoding="utf-8", errors="replace").splitlines():
        item = parse_warning(raw)
        if item is None:
            continue
        item["category"], item["rule"] = classify(item, policy)
        warnings.append(item)

    unique = []
    seen = set()
    for item in warnings:
        key = (item["path"], item["line"], item["column"], item["option"], item["message"], item["category"])
        if key not in seen:
            seen.add(key)
            unique.append(item)

    counts = {category: 0 for category in ("real-warning", "intentional-extension", "benchmark-only", "false-positive")}
    for item in unique:
        counts[item["category"]] += 1
        loc = item["path"]
        if item["line"] is not None:
            loc += f":{item['line']}"
        print(f"[{item['category']}] {loc}: {item['message']}" + (f" [{item['option']}]" if item["option"] else ""))
    print("warning summary: " + ", ".join(f"{key}={value}" for key, value in counts.items()))

    report = {"counts": counts, "warnings": unique}
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 1 if counts["real-warning"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
