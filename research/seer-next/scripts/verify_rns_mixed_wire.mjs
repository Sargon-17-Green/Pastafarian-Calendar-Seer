// Mixed R/Y/D wire parity and memory A/B for research-only immutable RNS cache.
// All numeric answers are compared as complete JSON to unchanged Seer.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,platform,arch,cpus} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 is required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bin={
 original:path.join(root,'prototype','build','seer_engine_service'),
 hybrid:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
 probe0:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
 probe1:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
 probe2:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const args=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);
 if(!m)throw Error('Invalid option '+x);
 return [m[1],m[2]];
}));
const trials=Number(args.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>3)throw Error('trials must be 1..3');
const tmp=await mkdtemp(path.join(tmpdir(),'seer-next-rns-mixed-'));
const now=()=>process.hrtime.bigint();
const millis=t=>Number(now()-t)/1e6;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const virtualCap=512*1024*1024;
function start(mode,traceFile='',capBytes=0){
 const t=now();
 const probe=mode.startsWith('probe');
 const on=mode==='probe1'||mode==='probe2';
 const child=spawn(bin[mode],[],{
  cwd,
  env:{...process.env,
   SEER_NEXT_EXECUTION_PROFILE:'experimental42',
   SEER_NEXT_CACHE_BYTES:'0',
   SEER_NEXT_DAY_CACHE_BYTES:'0',
   SEER_NEXT_Y_MEMO_DIRECT:'0',
   SEER_NEXT_Y_STRUCT_REUSE:'0',
   SEER_NEXT_COLD_RNS_THREADS:'4',
   SEER_NEXT_COLD_REPLAY_THREADS:'2',
   SEER_NEXT_COLD_SUPERBLOCK:'512',
   SEER_NEXT_COLD_ADAPT_SUPERBLOCK:'0',
   SEER_NEXT_COLD_RNS_ENGINE_REUSE:on?'1':'0',
   SEER_NEXT_COLD_RNS_ENGINE_SLOTS:mode==='probe2'?'2':'1',
   // The mixed harness nests native OpenMP RNS builders and D workers. Bound
   // hosted-CI thread creation explicitly for all source/candidate arms.
   // The cap remains a real RLIMIT_AS and is never silently lifted.
   OMP_NUM_THREADS:'4',
   OMP_THREAD_LIMIT:'8',
   OMP_DYNAMIC:'FALSE',
   OMP_STACKSIZE:'2M',
   // The 512MiB address-space cap cannot sustain the two native D
   // dispatch threads plus OpenMP/replay stacks in this observed CI profile.
   // Keep the uncapped two-worker integration A/B; exercise capped D serially.
   SEER_DIAGONAL_THREADS:capBytes?'1':'2',
   SEER_NEXT_COLD_RNS_CACHE_STATS_FILE:probe?traceFile:'',
   ...(capBytes?{SEER_NEXT_MAX_VIRTUAL_BYTES:String(capBytes)}:{})
  },stdio:['pipe','pipe','pipe']
 });
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 let buffer='',pending=null,err=null,stderr='';
 child.stderr.on('data',v=>stderr=(stderr+v).slice(-10000));
 child.stdout.on('data',v=>{
  buffer+=v;
  if(buffer.length>96*1024*1024){
   err=Error('Native response exceeds 96MiB');pending?.reject(err);pending=null;child.kill();return;
  }
  let index;
  while((index=buffer.indexOf('\n'))!==-1){
   const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
   if(!pending){err=Error('Unsolicited native stdout');child.kill();return;}
   const a=pending;pending=null;
   try{a.resolve(JSON.parse(line));}catch(e){a.reject(e);}
  }
 });
 child.on('error',e=>{err=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  err??=Error('Native closed: '+code+'/'+signal+' '+stderr);
  pending?.reject(err);pending=null;
 });
 return {
  pid:child.pid,
  async call(command){
   if(err)throw err;
   if(pending)throw Error('Concurrent native calls are unsupported');
   const t0=now();
   let timeout;
   try{
    const reply=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     err=Error('Timeout: '+command.join(','));
     pending?.reject(err);pending=null;child.kill();
    },180000);
    child.stdin.write(command.join('\t')+'\n');
    const value=await reply;
    if(value?.error||value?.ok===false)throw Error('Native protocol error: '+JSON.stringify(value).slice(0,800));
    return {value,requestMs:millis(t0),spawnToReplyMs:millis(t)};
   }finally{clearTimeout(timeout);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
async function metrics(pid){
 const raw=await readFile('/proc/'+pid+'/status','utf8');
 const get=name=>{
  const m=new RegExp('^'+name+':\\s+(\\d+) kB','m').exec(raw);
  if(!m)throw Error('Missing '+name+' for PID '+pid);
  return Number(m[1]);
 };
 return {vmPeakKiB:get('VmPeak'),vmHwmKiB:get('VmHWM')};
}
async function effectiveCap(pid){
 const raw=await readFile('/proc/'+pid+'/limits','utf8');
 const m=/^Max address space\s+(\d+)\s+/m.exec(raw);
 if(!m)throw Error('Missing effective address space limit');
 return Number(m[1]);
}
async function yearMeta(calc,year){
 const client=start('original');
 try{
  const {value}=await client.call(['Y',String(calc),String(year),'0']);
  assert.equal(value.calcJdn,calc);assert.equal(value.year,year);
  assert.equal(value.endJdn-value.startJdn+1,value.lengthDays);
  assert.ok(value.lengthDays>20);
  return value;
 }finally{client.close();}
}
function mid(meta){return meta.startJdn+Math.floor(meta.lengthDays/2);}
function r(calc,day,count=1){return ['R',String(calc),String(day),String(count)];}
function commandsFor(calc,meta){
 const a=meta[4999],b=meta[5000],c=meta[5001];
 const am=mid(a),bm=mid(b),cm=mid(c);
 // Initial four R requests must alternate structurally distinct years.
 return [
  r(calc,am),r(calc,bm),r(calc,am+1),r(calc,bm+1),
  ['Y',String(calc),'5000','0'],
  r(calc,b.endJdn-1),
  ['Y',String(calc),'5000','1'],
  r(calc,cm,4),
  ['D',String(calc),'5','1'],
  ['D',String(calc),'4','-1'],
  ['Y',String(calc),'4999','1'],
  r(calc,a.endJdn-1),
  ['Y',String(calc),'5001','0'],
  r(calc,cm+1,8),
  r(calc,am),
  ['Y',String(calc),'5001','1'],
  r(calc,bm),
  ['D',String(calc),'3','1']
 ];
}
async function run(mode,commands,oracle,tag,cap=0){
 const probe=mode.startsWith('probe');
 const tracePath=probe?path.join(tmp,'cache-'+tag+'.tsv'):'';
 const s=start(mode,tracePath,cap);
 const answer=[],timings=[],digests=[];
 // The native service processes R and Y on its main thread, while D also
 // dispatches short-lived workers with *separate thread_local* LRU counters.
 // Capture trace boundaries after each fully completed wire request so that
 // monotonicity is asserted only for the durable main-thread R/Y subset.
 const traceSegments=[];
 let observedRows=0;
 let spawnToFirstMs=null;
 try{
  for(let i=0;i<commands.length;i++){
   const command=commands[i];
   // Preserve exact failed index in CI logs when a native subprocess fails.
   if(process.env.SEER_NEXT_MIXED_PROGRESS==='1')
     process.stderr.write('MIXED_BEGIN '+JSON.stringify({mode,tag,cap,commandIndex:i,command})+'\n');
   let x;
   try{x=await s.call(command);}
   catch(e){
    throw new Error('Mixed native request failed '+JSON.stringify({mode,tag,cap,
      commandIndex:i,command,cause:String(e)}),{cause:e});
   }
   if(process.env.SEER_NEXT_MIXED_PROGRESS==='1')
     process.stderr.write('MIXED_DONE '+JSON.stringify({mode,tag,cap,commandIndex:i,ms:x.requestMs})+'\n');
   if(i===0)spawnToFirstMs=x.spawnToReplyMs;
   if(oracle)assert.deepStrictEqual(x.value,oracle[i],
    'Complete native R/Y/D mismatch: '+mode+' at #'+i+' '+commands[i].join(','));
   answer.push(x.value);timings.push(x.requestMs);digests.push(hash(x.value));
   if(probe){
    // Each request has completed and joined D workers before it replies.
    const raw=(await readFile(tracePath,'utf8')).trim();
    const allLines=raw?raw.split(/\r?\n/).filter(Boolean):[];
    assert.ok(allLines.length>=observedRows,'Native trace rows disappeared');
    traceSegments.push({commandIndex:i,type:commands[i][0],
       begin:observedRows,end:allLines.length});
    observedRows=allLines.length;
   }
  }
  let trace=null,mainThreadTraceRows=0,diagonalWorkerTraceRows=0;
  if(probe){
   const lines=(await readFile(tracePath,'utf8')).trim().split(/\r?\n/).filter(Boolean);
   assert.ok(lines.length>=4,'Missing RNS cache trace for mixed commands');
   trace=lines.map(line=>{
    const a=line.split('\t').map(Number);
    assert.equal(a.length,4,'Four-field research cache trace required');
    assert.ok(a.every(Number.isSafeInteger),'Malformed cache trace');
    const [hit,entries,evictions,slots]=a;
    assert.ok(hit===0||hit===1);
    assert.ok(evictions>=0&&slots>=1&&slots<=2&&entries>=0&&entries<=slots);
    if(mode==='probe0'){assert.equal(hit,0);assert.equal(entries,0);}
    if(mode==='probe1')assert.equal(slots,1);
    if(mode==='probe2')assert.equal(slots,2);
    return {hit,entries,evictions,slots};
   });
   assert.equal(trace.length,observedRows,'Trace must match exact command boundaries');
   assert.equal(traceSegments.length,commands.length,'Each wire command needs a boundary');
   const firstFour=trace.slice(0,4).map(x=>x.hit);
   assert.deepStrictEqual(firstFour,mode==='probe2'?[0,0,1,1]:[0,0,0,0],
      'A/B/A/B early engine-init hit pattern');
   let mainCounter=-1;
   for(const segment of traceSegments){
    assert.ok(segment.end>=segment.begin&&segment.end<=trace.length);
    const rows=trace.slice(segment.begin,segment.end);
    if(segment.type==='D'){
     // D concurrently uses the main thread and new short-lived threads.
     // A thread_local counter can reset to zero on each new worker: there
     // is no valid global ordering or global monotonicity assertion.
     diagonalWorkerTraceRows+=rows.length;
     continue;
    }
    assert.ok(segment.type==='R'||segment.type==='Y');
    for(const row of rows){
     assert.ok(row.evictions>=mainCounter,
       'Persistent main-thread R/Y cache evictions must not decrease');
     mainCounter=row.evictions;
     ++mainThreadTraceRows;
    }
   }
   assert.ok(mainThreadTraceRows>=4,'Missing persistent main-thread R traces');
  }
  const memory=await metrics(s.pid);
  const kernelLimit=cap?await effectiveCap(s.pid):null;
  if(cap){assert.equal(kernelLimit,cap);assert.ok(memory.vmPeakKiB*1024<=cap);}
  return {answers:answer,evidence:{mode,commands:commands.length,
    commandTypes:commands.map(x=>x[0]),requestMs:timings,
    totalMs:timings.reduce((a,b)=>a+b,0),spawnToFirstMs,
    hashes:digests,trace,traceSegments,mainThreadTraceRows,
    diagonalWorkerTraceRows,memory,effectiveLimitBytes:kernelLimit,fullParity:true}};
 }finally{s.close();}
}
const results=[];
try{
 const calculations=[2461290,2461400];
 const metadata={};
 for(const calc of calculations){
  metadata[calc]={};
  for(const year of [4999,5000,5001])metadata[calc][year]=await yearMeta(calc,year);
 }
 for(let trial=0;trial<trials;trial++)for(const calc of calculations){
  const commands=commandsFor(calc,metadata[calc]);
  assert.equal(commands.length,18);
  const baseline=await run('original',commands,null,'base-'+trial+'-'+calc);
  const order=(trial+calc)%2===0?['hybrid','probe0','probe1','probe2']:
       ['probe2','probe1','probe0','hybrid'];
  const rows={original:baseline.evidence};
  for(const mode of order){
   const x=await run(mode,commands,baseline.answers,mode+'-'+trial+'-'+calc);
   rows[mode]=x.evidence;
  }
  results.push({trial,calc,requests:commands.length,rows,fullParity:true});
 }
 const capCalc=2461290;
 const capCommands=commandsFor(capCalc,metadata[capCalc]);
 const capReference=await run('original',capCommands,null,'capped-reference');
 const capped=await run('probe2',capCommands,capReference.answers,'capped-probe2',virtualCap);
 const groups=['original','hybrid','probe0','probe1','probe2'].map(mode=>{
  const rows=results.map(x=>x.rows[mode]);
  return {mode,contexts:rows.length,requests:rows.reduce((s,x)=>s+x.commands,0),
   totalMs:rows.reduce((s,x)=>s+x.totalMs,0),
   maxVmPeakKiB:Math.max(...rows.map(x=>x.memory.vmPeakKiB)),
   maxVmHwmKiB:Math.max(...rows.map(x=>x.memory.vmHwmKiB)),
   totalInitHits:mode.startsWith('probe')?
      rows.reduce((s,x)=>s+x.trace.reduce((n,t)=>n+t.hit,0),0):null,
   traceRows:mode.startsWith('probe')?
      rows.reduce((s,x)=>s+x.trace.length,0):null};
 });
 const report={
  schema:'seer-next-rns-cache-mixed-wire-v1',
  sourceCommitParent:'2dd85de901af3d78dad8391b86d6e60b4dfcc591',
  cpu:cpus()[0]?.model,platform:platform(),arch:arch(),
  trials,contexts:results.length,commandsPerContext:18,
  primaryNativeReplies:results.length*18*5,
  cappedNativeReplies:capCommands.length*2,fullParity:true,
  workerProfile:{rns:4,replay:2},
  disabledResultCaches:true,hostThreadLimits:{ompNumThreads:4,ompThreadLimit:8,
   ompStack:'2M',diagonalThreadsUncapped:2,diagonalThreadsCapped:1},groups,results,
  cappedEvidence:capped.evidence,
  caveats:[
   'Actual research hybrid control uses unchanged prototype arithmetic, while experimental cold probe uses independent research core/weave.',
   'Full native R/Y/D JSON equality is required against unchanged Seer for each request, including three full-year Y exports per context.',
   'Only cold probe implements optional immutable RNS initializer reuse; not merged into normal hybrid or production.',
   'The first R four-command hit pattern is checked separately from later Y/D workload paths.',
   'All record/day memo caches are disabled, so this isolates RNS initializer reuse.',
   'Two cache slots bound entries but not allocated bytes; process VmHWM is measured and not a portable hard limit.',
   'Linux RLIMIT_AS is an address-space cap, not a physical RAM guarantee.',
   'Under 512MiB the D dispatcher uses one worker; two-worker capped D previously failed at command index 8 with Resource temporarily unavailable in completed CI 42395106652. The capped test does NOT certify two-worker D.',
   'Uncapped mixed matrix retains two D dispatcher workers; capped versus uncapped wall timings are NOT directly comparable.',
   'Single-host observations cannot prove universal performance or correctness.'
  ]
 };
 const rendered=JSON.stringify(report,null,2)+'\n';
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),rendered);
 else process.stdout.write(rendered);
}finally{await rm(tmp,{recursive:true,force:true});}
