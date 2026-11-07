// Exact same-process cold RNS initialization reuse, research only.
// Every R reply is compared in full to the unchanged Seer native engine.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpus,platform,arch,tmpdir} from 'node:os';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bins={
 baseline:path.join(root,'prototype','build','seer_engine_service'),
 control:path.join(root,'research','seer-next','build','seer_next_cold_probe_service'),
 reuse:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const args=new Map(process.argv.slice(2).map(arg=>{
 const match=/^--([a-z-]+)=(.*)$/.exec(arg);
 if(!match)throw Error('Invalid option '+arg);
 return [match[1],match[2]];
}));
const trials=Number(args.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>4)throw Error('trials must be in 1..4');
const years=[4997,4999,5000,5002,5003];
const calculationDays=[2461290,2461400];
const workspace=await mkdtemp(path.join(tmpdir(),'seer-next-rns-engine-reuse-'));
const clock=()=>process.hrtime.bigint();
const ms=t=>Number(clock()-t)/1e6;

function service(kind,traceFile=''){
 const original=kind==='baseline';
 const p=spawn(bins[kind],[],{
  cwd,
  env:{...process.env,
   SEER_NEXT_CACHE_BYTES:'0',
   SEER_NEXT_DAY_CACHE_BYTES:'0',
   SEER_NEXT_EXECUTION_PROFILE:'latency',
   SEER_NEXT_COLD_RNS_THREADS:'4',
   SEER_NEXT_COLD_REPLAY_THREADS:'2',
   SEER_NEXT_COLD_RNS_ENGINE_REUSE:kind==='reuse'?'1':'0',
   SEER_NEXT_COLD_RNS_ENGINE_REUSE_STAGE_FILE:original?'':traceFile,
   SEER_NEXT_COLD_ADAPT_SUPERBLOCK:'0',
   SEER_NEXT_COLD_SUPERBLOCK:'512'
  },
  stdio:['pipe','pipe','pipe']
 });
 let buffer='',pending=null,closed=null,stderr='';
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 p.stderr.on('data',s=>{stderr=(stderr+s).slice(-16000);});
 p.stdout.on('data',s=>{
  buffer+=s;
  if(buffer.length>32*1024*1024){
   closed=Error('Native response too long');pending?.reject(closed);pending=null;p.kill();return;
  }
  let offset;
  while((offset=buffer.indexOf('\n'))!==-1){
   const line=buffer.slice(0,offset);buffer=buffer.slice(offset+1);
   if(!pending){closed=Error('Unexpected native reply');p.kill();return;}
   const request=pending;pending=null;
   try{request.resolve(JSON.parse(line));}catch(e){request.reject(e);}
  }
 });
 p.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
  closed??=Error('Native exited '+code+'/'+signal+': '+stderr);
  pending?.reject(closed);pending=null;
 });
 return {
  pid:p.pid,
  async call(fields){
   if(closed)throw closed;
   if(pending)throw Error('Concurrent requests unsupported');
   const start=clock();
   let timeout;
   try{
    const result=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     closed=Error('Timed out native request '+fields.join(','));
     pending?.reject(closed);pending=null;p.kill();
    },180000);
    p.stdin.write(fields.join('\t')+'\n');
    const value=await result;
    if(value?.error||value?.ok===false)throw Error('Native error '+JSON.stringify(value).slice(0,700));
    return {value,ms:ms(start)};
   }finally{clearTimeout(timeout);}
  },
  stop(){p.stdin.end();p.kill();}
 };
}
async function rss(pid){
 const raw=await readFile('/proc/'+pid+'/status','utf8');
 const field=name=>{
  const found=new RegExp('^'+name+':\\s+(\\d+) kB','m').exec(raw);
  if(!found)throw Error('Missing '+name+' for PID '+pid);
  return Number(found[1]);
 };
 return {vmPeakKiB:field('VmPeak'),rssHighWaterKiB:field('VmHWM')};
}
async function metadata(calc,year){
 const p=service('baseline');
 try{
  const {value}=await p.call(['Y',String(calc),String(year),'0']);
  assert.equal(value.calcJdn,calc);assert.equal(value.year,year);
  assert.ok(Number.isSafeInteger(value.startJdn)&&Number.isSafeInteger(value.endJdn));
  assert.equal(value.lengthDays,value.endJdn-value.startJdn+1);
  assert.ok(value.lengthDays>=6);
  return value;
 }finally{p.stop();}
}
async function exercise(kind,commands,reference,traceFile,expectedHits){
 const p=service(kind,traceFile);
 const answers=[],timings=[];
 const start=clock();
 let spawnedToFirstMs=null;
 try{
  for(let i=0;i<commands.length;i++){
   const {value,ms:wall}=await p.call(commands[i]);
   if(reference)assert.deepStrictEqual(value,reference[i],
       'Complete native R mismatch '+kind+' index '+i+' '+commands[i].join(','));
   answers.push(value);timings.push(wall);
   if(i===0)spawnedToFirstMs=ms(start);
  }
  const memory=await rss(p.pid);
  let trace=null;
  if(traceFile){
   const lines=(await readFile(traceFile,'utf8')).trim().split(/\r?\n/);
   assert.equal(lines.length,commands.length,'One trace record per R request');
   trace=lines.map(line=>{
    const a=line.split('\t').map(Number);
    assert.equal(a.length,4,'Expected [hit,npr,threads,packs]');
    assert.ok(a.every(Number.isSafeInteger));
    const [hit,npr,threads,packs]=a;
    assert.ok(hit===0||hit===1);
    assert.ok(npr>=8&&packs>0);
    assert.equal(threads,4);
    return {hit,npr,threads,packs};
   });
   if(expectedHits)assert.deepStrictEqual(trace.map(x=>x.hit),expectedHits,
     'Exact cold/warm RNS engine cache hit pattern mismatch');
  }
  return {answers,evidence:{kind,requestMs:timings,elapsedMs:ms(start),
   spawnedToFirstMs,memory,trace,allExact:true}};
 }finally{p.stop();}
}
const results=[],samples=[];
try{
 for(const calc of calculationDays)for(const year of years){
  const meta=await metadata(calc,year);
  const midpoint=meta.startJdn+Math.floor(meta.lengthDays/2);
  const targets=[midpoint,midpoint+1,meta.endJdn-1];
  assert.ok(targets[0]<targets[1]&&targets[1]<targets[2]);
  samples.push({calc,year,yearLength:meta.lengthDays,targets});
 }
 assert.equal(samples.length,years.length*calculationDays.length);
 for(let trial=0;trial<trials;trial++){
  for(let k=0;k<samples.length;k++){
   const sample=samples[(k+trial)%samples.length];
   const commands=sample.targets.map(t=>['R',String(sample.calc),String(t),'1']);
   const baseline=await exercise('baseline',commands,null,'');
   const kinds=(k+trial)%2===0?['control','reuse']:['reuse','control'];
   const rows={baseline:baseline.evidence};
   for(const kind of kinds){
    const file=path.join(workspace,kind+'-'+trial+'-'+k+'.tsv');
    const result=await exercise(kind,commands,baseline.answers,file,
      kind==='reuse'?[0,1,1]:[0,0,0]);
    rows[kind]=result.evidence;
   }
   results.push({trial,calc:sample.calc,year:sample.year,targets:sample.targets,
    rows,completeParity:true});
  }
 }
 assert.equal(results.length,10*trials);
 // Different year must evict capacity-one engine. Return to first year misses.
 const a=samples.find(x=>x.calc===2461290&&x.year===5000);
 const b=samples.find(x=>x.calc===2461290&&x.year===5002);
 const evictCommands=[
  ['R',String(a.calc),String(a.targets[0]),'1'],
  ['R',String(b.calc),String(b.targets[0]),'1'],
  ['R',String(a.calc),String(a.targets[0]),'1']
 ];
 const reference=await exercise('baseline',evictCommands,null,'');
 const eviction=await exercise('reuse',evictCommands,reference.answers,
  path.join(workspace,'evict-cross-years.tsv'),[0,0,0]);
 const sameDaysNewCalc=[
  ['R','2461290',String(a.targets[0]),'1'],
  ['R','2461400',String(a.targets[0]),'1']
 ];
 const reference2=await exercise('baseline',sameDaysNewCalc,null,'');
 const independentCalcs=await exercise('reuse',sameDaysNewCalc,reference2.answers,
  path.join(workspace,'distinct-calculations.tsv'));
 const summary=['baseline','control','reuse'].map(kind=>{
  const rows=results.map(x=>x.rows[kind]);
  const sum=index=>rows.reduce((total,x)=>total+x.requestMs[index],0);
  return {kind,contexts:rows.length,firstRTotalMs:sum(0),
   secondRTotalMs:sum(1),thirdRTotalMs:sum(2),
   allThreeMs:sum(0)+sum(1)+sum(2),
   maxVmPeakKiB:Math.max(...rows.map(x=>x.memory.vmPeakKiB)),
   maxRssHighWaterKiB:Math.max(...rows.map(x=>x.memory.rssHighWaterKiB))};
 });
 const document={
  schema:'seer-next-cold-rns-engine-reuse-v1',
  baselineCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
  sourceParent:'caa4b9aa312a2b0c40bf44aae3f8c37cd4b0e15f',
  platform:platform(),arch:arch(),cpu:cpus()[0]?.model,trials,
  contexts:results.length,candidateNativeRReplies:results.length*6+5,
  referenceNativeRReplies:results.length*3+5,
  fullParity:true,workers:{rns:4,replay:2},samples,summary,results,
  eviction:eviction.evidence,independentCalcs:independentCalcs.evidence,
  caveats:[
   'The retained engine includes a large year-specific RNS precomputation; its memory is not charged to BatchRecord memo budgets.',
   'A single one-entry thread-local reuse slot means distinct month-length vectors replace the prior engine; context switches are tested explicitly.',
   'Only the immutable RnsEngine is shared. Sauce, rank, FastState, predictor and replay pool are computed for every request.',
   'No R or day memo is enabled in any variant; source Seer and exact full native R JSON are oracle controls.',
   'All timings are from one hosted CPU and not an all-platform promise; VmPeak is address space, not RSS.',
   'Spawn-to-first in this harness is captured separately from request wall times.'
  ]
 };
 const rendered=JSON.stringify(document,null,2)+'\n';
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),rendered);
 else process.stdout.write(rendered);
}finally{await rm(workspace,{recursive:true,force:true});}
