// Seer Next opt-in Y full-year record caching: exact parity and live warm-cost A/B.
// Research only. No production code changes or extrapolation to arbitrary hardware.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,platform,arch} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const binary={
  reference:path.join(root,'prototype','build','seer_engine_service'),
  latency:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
  experimental42:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
  experimental42Memo:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service')
};
const args=new Map(process.argv.slice(2).map(s=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(s);
 if(!m)throw Error('Invalid option '+s);
 return [m[1],m[2]];
}));
const trials=Number(args.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>4)throw Error('trials must be 1..4');
const repetitions=3;
const cases=[2461290,2461400].flatMap(calc=>[4999,5000,5001].map(year=>({calc,year})));
const budgetBytes=8*1024*1024;
const threshold=2;
const suiteSeed=20261107;
function random(seed){let state=seed>>>0;return ()=>{
  state=(state+0x6d2b79f5)>>>0;
  let t=state;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
};}
function shuffle(v,rand){const a=[...v];for(let i=a.length-1;i>0;i--){
 const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];
}return a;}
const tick=()=>process.hrtime.bigint();
const elapsed=start=>Number(tick()-start)/1e6;
async function memory(pid){
 const status=await readFile('/proc/'+pid+'/status','utf8');
 const field=(name)=>{
  const m=new RegExp('^'+name+':\\s+(\\d+) kB','m').exec(status);
  if(!m)throw Error('Missing native process memory field '+name);
  return Number(m[1]);
 };
 return {vmPeakKiB:field('VmPeak'),rssHighWaterKiB:field('VmHWM')};
}
function startService(kind,budget=budgetBytes,maxAddressBytes=0){
 const child=spawn(binary[kind],[],{cwd,env:{...process.env,
   SEER_NEXT_EXECUTION_PROFILE:kind==='reference'?'latency':
     kind==='experimental42Memo'?'experimental42':kind,
   SEER_NEXT_Y_MEMO_DIRECT:kind==='experimental42Memo'?'1':'0',
   SEER_NEXT_CACHE_BYTES:String(budget),
   SEER_NEXT_PROMOTE_AFTER:String(threshold),
   SEER_NEXT_DAY_CACHE_BYTES:'0',
   ...(maxAddressBytes?{SEER_NEXT_MAX_VIRTUAL_BYTES:String(maxAddressBytes)}:{})
 },stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',stderr='',closed=null;
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
  buffer+=chunk;
  if(buffer.length>64*1024*1024){
   closed=Error('Native response exceeded 64MiB parser buffer');
   pending?.reject(closed);pending=null;child.kill();return;
  }
  let ix;
  while((ix=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,ix);buffer=buffer.slice(ix+1);
   if(!pending){closed=Error('Unexpected native stdout');child.kill();return;}
   const p=pending;pending=null;
   try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);}
  }
 });
 child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8192);});
 child.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  closed=closed??Error('native exit code='+code+' signal='+signal+' '+stderr);
  pending?.reject(closed);pending=null;
 });
 return {
  pid:child.pid,
  async call(fields){
   if(closed)throw closed;
   if(pending)throw Error('Simultaneous calls unsupported');
   const begin=tick();let timer;
   try{
    const answer=new Promise((resolve,reject)=>pending={resolve,reject});
    timer=setTimeout(()=>{
      closed=Error('Native Y response timeout '+fields.join(' '));
      pending?.reject(closed);pending=null;child.kill();
    },180000);
    child.stdin.write(fields.join('\t')+'\n');
    return {response:await answer,ms:elapsed(begin)};
   }finally{clearTimeout(timer);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
function verifyFullYear(answer,calc,year,role){
 assert.equal(answer?.calcJdn,calc,role+' calculation JDN');
 assert.equal(answer?.year,year,role+' requested year');
 assert.ok(Number.isSafeInteger(answer?.startJdn)&&Number.isSafeInteger(answer?.endJdn));
 assert.equal(answer.endJdn-answer.startJdn+1,answer.lengthDays,role+' year inclusive length');
 assert.ok(Array.isArray(answer.days),'Missing full year days '+role);
 assert.equal(answer.days.length,answer.lengthDays,'Missing days '+role);
 assert.equal(answer.days[0]?.targetJdn,answer.startJdn,'First day '+role);
 assert.equal(answer.days.at(-1)?.targetJdn,answer.endJdn,'Last day '+role);
 if(answer.ok===false||answer.error)throw Error('Native Y request error '+role+': '+JSON.stringify(answer).slice(0,700));
}
async function collect(kind,testcase,reference){
 const child=startService(kind),spawnBegin=tick();
 const responses=[],durations=[];
 let firstToLastMs=null,fullReference=reference;
 try{
  const cmd=['Y',String(testcase.calc),String(testcase.year),'1'];
  for(let i=0;i<repetitions;i++){
   const {response,ms}=await child.call(cmd);
   verifyFullYear(response,testcase.calc,testcase.year,kind+' / repetition '+i);
   if(!fullReference)fullReference=response;
   assert.deepStrictEqual(response,fullReference,
      'Complete Y JSON mismatch '+kind+' '+testcase.calc+'/'+testcase.year+' repeat='+i);
   const digest=createHash('sha256').update(JSON.stringify(response)).digest('hex');
   responses.push(digest);
   durations.push(ms);
   if(i===0)firstToLastMs=elapsed(spawnBegin);
  }
  let memo=null;
  if(kind!=='reference'){
   const diagnostic=(await child.call(['M'])).response;
   assert.ok(diagnostic?.memo,'Research service M diagnostic missing');
   memo=diagnostic.memo;
   if(kind==='experimental42Memo' && budgetBytes>=8*1024*1024){
     assert.equal(memo.builds,1,'opt-in year export must store once on first Y');
     assert.equal(memo.hits,2,'second and third Y must be exact cache hits');
     assert.equal(memo.keys,1,'one Y context should create exactly one memo key');
     assert.ok(memo.payloadBytes>0&&memo.payloadBytes<=memo.payloadBudgetBytes);
   }
  }
  const mem=await memory(child.pid);
  return {reference:fullReference,evidence:{
    kind,calc:testcase.calc,year:testcase.year,
    yearLength:fullReference.lengthDays,
    replies:responses.length,responseHashes:responses,
    exactFullYearParity:true,perRequestMs:durations,
    sumRequestMs:durations.reduce((x,y)=>x+y,0),
    spawnToFirstReplyMs:firstToLastMs,
    memory:mem,memo
  }};
 }finally{child.close();}
}
const results=[];
const randomSequence=random(suiteSeed);
for(let trial=0;trial<trials;trial++){
 const samples=shuffle(cases,randomSequence);
 for(const testcase of samples){
  // The original service is the independent comparator. Candidate order is
  // deterministically randomized to minimize systematic clock-drift bias.
  const original=await collect('reference',testcase,null);
  const rows={reference:original.evidence};
  for(const kind of shuffle(['latency','experimental42','experimental42Memo'],randomSequence)){
   const sampled=await collect(kind,testcase,original.reference);
   rows[kind]=sampled.evidence;
  }
  assert.deepStrictEqual(rows.latency.responseHashes,rows.reference.responseHashes);
  assert.deepStrictEqual(rows.experimental42.responseHashes,rows.reference.responseHashes);
  assert.deepStrictEqual(rows.experimental42Memo.responseHashes,rows.reference.responseHashes);
  results.push({trial,...testcase,rows,completeParity:true});
 }
}
assert.equal(results.length,trials*cases.length,'Incomplete year/profile matrix');

// Interoperability: Y-built tables must serve R, tiny/no budgets must fall
// back without stale payloads, and eviction must preserve exact Y responses.
async function verifyInterop(label,budget,commands,expected){
 const native=startService('experimental42Memo',budget);
 const reference=startService('reference',0);
 const evidence={label,budgetBytes:budget,commands:commands.length};
 try {
  for(const fields of commands){
   const original=(await reference.call(fields)).response;
   const candidate=(await native.call(fields)).response;
   assert.deepStrictEqual(candidate,original,label+' command '+fields.join(' '));
  }
  const diagnostic=(await native.call(['M'])).response;
  assert.ok(diagnostic?.memo,label+' missing memo diagnostics');
  evidence.memo=diagnostic.memo;
  assert.ok(evidence.memo.payloadBytes<=budget,label+' memo budget exceeded');
  for(const [field,min] of Object.entries(expected)){
   assert.ok(evidence.memo[field]>=min,
      label+' expected '+field+'>='+min+', got '+evidence.memo[field]);
  }
  evidence.memory=await memory(native.pid);
  evidence.fullRepliesMatch=true;
  return evidence;
 }finally{native.close();reference.close();}
}
const y5000=['Y','2461290','5000','1'];
const y5001=['Y','2461290','5001','1'];
const rMid=['R','2461290','2460984','1'];
const interop=[
 await verifyInterop('zero-payload-budget',0,[y5000,y5000,rMid],{builds:0,hits:0}),
 await verifyInterop('tiny-payload-budget',1024,[y5000,y5000],{builds:0,hits:0}),
 await verifyInterop('Y-then-R-cross-route',budgetBytes,[y5000,rMid,y5000],{builds:1,hits:2}),
 await verifyInterop('one-year-LRU-eviction',180000,[y5000,y5001,y5000],{builds:3,evictions:2})
];
// Resource observation with a *real* address-space cap, distinct from memo
// payload accounting. Calendar parity failures remain hard test failures.
const capped=startService('experimental42Memo',budgetBytes,512*1024*1024);
const cappedReference=startService('reference',0);
let cappedEvidence;
try{
 const f=['Y','2461290','4999','1'];
 const original=(await cappedReference.call(f)).response;
 const fresh=(await capped.call(f)).response;
 assert.deepStrictEqual(fresh,original,'512MiB first full-year memo reply');
 const warm=(await capped.call(f)).response;
 assert.deepStrictEqual(warm,original,'512MiB warm full-year memo reply');
 const m=(await capped.call(['M'])).response.memo;
 assert.equal(m.builds,1);assert.equal(m.hits,1);
 const mem=await memory(capped.pid);
 assert.ok(mem.vmPeakKiB<=512*1024,'512MiB virtual address cap overrun');
 cappedEvidence={limitBytes:512*1024*1024,fullParity:true,memo:m,memory:mem};
}finally{capped.close();cappedReference.close();}

const profiles=['reference','latency','experimental42','experimental42Memo'];
const groups=profiles.map(profile=>{
 const v=results.map(x=>x.rows[profile]);
 const total=k=>v.reduce((s,x)=>s+x.perRequestMs[k],0);
 return {profile,contexts:v.length,
  coldTotalMs:total(0),firstWarmTotalMs:total(1),secondWarmTotalMs:total(2),
  allThreeTotalMs:total(0)+total(1)+total(2),
  largestVmPeakKiB:Math.max(...v.map(x=>x.memory.vmPeakKiB)),
  largestRssHwmKiB:Math.max(...v.map(x=>x.memory.rssHighWaterKiB)),
  memoBuilds:v.map(x=>x.memo?.builds??null),
  memoHits:v.map(x=>x.memo?.hits??null)};
});
const final={
 schema:'seer-next-y-export-direct-memo-v1',
 sourceBaseline:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
 cpu:cpus()[0]?.model,platform:platform(),arch:arch(),node:process.version,
 trials,calculationDays:[2461290,2461400],years:[4999,5000,5001],
 repetitions,suiteSeed,candidateOrder:'seeded pseudorandom shuffle, baseline first',
 candidateCache:{fullYearPayloadBytes:budgetBytes,promoteAfter:threshold,dayPayloadBytes:0},
 completeFullJsonParity:true,groups,results,interop,cappedEvidence,
 qualifications:[
  'Fresh native process for each reference/profile/year combination, but three Y calls within it.',
  'The full reply is checked by deepStrictEqual, including every day record; hashes are only provenance.',
  'Per-request wall excludes process spawn; spawn-to-first measurement is recorded separately.',
  'This measures repeated Y full-year exports, not R cache lookup, full-domain correctness, physical RAM caps or Windows.',
  'An opt-in year-record table is created once on the initial Y, then hit twice; default Y path still bypasses it.',
  'The existing R-to-year promotion threshold is unchanged; zero/tiny payload budgets retain correct uncached answers.',
  'Memo counters are measured, not inferred; RNS internals and source main unchanged.',
  'One hosted CPU and two trials: numbers are exploratory and not universal speed guarantees.',
  'Selected capped year fits under 512MiB in this Linux runner; no all-year minimum is proven.'
 ]};
const out=JSON.stringify(final,null,2)+'\n';
if(args.has('output'))await writeFile(path.resolve(args.get('output')),out);
else process.stdout.write(out);
