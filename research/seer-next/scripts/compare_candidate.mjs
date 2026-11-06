import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { cpus, platform, arch, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const src = path.join(root, 'prototype', 'build', 'seer_engine_service');
const candidate = path.join(root, 'research', 'seer-next', 'build', 'seer_next_engine_service');
const cwd = path.join(root, 'prototype', 'data');
const args = new Map(process.argv.slice(2).map(a => {
  const m = /^--([a-z-]+)=(.*)$/.exec(a);
  if (!m) throw Error('Invalid argument: ' + a);
  return [m[1], m[2]];
}));
const n = Number(args.get('repetitions') ?? '32');
if (!Number.isSafeInteger(n) || n < 20 || n > 1000) throw Error('repetitions must be 20..1000');
const temp = await mkdtemp(path.join(tmpdir(), 'seer-next-ab-'));
const sha256 = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
const measure = arr => {
  const sorted = [...arr].sort((a,b)=>a-b);
  const percentile = p => sorted[Math.max(0, Math.ceil(p*sorted.length)-1)];
  return {count:arr.length,p50:percentile(.5),p95:arr.length>=20?percentile(.95):null,
    p99:arr.length>=100?percentile(.99):null,min:sorted[0],max:sorted.at(-1),
    sum:arr.reduce((a,b)=>a+b,0),samples:arr};
};
const fixture = {
  2458961: {year:5000,cutletIndex:5,dayInCutlet:1,monthIndex:5,dayInMonth:1,monthCount:37},
  2460984: {year:5000,cutletIndex:14,dayInCutlet:31,monthIndex:18,dayInMonth:68,monthCount:37},
  2461290: {year:5000,cutletIndex:14,dayInCutlet:337,monthIndex:39,dayInMonth:69,monthCount:37},
  2463007: {year:5000,cutletIndex:13,dayInCutlet:524,monthIndex:44,dayInMonth:111,monthCount:37},
};
function openService(binary, env, label) {
  const child = spawn(binary, [], {cwd,env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
  let pending = null, buffer = '', errorText='', ended = null;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 32*1024*1024) {
      ended = Error(label + ': oversized line');
      pending?.reject(ended); pending=null; child.kill(); return;
    }
    for (;;) {
      const idx = buffer.indexOf('\n');
      if (idx<0) break;
      const line=buffer.slice(0,idx); buffer=buffer.slice(idx+1);
      if (!pending) {ended=Error(label+': unsolicited stdout');child.kill();return;}
      const current=pending;pending=null;current.resolve(line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {errorText=(errorText+chunk).slice(-4096);});
  child.on('error',e=>{ended=e;pending?.reject(e);pending=null;});
  child.on('close',(code,signal)=>{
    ended=ended??Error(label+': native exit '+code+'/'+signal+': '+errorText);
    pending?.reject(ended); pending=null;
  });
  async function request(fields) {
    if(ended)throw ended;
    if(pending)throw Error(label+': concurrent native calls unsupported');
    const started=process.hrtime.bigint();
    let timer;
    try {
      const result = new Promise((resolve,reject)=>{pending={resolve,reject};});
      timer=setTimeout(()=>{const e=Error(label+': timed out');ended=e;pending?.reject(e);pending=null;child.kill();},120000);
      child.stdin.write(fields.join('\t')+'\n','utf8');
      const line=await result;
      const parsed=JSON.parse(line);
      if (parsed?.error || parsed?.ok===false) throw Error(label+': '+line);
      return {parsed,ms:Number(process.hrtime.bigint()-started)/1e6};
    } finally {clearTimeout(timer);}
  }
  return {request,close(){child.stdin.end();child.kill();}};
}
async function countWeaves(file) {
  try {
    const s = await readFile(file,'utf8');
    return s.split('\n').map(x=>x.trim()).filter(x=>x==='weave'||x==='year_batch_weave').length;
  } catch(e) {if(e?.code==='ENOENT')return 0;throw e;}
}
async function scenario(binary,label,opts={}) {
  const trace=path.join(temp,label+'.log');
  const svc=openService(binary,{SEER_TEST_WEAVE_COUNTER_FILE:trace,SEER_NEXT_PROMOTE_AFTER:'2',SEER_NEXT_CACHE_BYTES:opts.disabled?'0':'8388608'},label);
  const totals=[],warm=[],actual=[],hashes=[],outputs=[];
  try {
    const repeats=Array(n).fill(2460984);
    for (const t of repeats) {
      const {parsed,ms}=await svc.request(['R','2461290',String(t),'1']);
      assert.equal(parsed.targetCount,1);
      assert.equal(parsed.records?.[0]?.targetJdn,t);
      for(const [name,value] of Object.entries(fixture[t]))
        assert.equal(parsed.records[0][name],value,label+' independent vector '+name);
      actual.push(ms);
      outputs.push(parsed);
      hashes.push(createHash('sha256').update(JSON.stringify(parsed.records[0])).digest('hex'));
    }
    const repeatedWeaves=await countWeaves(trace);
    const repeatsResult={latency:measure(actual),warmPostTwo:measure(actual.slice(2)),weaves:repeatedWeaves};
    // Fixed-c, same-year sparse and boundary requests exercise exact year-table indexing.
    const samples=[2463007,2458961,2461290,2460984,2463007,2458961];
    for (const t of samples) {
      const {parsed,ms}=await svc.request(['R','2461290',String(t),'1']);
      assert.equal(parsed.targetCount,1);
      assert.equal(parsed.records?.[0]?.targetJdn,t);
      for(const [name,value] of Object.entries(fixture[t]))
        assert.equal(parsed.records[0][name],value,label+' independent boundary '+name);
      totals.push({target:t,ms,parsed});
    }
    const tailWeaves=await countWeaves(trace);
    return {label,disabled:!!opts.disabled,repeated:repeatsResult,byTarget:totals,
      repeatedRecordHashes:hashes,fullResponses:outputs,allWeaveEvents:tailWeaves};
  } finally {svc.close();}
}
try {
  const baseline=await scenario(src,'baseline',{disabled:true});
  const optimized=await scenario(candidate,'candidate');
  const disabled=await scenario(candidate,'candidate-disabled',{disabled:true});
  assert.deepEqual(optimized.fullResponses,baseline.fullResponses,'cached numeric responses differ from baseline');
  assert.deepEqual(disabled.fullResponses,baseline.fullResponses,'zero-budget responses differ from baseline');
  assert.deepEqual(optimized.byTarget.map(x=>x.parsed),baseline.byTarget.map(x=>x.parsed),
    'cached year boundary/sparse responses differ from baseline');
  assert.equal(baseline.repeated.weaves,n,'baseline unexpectedly reused non-edge weaving');
  assert.equal(optimized.repeated.weaves,2,'candidate did not materialize exactly on second query');
  assert.equal(optimized.allWeaveEvents,2,'candidate unexpectedly replayed weave after materialization');
  assert.equal(disabled.repeated.weaves,n,'zero-cache candidate did not behave as baseline');
  const result={
    schema:'seer-next-full-year-memo-ab-v1',
    comparedAt:new Date().toISOString(),
    startingCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
    baselineBinarySHA256:await sha256(src),candidateBinarySHA256:await sha256(candidate),
    platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,node:process.version,
    n,cachePolicy:{promoteAfter:2,payloadLimitBytes:8388608,nativeCacheKey:'(c,year)'},
    baseline:{repeated:baseline.repeated,allWeaveEvents:baseline.allWeaveEvents,
      byTarget:baseline.byTarget.map(({target,ms})=>({target,ms}))},
    candidate:{repeated:optimized.repeated,allWeaveEvents:optimized.allWeaveEvents,
      byTarget:optimized.byTarget.map(({target,ms})=>({target,ms}))},
    zeroBudgetControl:{repeated:disabled.repeated,allWeaveEvents:disabled.allWeaveEvents},
    numericalEquivalence:'full JSON response and independent saved-sum vectors PASS for tested coordinates',
    warmP50Ratio:baseline.repeated.warmPostTwo.p50/optimized.repeated.warmPostTwo.p50,
    totalRepeatedRatio:baseline.repeated.latency.sum/optimized.repeated.latency.sum,
    caveats:['Fixed-c/year sample, same process lifetimes per variant, ordered A/B only.',
      'No causal proof of production-wide speedup, no RSS/CPU/energy measurement.','No full domain differential.']
  };
  const json=JSON.stringify(result,null,2)+'\n';
  if(args.has('output'))await writeFile(path.resolve(args.get('output')),json,'utf8');
  else process.stdout.write(json);
} finally {await rm(temp,{recursive:true,force:true});}
