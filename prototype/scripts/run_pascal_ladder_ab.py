#!/usr/bin/env python3
from __future__ import annotations
import csv, os, random, re, statistics, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; BUILD=ROOT/'build'; RESULTS=ROOT/'results'; RESULTS.mkdir(parents=True,exist_ok=True)
reps=int(sys.argv[1]) if len(sys.argv)>1 else 5
threads=int(os.getenv('COUNT_THREADS','4')); replay_threads=int(os.getenv('REPLAY_THREADS','2')); sb=int(os.getenv('SB','512')); cooldown=float(os.getenv('COOLDOWN','2'))
backs={'base':'pascal_ladder_base','cand':'pascal_ladder_candidate'}
cases=[('same-query',2461290,2461290),('same-end',2461290,2464579),('far-past-3576y',2461290,-12829630),('forward-1002y',2461290,6788193)]
rx=re.compile(r'(\w+)=([0-9.]+)'); rows=[]
for rep in range(1,reps+1):
    jobs=[(b,c) for c in cases for b in backs]; random.Random(0x50415343+rep).shuffle(jobs)
    for b,(case,calc,target) in jobs:
        cmd=['/usr/bin/time','-f','__TIME__ external_wall_s=%e max_rss_kb=%M',str(BUILD/backs[b]),str(calc),str(target),str(threads),str(sb),str(replay_threads)]
        p=subprocess.run(cmd,cwd=BUILD,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
        lines=[x for x in p.stdout.splitlines() if x.strip()]; vals={k:float(v) for k,v in rx.findall(lines[-1])}
        tm=re.search(r'__TIME__ external_wall_s=([0-9.]+) max_rss_kb=(\d+)',p.stderr)
        if not tm: raise RuntimeError(p.stderr)
        row={'rep':rep,'backend':b,'case':case,'calc':calc,'target':target,'external_wall_s':float(tm.group(1)),'max_rss_kb':int(tm.group(2)),
             'all_ms':vals['all'],'walk_ms':vals['walk'],'rns_ctor_ms':vals['rns_ctor'],'rns_count_ms':vals['rns_count'],'prefix_total_ms':vals['prefix_total'],'replay_ms':vals['replay'],'reset_ms':vals['reset'],'ucrt_ms':vals['ucrt']}
        rows.append(row); print(f"rep={rep} backend={b} case={case} all={row['all_ms']:.3f} rns={row['rns_count_ms']:.3f} replay={row['replay_ms']:.3f} rss_kb={row['max_rss_kb']}",flush=True)
        if cooldown: time.sleep(cooldown)
with (RESULTS/'pascal-ladder-ab.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
out=[]
for case,_,_ in cases:
    out.append(f'[{case}]'); meds={}
    for b in backs:
        rr=[r for r in rows if r['case']==case and r['backend']==b]
        med={k:statistics.median(r[k] for r in rr) for k in ('all_ms','rns_count_ms','prefix_total_ms','replay_ms','max_rss_kb')}; meds[b]=med
        out.append(f"{b}: all_ms={med['all_ms']:.3f} rns_count_ms={med['rns_count_ms']:.3f} prefix_ms={med['prefix_total_ms']:.3f} replay_ms={med['replay_ms']:.3f} max_rss_kb={med['max_rss_kb']:.0f}")
    a=meds['base']; b=meds['cand']; out.append(f"cand_vs_base: all_delta_pct={(b['all_ms']/a['all_ms']-1)*100:.2f} rns_delta_pct={(b['rns_count_ms']/a['rns_count_ms']-1)*100:.2f} replay_delta_pct={(b['replay_ms']/a['replay_ms']-1)*100:.2f} rss_delta_pct={(b['max_rss_kb']/a['max_rss_kb']-1)*100:.2f}"); out.append('')
summary='\n'.join(out); (RESULTS/'pascal-ladder-summary.txt').write_text(summary+'\n'); print('\n'+summary)
