#!/usr/bin/env python3
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BUILD = ROOT / 'build'
POS = DATA / 'gates_u16.bin'
NEG = DATA / 'gates_negative_u16.bin'
ORACLE = BUILD / 'canonical_vector_oracle'
FOUNDATION = -13_334_246
FIELDS = ('year', 'gates', 'len', 'offset', 'cutlet_idx', 'day_cutlet',
          'month_idx', 'day_month', 'months', 'Nbits', 'width')


def run(args):
    return subprocess.check_output([str(x) for x in args], cwd=DATA, text=True).strip()


def tokens(line):
    return dict(re.findall(r'([A-Za-z_]+)=([^ ]+)', line))


def reference(calc, target):
    return tokens(run([ORACLE, POS, calc, target, f'--negative-gates={NEG}']))


def check_backend(exe, extra_args):
    cases = [
        ('negative-same', FOUNDATION - 100, FOUNDATION - 100),
        ('cross-foundation-backward', FOUNDATION + 100, FOUNDATION - 3000),
        ('deep-negative', FOUNDATION - 5_000_000, FOUNDATION - 5_001_000),
    ]
    for name, calc, target in cases:
        expected = reference(calc, target)
        actual_line = next(
            line for line in run([exe, calc, target, *extra_args]).splitlines()
            if line.startswith('year=')
        )
        actual = tokens(actual_line)
        for field in FIELDS:
            if actual.get(field) != expected.get(field):
                raise AssertionError(
                    f'{Path(exe).name}:{name}:{field}: '
                    f'expected {expected.get(field)!r}, got {actual.get(field)!r}'
                )
        opening, closing = map(int, actual['gates'].split(':'))
        if opening >= 0 and closing >= 0:
            raise AssertionError(f'{Path(exe).name}:{name}: did not exercise negative gates')
        print(f'{Path(exe).name}: {name} gates={actual["gates"]} PASS')


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: check_bidirectional_benchmark_backends.py EXE [EXE ...]')
    for required in (POS, NEG, ORACLE):
        if not required.exists():
            raise SystemExit(f'missing required input: {required}')
    for raw in sys.argv[1:]:
        exe = Path(raw).resolve()
        if not exe.exists():
            raise SystemExit(f'missing backend executable: {exe}')
        check_backend(exe, ['4', '512'])
    print('Bidirectional benchmark backend verification: PASS')


if __name__ == '__main__':
    main()
