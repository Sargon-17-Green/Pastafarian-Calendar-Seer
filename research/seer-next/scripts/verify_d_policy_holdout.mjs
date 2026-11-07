// Research-only out-of-sample falsification of RLIMIT_AS-aware D dispatch.
// Every completed R/Y/D native JSON reply must match unchanged Seer exactly.
// Resource-limited attempts are evidence of failed acceptance, NOT a PASS.
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
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-d-policy-holdout-'));
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
  SEER_NEXT_COLD_RNS_ENGINE_REUSE:mode==='probe'?'1':'0',
  SEER_NEXT_COLD_RNS_ENGINE_SLOTS:'2',
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

const cases=[
 {calc:2461007,years:[4997,5001]},
 {calc:2461159,years:[4998,5002]},
 {calc:2461247,years:[4999,5003]},
 {calc:2461481,years:[4997,5002]},
 {calc:2461593,years:[4998,5003]},
 {calc:2461759,years:[4999,5001]}
];
const capMiB=[512,768,1024];
const modes=[{engine:'hybrid',scope:'thread'},
 {engine:'probe',scope:'thread'},{engine:'probe',scope:'process'}];
const isResourceFailure=x=>
 /Resource temporarily unavailable|Cannot allocate memory|std::bad_alloc|bad allocation|libgomp: Thread creation failed|std::system_error/i.test(String(x));
async function testCandidate(context,cap,variant,oracle,label){
 const {calc,years,commands:cmds}=context;
 const expected=cap===512?1:2;
 const p=start(variant.engine,{
  policy:'1',requested:3,limitMiB:cap,scope:variant.scope},label);
 let fail=null,successful=0;
 const times=[];
 try{
  for(let i=0;i<cmds.length;i++){
   let x;
   try{x=await p.call(cmds[i]);}
   catch(e){
    if(!isResourceFailure(e))throw new Error('Unexpected holdout service failure '+JSON.stringify({
      calc,years,cap,mode:variant,commandIndex:i,command:cmds[i],cause:String(e)}),{cause:e});
    fail={commandIndex:i,command:cmds[i],cause:String(e).slice(0,2000)};
    break;
   }
   if(x.reply?.error||x.reply?.ok===false){
    if(!isResourceFailure(JSON.stringify(x.reply)))
      throw new Error('Unexpected native protocol error '+JSON.stringify({
       calc,years,cap,mode:variant,commandIndex:i,reply:x.reply}));
    fail={commandIndex:i,command:cmds[i],cause:JSON.stringify(x.reply).slice(0,2000)};
    break;
   }
   assert.deepStrictEqual(x.reply,oracle[i],
    'Full original-Seer native wire JSON mismatch '+JSON.stringify({
      calc,years,cap,mode:variant,index:i,command:cmds[i]}));
   successful++;
   times.push(x.ms);
  }
  let kernel=null;
  try{kernel=await procInfo(p.pid);}
  catch(e){if(!fail)throw e;}
  if(kernel){
   assert.equal(kernel.limitBytes,cap*MiB,'Native kernel RLIMIT_AS mismatch');
   assert.ok(kernel.vmPeakKiB*1024<=cap*MiB,'Native address space above limit');
  }
  if(fail){
   return {calc,years,capMiB:cap,engine:variant.engine,scope:variant.scope,
    requested:3,expectedWorkers:expected,status:'RESOURCE_LIMITED',
    completedReplies:successful,totalReplies:cmds.length,fail,kernel,
    fullParityOfCompletedReplies:true,completeFullParity:false};
  }
  assert.equal(successful,cmds.length);
  assert.ok(kernel,'Complete response set must include Linux kernel readback');
  const raw=(await readFile(p.trace,'utf8')).trim();
  const dispatch=raw?raw.split(/\r?\n/).filter(Boolean).map(x=>x.split('\t').map(Number)):[];
  assert.equal(dispatch.length,3,'Three D commands must have exact policy trace');
  for(let i=0;i<3;i++){
   assert.deepStrictEqual(dispatch[i],[3,expected,cap*MiB,[5,9,13][i]],
    'D policy mismatch '+JSON.stringify({calc,cap,mode:variant,index:i}));
  }
  let cache=null;
  if(variant.engine==='probe'){
   const legacy=(await readFile(p.cacheTrace,'utf8')).trim().split(/\r?\n/).filter(Boolean)
    .map(x=>x.split('\t').map(Number));
   const scope=(await readFile(p.scopeTrace,'utf8')).trim().split(/\r?\n/).filter(Boolean)
    .map(x=>x.split('\t').map(Number));
   assert.ok(legacy.length>=5&&scope.length===legacy.length,'Missing initializer cache traces');
   for(const row of legacy){
    assert.equal(row.length,4);
    assert.ok(row.every(Number.isSafeInteger));
    assert.ok(row[0]===0||row[0]===1);
    assert.ok(row[1]>=1&&row[1]<=2&&row[2]>=0&&row[3]===2);
   }
   for(const row of scope){
    assert.equal(row.length,4);
    assert.ok(row.every(Number.isSafeInteger));
    assert.equal(row[0],variant.scope==='process'?1:0);
    assert.ok(row[1]===0||row[1]===1);
    assert.ok(row[2]>=1&&row[2]<=2&&row[3]>=0);
   }
   assert.deepStrictEqual(legacy.slice(0,4).map(x=>x[0]),[0,0,1,1],
    'A/B/A/B full-reuse RNS initializer pattern incorrect');
   assert.deepStrictEqual(scope.slice(0,4).map(x=>x[1]),[0,0,1,1]);
   assert.equal(legacy.reduce((n,row)=>n+row[0],0),scope.reduce((n,row)=>n+row[1],0));
   cache={rows:legacy.length,hits:legacy.reduce((n,row)=>n+row[0],0)};
  }
  return {calc,years,capMiB:cap,engine:variant.engine,scope:variant.scope,
   requested:3,expectedWorkers:expected,status:'ACCEPTED',
   completedReplies:successful,totalReplies:cmds.length,fullParityOfCompletedReplies:true,
   completeFullParity:true,kernel,dispatcherTrace:dispatch,
   totalMs:times.reduce((a,b)=>a+b,0),cache};
 }finally{p.close();}
}
try{
 const contexts=[];
 for(const test of cases){
  const [yA,yB]=test.years;
  const a=await metadata(test.calc,yA);
  const b=await metadata(test.calc,yB);
  assert.notDeepStrictEqual(a.months.map(x=>x.lengthDays),
    b.months.map(x=>x.lengthDays),'Holdout years must yield distinct initializer keys');
  const cmds=commands(test.calc,a,b,yB);
  assert.equal(cmds.length,9);
  const baseline=start('original',{policy:null,requested:1},'oracle-'+test.calc);
  try{
   const answers=[];
   for(const cmd of cmds){
    const x=(await baseline.call(cmd)).reply;
    assert.ok(x&&x.ok!==false&&!x.error,'Original oracle returned error');
    answers.push(x);
   }
   contexts.push({...test,commands:cmds,answers});
  }finally{baseline.close();}
 }
 const results=[];
 for(const context of contexts){
  for(const cap of capMiB){
   const order=(context.calc+cap)%2===0?modes:[...modes].reverse();
   for(const variant of order){
    const name=['calc',context.calc,'c',cap,variant.engine,variant.scope].join('-');
    results.push(await testCandidate(context,cap,variant,context.answers,name));
   }
  }
 }
 assert.equal(results.length,54,'6 calcs × 3 caps × 3 variants are required');
 const accepted=results.filter(r=>r.status==='ACCEPTED');
 const limited=results.filter(r=>r.status==='RESOURCE_LIMITED');
 const groups=capMiB.flatMap(cap=>modes.map(m=>{
  const rows=results.filter(x=>x.capMiB===cap&&x.engine===m.engine&&x.scope===m.scope);
  const complete=rows.filter(x=>x.status==='ACCEPTED');
  return {capMiB:cap,engine:m.engine,scope:m.scope,
   trials:rows.length,accepted:complete.length,resourceLimited:rows.length-complete.length,
   maxAcceptedVmPeakKiB:complete.length?Math.max(...complete.map(x=>x.kernel.vmPeakKiB)):null,
   maxAcceptedRssKiB:complete.length?Math.max(...complete.map(x=>x.kernel.vmHwmKiB)):null,
   acceptedTotalMs:complete.reduce((n,x)=>n+x.totalMs,0)};
 }));
 const report={
  schema:'seer-next-d-policy-holdout-v1',
  cpu:cpus()[0]?.model,platform:platform(),arch:arch(),
  sourceSha:'edf21ed3c3c2c99b014b738209548333c539dcc9',
  holdoutCalculationJdns:cases.map(x=>x.calc),
  holdoutYearPairs:cases.map(x=>x.years),limitsMiB:capMiB,
  nativeModes:modes,sourceOracleReplies:contexts.length*9,
  expectedCandidateReplies:results.length*9,
  observedCandidateReplies:results.reduce((n,x)=>n+x.completedReplies,0),
  trials:results.length,acceptedTrials:accepted.length,
  resourceLimitedTrials:limited.length,
  allCompletedFullParity:results.every(x=>x.fullParityOfCompletedReplies),
  allTrialAccepted:limited.length===0,groups,results,
  caveats:[
   'Holdout calculation-day JDNs and year pairs are fixed in advance and exclude the two earlier tuning calculation contexts.',
   'This is an attempt to FALSIFY a cap-aware D heuristic rather than to assume success; RESOURCE_LIMITED is not acceptance.',
   'Each complete candidate R/Y/D reply is compared as full native JSON to untouched original Seer.',
   'The RNS constructor cache is separately enabled only in the experimental cold probe, both local and process-shared opt-in.',
   'Every ACCEPTED trial verifies effective Linux RLIMIT_AS and VmPeak. Kernel readback is not always possible after a native process exits on allocation failure.',
   'The 512/768/1024MiB thresholds are virtual-address limits, not physical resident memory budgets and not portable guarantees.',
   'A completed CI experiment validates truthful classification even when the generalization hypothesis fails; report all failures explicitly.'
  ]
 };
 if(opts.has('output'))await writeFile(path.resolve(opts.get('output')),JSON.stringify(report,null,2)+'\n');
 else process.stdout.write(JSON.stringify(report,null,2)+'\n');
}finally{await rm(scratch,{recursive:true,force:true});}
