// Address-space acceptance frontier for D concurrency and immutable RNS cache scope.
// Exact full-wire parity is required for every completed reply; resource failures
// under a requested cap are recorded distinctly from successful acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpus,platform,arch,tmpdir} from 'node:os';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bins={
 original:path.join(root,'prototype','build','seer_engine_service'),
 thread:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
 process:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const args=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);
 if(!m)throw Error('Invalid option: '+x);
 return [m[1],m[2]];
}));
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-rns-d-capfrontier-'));
const capMiB=[512,768,1024,1280];
const timestamp=()=>process.hrtime.bigint();
const elapsed=t=>Number(timestamp()-t)/1e6;
function client(mode,workers,label,addressLimit=0){
 const trace=mode==='original'?'':path.join(scratch,'hits-'+label+'.tsv');
 const scopeTrace=mode==='original'?'':path.join(scratch,'scope-'+label+'.tsv');
 const p=spawn(bins[mode],[],{
  cwd,
  env:{...process.env,
   SEER_NEXT_EXECUTION_PROFILE:'experimental42',
   SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0',
   SEER_NEXT_Y_MEMO_DIRECT:'0',SEER_NEXT_Y_STRUCT_REUSE:'0',
   SEER_NEXT_COLD_RNS_THREADS:'4',SEER_NEXT_COLD_REPLAY_THREADS:'2',
   SEER_NEXT_COLD_SUPERBLOCK:'512',SEER_NEXT_COLD_ADAPT_SUPERBLOCK:'0',
   SEER_NEXT_COLD_RNS_ENGINE_REUSE:mode==='original'?'0':'1',
   SEER_NEXT_COLD_RNS_ENGINE_SLOTS:'2',
   SEER_NEXT_COLD_RNS_ENGINE_SCOPE:mode==='process'?'process':'thread',
   SEER_NEXT_COLD_RNS_CACHE_STATS_FILE:trace,
   SEER_NEXT_COLD_RNS_PROCESS_SCOPE_TRACE_FILE:scopeTrace,
   SEER_DIAGONAL_THREADS:String(workers),
   OMP_NUM_THREADS:'4',OMP_THREAD_LIMIT:'8',OMP_DYNAMIC:'FALSE',OMP_STACKSIZE:'2M',
   ...(addressLimit?{SEER_NEXT_MAX_VIRTUAL_BYTES:String(addressLimit)}:{})
  },stdio:['pipe','pipe','pipe']
 });
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 let buf='',pending=null,closed=null,stderr='';
 p.stderr.on('data',x=>{stderr=(stderr+x).slice(-12000);});
 p.stdout.on('data',x=>{
  buf+=x;
  if(buf.length>96*1024*1024){
   closed=Error('Native response buffer exceeded 96MiB');pending?.reject(closed);pending=null;p.kill();return;
  }
  let pos;
  while((pos=buf.indexOf('\n'))>=0){
   const line=buf.slice(0,pos);buf=buf.slice(pos+1);
   if(!pending){closed=Error('Unexpected native reply');p.kill();return;}
   const q=pending;pending=null;
   try{q.resolve(JSON.parse(line));}catch(e){q.reject(e);}
  }
 });
 p.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
  closed??=Error('Native exited: '+code+' '+signal+' '+stderr);
  pending?.reject(closed);pending=null;
 });
 return {
  pid:p.pid,trace,scopeTrace,
  async call(command){
   if(closed)throw closed;
   if(pending)throw Error('Concurrent native calls forbidden');
   const start=timestamp();
   let timeout;
   try{
    const result=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     closed=Error('Native timeout '+command.join(','));
     pending?.reject(closed);pending=null;p.kill();
    },180000);
    p.stdin.write(command.join('\t')+'\n');
    const value=await result;
    if(value?.error||value?.ok===false)throw Error('Native error '+JSON.stringify(value).slice(0,600));
    return {value,ms:elapsed(start)};
   }finally{clearTimeout(timeout);}
  },
  stop(){p.stdin.end();p.kill();}
 };
}
async function memory(pid){
 const raw=await readFile('/proc/'+pid+'/status','utf8');
 const get=name=>{
  const x=new RegExp('^'+name+':\\s+(\\d+) kB','m').exec(raw);
  if(!x)throw Error('Missing '+name);
  return Number(x[1]);
 };
 return {vmPeakKiB:get('VmPeak'),vmHwmKiB:get('VmHWM')};
}
async function effectiveLimit(pid){
 const raw=await readFile('/proc/'+pid+'/limits','utf8');
 const x=/^Max address space\s+(\d+)\s+/m.exec(raw);
 if(!x)throw Error('Missing kernel Max address space limit');
 return Number(x[1]);
}
async function getMeta(calc,year){
 const p=client('original',1,'meta');
 try{
  const {value}=await p.call(['Y',String(calc),String(year),'0']);
  assert.equal(value.calcJdn,calc);assert.equal(value.year,year);
  assert.equal(value.lengthDays,value.endJdn-value.startJdn+1);
  assert.ok(value.lengthDays>50);
  return value;
 }finally{p.stop();}
}
function commands(calc,a,b){
 const midpoint=m=>m.startJdn+Math.floor(m.lengthDays/2);
 const am=midpoint(a),bm=midpoint(b);
 return [
  ['R',String(calc),String(am),'1'],
  ['R',String(calc),String(bm),'1'],
  ['D',String(calc),'6','1'],
  ['D',String(calc+20),'9','-1'],
  ['R',String(calc),String(am+1),'1'],
  ['Y',String(calc),'5000','0'],
  ['D',String(calc+40),'12','1'],
  ['R',String(calc),String(bm+1),'1']
 ];
}
async function probe(mode,workers,cmds,oracle,label,addressLimit){
 const p=client(mode,workers,label,addressLimit);
 let completedReplies=0;
 const times=[];
 let resourceFailure=null;
 let confirmedLimit=null;
 try{
  for(let i=0;i<cmds.length;i++){
   let result;
   try{result=await p.call(cmds[i]);}
   catch(e){
    const err=String(e);
    // Only explicit OS/native allocation or thread creation failures can be
    // expected under a deliberately restrictive RLIMIT_AS. A timeout, crash,
    // malformed reply or unexpected error always FAILS the experiment.
    if(/Resource temporarily unavailable|Cannot allocate memory|std::bad_alloc|bad allocation|libgomp: Thread creation failed/i.test(err)){
      resourceFailure={commandIndex:i,command:cmds[i],message:err.slice(0,1100)};
      break;
    }
    throw new Error('Unexpected capped native failure '+JSON.stringify({
      mode,workers,addressLimit,label,index:i,command:cmds[i],error:err}),{cause:e});
   }
   assert.deepStrictEqual(result.value,oracle[i],
     'Complete native JSON mismatch '+JSON.stringify({
      mode,workers,addressLimit,label,index:i,command:cmds[i]}));
   completedReplies++;
   times.push(result.ms);
  }
  let mem=null,effective=null;
  try{mem=await memory(p.pid);}catch(e){if(!resourceFailure)throw e;}
  try{effective=await effectiveLimit(p.pid);}catch(e){if(!resourceFailure)throw e;}
  if(effective!==null)assert.equal(effective,addressLimit,
    'Wrong effective kernel RLIMIT_AS after native workload');
  if(mem!==null)assert.ok(mem.vmPeakKiB*1024<=addressLimit,
    'VmPeak exceeded actual requested address-space cap');
  if(!resourceFailure && (effective===null||mem===null))
    throw Error('Cannot accept a completed native trial without Linux kernel memory evidence');
  if(resourceFailure){
   return {mode,workers,capMiB:addressLimit/(1024*1024),status:'RESOURCE_LIMITED',
    completedReplies,requestedReplies:cmds.length,
    resourceFailure,memory:mem,effectiveLimitBytes:effective,
    observedRequestTimesMs:times,fullParityOfCompletedReplies:true,
    completeFullParity:false};
  }
  // A SUCCESS must also have fully parsed, schema-verified trace records.
  const s=(await readFile(p.trace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
  const t=(await readFile(p.scopeTrace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(s.length>=2,'Missing native initializer cache trace rows');
  assert.equal(s.length,t.length,'Legacy cache and scope traces have different row counts');
  const a=s.map(line=>line.split('\t').map(Number));
  const b=t.map(line=>line.split('\t').map(Number));
  for(const row of a){
   assert.equal(row.length,4);
   assert.ok(row.every(Number.isSafeInteger));
   assert.ok(row[0]===0||row[0]===1);
   assert.ok(row[1]>=1&&row[1]<=2);
   assert.ok(row[2]>=0);
   assert.equal(row[3],2);
  }
  for(const row of b){
   assert.equal(row.length,4);
   assert.ok(row.every(Number.isSafeInteger));
   assert.equal(row[0],mode==='process'?1:0);
   assert.ok(row[1]===0||row[1]===1);
   assert.ok(row[2]>=1&&row[2]<=2);
   assert.ok(row[3]>=0);
  }
  assert.deepStrictEqual(a.slice(0,2).map(x=>x[0]),[0,0],
    'Initial two structurally distinct R years must both miss');
  assert.deepStrictEqual(b.slice(0,2).map(x=>x[1]),[0,0]);
  assert.equal(a.reduce((n,row)=>n+row[0],0),
    b.reduce((n,row)=>n+row[1],0),'Native cache/scope hit totals disagree');
  return {mode,workers,capMiB:addressLimit/(1024*1024),status:'ACCEPTED',
   completedReplies,requestedReplies:cmds.length,
   totalMs:times.reduce((a,b)=>a+b,0),
   dTotalMs:times.reduce((n,ms,i)=>n+(cmds[i][0]==='D'?ms:0),0),
   requestTimesMs:times,memory:mem,effectiveLimitBytes:effective,
   traceRows:a.length,totalCacheHits:a.reduce((n,row)=>n+row[0],0),
   fullParityOfCompletedReplies:true,completeFullParity:true};
 }finally{p.stop();}
}
try{
 const metadata={};
 const oracleByCalc={};
 for(const calc of [2461290,2461400]){
  const a=await getMeta(calc,4999),b=await getMeta(calc,5000);
  assert.notDeepStrictEqual(a.months.map(m=>m.lengthDays),
    b.months.map(m=>m.lengthDays),'Different year initializer keys required');
  const cmds=commands(calc,a,b);
  assert.equal(cmds.length,8);
  const p=client('original',1,'baseline-'+calc);
  try{
   const values=[];
   for(const command of cmds){
    const reply=await p.call(command);
    values.push(reply.value);
   }
   oracleByCalc[calc]={cmds,values};
  }finally{p.stop();}
 }
 const results=[];
 for(const calc of [2461290,2461400]){
  const {cmds,values}=oracleByCalc[calc];
  for(const limit of capMiB){
   for(const workers of [1,2,3]){
    // Alternate cache-scope order between adjacent measurements.
    const order=(calc+limit+workers)%2===0?['thread','process']:['process','thread'];
    for(const mode of order){
     const label=['c',calc,'mb',limit,'d',workers,mode].join('-');
     const r=await probe(mode,workers,cmds,values,label,limit*1024*1024);
     results.push({calc,...r});
    }
   }
  }
 }
 assert.equal(results.length,48,'Incomplete 2×4×3×2 cap matrix');
 const accepted=results.filter(x=>x.status==='ACCEPTED');
 const resourceLimited=results.filter(x=>x.status==='RESOURCE_LIMITED');
 const at=(calc,mode,workers,cap)=>{
  const row=results.find(r=>r.calc===calc&&r.mode===mode&&r.workers===workers&&r.capMiB===cap);
  assert.ok(row,'Missing required measurement');
  return row;
 };
 const essential=[];
 for(const calc of [2461290,2461400])for(const mode of ['thread','process']){
  // These are pre-registered positive gates, not assumptions that all lower
  // caps will pass. A failure is faithfully included in the JSON artifact.
  for(const [workers,cap] of [[1,512],[2,768],[3,1280]]){
   const row=at(calc,mode,workers,cap);
   essential.push({calc,mode,workers,capMiB:cap,status:row.status});
  }
 }
 const summary=['thread','process'].flatMap(mode=>
   [1,2,3].map(workers=>{
    const group=results.filter(x=>x.mode===mode&&x.workers===workers);
    const successes=group.filter(x=>x.status==='ACCEPTED');
    return {mode,workers,attempts:group.length,accepted:successes.length,
      resourceLimited:group.length-successes.length,
      smallestAcceptedCapMiB:successes.length?Math.min(...successes.map(x=>x.capMiB)):null,
      largestSuccessfulPeakVmKiB:successes.length?
        Math.max(...successes.map(x=>x.memory.vmPeakKiB)):null,
      largestSuccessfulHwmKiB:successes.length?
        Math.max(...successes.map(x=>x.memory.vmHwmKiB)):null};
   }));
 const report={
  schema:'seer-next-rns-d-cap-frontier-v1',
  originalSha:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
  researchParent:'bd7c02d579fe28df56b8018a35cf264cedbf29d2',
  cpu:cpus()[0]?.model,platform:platform(),arch:arch(),
  calculationJdns:[2461290,2461400],capMiB,workerCounts:[1,2,3],
  cacheScopes:['thread','process'],
  oracleFullReplies:16,attempts:results.length,
  nativeCandidateCompletedReplies:results.reduce((n,x)=>n+x.completedReplies,0),
  acceptedTrials:accepted.length,resourceLimitedTrials:resourceLimited.length,
  fullParityOfAllCompletedReplies:results.every(x=>x.fullParityOfCompletedReplies),
  essentialGates:essential,summary,results,
  caveats:[
   'RESOURCE_LIMITED is not PASS; it documents the exact native request index where address-space or thread-resource creation failed.',
   'Any complete native response is compared in full JSON to an unchanged Seer oracle, even when a later request fails.',
   'Every ACCEPTED trial has eight full replies, real Linux effective RLIMIT_AS from /proc/PID/limits, VmPeak below its cap, and both native cache trace schemas checked.',
   'A failed native process can exit before /proc/PID/limits or /proc/PID/status is read, so an incomplete resource-limited row might not independently prove its effective kernel limit.',
   'These are fresh process samples on one hosted CPU, not proven universal safe address-space thresholds.',
   'A 512MiB virtual-address cap is not a physical RAM ceiling and even a successful RNS cache does not bound resident bytes.',
   'The source Seer and standard research-hybrid implementation are unchanged.'
  ]
 };
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),
   JSON.stringify(report,null,2)+'\n');
 else process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(!essential.every(g=>g.status==='ACCEPTED'))
  throw Error('Required positive 512/768/1280MiB cap-frontier gates not all accepted; inspect written raw evidence');
}finally{await rm(scratch,{recursive:true,force:true});}
