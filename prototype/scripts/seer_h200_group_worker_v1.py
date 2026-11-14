#!/usr/bin/env python3
"""Grouped native Seer birthday worker for frozen H200 tasks.

The C++ B command owns all calendar arithmetic and reports exact CUTLET and
MONTH flags. This adapter groups pairs by calculation day, validates each
native response and emits the preexisting engine-task contract verbatim.
"""
from __future__ import annotations
import argparse,hashlib,json,os
from pathlib import Path
import subprocess,sys,time
from seer_h200_pair_worker_v1 import load_task,atomic_write,canonical,DONE_SCHEMA,EVENT_HEADER


def run_group(task,service,service_cwd,events,completion):
    service=Path(service).resolve()
    if not service.is_file():raise FileNotFoundError(service)
    proc=subprocess.Popen([str(service)],cwd=service_cwd,stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',bufsize=1)
    events_text=[EVENT_HEADER]
    counts={str(b):0 for b in task['births']}
    positives=0;requests=0
    begin=time.monotonic()
    lo=task['age_start'];hi=task['age_end'];births=task['births']
    try:
        for target in range(min(b+lo for b in births),max(b+hi for b in births)+1):
            active=[b for b in births if lo<=target-b<=hi]
            if not active:continue
            if proc.poll() is not None:raise RuntimeError('Native group service stopped early')
            proc.stdin.write('B\t'+str(target)+'\t'+','.join(map(str,active))+'\n');proc.stdin.flush()
            raw=proc.stdout.readline()
            if not raw:raise RuntimeError('Native B response missing')
            row=json.loads(raw)
            if row.get('schema')!=1 or row.get('engine')!='seer-v12-birthday-group':
                raise RuntimeError('Native B failed or returned an unexpected service response')
            if row.get('calculationJdn')!=target:raise RuntimeError('Native B calculation day mismatch')
            records=row.get('records')
            if not isinstance(records,list) or len(records)!=len(active):
                raise RuntimeError('Native B returned wrong number of births')
            for b,rec in zip(active,records):
                if rec.get('birthJdn')!=b:raise RuntimeError('Native B birth/order mismatch')
                c=rec.get('cutletMatch');m=rec.get('monthMatch')
                if type(c)!=bool or type(m)!=bool:raise RuntimeError('Invalid native B flags')
                counts[str(b)]+=1
                if c or m:
                    typ='BOTH' if c and m else 'CUTLET' if c else 'MONTH'
                    events_text.append(f'{b}\t{target}\t{target-b}\t{int(c)}\t{int(m)}\t{typ}\n')
                    positives+=1
            requests+=1
        proc.stdin.write('X\n');proc.stdin.flush();proc.stdin.close()
        rc=proc.wait(timeout=30)
        if rc!=0:raise RuntimeError('Native group service exited with code '+str(rc))
    except BaseException:
        proc.kill();proc.wait();raise
    finally:
        if proc.stdin and not proc.stdin.closed:proc.stdin.close()
        if proc.stdout:proc.stdout.close()
        if proc.stderr:proc.stderr.close()
    expected_per_birth=hi-lo+1
    if any(v!=expected_per_birth for v in counts.values()):
        raise RuntimeError('Group pair coverage was incomplete')
    data=''.join(events_text).encode('utf-8')
    cert={'schema':DONE_SCHEMA,'task_sha256':task['task_sha256'],'complete':True,
          'pair_evaluations':sum(counts.values()),'evaluations_per_birth':counts,
          'events_sha256':hashlib.sha256(data).hexdigest(),'positive_events':positives}
    if cert['pair_evaluations']!=task['expected_evaluations']:
        raise RuntimeError('Group total pair count mismatch')
    atomic_write(events,data)
    atomic_write(completion,canonical(cert))
    print(json.dumps({'status':'NATIVE_GROUP_COMPLETE','pairs':cert['pair_evaluations'],
                      'group_requests':requests,'positive_events':positives,
                      'elapsed_seconds':round(time.monotonic()-begin,3)}))


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--task',required=True,type=Path)
    ap.add_argument('--events',required=True,type=Path)
    ap.add_argument('--completion',required=True,type=Path)
    ap.add_argument('--service',type=Path,default=Path(os.environ.get('SEER_H200_SERVICE_EXE','prototype/build/seer_engine_service')))
    ap.add_argument('--service-cwd',type=Path,default=Path(os.environ.get('SEER_H200_GATE_DATA_DIR','prototype/data')))
    args=ap.parse_args()
    try:
        run_group(load_task(args.task),args.service,args.service_cwd,args.events,args.completion)
    except Exception as ex:
        print(f'ERROR: {type(ex).__name__}: {ex}',file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())