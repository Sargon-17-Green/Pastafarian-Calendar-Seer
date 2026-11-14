#!/usr/bin/env python3
"""H200 task-to-native-service bridge. Exact date arithmetic happens in Seer C++.

This bridge cannot use H1000 archived events or holdout labels.  It never infers
success from an absent event file and never writes a completed receipt on error.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

TASK_SCHEMA = 'M-BIRTHDAY-CSP-H200-ENGINE-TASK/1.0'
DONE_SCHEMA = 'M-BIRTHDAY-CSP-H200-ENGINE-DONE/1.0'
SAMPLE_SHA = '75915fdb5270e12e21223aa48eaf5ebfa28305ba129498db3e4fe32c5d8cd442'
EVENT_HEADER = 'birth_jdn\ttarget_jdn\tage_days\tcutlet_match\tmonth_match\tmatch_type\n'


def canonical(obj):
    return (json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode('utf-8')


def load_task(path):
    obj=json.loads(Path(path).read_text('utf-8'))
    if not isinstance(obj,dict) or obj.get('schema')!=TASK_SCHEMA:
        raise ValueError('Unexpected task schema')
    if obj.get('frozen_sample_sha256')!=SAMPLE_SHA:
        raise ValueError('Frozen sample identity mismatch')
    age_a=obj.get('age_start');age_b=obj.get('age_end')
    if type(age_a)!=int or type(age_b)!=int or not (1<=age_a<=age_b<=73049):
        raise ValueError('Invalid age interval')
    births=obj.get('births')
    if not isinstance(births,list) or not births or any(type(b)!=int for b in births) or len(set(births))!=len(births):
        raise ValueError('Invalid birth vector')
    if len(births)>10: raise ValueError('Task has too many births')
    pairs=len(births)*(age_b-age_a+1)
    if type(obj.get('expected_evaluations'))!=int or obj['expected_evaluations']!=pairs:
        raise ValueError('Expected pair count mismatch')
    checksum=obj.get('task_sha256')
    if not isinstance(checksum,str) or len(checksum)!=64:
        raise ValueError('Missing task checksum')
    original={key:value for key,value in obj.items() if key!='task_sha256'}
    if checksum!=hashlib.sha256(canonical(original)).hexdigest():
        raise ValueError('Task checksum mismatch')
    return obj


def atomic_write(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix=path.name+'.tmp.',delete=False) as f:
        temp=Path(f.name)
        try:
            f.write(data);f.flush();os.fsync(f.fileno())
        except BaseException:
            temp.unlink(missing_ok=True);raise
    os.replace(temp,path)


def run(task,service,service_cwd,events,completion):
    # Explicit service binary required. This is NOT a Python reference oracle.
    service=Path(service).resolve()
    if not service.is_file():raise FileNotFoundError(service)
    proc=subprocess.Popen([str(service)],cwd=service_cwd,stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',bufsize=1)
    event_lines=[EVENT_HEADER]
    counts={str(b):0 for b in task['births']}
    positives=0
    start=time.monotonic()
    try:
        for birth in task['births']:
            for age in range(task['age_start'],task['age_end']+1):
                target=birth+age
                if proc.poll() is not None:raise RuntimeError('Native service stopped early')
                proc.stdin.write(f'P\t{target}\t{birth}\n');proc.stdin.flush()
                line=proc.stdout.readline()
                if not line:raise RuntimeError('Native service response missing')
                record=json.loads(line)
                if record.get('schema')!=1 or record.get('engine')!='seer-v12-pair-service':
                    raise RuntimeError('Unexpected native service response or error')
                if record.get('calculationJdn')!=target or record.get('birthJdn')!=birth:
                    raise RuntimeError('Native response identity mismatch')
                c=record.get('cutletMatch');m=record.get('monthMatch')
                if type(c)!=bool or type(m)!=bool:
                    raise RuntimeError('Invalid native event flags')
                counts[str(birth)]+=1
                if c or m:
                    typ='BOTH' if c and m else 'CUTLET' if c else 'MONTH'
                    event_lines.append(f'{birth}\t{target}\t{age}\t{int(c)}\t{int(m)}\t{typ}\n')
                    positives+=1
        proc.stdin.write('X\n');proc.stdin.flush();proc.stdin.close()
        rc=proc.wait(timeout=30)
        if rc!=0:raise RuntimeError('Native service exited nonzero: '+proc.stderr.read()[-300:])
    except BaseException:
        proc.kill();proc.wait()
        raise
    finally:
        if proc.stdin and not proc.stdin.closed:proc.stdin.close()
        if proc.stdout:proc.stdout.close()
        if proc.stderr:proc.stderr.close()
    data=''.join(event_lines).encode('utf-8')
    digest=hashlib.sha256(data).hexdigest()
    cert={'schema':DONE_SCHEMA,'task_sha256':task['task_sha256'],'complete':True,
          'pair_evaluations':sum(counts.values()),'evaluations_per_birth':counts,
          'events_sha256':digest,'positive_events':positives}
    if cert['pair_evaluations']!=task['expected_evaluations']:
        raise RuntimeError('Count reconciliation failed')
    # The completion file must only be published after the complete TSV is durable.
    atomic_write(events,data)
    atomic_write(completion,canonical(cert))
    print(json.dumps({'status':'NATIVE_PAIR_BRIDGE_COMPLETE','pairs':cert['pair_evaluations'],
                      'positive_events':positives,'elapsed_seconds':round(time.monotonic()-start,3)}))


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--task',required=True,type=Path)
    ap.add_argument('--events',required=True,type=Path)
    ap.add_argument('--completion',required=True,type=Path)
    ap.add_argument('--service',type=Path,default=Path(os.environ.get('SEER_H200_SERVICE_EXE','prototype/build/seer_engine_service')))
    ap.add_argument('--service-cwd',type=Path,default=Path(os.environ.get('SEER_H200_GATE_DATA_DIR','prototype/data')))
    args=ap.parse_args()
    try:
        task=load_task(args.task)
        run(task,args.service,args.service_cwd,args.events,args.completion)
    except Exception as exc:
        print(f'ERROR: {type(exc).__name__}: {exc}',file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':sys.exit(main())