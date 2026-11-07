// Research-only long-lived mixed R/Y/D initializer-cache ROI: off/1/2 slots.
// All completed native wire replies must equal unchanged Seer; resource failures are not PASS.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,platform,arch,cpus} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const binary={
 original:path.join(root,'prototype','build','seer_engine_service'),
 hybrid:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
 probe:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const opts=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);
 if(!m)throw Error('Unknown option '+x);
 return [m[1],m[2]];
}));
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-rns-roi-'));
const mark=()=>process.hrtime.bigint();
const delta=t=>Number(mark()-t)/1e6;
const MiB=1048576;
function start(mode,scenario,label){
 const trace=path.join(scratch,'d-policy-'+label+'.tsv');
 const cacheTrace=path.join(scratch,'cache-'+label+'.tsv');
 const scopeTrace=path.join(scratch,'scope-'+label+'.tsv');
 const env={...process.env,
  SEER_NEXT_EXECUTION_PROFILE:scenario.profile??'experimental42',
  SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0',
  SEER_NEXT_Y_MEMO_DIRECT:'0',SEER_NEXT_Y_STRUCT_REUSE:'0',
  SEER_NEXT_COLD_RNS_THREADS:'4',SEER_NEXT_COLD_REPLAY_THREADS:'2',
  SEER_NEXT_COLD_SUPERBLOCK:'512',SEER_NEXT_COLD_ADAPT_SUPERBLOCK:'0',
  SEER_NEXT_COLD_RNS_ENGINE_REUSE:mode==='probe'&&scenario.reuse?'1':'0',
  SEER_NEXT_COLD_RNS_ENGINE_SLOTS:String(scenario.slots??2),
  SEER_NEXT_COLD_RNS_ENGINE_SCOPE:scenario.scope??'thread',
  SEER_NEXT_COLD_RNS_CACHE_STATS_FILE:mode==='probe'?cacheTrace:'',
  SEER_NEXT_COLD_RNS_PROCESS_SCOPE_TRACE_FILE:mode==='probe'?scopeTrace:'',
  SEER_DIAGONAL_THREADS:String(scenario.requested??1),
  SEER_NEXT_MAX_VIRTUAL_BYTES:String((scenario.limitMiB??0)*MiB),
  SEER_NEXT_D_CAP_POLICY_TRACE_FILE:trace,
  OMP_NUM_THREADS:'4',OMP_THREAD_LIMIT:'8',
  OMP_STACKSIZE:'2M',OMP_DYNAMIC:'FALSE'
 };
 if(scenario.policy===null)delete env.SEER_NEXT_D_CAP_POLICY;
 else env.SEER_NEXT_D_CAP_POLICY=scenario.policy??'0';
 const child=spawn(binary[mode],[],{cwd,env,stdio:['pipe','pipe','pipe']});
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 let buffer='',pending=null,err=null,stderr='';
 child.stderr.on('data',s=>stderr=(stderr+s).slice(-4000));
 child.stdout.on('data',s=>{
  buffer+=s;
  if(buffer.length>96*1024*1024){
   err=Error('Native response too large');pending?.reject(err);pending=null;child.kill();return;
  }
  let at;
  while((at=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
   if(!pending){err=Error('Unsolicited native reply');child.kill();return;}
   const task=pending;pending=null;
   try{task.resolve(JSON.parse(line));}catch(e){task.reject(e);}
  }
 });
 child.on('error',e=>{err=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  err??=Error('Native exited: '+code+' '+signal+' '+stderr);
  pending?.reject(err);pending=null;
 });
 return {pid:child.pid,trace,cacheTrace,scopeTrace,
  async call(command){
   if(err)throw err;
   if(pending)throw Error('Overlapping native commands forbidden');
   let timeout;
   const startTime=mark();
   try{
    const reply=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     err=Error('Native timeout '+command.join(','));
     pending?.reject(err);pending=null;child.kill();
    },180000);
    child.stdin.write(command.join('\t')+'\n');
    return {reply:await reply,ms:delta(startTime)};
   }finally{clearTimeout(timeout);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
async function procInfo(pid){
 const limits=await readFile('/proc/'+pid+'/limits','utf8');
 const match=/^Max address space\s+(unlimited|\d+)\s+/m.exec(limits);
 if(!match)throw Error('Kernel Max address space missing');
 const limit=match[1]==='unlimited'?null:Number(match[1]);
 const status=await readFile('/proc/'+pid+'/status','utf8');
 const get=name=>{
  const x=new RegExp('^'+name+':\\s+(\\d+) kB','m').exec(status);
  if(!x)throw Error('Missing '+name+' in /proc status');
  return Number(x[1]);
 };
 return {limitBytes:limit,vmPeakKiB:get('VmPeak'),vmHwmKiB:get('VmHWM')};
}
async function metadata(calc,year){
 const p=start('original',{policy:null,requested:1},'meta-'+calc+'-'+year);
 try{
  const {reply}=await p.call(['Y',String(calc),String(year),'0']);
  assert.equal(reply.calcJdn,calc);
  assert.equal(reply.year,year);
  assert.ok(reply.lengthDays>0);
  return reply;
 }finally{p.close();}
}
function commands(calc,a,b,yearB){
 const center=x=>x.startJdn+Math.floor(x.lengthDays/2);
 return [
  ['R',String(calc),String(center(a)),'1'],
  ['R',String(calc),String(center(b)),'1'],
  ['R',String(calc),String(center(a)+1),'1'],
  ['R',String(calc),String(center(b)+1),'1'],
  ['D',String(calc),'5','1'],
  ['D',String(calc+21),'9','-1'],
  ['Y',String(calc),String(yearB),'0'],
  ['D',String(calc+48),'13','1'],
  ['R',String(calc),String(center(a)+2),'1']
 ];
}


const contexts=[
 {calc:2461007,years:[4997,5001]},
 {calc:2461247,years:[4999,5003]},
 {calc:2461593,years:[4998,5003]}
];
const rounds=3;
const caps=[512,768];
const arms=[
 {id:'off',reuse:false,slots:1,scope:'thread'},
 {id:'thread1',reuse:true,slots:1,scope:'thread'},
 {id:'thread2',reuse:true,slots:2,scope:'thread'},
 {id:'process1',reuse:true,slots:1,scope:'process'},
 {id:'process2',reuse:true,slots:2,scope:'process'}
];
const isResource=x=>
 /Resource temporarily unavailable|Cannot allocate memory|std::bad_alloc|bad allocation|libgomp: Thread creation failed|std::system_error/i.test(String(x));
function composedOracle(sequences){
 const perRound=sequences.flatMap(x=>x.replies);
 return Array.from({length:rounds},()=>perRound).flat();
}
function composedCommands(sequences){
 const perRound=sequences.flatMap(x=>x.cmds);
 return Array.from({length:rounds},()=>perRound).flat();
}
async function longRun(mode,scenario,cmds,expected,label){
 const p=start(mode,scenario,label);
 let completed=0,resourceFailure=null;
 const snapshots=[],requestMs=[];
 const expectedD=cmds.filter(x=>x[0]==='D').length;
 const cap=scenario.limitMiB??0;
 try{
  for(let i=0;i<cmds.length;i++){
   let r;
   try{r=await p.call(cmds[i]);}
   catch(e){
    if(!cap||!isResource(e))throw new Error('Unexpected long-lived native service failure '+
     JSON.stringify({mode,scope:scenario.scope,cap,i,command:cmds[i],cause:String(e)}),{cause:e});
    resourceFailure={commandIndex:i,command:cmds[i],cause:String(e).slice(0,1500)};
    break;
   }
   if(r.reply?.ok===false||r.reply?.error){
    if(!cap||!isResource(JSON.stringify(r.reply)))
     throw new Error('Unrecognized service error '+JSON.stringify({
      mode,cap,scope:scenario.scope,i,reply:r.reply}));
    resourceFailure={commandIndex:i,command:cmds[i],
     cause:JSON.stringify(r.reply).slice(0,1500)};
    break;
   }
   assert.deepStrictEqual(r.reply,expected[i],
    'Full R/Y/D original Seer JSON mismatch '+JSON.stringify({
     mode,scope:scenario.scope,cap,i,command:cmds[i]}));
   completed++;requestMs.push(r.ms);
   if(completed%(contexts.length*9)===0){
    const status=await procInfo(p.pid);
    if(cap){
     assert.equal(status.limitBytes,cap*MiB,'Wrong effective kernel limit during soak');
     assert.ok(status.vmPeakKiB*1024<=cap*MiB,
      'Native VmPeak exceeded cap during long-lived mixed requests');
    }
    snapshots.push({completedReplies:completed,...status});
   }
  }
  let finalStatus=null;
  try{finalStatus=await procInfo(p.pid);}catch(e){if(!resourceFailure)throw e;}
  if(finalStatus&&cap){
   assert.equal(finalStatus.limitBytes,cap*MiB,'Wrong final Linux RLIMIT_AS');
   assert.ok(finalStatus.vmPeakKiB*1024<=cap*MiB,'Final VmPeak exceeds cap');
  }
  const base={mode,scope:scenario.scope??null,capMiB:cap,
   expectedDWorkers:cap===512?1:cap===768?2:null,
   requestedDWorkers:scenario.requested,
   reuse:!!scenario.reuse,slots:scenario.slots??2,
   completedReplies:completed,expectedReplies:cmds.length,
   fullParityOfCompletedReplies:true,
   snapshots,finalStatus,
   totalObservedMs:requestMs.reduce((a,b)=>a+b,0),resourceFailure};
  if(resourceFailure)
   return {...base,status:'RESOURCE_LIMITED',completeFullParity:false};
  assert.equal(completed,cmds.length);
  if(mode!=='probe')
   return {...base,status:'ACCEPTED',completeFullParity:true};
  const readRows=async filepath=>(await readFile(filepath,'utf8')).trim()
   .split(/\r?\n/).filter(Boolean).map(line=>line.split('\t').map(Number));
  const legacy=await readRows(p.cacheTrace);
  const scopeTrace=await readRows(p.scopeTrace);
  assert.ok(legacy.length>=4&&legacy.length===scopeTrace.length,
   'Missing or unmatched RNS initializer diagnostic rows');
  for(const row of legacy){
   assert.equal(row.length,4);
   assert.ok(row.every(Number.isSafeInteger));
   assert.ok(row[0]===0||row[0]===1);
   assert.ok(row[1]>=0&&row[1]<=2);
   assert.ok(row[2]>=0&&row[3]===(scenario.slots??2));
  }
  for(const row of scopeTrace){
   assert.equal(row.length,4);
   assert.ok(row.every(Number.isSafeInteger));
   assert.equal(row[0],scenario.reuse&&scenario.scope==='process'?1:0);
   assert.ok(row[1]===0||row[1]===1);
   assert.ok(row[2]>=0&&row[2]<=2&&row[3]>=0);
  }
  const expectedFirstFour=scenario.reuse&&(scenario.slots??2)===2?
   [0,0,1,1]:[0,0,0,0];
  assert.deepStrictEqual(legacy.slice(0,4).map(r=>r[0]),expectedFirstFour,
   'Initial A/B/A/B cache pattern does not match reuse/slots');
  assert.deepStrictEqual(scopeTrace.slice(0,4).map(r=>r[1]),expectedFirstFour);
  const hits=legacy.reduce((n,r)=>n+r[0],0);
  assert.equal(hits,scopeTrace.reduce((n,r)=>n+r[1],0),
   'Cross-thread trace writes disagree on aggregate initializer cache hits');
  const evictionsMax=Math.max(...legacy.map(r=>r[2]));
  assert.ok(scenario.reuse?evictionsMax>=1:evictionsMax===0,
   'LRU eviction evidence contradicts initializer reuse mode');
  const dispatch=await readRows(p.trace);
  assert.equal(dispatch.length,expectedD,'One dispatch trace per D request required');
  const expectedSelected=cap<768?1:2;
  for(let round=0;round<rounds;round++){
   for(let context=0;context<contexts.length;context++){
    for(let d=0;d<3;d++){
     const idx=(round*contexts.length+context)*3+d;
     assert.deepStrictEqual(dispatch[idx],
      [3,expectedSelected,cap*MiB,[5,9,13][d]],
      'Incorrect D dispatch after multi-context cache churn');
    }
   }
  }
  return {...base,status:'ACCEPTED',completeFullParity:true,
   traceEvidence:{rows:legacy.length,hits,evictionsMax,dispatchRows:dispatch.length,
    firstFour:legacy.slice(0,4).map(r=>r[0]),reuse:!!scenario.reuse,
    slots:scenario.slots??2,scope:scenario.scope}};
 }finally{p.close();}
}
try{
 const sequences=[];
 for(const item of contexts){
  const a=await metadata(item.calc,item.years[0]);
  const b=await metadata(item.calc,item.years[1]);
  assert.notDeepStrictEqual(a.months.map(x=>x.lengthDays),
   b.months.map(x=>x.lengthDays),'Distinct RNS key vectors required');
  const cmds=commands(item.calc,a,b,item.years[1]);
  assert.equal(cmds.length,9);
  const ref=start('original',{policy:null,requested:1},
   'source-oracle-'+item.calc);
  try{
   const replies=[];
   for(const cmd of cmds){
    const output=(await ref.call(cmd)).reply;
    assert.ok(output&&!output.error&&output.ok!==false,
     'Original Seer oracle returned a native protocol error');
    replies.push(output);
   }
   sequences.push({...item,cmds,replies});
  }finally{ref.close();}
 }
 const wire=composedCommands(sequences);
 const oracle=composedOracle(sequences);
 assert.equal(wire.length,81);assert.equal(oracle.length,81);
 // A single unchanged Seer service itself replays the identical 81 wire
 // requests, proving that our per-context references are stable across cycles.
 const unchanged=await longRun('original',{policy:null,requested:1},wire,oracle,
  'original-stateful-control');
 assert.equal(unchanged.completedReplies,81);
 const results=[];
 for(const cap of caps){
  const order=cap===512?arms:[...arms].reverse();
  for(const arm of order){
   const row=await longRun('probe',{
    policy:'1',requested:3,limitMiB:cap,scope:arm.scope,
    reuse:arm.reuse,slots:arm.slots},wire,oracle,'c'+cap+'-'+arm.id);
   results.push({arm:arm.id,...row});
  }
 }
 assert.equal(results.length,10);
 const accepted=results.filter(x=>x.status==='ACCEPTED');
 const limited=results.filter(x=>x.status==='RESOURCE_LIMITED');
 const summary=results.map(row=>({
  capMiB:row.capMiB,arm:row.arm,scope:row.scope,
  reuse:row.reuse,slots:row.slots,status:row.status,
  completed:row.completedReplies,ms:row.totalObservedMs,
  vmPeakKiB:row.finalStatus?.vmPeakKiB??null,
  vmHwmKiB:row.finalStatus?.vmHwmKiB??null,
  initTraceRows:row.traceEvidence?.rows??null,
  initHits:row.traceEvidence?.hits??null,
  evictionsMax:row.traceEvidence?.evictionsMax??null,
  snapshots:row.snapshots.map(v=>({
   completed:v.completedReplies,vmPeakKiB:v.vmPeakKiB,vmHwmKiB:v.vmHwmKiB
  }))
 }));
 const report={
  schema:'seer-next-long-lived-rns-cache-roi-v1',
  cpu:cpus()[0]?.model,platform:platform(),arch:arch(),
  researchSourceParent:'bab1c998ebfb01d75884c1e4fd6a6bb5b2cc9ff5',
  contexts,rounds,capsMiB:caps,arms,
  originalOracleUniqueReplies:sequences.reduce((n,x)=>n+x.replies.length,0),
  originalStatefulReplayedReplies:unchanged.completedReplies,
  expectedCandidateReplies:results.length*wire.length,
  observedCandidateReplies:results.reduce((n,x)=>n+x.completedReplies,0),
  candidateProcesses:results.length,
  acceptedProcesses:accepted.length,resourceLimitedProcesses:limited.length,
  allCompletedWireParity:results.every(x=>x.fullParityOfCompletedReplies),
  allAccepted:limited.length===0,
  unchanged,summary,results,
  caveats:[
   'All five initializer cache policies run identical original-Seer-equal 81-request R/Y/D wire in fresh native processes.',
   'Initializer reuse OFF is still an experimental cold-probe candidate, not production Seer.',
   'One slot and reuse OFF must both start with R A/B/A/B misses [0,0,0,0]; two slots reuse [0,0,1,1].',
   'Per-thread eviction counters have different semantics than process-global counters: do not compare maxima as sums.',
   '512MiB/768MiB Linux RLIMIT_AS and native cap-aware D scheduling are real, but virtual-space limits are not physical RSS limits.',
   'All accepted native processes have three complete 27-request memory checkpoints, 27 D dispatcher policy traces and independent RNS initializer trace schemas.',
   'A RESOURCE_LIMITED attempt is not accepted despite any earlier full-wire-equal responses.',
   'RNS LRU slot count is not a byte budget and does not bound in-flight shared_ptr-pinned engines.',
   'All released Seer, main, default cache and D policy modes remain unchanged.'
  ]
 };
 if(opts.has('output'))await writeFile(path.resolve(opts.get('output')),out);
 else process.stdout.write(out);
}finally{await rm(scratch,{recursive:true,force:true});}
