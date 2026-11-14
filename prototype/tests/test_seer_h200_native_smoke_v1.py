#!/usr/bin/env python3
"""Check new P response against Seer's existing R route and safe rejects.

Not an independent canonical oracle. Do NOT treat this as H200 qualification.
"""
import argparse
import json
from pathlib import Path
import subprocess

CASES=[(2461290,2460984),(2463008,2461290),(-13334245,-13334246),(6700000,6699900)]


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--service',required=True,type=Path)
    p.add_argument('--data',required=True,type=Path)
    args=p.parse_args()
    requests=[]
    for t,b in CASES:
        requests.extend([f'P\t{t}\t{b}',f'R\t{t}\t{t}\t1',f'R\t{t}\t{b}\t1'])
    requests.extend(['P\t123\t124','X'])
    run=subprocess.run([str(args.service.resolve())],cwd=args.data.resolve(),
        input='\n'.join(requests)+'\n',text=True,capture_output=True,timeout=300,check=True)
    actual=[json.loads(x) for x in run.stdout.splitlines()]
    assert len(actual)==3*len(CASES)+1,(len(actual),run.stderr)
    for idx,(t,b) in enumerate(CASES):
        pair,now,past=actual[idx*3:idx*3+3]
        assert pair['engine']=='seer-v12-pair-service'
        assert (pair['calculationJdn'],pair['birthJdn'])==(t,b)
        n=now['records'][0];q=past['records'][0]
        cut=n['cutletIndex']==q['cutletIndex'] and n['dayInCutlet']==q['dayInCutlet']
        mon=n['monthIndex']==q['monthIndex'] and n['dayInMonth']==q['dayInMonth']
        assert (pair['cutletMatch'],pair['monthMatch'])==(cut,mon),(t,b,pair,n,q)
    assert actual[-1].get('ok') is False
    print(f'PASS: {len(CASES)} paired native P/R comparisons, rejects reverse chronology')

if __name__=='__main__':main()