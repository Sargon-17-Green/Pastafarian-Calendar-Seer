#!/usr/bin/env python3
from __future__ import annotations
import csv, os, random, re, statistics, subprocess, sys, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'build'; RESULTS=ROOT/'results'
RESULTS.mkdir(parents=True,exist_ok=True)
reps=int(sys.argv[1]) if len(sys.argv)>1 else 3
threads=int(os.getenv('COUNT_THREADS','4'))
replay_threads=int(os.getenv('REPLAY_THREADS','2'))
sb=int(os.getenv('SB','512'))
cooldown=float(os.getenv('COOLDOWN','2'))
backends={'base':'replay_cache_base','top2':'replay_cache_top2','all':'replay_cache_all'}
cases=[
    ('same-end',2461290,2464579),
    ('far-past-3576y',2461290,-12829630),
    ('forward-1002y',2461290,6788193),
]
rx=re.compile(r'(\w+)=([0-9.]+)')
rows=[]
for rep in range(1,reps+1):
    jobs=[(b,c) for c in cases for b in backends]
    random.Random(0x5EED0000+rep).shuffle(jobs)
    for b,(case,calc,target) in jobs:
        exe=BUILD/backends[b]
        cmd=['/usr/bin/time','-f','__TIME__ external_wall_s=%e max_rss_kb=%M',str(exe),str(calc),str(target),str(threads),str(sb),str(replay_threads)]
        p=subprocess.run(cmd,cwd=BUILD,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
        lines=[x for x in p.stdout.splitlines() if x.strip()]
        if len(lines)<2: raise RuntimeError(f'bad stdout for {b}/{case}: {p.stdout!r}')
        summary, timing=lines[0],lines[-1]
        vals={k:float(v) for k,v in rx.findall(timing)}
        tm=re.search(r'__TIME__ external_wall_s=([0-9.]+) max_rss_kb=(\d+)',p.stderr)
        if not tm: raise RuntimeError(f'missing /usr/bin/time line: {p.stderr!r}')
        row={
            'rep':rep,'backend':b,'case':case,'calc':calc,'target':target,
            'external_wall_s':float(tm.group(1)),'max_rss_kb':int(tm.group(2)),
            'all_ms':vals['all'],'walk_ms':vals['walk'],'rns_ctor_ms':vals['rns_ctor'],
            'rns_count_ms':vals['rns_count'],'prefix_total_ms':vals['prefix_total'],
            'replay_ms':vals['replay'],'reset_ms':vals['reset'],'ucrt_ms':vals['ucrt'],
            'cert':int(vals['cert']),'splits':int(vals['splits']),'micro':int(vals['micro']),
            'summary':summary,
        }
        rows.append(row)
        print(f"rep={rep} backend={b} case={case} all={row['all_ms']:.3f} replay={row['replay_ms']:.3f} rss_kb={row['max_rss_kb']}",flush=True)
        if cooldown: time.sleep(cooldown)

csv_path=RESULTS/'replay-cache-ab.csv'
with csv_path.open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)

out=[]
for case,_,_ in cases:
    out.append(f'[{case}]')
    meds={}
    for b in backends:
        rr=[r for r in rows if r['case']==case and r['backend']==b]
        med={k:statistics.median(r[k] for r in rr) for k in ('all_ms','replay_ms','prefix_total_ms','rns_ctor_ms','rns_count_ms','max_rss_kb')}
        meds[b]=med
        out.append(f"{b}: all_ms={med['all_ms']:.3f} replay_ms={med['replay_ms']:.3f} prefix_ms={med['prefix_total_ms']:.3f} ctor_ms={med['rns_ctor_ms']:.3f} rns_count_ms={med['rns_count_ms']:.3f} max_rss_kb={med['max_rss_kb']:.0f}")
    for b in ('top2','all'):
        base=meds['base']; x=meds[b]
        out.append(f"{b}_vs_base: all_delta_pct={(x['all_ms']/base['all_ms']-1)*100:.2f} replay_delta_pct={(x['replay_ms']/base['replay_ms']-1)*100:.2f} rss_delta_pct={(x['max_rss_kb']/base['max_rss_kb']-1)*100:.2f}")
    out.append('')
summary='\n'.join(out)
(RESULTS/'replay-cache-summary.txt').write_text(summary+'\n')
print('\n'+summary)
