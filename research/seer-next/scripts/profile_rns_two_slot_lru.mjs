// Independent exact A/B: one-slot versus two-slot RNS initializer LRU.
// A/B/A/B means four cold misses for capacity 1, two cold misses then hits for capacity 2.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpus,platform,arch,tmpdir} from 'node:os';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const baseline=path.join(root,'prototype','build','seer_engine_service');
const candidate=path.join(root,'research','seer-next','build','seer_next_cold_probe_service');
const args=new Map(process.argv.slice(2).map(a=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(a);
 if(!m)throw Error('Bad option: '+a);
 return [m[1],m[2]];
}));
const trials=Number(args.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>4)throw Error('Trials must be 1..4');
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-rns-two-slot-'));
const nano=()=>process.hrtime.bigint();
const millis=t=>Number(nano()-t)/1e6;
const limits=512*1024*1024;
function start(mode,slots,cachePath='',enginePath='',cap=0){
 const beforeSpawn=nano();
 const p=spawn(mode==='baseline'?baseline:candidate,[],{
  cwd,env:{...process.env,
   SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0',
   SEER_NEXT_COLD_RNS_THREADS:'4',SEER_NEXT_COLD_REPLAY_THREADS:'2',
   SEER_NEXT_COLD_SUPERBLOCK:'512',SEER_NEXT_COLD_ADAPT_SUPERBLOCK:'0',
   SEER_NEXT_COLD_RNS_ENGINE_REUSE:mode==='baseline'?'0':'1',
   SEER_NEXT_COLD_RNS_ENGINE_SLOTS:String(slots),
   SEER_NEXT_COLD_RNS_CACHE_STATS_FILE:cachePath,
   SEER_NEXT_COLD_RNS_ENGINE_REUSE_STAGE_FILE:enginePath,
   ...(cap?{SEER_NEXT_MAX_VIRTUAL_BYTES:String(cap)}:{})
  },stdio:['pipe','pipe','pipe']
 });
 let output='',stderr='',pending=null,error=null;
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 p.stderr.on('data',data=>{stderr=(stderr+data).slice(-6000);});
 p.stdout.on('data',data=>{
  output+=data;
  if(output.length>32*1024*1024){
   error=Error('Excessive native response');pending?.reject(error);pending=null;p.kill();return;
  }
  let i;
  while((i=output.indexOf('\n'))>=0){
   const line=output.slice(0,i);output=output.slice(i+1);
   if(!pending){error=Error('Unexpected native response');p.kill();return;}
   const request=pending;pending=null;
   try{request.resolve(JSON.parse(line));}catch(e){request.reject(e);}
  }
 });
 p.on('error',e=>{error=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
  error??=Error('Native process exited '+code+'/'+signal+': '+stderr);
  pending?.reject(error);pending=null;
 });
 return {
  pid:p.pid,beforeSpawn,
  async query(fields){
   if(error)throw error;
   if(pending)throw Error('Concurrent request not supported');
   const before=nano();
   let timeout;
   try{
    const promise=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     error=Error('Native timeout for '+fields.join(','));
     pending?.reject(error);pending=null;p.kill();
    },180000);
    p.stdin.write(fields.join('\t')+'\n');
    const response=await promise;
    if(response?.error||response?.ok===false)throw Error('Native error: '+JSON.stringify(response).slice(0,800));
    return {response,requestMs:millis(before),spawnToReplyMs:millis(beforeSpawn)};
   }finally{clearTimeout(timeout);}
  },
  stop(){p.stdin.end();p.kill();}
 };
}
async function processMemory(pid){
 const text=await readFile('/proc/'+pid+'/status','utf8');
 function get(n){const m=new RegExp('^'+n+':\\s+(\\d+) kB','m').exec(text);if(!m)throw Error('Missing '+n);return Number(m[1]);}
 return {vmPeakKiB:get('VmPeak'),rssHighWaterKiB:get('VmHWM')};
}
async function effectiveAddressLimit(pid){
 const text=await readFile('/proc/'+pid+'/limits','utf8');
 const m=/^Max address space\s+(\d+)\s+/m.exec(text);
 if(!m)throw Error('Missing effective Linux RLIMIT_AS');
 return Number(m[1]);
}
async function yearInfo(calc,year){
 const p=start('baseline',1);
 try{
  const v=(await p.query(['Y',String(calc),String(year),'0'])).response;
  assert.equal(v.calcJdn,calc);assert.equal(v.year,year);
  assert.equal(v.lengthDays,v.endJdn-v.startJdn+1);
  assert.ok(v.lengthDays>10);
  return {calc,year,target:v.startJdn+Math.floor(v.lengthDays/2),
   monthLengths:v.months.map(x=>x.lengthDays),yearLength:v.lengthDays};
 }finally{p.stop();}
}
async function compare(mode,slots,commands,reference,tag,cap=0){
 const cachePath=mode==='baseline'?'':path.join(scratch,'cache-'+tag+'.tsv');
 const enginePath=mode==='baseline'?'':path.join(scratch,'engine-'+tag+'.tsv');
 const p=start(mode,slots,cachePath,enginePath,cap);
 let spawnToFirstMs=null;
 const replies=[],timings=[];
 try{
  for(let i=0;i<commands.length;i++){
   const r=await p.query(commands[i]);
   if(i===0)spawnToFirstMs=r.spawnToReplyMs;
   if(reference)assert.deepStrictEqual(r.response,reference[i],
     'Full native R JSON mismatch '+tag+' #'+i);
   replies.push(r.response);timings.push(r.requestMs);
  }
  const memory=await processMemory(p.pid);
  let trace=null,engineTrace=null;
  if(mode!=='baseline'){
   const lines=(await readFile(cachePath,'utf8')).trim().split(/\r?\n/);
   const engineLines=(await readFile(enginePath,'utf8')).trim().split(/\r?\n/);
   assert.equal(lines.length,commands.length,'One cache diagnostic per native R');
   assert.equal(engineLines.length,commands.length,'Legacy four-field trace must remain intact');
   trace=lines.map(line=>{
    const a=line.split('\t').map(Number);
    assert.equal(a.length,4);
    assert.ok(a.every(Number.isSafeInteger));
    const [hit,entries,evictions,configuredSlots]=a;
    assert.ok(hit===0||hit===1);
    assert.ok(entries>=1&&entries<=slots);
    assert.ok(evictions>=0);
    assert.equal(configuredSlots,slots);
    return {hit,entries,evictions,configuredSlots};
   });
   engineTrace=engineLines.map(line=>{
    const x=line.split('\t').map(Number);
    assert.equal(x.length,4,'Pre-existing engine diagnostic schema changed');
    assert.ok(x.every(Number.isSafeInteger));
    return {hit:x[0],primes:x[1],threads:x[2],packs:x[3]};
   });
   assert.deepStrictEqual(trace.map(x=>x.hit),engineTrace.map(x=>x.hit));
  }
  return {replies,evidence:{mode,slots,requests:commands.length,requestMs:timings,
   spawnToFirstMs,memory,trace,engineTrace,fullParity:true}};
 }finally{p.stop();}
}
const trialsData=[],cases=[];
try{
 for(const calc of [2461290,2461400])for(const pair of [[4999,5000],[5002,5003]]){
  const a=await yearInfo(calc,pair[0]),b=await yearInfo(calc,pair[1]);
  assert.notDeepStrictEqual(a.monthLengths,b.monthLengths,'A and B must have distinct engine keys');
  cases.push({calc,pair,A:a,B:b});
 }
 for(let trial=0;trial<trials;trial++){
  for(let i=0;i<cases.length;i++){
   const c=cases[(i+trial)%cases.length];
   const commands=[c.A,c.B,c.A,c.B].map(v=>['R',String(c.calc),String(v.target),'1']);
   const reference=await compare('baseline',1,commands,null,'reference-'+trial+'-'+i);
   const modes=(i+trial)%2? [2,1]:[1,2];
   const rows={baseline:reference.evidence};
   for(const slots of modes){
    const variant=await compare('candidate',slots,commands,reference.replies,'slots'+slots+'-'+trial+'-'+i);
    assert.deepStrictEqual(variant.evidence.trace.map(x=>x.hit),slots===1?[0,0,0,0]:[0,0,1,1]);
    assert.deepStrictEqual(variant.evidence.trace.map(x=>x.entries),slots===1?[1,1,1,1]:[1,2,2,2]);
    assert.deepStrictEqual(variant.evidence.trace.map(x=>x.evictions),slots===1?[0,1,2,3]:[0,0,0,0]);
    rows['slots'+slots]=variant.evidence;
   }
   trialsData.push({trial,calc:c.calc,years:c.pair,rows,fullParity:true});
  }
 }
 assert.equal(trialsData.length,trials*cases.length);
 const a=await yearInfo(2461290,4999),b=await yearInfo(2461290,5000),c=await yearInfo(2461290,5002);
 assert.notDeepStrictEqual(a.monthLengths,b.monthLengths);
 assert.notDeepStrictEqual(a.monthLengths,c.monthLengths);
 assert.notDeepStrictEqual(b.monthLengths,c.monthLengths);
 const cycle=[a,b,c,a].map(v=>['R','2461290',String(v.target),'1']);
 const refCycle=await compare('baseline',1,cycle,null,'cycle-baseline');
 const eviction=await compare('candidate',2,cycle,refCycle.replies,'capacity2-eviction');
 assert.deepStrictEqual(eviction.evidence.trace.map(x=>x.hit),[0,0,0,0]);
 assert.deepStrictEqual(eviction.evidence.trace.map(x=>x.evictions),[0,0,1,2]);
 // Reuse under a real 512MiB address-space cap. Don't label a virtual cap a RAM ceiling.
 const capped=await compare('candidate',2,
  [a,b,a].map(v=>['R','2461290',String(v.target),'1']),
  refCycle.replies.slice(0,2).concat(refCycle.replies[0]),
  'capacity2-512MiB',limits);
 assert.deepStrictEqual(capped.evidence.trace.map(x=>x.hit),[0,0,1]);
 const capProbe=start('candidate',2,'','',limits);
 let effective;
 try{
  await capProbe.query(['R','2461290',String(a.target),'1']);
  effective=await effectiveAddressLimit(capProbe.pid);
  assert.equal(effective,limits);
 }finally{capProbe.stop();}
 assert.ok(capped.evidence.memory.vmPeakKiB*1024<=limits);
 const groups=['baseline','slots1','slots2'].map(kind=>{
  const rows=trialsData.map(row=>row.rows[kind]);
  const sum=i=>rows.reduce((v,x)=>v+x.requestMs[i],0);
  return {kind,contexts:rows.length,firstMs:sum(0),secondMs:sum(1),
   thirdMs:sum(2),fourthMs:sum(3),
   totalMs:sum(0)+sum(1)+sum(2)+sum(3),
   maxVmPeakKiB:Math.max(...rows.map(x=>x.memory.vmPeakKiB)),
   maxRssHighWaterKiB:Math.max(...rows.map(x=>x.memory.rssHighWaterKiB))};
 });
 const report={schema:'seer-next-rns-two-slot-lru-v1',
  baselineCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
  sourceParent:'b83985e621ab841d62a410335b8174ca61528f2b',
  cpu:cpus()[0]?.model,platform:platform(),arch:arch(),trials,
  contexts:trialsData.length,fullParity:true,workerProfile:{rns:4,replay:2},
  groups,cases,trialsData,eviction:eviction.evidence,
  cappedEvidence:{...capped.evidence,effectiveLimitBytes:effective},
  caveats:[
   'The two-slot mode is research-only, opt-in, and uses a bounded entry count but not a byte limit.',
   'Native full R JSON is compared to unchanged Seer for every request, with old 4-field diagnostics preserved.',
   'Cold-and-alternating year workloads are separate from the earlier same-year warm benchmark.',
   'Peak virtual address space is not physical memory; RSS observations are host-specific.',
   'Cached engine initialization is immutable and keyed by exact month lengths/prime count/worker count/constructor feature flags.',
   'Seer production and all default flags remain unchanged.'
  ]
 };
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),JSON.stringify(report,null,2)+'\n','utf8');
 else process.stdout.write(JSON.stringify(report,null,2)+'\n');
}finally{await rm(scratch,{recursive:true,force:true});}
