// Seer Next research-only exact second-day combinatorial shortcut validation.
// Cross-compares original native service, shortcut-enabled candidate, and
// selected independent saved-sum oracle values for the same (calc,target).
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bins={
  baseline:path.join(root,'prototype','build','seer_engine_service'),
  shortcut:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
  oracle:path.join(root,'research','seer-next','build','independent_canonical_oracle')
};
const positiveGates=path.join(cwd,'gates_100k_u16.bin');
const negativeGates=path.join(cwd,'gates_negative_100k_u16.bin');
const args=new Map(process.argv.slice(2).map(a=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(a);if(!m)throw Error('bad option '+a);return [m[1],m[2]];
}));
const tmp=await mkdtemp(path.join(tmpdir(),'seer-next-second-day-'));
function client(bin,tag,env) {
 const child=spawn(bin,[],{cwd,env:{...process.env,...env,
    SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0'},stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',stderr='',failed=null;
 child.stdout.setEncoding('utf8');
 child.stdout.on('data',data=>{
  buffer+=data;
  if(buffer.length>32*1024*1024){failed=Error(tag+': oversized response');pending?.reject(failed);pending=null;child.kill();return;}
  let n;
  while((n=buffer.indexOf('\n'))>=0) {
   const line=buffer.slice(0,n);buffer=buffer.slice(n+1);
   if(!pending){failed=Error(tag+': unsolicited stdout');child.kill();return;}
   const p=pending;pending=null;
   try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);}
  }
 });
 child.stderr.setEncoding('utf8');
 child.stderr.on('data',data=>{stderr=(stderr+data).slice(-4096);});
 child.on('error',e=>{failed=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  failed=failed??Error(tag+': process exit '+code+'/'+signal+': '+stderr);
  pending?.reject(failed);pending=null;
 });
 return {
  async call(fields) {
   if(failed)throw failed;
   if(pending)throw Error(tag+': concurrent native calls');
   let timer;
   const started=process.hrtime.bigint();
   try{
    const result=new Promise((resolve,reject)=>{pending={resolve,reject};});
    timer=setTimeout(()=>{
      failed=Error(tag+': timeout '+JSON.stringify(fields));
      pending?.reject(failed);pending=null;child.kill();
    },120000);
    child.stdin.write(fields.join('\t')+'\n');
    const data=await result;
    return {data,ms:Number(process.hrtime.bigint()-started)/1e6};
   }finally{clearTimeout(timer);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
function oracle(c,t) {
 const stdout=execFileSync(bins.oracle,[positiveGates,String(c),String(t),'--negative-gates='+negativeGates],
   {cwd,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
 const d=Object.fromEntries([...stdout.matchAll(/([A-Za-z_]+)=(-?\d+(?::-?\d+)?)/g)]
   .map(x=>[x[1],x[2]]));
 const conv=k=>{const n=Number(d[k]);if(!Number.isSafeInteger(n))throw Error('invalid oracle field '+k);return n;};
 return {year:conv('year'),cutletIndex:conv('cutlet_idx'),dayInCutlet:conv('day_cutlet'),
  monthIndex:conv('month_idx'),dayInMonth:conv('day_month'),
  cutletCount:conv('cutlets'),monthCount:conv('months')};
}
const calculationDays=[
  ...Array.from({length:25},(_,i)=>2461290+i-12),
  2461000,2461100,2461200,2461320,2461400,2461500,2461700,
  -13334246,-13334245,-13334244,-13334243,-13334242,-13334241,
  -13334240,-13334239,-13334238,-13334237,-13334236,
  -13334235,-13334234,-13334233,-13334232,
  2462000,2462500,2463000,2464000
];
assert.equal(new Set(calculationDays).size,calculationDays.length);
const trace=path.join(tmp,'shortcut.tsv');
const base=client(bins.baseline,'reference',{});
const fast=client(bins.shortcut,'candidate',{
 SEER_NEXT_SECOND_DAY_SHORTCUT:'1',SEER_NEXT_COLD_STAGE_FILE:trace
});
const rows=[];
try{
  const digest=createHash('sha256');
  for(let i=0;i<calculationDays.length;i++){
    const c=calculationDays[i];
    const query=['Y',String(c),'5000','0'];
    const aY=(await base.call(query)).data;
    const bY=(await fast.call(query)).data;
    assert.deepStrictEqual(bY,aY,'Y structure parity '+c);
    assert.equal(aY.year,5000);
    const t=aY.startJdn+1;
    assert.ok(t<=aY.endJdn,'year must contain second day');
    const fields=['R',String(c),String(t),'1'];
    const order=i%2===0?['baseline','shortcut']:['shortcut','baseline'];
    const result={};
    for(const name of order)result[name]=await (name==='baseline'?base:fast).call(fields);
    assert.deepStrictEqual(result.shortcut.data,result.baseline.data,
      'second-day full JSON mismatch '+c+'/'+t);
    assert.equal(result.baseline.data.records?.length,1);
    assert.equal(result.shortcut.data.records[0].targetJdn,t);
    const r={calculationJdn:c,targetJdn:t,yearStart:aY.startJdn,
      baselineMs:result.baseline.ms,shortcutMs:result.shortcut.ms,
      selectedMonthIndex:result.shortcut.data.records[0].monthIndex,
      selectedMonthDay:result.shortcut.data.records[0].dayInMonth,
      fullReplyEqual:true};
    if(i<8){
      const independent=oracle(c,t);
      for(const [name,value] of Object.entries(independent))
        assert.equal(result.shortcut.data.records[0][name],value,
          'independent saved-sum mismatch '+c+'/'+t+' '+name);
      r.independentOracle=true;
    }
    digest.update(JSON.stringify({c,t,answer:result.baseline.data})+'\n');
    rows.push(r);
  }
  const content=await readFile(trace,'utf8');
  const entries=content.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(entries.length,rows.length,'one shortcut trace for each distinct calculation day');
  for(const line of entries){
    assert.ok(line.startsWith('second_day\t'),
      'unintended fallback to RNS: '+line);
    const nums=line.split('\t').map((x,i)=>i===0?x:Number(x));
    assert.equal(nums.length,9);
    assert.equal(nums[4],1,'shortcut must report no RNS weave');
    assert.equal(nums[7],0,'shortcut must have zero measured RNS work');
  }
  const sortedBase=rows.map(x=>x.baselineMs).sort((a,b)=>a-b);
  const sortedFast=rows.map(x=>x.shortcutMs).sort((a,b)=>a-b);
  const median=a=>a[Math.floor((a.length-1)/2)];
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const stats={baselineMedianMs:median(sortedBase),candidateMedianMs:median(sortedFast),
    baselineTotalMs:sum(rows.map(x=>x.baselineMs)),
    candidateTotalMs:sum(rows.map(x=>x.shortcutMs))};
  const final={schema:'seer-next-exact-second-day-v1',
    sourceBaseline:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
    cpu:cpus()[0]?.model,requests:rows.length,
    independentOracleRequests:rows.filter(x=>x.independentOracle).length,
    completeReplyParity:true,allFastPathsTaken:true,
    traceEventCount:entries.length,responseSequenceSHA256:digest.digest('hex'),
    timing:stats,totalRatio:stats.baselineTotalMs/stats.candidateTotalMs,
    rows,caveats:['Within-host small sample of anchored Year 5000 and two date regions.',
      'Service pipe timings include native work but not process spawn; both services were warm processes and each c was new.',
      'Candidate only: research opt-in flag; the production Seer source remains unchanged.',
      'No mathematical claim about deeper-year random access or other offsets.']};
  const out=JSON.stringify(final,null,2)+'\n';
  if(args.has('output'))await writeFile(path.resolve(args.get('output')),out,'utf8');
  else process.stdout.write(out);
} finally {base.close();fast.close();await rm(tmp,{recursive:true,force:true});}
