// Seer Next research: workload-profile matrix with full parity and child-process metrics.
// Never used for production. Ubuntu/Linux only for /proc CPU and VmHWM accounting.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (platform() !== 'linux') throw Error('This profiler requires Linux /proc');
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const workingDir = path.join(root, 'prototype', 'data');
const baseline = path.join(root, 'prototype', 'build', 'seer_engine_service');
const candidate = path.join(root, 'research', 'seer-next', 'build', 'seer_next_engine_service');
const tickHz = Number(execFileSync('getconf', ['CLK_TCK'], {encoding:'utf8'}).trim());
if (!Number.isSafeInteger(tickHz) || tickHz <= 0) throw Error('Invalid CPU tick rate');
const args = new Map(process.argv.slice(2).map(arg => {
  const match = /^--([a-z-]+)=(.*)$/.exec(arg);
  if (!match) throw Error('Invalid arg: '+arg);
  return [match[1],match[2]];
}));
const trials = Number(args.get('trials') ?? 2);
if (!Number.isSafeInteger(trials) || trials < 1 || trials > 10) throw Error('trials must be 1..10');

const fixtures = new Map([
  [2458961, {year:5000,cutletIndex:5,dayInCutlet:1,monthIndex:5,dayInMonth:1,monthCount:37}],
  [2460984, {year:5000,cutletIndex:14,dayInCutlet:31,monthIndex:18,dayInMonth:68,monthCount:37}],
  [2461290, {year:5000,cutletIndex:14,dayInCutlet:337,monthIndex:39,dayInMonth:69,monthCount:37}],
  [2463007, {year:5000,cutletIndex:13,dayInCutlet:524,monthIndex:44,dayInMonth:111,monthCount:37}]
]);
const calcDays = [2461290,2461291,2461292,2461294,2461295,2461299,2461310,2461400,2461500];
const q=(c,t,count=1)=>['R',String(c),String(t),String(count)];
const workloads = [];
for(const target of [2460984,2458962,2463006]) {
  const suffix=target===2460984?'interior':target===2458962?'early':'late';
  for(const count of [1,2,4,16,32]) {
    workloads.push({id:suffix+'-'+count,commands:Array.from({length:count},()=>q(2461290,target))});
  }
}
workloads.push({id:'distinct-c-18',commands:Array.from({length:18},(_,i)=>q(2461290+i,2460984))});
workloads.push({id:'rotating-9-by-two',commands:[...calcDays,...calcDays].map(c=>q(c,2460984))});
workloads.push({id:'sparse-same-year-8',commands:[2458961,2460984,2461290,2463007,2460984,2458961,2461290,2463007].map(t=>q(2461290,t))});

const monotonic=()=>process.hrtime.bigint();
const milliseconds=(a,b)=>Number(b-a)/1e6;
function quantiles(times){
 const sorted=[...times].sort((a,b)=>a-b);
 const p=x=>sorted[Math.max(0,Math.ceil(sorted.length*x)-1)];
 return {count:times.length,p50Ms:p(.5),maxMs:sorted.at(-1),minMs:sorted[0],
   p95Ms:times.length>=20?p(.95):null,
   totalMs:times.reduce((a,b)=>a+b,0)};
}
function validateFixture(cmd,answer){
 if(cmd[0]!=='R'||cmd[3]!=='1'||Number(cmd[1])!==2461290)return;
 const target=Number(cmd[2]),ref=fixtures.get(target);
 if(!ref)return;
 assert.equal(answer.records?.length,1);
 for(const [name,val] of Object.entries(ref))assert.equal(answer.records[0][name],val);
}
async function procStats(pid) {
 const [stat,status]=await Promise.all([
   readFile('/proc/'+pid+'/stat','utf8'),
   readFile('/proc/'+pid+'/status','utf8')
 ]);
 const end=stat.lastIndexOf(') ');
 if(end<0)throw Error('Malformed /proc stat');
 const parts=stat.slice(end+2).trim().split(/\s+/);
 const cpuTicks=Number(parts[11])+Number(parts[12]); // /proc fields 14 and 15
 if(!Number.isFinite(cpuTicks))throw Error('Malformed child CPU ticks');
 const hwm=/^VmHWM:\s+(\d+) kB/m.exec(status);
 const rss=/^VmRSS:\s+(\d+) kB/m.exec(status);
 return {cpuMs:1000*cpuTicks/tickHz,peakRssKiB:hwm?Number(hwm[1]):null,
   currentRssKiB:rss?Number(rss[1]):null};
}
function session(binary, policy){
 const start=monotonic();
 const child=spawn(binary,[],{cwd:workingDir,env:{...process.env,
   SEER_NEXT_CACHE_BYTES:String(policy.budgetBytes),
   SEER_NEXT_PROMOTE_AFTER:String(policy.threshold)},stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',errText='',closed=null;
 child.stdout.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
   buffer+=chunk;
   if(buffer.length>32*1024*1024){
     closed=Error('Unbounded line');pending?.reject(closed);pending=null;child.kill();return;
   }
   while(buffer.includes('\n')){
     const i=buffer.indexOf('\n'),line=buffer.slice(0,i);
     buffer=buffer.slice(i+1);
     if(!pending){closed=Error('Unrequested output');child.kill();return;}
     const item=pending;pending=null;
     try{item.resolve(JSON.parse(line));}catch(e){item.reject(e);}
   }
 });
 child.stderr.setEncoding('utf8');
 child.stderr.on('data',x=>{errText=(errText+x).slice(-8192);});
 child.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
   closed=closed??Error('Native process closed '+code+'/'+signal+': '+errText);
   pending?.reject(closed);pending=null;
 });
 return {pid:child.pid,start,
   async call(fields){
     if(closed)throw closed;
     if(pending)throw Error('Concurrent calls unsupported in profiler');
     const begin=monotonic();
     let timer;
     try{
       const promise=new Promise((resolve,reject)=>{pending={resolve,reject};});
       timer=setTimeout(()=>{
         closed=Error('Native response timeout for '+fields.join(' '));
         pending?.reject(closed);pending=null;child.kill();
       },120000);
       child.stdin.write(fields.join('\t')+'\n');
       const answer=await promise;
       if(answer?.ok===false||answer?.error)throw Error('Native error '+JSON.stringify(answer));
       return {answer,latencyMs:milliseconds(begin,monotonic())};
     } finally {clearTimeout(timer);}
   },
   close(){child.stdin.end();child.kill();}
 };
}
async function execute(binary,kind,policy,commands){
 const svc=session(binary,policy);
 const observed=[],times=[];
 try{
   const cpuBegin=await procStats(svc.pid);
   let startupToFirstMs=null;
   for(const cmd of commands){
     const {answer,latencyMs}=await svc.call(cmd);
     if(startupToFirstMs===null)startupToFirstMs=milliseconds(svc.start,monotonic());
     validateFixture(cmd,answer);
     observed.push(answer);
     times.push(latencyMs);
   }
   let memo=null;
   if(kind==='candidate'){
     memo=(await svc.call(['M'])).answer.memo;
     assert.ok(memo && memo.payloadBytes<=memo.payloadBudgetBytes);
     assert.equal(memo.payloadBudgetBytes,policy.budgetBytes);
     assert.equal(memo.promoteAfter,policy.threshold);
   }
   const cpuEnd=await procStats(svc.pid);
   return {observed,times,record:{
     requestCount:times.length,latency:quantiles(times),
     timeToFirstResultIncludingProcessStartMs:startupToFirstMs,
     processCpuMs:cpuEnd.cpuMs-cpuBegin.cpuMs,
     nativePeakRssKiB:cpuEnd.peakRssKiB,
     memo
   }};
 } finally {svc.close();}
}
const policies=[
 {name:'disabled',threshold:2,budgetBytes:0},
 {name:'eager-second',threshold:2,budgetBytes:8*1024*1024},
 {name:'delayed-eighth',threshold:8,budgetBytes:8*1024*1024},
 {name:'tight-one-year',threshold:2,budgetBytes:180000}
];
const results=[];
for(let trial=0;trial<trials;trial++){
 for(let wi=0;wi<workloads.length;wi++){
   const w=workloads[(wi+(trial*7))%workloads.length];
   for(let pi=0;pi<policies.length;pi++){
     const p=policies[(pi+trial)%policies.length];
     // Alternate baseline/candidate order to limit systematic runner drift.
     const first=((trial+wi+pi)%2===0)?'baseline':'candidate';
     const outputs={};
     for(const kind of [first,first==='baseline'?'candidate':'baseline']){
       const chosenBinary=kind==='baseline'?baseline:candidate;
       outputs[kind]=await execute(chosenBinary,kind,p,w.commands);
     }
     assert.deepEqual(outputs.candidate.observed,outputs.baseline.observed,
       'Full response mismatch: '+w.id+', '+p.name+', trial '+trial);
     const digest=createHash('sha256');
     for(const x of outputs.baseline.observed)digest.update(JSON.stringify(x)+'\n');
     const record={trial,scenario:w.id,policy:p.name,commandCount:w.commands.length,
       fullParity:true,responseSha256:digest.digest('hex'),
       baseline:outputs.baseline.record,candidate:outputs.candidate.record,
       totalWallRatio:outputs.baseline.record.latency.totalMs/outputs.candidate.record.latency.totalMs,
       cpuRatio:outputs.baseline.record.processCpuMs/outputs.candidate.record.processCpuMs};
     results.push(record);
     process.stderr.write('PROFILE '+trial+'/'+w.id+'/'+p.name+
       ' wall_ratio='+record.totalWallRatio.toFixed(3)+'\n');
   }
 }
}
const final={
 schema:'seer-next-profile-matrix-v1',utc:new Date().toISOString(),
 researchBaseCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
 environment:{os:platform(),arch:arch(),cpu:cpus()[0]?.model,
   logicalCpus:cpus().length,node:process.version,tickHz},
 assumptions:['Separate native processes for every scenario and policy.',
   'Full baseline/candidate JSON response equivalence for every command.',
   'Linux /proc stat CPU tick resolution and VmHWM, not cgroup total memory.',
   'First-result metric includes spawn and initialization; per-call metrics exclude spawn.',
   'No external network; no speculative prefetch; one native service request at a time.'],
 trials,workloads:workloads.map(w=>({id:w.id,commands:w.commands})),
 policies,results
};
const output=JSON.stringify(final,null,2)+'\n';
if(args.has('output'))await writeFile(path.resolve(args.get('output')),output,'utf8');
else process.stdout.write(output);
