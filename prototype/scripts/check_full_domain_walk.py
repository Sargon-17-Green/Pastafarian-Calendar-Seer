#!/usr/bin/env python3
import json
import os
import re
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BUILD = ROOT / 'build'
POS = DATA / 'gates_u16.bin'
NEG = DATA / 'gates_negative_u16.bin'
POS_EXT = DATA / 'gates_100k_u16.bin'
NEG_EXT = DATA / 'gates_negative_100k_u16.bin'
EXE_SUFFIX = '.exe' if os.name == 'nt' else ''
FAST = BUILD / f'full_domain_fast_probe{EXE_SUFFIX}'
REF = BUILD / f'full_domain_reference_probe{EXE_SUFFIX}'
BATCH = BUILD / f'seer_year_batch{EXE_SUFFIX}'
ORACLE = BUILD / f'canonical_vector_oracle{EXE_SUFFIX}'
FOUNDATION = -13_334_246
MIN_GATE = -40_000
MAX_GATE = 40_000
EXT_MIN_GATE = -100_000
EXT_MAX_GATE = 100_000


def run(args, *, check=True):
    return subprocess.run(
        [str(x) for x in args], cwd=DATA, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check,
    )


def tokens(text):
    return {k: int(v) for k, v in re.findall(r'([A-Za-z_]+)=(-?[0-9]+)', text)}


def gate_positions(positive_path=POS, negative_path=NEG):
    positive_bytes = positive_path.read_bytes()
    negative_bytes = negative_path.read_bytes()
    if len(positive_bytes) != len(negative_bytes) or len(positive_bytes) % 2:
        raise AssertionError('positive/negative gate corpus size mismatch')
    count = len(positive_bytes) // 2
    positive = struct.unpack(f'<{count}H', positive_bytes)
    negative = struct.unpack(f'<{count}H', negative_bytes)
    positions = {0: FOUNDATION}
    for n, gap in enumerate(negative, 1):
        positions[-n] = positions[-n + 1] - gap
    for n, gap in enumerate(positive, 1):
        positions[n] = positions[n - 1] + gap
    return positions


def summaries(calc):
    fast = tokens(run([FAST, calc]).stdout)
    ref = tokens(run([REF, POS, NEG, calc]).stdout)
    if fast != ref:
        missing_fast = sorted(set(ref) - set(fast))
        missing_ref = sorted(set(fast) - set(ref))
        differing = {k: (fast.get(k), ref.get(k)) for k in sorted(set(fast) & set(ref)) if fast[k] != ref[k]}
        raise AssertionError(
            f'domain summary mismatch for calc={calc}: missing_fast={missing_fast} '
            f'missing_ref={missing_ref} differing={differing}'
        )
    if not (MIN_GATE <= fast['first_open'] <= MIN_GATE + 5):
        raise AssertionError(f"left edge did not reach corpus boundary neighborhood: {fast['first_open']}")
    if not (MAX_GATE - 5 <= fast['last_close'] <= MAX_GATE):
        raise AssertionError(f"right edge did not reach corpus boundary neighborhood: {fast['last_close']}")
    if fast['first_b'] >= fast['last_a']:
        raise AssertionError('domain edge years are not ordered')
    return fast


def oracle(calc, target):
    proc = run([ORACLE, POS, calc, target, f'--negative-gates={NEG}'])
    return {k: v for k, v in re.findall(r'([A-Za-z_]+)=([^ ]+)', proc.stdout.strip())}


def batch_record(calc, target):
    payload = json.loads(run([BATCH, calc, target, 1]).stdout)
    if payload['schema'] != 1 or payload['calcJdn'] != calc or payload['targetStartJdn'] != target:
        raise AssertionError('unexpected batch envelope')
    return payload['records'][0]


def compare_full_record(label, calc, target):
    ref = oracle(calc, target)
    record = batch_record(calc, target)
    expected = {
        'targetJdn': target,
        'year': int(ref['year']),
        'cutletIndex': int(ref['cutlet_idx']),
        'dayInCutlet': int(ref['day_cutlet']),
        'monthIndex': int(ref['month_idx']),
        'dayInMonth': int(ref['day_month']),
        'cutletCount': int(ref['cutlets']),
        'monthCount': int(ref['months']),
    }
    for key, value in expected.items():
        if record[key] != value:
            raise AssertionError(f'{label}:{key}: expected {value}, got {record[key]}')
    print(f'{label}: calc={calc} target={target} year={record["year"]} PASS')


def expect_outside(label, calc, target, needle):
    proc = run([BATCH, calc, target, 1], check=False)
    if proc.returncode == 0:
        raise AssertionError(f'{label}: unexpectedly succeeded')
    if needle not in proc.stderr:
        raise AssertionError(f'{label}: expected {needle!r} in stderr, got {proc.stderr!r}')
    print(f'{label}: rejected cleanly PASS')


def main():
    for required in (POS, NEG, POS_EXT, NEG_EXT, FAST, REF, BATCH, ORACLE):
        if not required.exists():
            raise SystemExit(f'missing required full-domain input: {required}')
    positions = gate_positions()
    if positions[MIN_GATE] >= FOUNDATION or positions[MAX_GATE] <= FOUNDATION:
        raise AssertionError('gate corpus is not bidirectional around Foundation')

    calcs = [
        FOUNDATION,
        positions[-20_000] + 1,
        positions[20_000] + 1,
    ]
    results = {}
    for calc in calcs:
        summary = summaries(calc)
        results[calc] = summary
        print(
            f'summary calc={calc}: first={summary["first_year"]} '
            f'gates={summary["first_open"]}:{summary["first_close"]} '
            f'last={summary["last_year"]} gates={summary["last_open"]}:{summary["last_close"]} '
            f'walk={summary["prev_steps"]}+{summary["next_steps"]} PASS'
        )

    foundation = results[FOUNDATION]
    first_target = foundation['first_a'] + 1
    last_target = foundation['last_b']
    compare_full_record('foundation-left-edge-record', FOUNDATION, first_target)
    compare_full_record('foundation-right-edge-record', FOUNDATION, last_target)
    extended_positions = gate_positions(POS_EXT, NEG_EXT)
    expect_outside(
        'foundation-at-extended-left-boundary', FOUNDATION, extended_positions[EXT_MIN_GATE],
        'no previous year in gate corpus',
    )
    expect_outside(
        'foundation-one-day-after-extended-right-boundary', FOUNDATION,
        extended_positions[EXT_MAX_GATE] + 1,
        'no next year in gate corpus',
    )
    print('Full finite gate-domain walking verification: PASS')


if __name__ == '__main__':
    main()
