#!/usr/bin/env python3
"""Synthetic grouped I/O tests; cannot calculate or infer H200 outcomes."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE.parent / 'scripts'))
from seer_h200_pair_worker_v1 import canonical
SAMPLE='75915fdb5270e12e21223aa48eaf5ebfa28305ba129498db3e4fe32c5d8cd442'


def go():
 with tempfile.TemporaryDirectory(prefix='group-bridge-test-') as d:
  p=Path(d);service=p/'fake_service.py'
  service.write_text('''#!/usr/bin/env python3
import sys,json
for line in sys.stdin:
 if line.strip()=='X':break
 kind,t,raw=line.strip().split('\\t');t=int(t)
 if kind!='B':raise SystemExit(2)
 births=list(map(int,raw.split(',')))
 records=[{'birthJdn':b,'cutletMatch':t-b==11,'monthMatch':t-b==12} for b in births]
 print(json.dumps({'schema':1,'engine':'seer-v12-birthday-group','calculationJdn':t,'records':records}),flush=True)
''')
  service.chmod(0o755)
  task={'schema':'M-BIRTHDAY-CSP-H200-ENGINE-TASK/1.0','chunk_id':'SYNTHETIC_ONLY','births':[101,201],
        'births_sha256':'SYNTHETIC','frozen_sample_sha256':SAMPLE,'age_start':10,'age_end':12,'expected_evaluations':6}
  task['task_sha256']=hashlib.sha256(canonical(task)).hexdigest()
  tf=p/'task.json';tf.write_bytes(canonical(task));evt=p/'events.tsv';done=p/'completion.json'
  cmd=[sys.executable,str(BASE/'seer_h200_group_worker_v1.py'),'--task',str(tf),'--events',str(evt),
       '--completion',str(done),'--service',str(service),'--service-cwd',str(p)]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=30);assert r.returncode==0,(r.stdout,r.stderr)
  cert=json.loads(done.read_text());assert cert['pair_evaluations']==6 and cert['positive_events']==4
  assert cert['events_sha256']==hashlib.sha256(evt.read_bytes()).hexdigest()
  ls=evt.read_text().splitlines()
  assert len(ls)==5
  assert ls[1]=='101\t112\t11\t1\t0\tCUTLET'
  assert ls[3]=='201\t212\t11\t1\t0\tCUTLET'
  print('PASS: grouped adapter covers six synthetic pairs with correct event/certificate checksums')

if __name__=='__main__':go()