// Research-only D-concurrency scaling: immutable thread-local vs process-wide RNS cache.
// Compare every complete native JSON reply to the untouched original Seer service.
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
const trials=Number(args.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>3)throw Error('trials must be 1..3');
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-rns-d-workers-'));
const cap=512*1024*1024;
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
async function exercise(mode,workers,cmds,oracle,label,addressLimit=0){
 const p=client(mode,workers,label,addressLimit);
 const answers=[],times=[];
 try{
  for(let i=0;i<cmds.length;i++){
   const cmd=cmds[i];
   let result;
   try{result=await p.call(cmd);}catch(e){
    throw new Error('D-workers native failure '+JSON.stringify({
      mode,workers,label,addressLimit,index:i,command:cmd,error:String(e)}),{cause:e});
   }
   if(oracle)assert.deepStrictEqual(result.value,oracle[i],
      'Exact R/Y/D JSON differs: '+mode+' '+workers+' '+label+' index '+i);
   answers.push(result.value);times.push(result.ms);
  }
  const mem=await memory(p.pid);
  const effective=addressLimit?await effectiveLimit(p.pid):null;
  if(addressLimit){
   assert.equal(effective,addressLimit,'Effective kernel RLIMIT_AS mismatch');
   assert.ok(mem.vmPeakKiB*1024<=addressLimit,'Virtual memory exceeded limit');
  }
  let stats=null;
  if(mode!=='original'){
   const s=(await readFile(p.trace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
   const t=(await readFile(p.scopeTrace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
   assert.ok(s.length>=4,'Missing RNS initialization traces');
   assert.equal(s.length,t.length,'Scope trace and legacy cache trace row counts differ');
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
      'First two structurally distinct R years must miss');
   assert.deepStrictEqual(b.slice(0,2).map(x=>x[1]),[0,0]);
   const hits=a.reduce((sum,row)=>sum+row[0],0);
   assert.equal(hits,b.reduce((sum,row)=>sum+row[1],0),
      'Concurrent cache traces disagree about total hits');
   stats={traceRows:a.length,hits,evictionsMax:Math.max(...a.map(x=>x[2])),
    initialHits:a.slice(0,2).map(x=>x[0])};
  }
  return {answers,evidence:{
   mode,workers,requests:cmds.length,
   requestTimesMs:times,
   dTimesMs:times.filter((_,i)=>cmds[i][0]==='D'),
   totalMs:times.reduce((sum,x)=>sum+x,0),
   dTotalMs:times.reduce((sum,x,i)=>sum+(cmds[i][0]==='D'?x:0),0),
   memory:mem,effectiveLimitBytes:effective,stats,fullParity:true
  }};
 }finally{p.stop();}
}
const results=[];
try{
 const metadata={};
 for(const calc of [2461290,2461400]){
  metadata[calc]={};
  for(const year of [4999,5000])metadata[calc][year]=await getMeta(calc,year);
  assert.notDeepStrictEqual(
   metadata[calc][4999].months.map(m=>m.lengthDays),
   metadata[calc][5000].months.map(m=>m.lengthDays),
   'The two R years must have distinct engine keys');
 }
 for(let trial=0;trial<trials;trial++){
  for(const calc of [2461290,2461400]){
   const cmds=commands(calc,metadata[calc][4999],metadata[calc][5000]);
   assert.equal(cmds.length,8);
   for(const workers of [1,2,3]){
    const stem='t'+trial+'-c'+calc+'-d'+workers;
    const baseline=await exercise('original',workers,cmds,null,'original-'+stem);
    const order=(trial+workers+calc)%2===0?['thread','process']:['process','thread'];
    const rows={original:baseline.evidence};
    for(const mode of order){
     const r=await exercise(mode,workers,cmds,baseline.answers,mode+'-'+stem);
     rows[mode]=r.evidence;
    }
    results.push({trial,calc,workers,rows,fullParity:true});
   }
  }
 }
 const capCommands=commands(2461290,metadata[2461290][4999],metadata[2461290][5000]);
 const ref=await exercise('original',1,capCommands,null,'cap-original');
 const capped={original:ref.evidence};
 for(const mode of ['thread','process']){
  capped[mode]=(await exercise(mode,1,capCommands,ref.answers,'cap-'+mode,cap)).evidence;
 }
 assert.equal(results.length,12);
 const groups=['original','thread','process'].flatMap(mode=>
  [1,2,3].map(workers=>{
   const cases=results.filter(x=>x.workers===workers).map(x=>x.rows[mode]);
   return {mode,workers,contexts:cases.length,
    totalMs:cases.reduce((s,x)=>s+x.totalMs,0),
    dTotalMs:cases.reduce((s,x)=>s+x.dTotalMs,0),
    maxVmPeakKiB:Math.max(...cases.map(x=>x.memory.vmPeakKiB)),
    maxVmHwmKiB:Math.max(...cases.map(x=>x.memory.vmHwmKiB)),
    cacheHits:mode==='original'?null:cases.reduce((s,x)=>s+x.stats.hits,0),
    traceRows:mode==='original'?null:cases.reduce((s,x)=>s+x.stats.traceRows,0)};
  })
 );
 const report={schema:'seer-next-rns-process-scope-d-workers-v1',
  originalSha:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
  sourceParent:'634b87c99cf79a2016ae934f203572a608c88812',
  generated:new Date().toISOString(),cpu:cpus()[0]?.model,
  platform:platform(),arch:arch(),trials,contexts:results.length,
  requestsPerContext:8,primaryNativeReplies:results.length*8*3,
  cappedNativeReplies:24,fullParity:true,
  workerCases:[1,2,3],groups,results,cappedEvidence:capped,
  caveats:[
   'Uncapped D concurrency 1/2/3 is measured in separate fresh processes and includes nested native OpenMP/replay activity.',
   'First distinct R year keys must both miss for thread and process-scoped initializer caches.',
   'Every full R/Y/D native response is deep-equal to unchanged Seer, not only hashes or sample fields.',
   'The effective 512MiB Linux virtual-space cap is tested with D workers=1 only. Two/three D worker capped workloads are NOT certified.',
   'The two-slot cache is entry bounded and not byte/RSS bounded, and pinned process-shared engines can outlive LRU eviction.',
   'A mutex around process-cache construction can reduce contention or serialize expensive cold misses; performance is an empirical tradeoff.',
   'Only the isolated research cold probe is changed; released Seer and the research hybrid remain untouched.'
  ]};
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),JSON.stringify(report,null,2)+'\n');
 else process.stdout.write(JSON.stringify(report,null,2)+'\n');
}finally{await rm(scratch,{recursive:true,force:true});}
