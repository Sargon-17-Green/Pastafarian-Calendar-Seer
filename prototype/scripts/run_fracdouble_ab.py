#!/usr/bin/env python3
import csv, os, re, statistics, subprocess, sys, time
from pathlib import Path
reps=int(sys.argv[1]) if len(sys.argv)>1 else 7
root=Path(__file__).resolve().parents[2]
build=root/'prototype'/'build'; results=root/'prototype'/'results'; results.mkdir(exist_ok=True)
cool=float(os.environ.get('COOLDOWN','2'))
cases=[('same-query',2461290,2461290),('same-end',2461290,2464579),('far-past-3576y',2461290,-12829630),('forward-1002y',2461290,6788193)]
num=re.compile(r'(\w+)=([0-9.]+)')
def one(tag,c,t):
    exe=build/('fracdouble_base' if tag=='base' else 'fracdouble_candidate')
    tf=results/'time.tmp'
    p=subprocess.run(['/usr/bin/time','-f','maxrss_kb=%M', '-o',str(tf), str(exe),str(c),str(t),'4','512','2'],cwd=build,text=True,capture_output=True,check=True)
    line=next(x for x in p.stdout.splitlines() if x.startswith('ms '))
    vals={k:float(v) for k,v in num.findall(line)}
    rss=float(tf.read_text().strip().split('=')[1]); vals['maxrss_kb']=rss
    sem=next(x for x in p.stdout.splitlines() if x.startswith('year='))
    return vals,sem
rows=[]
for name,c,t in cases:
    for r in range(1,reps+1):
        order=['base','candidate'] if r%2 else ['candidate','base']
        pair={}
        for tag in order:
            vals,sem=one(tag,c,t); pair[tag]=(vals,sem); time.sleep(cooldown)
        if pair['base'][1]!=pair['candidate'][1]: raise SystemExit(f'semantic mismatch {name} rep {r}')
        for tag in ('base','candidate'):
            v=pair[tag][0]
            rows.append({'case':name,'rep':r,'backend':tag,**{k:v.get(k,0.0) for k in ('all','walk','rns_count','prefix_total','replay','reset','maxrss_kb')}})
out=results/'fracdouble-ab.csv'
with out.open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
summary=[]
for name,_,_ in cases:
    summary.append(f'[{name}]')
    rr=[x for x in rows if x['case']==name]
    for metric in ('all','rns_count','prefix_total','replay','reset','maxrss_kb'):
        b={x['rep']:x[metric] for x in rr if x['backend']=='base'}; c={x['rep']:x[metric] for x in rr if x['backend']=='candidate'}
        ds=[(c[i]-b[i])/b[i]*100 if b[i] else 0.0 for i in sorted(b)]
        wins=sum(c[i]<b[i] for i in b)
        summary.append(f'{metric}: base_med={statistics.median(b.values()):.3f} candidate_med={statistics.median(c.values()):.3f} paired_median_pct={statistics.median(ds):+.3f}% wins={wins}/{len(b)}')
    summary.append('')
text='\n'.join(summary); print(text); (results/'fracdouble-summary.txt').write_text(text+'\n')
