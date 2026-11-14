#!/usr/bin/env python3
"""Synthetic protocol/receipt tests; never calculate an H200 outcome."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

BASE=Path(__file__).resolve().parent
WORKER=BASE/'seer_h200_pair_worker_v1.py'
SAMPLE_SHA='75915fdb5270e12e21223aa48eaf5ebfa28305ba129498db3e4fe32c5d8cd442'


def stable(obj):return (json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()


def task(births=[101,201],lo=10,hi=12):
    obj={'schema':'M-BIRTHDAY-CSP-H200-ENGINE-TASK/1.0','chunk_id':'TEST_ONLY_NOT_H200',
         'births':births,'births_sha256':'test-births','frozen_sample_sha256':SAMPLE_SHA,
         'age_start':lo,'age_end':hi,'expected_evaluations':len(births)*(hi-lo+1)}
    obj['task_sha256']=hashlib.sha256(stable(obj)).hexdigest();return obj


def prepare(root):
    service=root/'fake_service.py'
    service.write_text('''#!/usr/bin/env python3
import json,sys
for line in sys.stdin:
    if line.strip()=='X':break
    f=line.strip().split('\\t')
    if f[0]!='P':raise SystemExit(2)
    t,b=map(int,f[1:]);a=t-b
    # purely synthetic test flags, NOT a calendar computation
    print(json.dumps({'schema':1,'engine':'seer-v12-pair-service',
      'calculationJdn':t,'birthJdn':b,'cutletMatch':a==11,
      'monthMatch':a==12},separators=(',',':')),flush=True)
''')
    service.chmod(0o755)
    return service


def run(root,service,obj,expected=0):
    f=root/'task.json';o=root/'events.tsv';c=root/'done.json'
    f.write_bytes(stable(obj))
    cmd=[sys.executable,str(WORKER),'--task',str(f),'--events',str(o),
         '--completion',str(c),'--service',str(service),'--service-cwd',str(root)]
    r=subprocess.run(cmd,capture_output=True,text=True,timeout=30)
    if r.returncode!=expected:raise AssertionError(f'exit {r.returncode}, expected {expected}: {r.stdout} {r.stderr}')
    return r,o,c


def main():
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp);service=prepare(root)
        r,events,done=run(root,service,task())
        cert=json.loads(done.read_text())
        assert cert['pair_evaluations']==6
        assert cert['evaluations_per_birth']=={'101':3,'201':3}
        assert cert['positive_events']==4
        assert cert['events_sha256']==hashlib.sha256(events.read_bytes()).hexdigest()
        rows=events.read_text().splitlines()
        assert len(rows)==5
        assert rows[1]=='101\t112\t11\t1\t0\tCUTLET'
        assert rows[2]=='101\t113\t12\t0\t1\tMONTH'
        done.unlink();events.unlink()
        bad=task();bad['expected_evaluations']=7
        run(root,service,bad,expected=1)
        assert not done.exists() and not events.exists()
        bad=task();bad['task_sha256']='0'*64
        run(root,service,bad,expected=1)
        assert not done.exists()
        r,_,_=run(root,service,task(births=[9],lo=1,hi=2))
        assert json.loads(done.read_text())['pair_evaluations']==2
        print('PASS: 3 protocol cases, deterministic events, SHA-256 completion, malformed task rejection')

if __name__=='__main__':main()