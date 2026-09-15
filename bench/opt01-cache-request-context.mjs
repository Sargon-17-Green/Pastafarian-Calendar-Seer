import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createCacheRequestContext, loadCacheRecordForCalculationDay } from '../precompute/cache-lookup.mjs';

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
const generatedDir = await mkdtemp(path.join(os.tmpdir(), 'seer-opt01-bench-'));
const calcJdn = 2461299, targetCount = 366, engineFingerprint='engine-test';
const records = Array.from({length:targetCount},(_,i)=>({targetJdn:calcJdn+i,year:5000,cutletIndex:i%17,dayInCutlet:1,monthIndex:i%47,dayInMonth:1,cutletCount:17,monthCount:47}));
const cache={schema:1,calcJdn,targetStartJdn:calcJdn,targetCount,engineFingerprint,records};
const raw=Buffer.from(`${JSON.stringify(cache)}\n`);
await mkdir(path.join(generatedDir,'calc'),{recursive:true});
await writeFile(path.join(generatedDir,'calc',`${calcJdn}.json`),raw);
const index={schema:1,rollingTargetDaysPerCalculationDay:targetCount,engineFingerprint,caches:[{calcJdn,path:`calc/${calcJdn}.json`,sha256:sha256(raw),targetStartJdn:calcJdn,targetCount}]};
await writeFile(path.join(generatedDir,'index.json'),`${JSON.stringify(index)}\n`);

async function baseline(){for(let i=0;i<targetCount;i++) await loadCacheRecordForCalculationDay({generatedDir,calcJdn,targetJdn:calcJdn+i});}
async function candidate(){const ctx=createCacheRequestContext({generatedDir});for(let i=0;i<targetCount;i++) await ctx.loadRecord(calcJdn,calcJdn+i);}
await baseline(); await candidate();
const b=[],c=[];
for(let i=0;i<7;i++){
  for(const [name,fn,arr] of (i%2===0?[['baseline',baseline,b],['candidate',candidate,c]]:[['candidate',candidate,c],['baseline',baseline,b]])){
    const t0=performance.now(); await fn(); arr.push(performance.now()-t0);
  }
}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
console.log(JSON.stringify({baselineMs:b,candidateMs:c,baselineMedianMs:median(b),candidateMedianMs:median(c),ratio:median(b)/median(c)},null,2));
