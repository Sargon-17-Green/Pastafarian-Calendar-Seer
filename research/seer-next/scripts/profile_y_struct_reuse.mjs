// Isolated structure-reuse experiment. Full native replies, no production changes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {cpus,platform,arch} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const binaries={
 reference:path.join(root,'prototype','build','seer_engine_service'),
 control:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
 reuse:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service')
};
const options=new Map(process.argv.slice(2).map(s=>{
 const match=/^--([a-z-]+)=(.*)$/.exec(s);
 if(!match)throw Error('Invalid option: '+s);
 return [match[1],match[2]];
}));
const trials=Number(options.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>4)throw Error('trials must be 1..4');
const budget=8*1024*1024;
const cap=512*1024*1024;
const cases=[2461290,2461400].flatMap(calc=>[4999,5000,5001].map(year=>({calc,year})));
const tick=()=>process.hrtime.bigint();
const milliseconds=start=>Number(tick()-start)/1e6;
function createService(kind,cacheBytes=budget,capBytes=0){
 const child=spawn(binaries[kind],[],{
  cwd,
  env:{...process.env,
   SEER_NEXT_EXECUTION_PROFILE:kind==='reference'?'latency':'experimental42',
   SEER_NEXT_Y_MEMO_DIRECT:kind==='reference'?'0':'1',
   SEER_NEXT_Y_STRUCT_REUSE:kind==='reuse'?'1':'0',
   SEER_NEXT_CACHE_BYTES:String(cacheBytes),
   SEER_NEXT_DAY_CACHE_BYTES:'0',
   SEER_NEXT_PROMOTE_AFTER:'2',
   ...(capBytes?{SEER_NEXT_MAX_VIRTUAL_BYTES:String(capBytes)}:{})
  },
  stdio:['pipe','pipe','pipe']
 });
 let pending=null,buffer='',closed=null,stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stderr.on('data',s=>{stderr=(stderr+s).slice(-8192);});
 child.stdout.on('data',chunk=>{
  buffer+=chunk;
  if(buffer.length>64*1024*1024){
   closed=Error('Native response parser buffer exceeded 64MiB');
   pending?.reject(closed);pending=null;child.kill();return;
  }
  let index;
  while((index=buffer.indexOf('\n'))!==-1){
   const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
   if(!pending){closed=Error('Unexpected native stdout line');child.kill();return;}
   const p=pending;pending=null;
   try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);}
  }
 });
 child.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  closed??=Error('Native closed: '+code+'/'+signal+' '+stderr);
  pending?.reject(closed);pending=null;
 });
 return {
  pid:child.pid,
  async call(fields){
   if(closed)throw closed;
   if(pending)throw Error('Concurrent calls unsupported');
   const begin=tick();
   let timeout;
   try{
    const answer=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     closed=Error('Native command timed out: '+fields.join(' '));
     pending?.reject(closed);pending=null;child.kill();
    },180000);
    child.stdin.write(fields.join('\t')+'\n');
    const value=await answer;
    if(value?.ok===false||value?.error)throw Error('Native semantic error: '+JSON.stringify(value).slice(0,600));
    return {value,ms:milliseconds(begin)};
   }finally{clearTimeout(timeout);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
async function memory(pid){
 const text=await readFile('/proc/'+pid+'/status','utf8');
 function get(field){
  const match=new RegExp('^'+field+':\\s+(\\d+) kB','m').exec(text);
  if(!match)throw Error('Missing process memory field '+field);
  return Number(match[1]);
 }
 return {vmPeakKiB:get('VmPeak'),rssHighWaterKiB:get('VmHWM')};
}
async function kernelLimit(pid){
 const limits=await readFile('/proc/'+pid+'/limits','utf8');
 const match=/^Max address space\s+(\d+)\s+/m.exec(limits);
 if(!match)throw Error('Effective RLIMIT_AS missing');
 return Number(match[1]);
}
function checkYear(value,calc,year){
 assert.equal(value.calcJdn,calc);
 assert.equal(value.year,year);
 assert.equal(value.endJdn-value.startJdn+1,value.lengthDays);
 assert.equal(value.days?.length,value.lengthDays);
 assert.equal(value.days[0]?.targetJdn,value.startJdn);
 assert.equal(value.days.at(-1)?.targetJdn,value.endJdn);
}
async function runThree(kind,tc,reference){
 const start=tick();
 const service=createService(kind);
 const cmd=['Y',String(tc.calc),String(tc.year),'1'];
 const timings=[],replies=[];
 let spawnToFirstMs=null;
 try{
  for(let i=0;i<3;i++){
   const {value,ms}=await service.call(cmd);
   checkYear(value,tc.calc,tc.year);
   if(reference)assert.deepStrictEqual(value,reference,'Full year parity '+kind+' '+JSON.stringify(tc));
   if(i>0)assert.deepStrictEqual(value,replies[0],'Repeat full Y parity');
   replies.push(value);timings.push(ms);
   if(i===0)spawnToFirstMs=milliseconds(start);
  }
  let memo=null;
  if(kind!=='reference'){
   memo=(await service.call(['M'])).value.memo;
   assert.equal(memo.builds,1);
   assert.equal(memo.hits,2);
   assert.equal(memo.evictions,0);
   assert.equal(memo.keys,1);
   assert.ok(memo.payloadBytes>0&&memo.payloadBytes<=budget);
   assert.equal(memo.serviceYearStructBuilds,kind==='reuse'?1:4,
    'The reuse path must remove exactly three structure builds');
  }
  return {
   original:replies[0],
   evidence:{kind,tc,perRequestMs:timings,spawnToFirstMs,
    fullParity:true,memo,memory:await memory(service.pid)}
  };
 }finally{service.close();}
}
const results=[];
for(let trial=0;trial<trials;trial++){
 for(let k=0;k<cases.length;k++){
  const tc=cases[(k+trial*2)%cases.length];
  const original=await runThree('reference',tc,null);
  const order=(k+trial)%2===0?['control','reuse']:['reuse','control'];
  const rows={reference:original.evidence};
  for(const kind of order){
   const candidate=await runThree(kind,tc,original.original);
   rows[kind]=candidate.evidence;
  }
  results.push({trial,...tc,rows,fullParity:true});
 }
}
assert.equal(results.length,trials*cases.length);
async function interopCase(label,budgetBytes,commands,expected){
 const reference=createService('reference',0);
 const test=createService('reuse',budgetBytes);
 try{
  for(const cmd of commands){
   const a=(await reference.call(cmd)).value;
   const b=(await test.call(cmd)).value;
   assert.deepStrictEqual(b,a,label+' '+cmd.join(' '));
  }
  const memo=(await test.call(['M'])).value.memo;
  for(const [field,value] of Object.entries(expected))
   assert.equal(memo[field],value,label+' field '+field);
  assert.ok(memo.payloadBytes<=budgetBytes);
  return {label,commands:commands.length,budgetBytes,memo,memory:await memory(test.pid),fullParity:true};
 }finally{reference.close();test.close();}
}
const y0=['Y','2461290','5000','1'];
const y1=['Y','2461290','5001','1'];
const yOther=['Y','2461400','5000','1'];
const r0=['R','2461290','2460984','1'];
const r1=['R','2461290','2460985','1'];
const interop=[
 await interopCase('zero-budget',0,[y0,y0],
  {builds:0,hits:0,keys:0,evictions:0,serviceYearStructBuilds:2}),
 await interopCase('tiny-budget',1024,[y0,y0],
  {builds:0,hits:0,keys:1,evictions:0,serviceYearStructBuilds:2}),
 await interopCase('Y-R-Y',budget,[y0,r0,y0],
  {builds:1,hits:2,keys:1,evictions:0,serviceYearStructBuilds:1}),
 await interopCase('R-R-Y',budget,[r0,r1,y0],
  {builds:1,hits:1,keys:1,evictions:0,serviceYearStructBuilds:1}),
 await interopCase('distinct-calcs',budget,[y0,yOther,y0],
  {builds:2,hits:1,keys:2,evictions:0,serviceYearStructBuilds:2}),
 await interopCase('LRU-rebuild',180000,[y0,y1,y0],
  {builds:3,hits:0,keys:1,evictions:2,serviceYearStructBuilds:3})
];
const capped=createService('reuse',budget,cap);
const cappedReference=createService('reference',0);
let cappedEvidence;
try{
 const cmd=['Y','2461290','4999','1'];
 const original=(await cappedReference.call(cmd)).value;
 for(let repeat=0;repeat<2;repeat++){
  const candidate=(await capped.call(cmd)).value;
  assert.deepStrictEqual(candidate,original,'Real 512MiB full-Y parity '+repeat);
 }
 const memo=(await capped.call(['M'])).value.memo;
 assert.equal(memo.builds,1);assert.equal(memo.hits,1);
 assert.equal(memo.serviceYearStructBuilds,1);
 const effectiveLimitBytes=await kernelLimit(capped.pid);
 assert.equal(effectiveLimitBytes,cap,'Effective RLIMIT_AS mismatch');
 const usage=await memory(capped.pid);
 assert.ok(usage.vmPeakKiB*1024<=effectiveLimitBytes);
 cappedEvidence={fullParity:true,effectiveLimitBytes,memo,memory:usage};
}finally{capped.close();cappedReference.close();}
const summary=['reference','control','reuse'].map(kind=>{
 const items=results.map(r=>r.rows[kind]);
 const sum=i=>items.reduce((a,v)=>a+v.perRequestMs[i],0);
 return {kind,contexts:items.length,coldTotalMs:sum(0),
  firstWarmTotalMs:sum(1),secondWarmTotalMs:sum(2),
  allThreeTotalMs:sum(0)+sum(1)+sum(2),
  largestVmPeakKiB:Math.max(...items.map(x=>x.memory.vmPeakKiB)),
  largestRssHwmKiB:Math.max(...items.map(x=>x.memory.rssHighWaterKiB))};
});
const final={
 schema:'seer-next-y-structure-reuse-v1',sourceBaseline:'714ae09180d9cabe39116901f78e13bbdbd5f7fe',
 cpu:cpus()[0]?.model,node:process.version,platform:platform(),arch:arch(),
 trials,contexts:results.length,fullYearReplies:results.length*9,
 cacheBudgetBytes:budget,fullParity:true,summary,results,interop,cappedEvidence,
 qualifications:[
 'Each context uses three fresh native processes, three full-Y requests within each.',
 'All full responses use deepStrictEqual against unchanged Seer; no hash-only oracle.',
 'The control and reuse order is interleaved deterministically across contexts.',
 'The 8MiB memo budget accounts only BatchRecord payload, not cached structure or RSS.',
 'RLIMIT_AS restricts virtual address space; no physical RAM ceiling or universal speedup is claimed.',
 'Single hosted x64 Linux runner and sampled years; research opt-in only.'
 ]
};
const out=JSON.stringify(final,null,2)+'\n';
if(options.has('output'))await writeFile(path.resolve(options.get('output')),out);
else process.stdout.write(out);
