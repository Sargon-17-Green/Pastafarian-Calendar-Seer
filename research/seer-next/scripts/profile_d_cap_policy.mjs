// Research-only verified RLIMIT_AS-aware D dispatcher policy: static vs opt-in.
 // All complete R/Y/D wire replies must match unchanged Seer exactly.
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
 process:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
 policyThread:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
 policyProcess:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const args=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);
 if(!m)throw Error('Invalid option: '+x);
 return [m[1],m[2]];
}));
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-d-auto-cap-'));
const capMiB=[512,768,1024,1280];
const timestamp=()=>process.hrtime.bigint();
const elapsed=t=>Number(timestamp()-t)/1e6;
function client(mode,workers,label,addressLimit=0){
 const trace=mode==='original'?'':path.join(scratch,'hits-'+label+'.tsv');
 const scopeTrace=mode==='original'?'':path.join(scratch,'scope-'+label+'.tsv');
 const dPolicyTrace=mode.startsWith('policy')?path.join(scratch,'dispatch-'+label+'.tsv'):'';
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
   SEER_NEXT_COLD_RNS_ENGINE_SCOPE:mode==='process'||mode==='policyProcess'?'process':'thread',
   SEER_NEXT_D_CAP_POLICY:mode.startsWith('policy')?'1':'0',
   SEER_NEXT_D_CAP_POLICY_TRACE_FILE:dPolicyTrace,
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
  pid:p.pid,trace,scopeTrace,dPolicyTrace,
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
async function run(mode,workers,cmds,oracle,label,limitMiB){
 const addressLimit=limitMiB*1024*1024;
 const p=client(mode,workers,label,addressLimit);
 const times=[];
 try {
  for(let i=0;i<cmds.length;i++){
   let value;
   try{value=await p.call(cmds[i]);}
   catch(e){
    throw new Error('Cap-aware dispatcher trial failed '+JSON.stringify({
      mode,workers,limitMiB,label,index:i,command:cmds[i],error:String(e)}),{cause:e});
   }
   assert.deepStrictEqual(value.value,oracle[i],
       'Complete R/Y/D mismatch '+JSON.stringify({mode,workers,limitMiB,label,index:i}));
   times.push(value.ms);
  }
  const mem=await memory(p.pid);
  const kernelLimit=await effectiveLimit(p.pid);
  assert.equal(kernelLimit,addressLimit,'Kernel effective RLIMIT_AS must match request');
  assert.ok(mem.vmPeakKiB*1024<=addressLimit,'Native VmPeak exceeds cap');
  const trace=(await readFile(p.trace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
  const scope=(await readFile(p.scopeTrace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(trace.length>=2&&trace.length===scope.length,'Missing RNS cache/scope evidence');
  const rows=trace.map(line=>line.split('\t').map(Number));
  const flags=scope.map(line=>line.split('\t').map(Number));
  for(const row of rows){
   assert.equal(row.length,4);
   assert.ok(row.every(Number.isSafeInteger));
   assert.ok(row[0]===0||row[0]===1);
   assert.ok(row[1]>=1&&row[1]<=2);
   assert.ok(row[2]>=0);
   assert.equal(row[3],2);
  }
  for(const row of flags){
   assert.equal(row.length,4);
   assert.ok(row.every(Number.isSafeInteger));
   assert.equal(row[0],mode==='process'||mode==='policyProcess'?1:0);
   assert.ok(row[1]===0||row[1]===1);
   assert.ok(row[2]>=1&&row[2]<=2);
   assert.ok(row[3]>=0);
  }
  assert.deepStrictEqual(rows.slice(0,2).map(x=>x[0]),[0,0],
   'Initial two structurally distinct RNS years must miss');
  assert.equal(rows.reduce((n,r)=>n+r[0],0),flags.reduce((n,r)=>n+r[1],0),
   'Independent native trace hit totals differ');
  let dispatch=[];
  if(mode.startsWith('policy')){
   const lines=(await readFile(p.dPolicyTrace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
   dispatch=lines.map(line=>{
    const row=line.split('\t').map(Number);
    assert.equal(row.length,4,'Dispatcher trace width');
    assert.ok(row.every(Number.isSafeInteger));
    return row;
   });
   assert.equal(dispatch.length,3,'One policy record for each of the three D commands');
   const expectedWorkers=limitMiB<768?1:2;
   assert.deepStrictEqual(dispatch.map(row=>row[0]),[3,3,3],
    'Unbounded requested D workers must remain 3');
   assert.deepStrictEqual(dispatch.map(row=>row[1]),[expectedWorkers,expectedWorkers,expectedWorkers],
    'Policy worker count must follow actual kernel cap');
   assert.ok(dispatch.every(row=>row[2]===addressLimit),
    'Policy must read effective RLIMIT_AS, not user-supplied environment value');
   assert.deepStrictEqual(dispatch.map(row=>row[3]),[6,9,12]);
  }
  return {mode,workers,capMiB:limitMiB,fullParity:true,requests:cmds.length,
   totalMs:times.reduce((n,x)=>n+x,0),
   dMs:times.reduce((n,x,i)=>n+(cmds[i][0]==='D'?x:0),0),
   requestTimesMs:times,memory:mem,kernelLimit,
   hits:rows.reduce((n,row)=>n+row[0],0),traceRows:rows.length,
   dispatcherTrace:dispatch};
 }finally{p.stop();}
}
try{
 const calcs=[2461290,2461400];
 const limits=[512,768,1024];
 const oracleByCalc={};
 for(const calc of calcs){
  const a=await getMeta(calc,4999),b=await getMeta(calc,5000);
  assert.notDeepStrictEqual(a.months.map(x=>x.lengthDays),
   b.months.map(x=>x.lengthDays),'Distinct RNS constructor keys are required');
  const cmds=commands(calc,a,b);
  assert.equal(cmds.length,8);
  const p=client('original',1,'oracle-'+calc);
  try{
   const values=[];
   for(const cmd of cmds)values.push((await p.call(cmd)).value);
   oracleByCalc[calc]={cmds,values};
  }finally{p.stop();}
 }
 const results=[];
 for(const calc of calcs){
  const {cmds,values}=oracleByCalc[calc];
  for(const capMiB of limits){
   for(const scope of ['thread','process']){
    const selected=capMiB===512?1:2;
    const policyMode=scope==='thread'?'policyThread':'policyProcess';
    const modes=(calc+capMiB)%2===0?
     [{mode:scope,workers:selected},{mode:policyMode,workers:3}]:
     [{mode:policyMode,workers:3},{mode:scope,workers:selected}];
    const row={calc,capMiB,scope};
    for(const m of modes){
     const tag=['calc',calc,'cap',capMiB,'scope',scope,'mode',m.mode].join('-');
     const response=await run(m.mode,m.workers,cmds,values,tag,capMiB);
     row[m.mode===scope?'static':'policy']=response;
    }
    assert.equal(row.static.requests,8);
    assert.equal(row.policy.requests,8);
    assert.equal(row.static.kernelLimit,row.policy.kernelLimit);
    results.push(row);
   }
  }
 }
 assert.equal(results.length,12);
 const summary=limits.flatMap(capMiB=>['thread','process'].map(scope=>{
   const p=results.filter(r=>r.capMiB===capMiB&&r.scope===scope);
   return {capMiB,scope,contexts:p.length,
    staticMs:p.reduce((s,r)=>s+r.static.totalMs,0),
    policyMs:p.reduce((s,r)=>s+r.policy.totalMs,0),
    staticDms:p.reduce((s,r)=>s+r.static.dMs,0),
    policyDms:p.reduce((s,r)=>s+r.policy.dMs,0),
    maxStaticVmPeakKiB:Math.max(...p.map(r=>r.static.memory.vmPeakKiB)),
    maxPolicyVmPeakKiB:Math.max(...p.map(r=>r.policy.memory.vmPeakKiB)),
    maxStaticVmHwmKiB:Math.max(...p.map(r=>r.static.memory.vmHwmKiB)),
    maxPolicyVmHwmKiB:Math.max(...p.map(r=>r.policy.memory.vmHwmKiB)),
    selectedWorkers:capMiB===512?1:2};
 }));
 const report={schema:'seer-next-d-cap-policy-v1',cpu:cpus()[0]?.model,
  researchSourceParent:'af2ebe5f5182b80b214f3329634729e0ea5aef18',
  capMiB:limits,calculationJdns:calcs,cacheScopes:['thread','process'],
  contexts:results.length,
  sourceOracleReplies:16,candidateReplies:results.length*2*8,
  allFullParity:results.every(r=>r.static.fullParity&&r.policy.fullParity),
  everyEffectiveKernelCapVerified:results.every(r=>
   r.static.kernelLimit===r.capMiB*1048576&&r.policy.kernelLimit===r.capMiB*1048576),
  policyReadbackVerified:results.every(r=>r.policy.dispatcherTrace.length===3),
  summary,results,
  caveats:[
   'RLIMIT_AS policy is research-only opt-in. No production/default change.',
   'For finite kernel limits below 768MiB, opt-in caps D dispatch to one worker; from 768MiB it caps to two. This is a heuristic derived from two calculation contexts, NOT a universal guarantee.',
   'These are fresh native processes with all result caches disabled; RNS initializer caching is a separate opt-in parameter.',
   'All R/Y/D JSON answers matched the unchanged original Seer in full, not by hash.',
   'Effective Linux RLIMIT_AS is measured separately for each process. It is not an RSS/physical memory constraint.',
   'No fallback after allocation failure is provided, and an unlimited kernel cap leaves the existing requested D worker count unchanged.',
   'Static-policy comparisons are same cap, same cache scope, same commands, not a proof of universal performance.'
  ]};
 const out=JSON.stringify(report,null,2)+'\n';
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),out);
 else process.stdout.write(out);
}finally{await rm(scratch,{recursive:true,force:true});}
