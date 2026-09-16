#!/usr/bin/env python3
import csv
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BUILD = ROOT / 'build'
POS = DATA / 'gates_u16.bin'
NEG = DATA / 'gates_negative_u16.bin'
ORACLE = BUILD / 'canonical_vector_oracle'
BATCH = BUILD / 'seer_year_batch'
FOUNDATION = -13_334_246


def run(args):
    return subprocess.check_output([str(x) for x in args], cwd=DATA, text=True).strip()


def tokens(text):
    return dict(re.findall(r'([A-Za-z_]+)=([^ ]+)', text))
def oracle(calc, target, bidirectional=False):
    args = [ORACLE, POS, calc, target]
    if bidirectional:
        args.append(f'--negative-gates={NEG}')
    return tokens(run(args))


def batch_record(calc, target):
    payload = json.loads(run([BATCH, calc, target, 1]))
    assert payload['schema'] == 1
    assert payload['calcJdn'] == calc
    assert payload['targetStartJdn'] == target
    assert payload['targetCount'] == 1
    return payload['records'][0]


def assert_equal(label, got, expected):
    if got != expected:
        raise AssertionError(f'{label}: expected {expected!r}, got {got!r}')


def compare_record(label, record, ref, target):
    mapping = {
        'targetJdn': target,
        'year': int(ref['year']),
        'cutletIndex': int(ref['cutlet_idx']),
        'dayInCutlet': int(ref['day_cutlet']),
        'monthIndex': int(ref['month_idx']),
        'dayInMonth': int(ref['day_month']),
        'cutletCount': int(ref['cutlets']),
        'monthCount': int(ref['months']),
    }
    for key, expected in mapping.items():
        assert_equal(f'{label}:{key}', record[key], expected)


def check_positive_vectors():
    rows = list(csv.DictReader((DATA / 'canonical_saved_sum_vectors.tsv').open(), delimiter='\t'))
    by_name = {row['name']: row for row in rows}
    for row in rows:
        calc, target = int(row['calc']), int(row['target'])
        ref = oracle(calc, target, False)
        expected = {
            'year': row['year'], 'steps': row['steps'], 'gates': row['gates'],
            'len': row['len'], 'offset': row['offset'], 'cutlet_idx': row['cutlet_idx'],
            'day_cutlet': row['day_cutlet'], 'month_idx': row['month_idx'],
            'day_month': row['day_month'], 'months': row['months'],
            'Nbits': row['Nbits'], 'width': row['width'],
        }
        for key, value in expected.items():
            assert_equal(f"positive-oracle:{row['name']}:{key}", ref[key], value)
    for name in ('same-query', 'far-past', 'forward'):
        row = by_name[name]
        calc, target = int(row['calc']), int(row['target'])
        ref = oracle(calc, target, False)
        compare_record(f'positive-engine:{name}', batch_record(calc, target), ref, target)
    print(f'positive canonical vectors: {len(rows)} oracle PASS; 3 engine witnesses PASS')


def check_negative_domain():
    cases = [
        ('foundation-exact', FOUNDATION, FOUNDATION),
        ('negative-same', FOUNDATION - 100, FOUNDATION - 100),
        ('cross-foundation-backward', FOUNDATION + 100, FOUNDATION - 3000),
        ('deep-negative', FOUNDATION - 5_000_000, FOUNDATION - 5_001_000),
    ]
    saw_negative_gate = False
    for name, calc, target in cases:
        ref = oracle(calc, target, True)
        record = batch_record(calc, target)
        compare_record(f'negative-engine:{name}', record, ref, target)
        opening, closing = map(int, ref['gates'].split(':'))
        saw_negative_gate |= opening < 0 or closing < 0
        if name == 'foundation-exact' and not (opening < 0 <= closing):
            raise AssertionError(f'foundation exact year must straddle gate 0, got {opening}:{closing}')
        print(f'{name}: calc={calc} target={target} year={ref["year"]} gates={ref["gates"]} PASS')
    if not saw_negative_gate:
        raise AssertionError('negative-domain cases never used a negative gate index')


def main():
    for required in (POS, NEG, ORACLE, BATCH):
        if not required.exists():
            raise SystemExit(f'missing required Phase B input: {required}')
    check_positive_vectors()
    check_negative_domain()
    print('Bidirectional gate-domain oracle/engine verification: PASS')


if __name__ == '__main__':
    main()
