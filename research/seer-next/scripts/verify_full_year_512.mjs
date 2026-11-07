// Full-year Y under real Linux RLIMIT_AS 512MiB: complete native oracle parity.
// The memory-capped request is observational: failures are retained as failures,
// not silently promoted to success, and do not mask an uncapped mismatch.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cpus,platform,arch} from 'node:os';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const baseline=path.join(root,'prototype','build','seer_engine_service');
const hybrid=path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service');
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&!args[0].startsWith('--output=')))
 throw Error('Usage: node verify_full_year_512.mjs [--output=path]');
const maxAddressBytes=512*1024*1024;
const cases=[2461290,2461400].flatMap(calc=>[4999,5000,5001].map(year=>({calc,year})));

function launch(binary,profile,limit) {
 const child=spawn(binary,[],{cwd,env:{...process.env,
  SEER_NEXT_DAY_CACHE_BYTES:'0',SEER_NEXT_CACHE_BYTES:'0',
  ...(profile?{SEER_NEXT_EXECUTION_PROFILE:profile}:{}),
  ...(limit?{SEER_NEXT_MAX_VIRTUAL_BYTES:String(limit)}:{})
 },stdio:['pipe','pipe','pipe']});
 let buffer='',stderr='',pending=null,failed=null;
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stderr.on('data',s=>{stderr=(stderr+s).slice(-8192);});
 child.stdout.on('data',s=>{
  buffer+=s;
  if(buffer.length>64*1024*1024){
   failed=Error('oversized JSON response');pending?.reject(failed);pending=null;child.kill();return;
  }
  let cut;
  while((cut=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,cut);buffer=buffer.slice(cut+1);
   if(!pending){failed=Error('unsolicited native stdout');child.kill();return;}
   const next=pending;pending=null;
   try{next.resolve(JSON.parse(line));}catch(e){next.reject(e);}
  }
 });
 child.on('error',e=>{failed=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  failed=failed??Error('native exit '+code+'/'+signal+': '+stderr);
  pending?.reject(failed);pending=null;
 });
 return {
  pid:child.pid,
  async call(fields) {
   if(failed)throw failed;
   if(pending)throw Error('concurrent native call');
   let timer;
   try{
    const p=new Promise((resolve,reject)=>pending={resolve,reject});
    timer=setTimeout(()=>{
      failed=Error('native request exceeded 120000ms');
      pending?.reject(failed);pending=null;child.kill();
    },120000);
    child.stdin.write(fields.join('\t')+'\n');
    return await p;
   }finally{clearTimeout(timer);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
async function snapshot(pid) {
 const [status,limits]=await Promise.all([
  readFile('/proc/'+pid+'/status','utf8'),
  readFile('/proc/'+pid+'/limits','utf8')
 ]);
 const find=(regexp,name)=>{
  const match=regexp.exec(name==='limits'?limits:status);
  if(!match)throw Error('missing Linux proc field '+name+' '+regexp);
  return Number(match[1]);
 };
 return {
  vmPeakKiB:find(/^VmPeak:\s+(\d+) kB/m,'status'),
  vmSizeKiB:find(/^VmSize:\s+(\d+) kB/m,'status'),
  rssHighWaterKiB:find(/^VmHWM:\s+(\d+) kB/m,'status'),
  effectiveLimitBytes:find(/^Max address space\s+(\d+)\s+/m,'limits')
 };
}
function verifyFullYear(answer,c,y,role) {
 assert.equal(answer?.calcJdn,c,role+' calculation day');
 assert.equal(answer?.year,y,role+' year identity');
 assert.ok(Number.isSafeInteger(answer.startJdn)&&Number.isSafeInteger(answer.endJdn));
 assert.equal(answer.endJdn-answer.startJdn+1,answer.lengthDays,
   role+' inclusive year boundaries');
 assert.ok(Array.isArray(answer.days),role+' missing days array');
 assert.equal(answer.days.length,answer.lengthDays,role+' incomplete full-year export');
 assert.equal(answer.days[0]?.targetJdn,answer.startJdn,role+' first day');
 assert.equal(answer.days.at(-1)?.targetJdn,answer.endJdn,role+' final day');
 if(answer.ok===false||answer.error)throw Error(role+' returned error '+JSON.stringify(answer).slice(0,600));
}
const records=[];
for(const {calc,year} of cases) {
 const b=launch(baseline,null,null);
 const u=launch(hybrid,'experimental42',null);
 const capped=launch(hybrid,'experimental42',maxAddressBytes);
 const record={calc,year,profile:'experimental42',requestedLimitBytes:maxAddressBytes,
   uncappedParity:false,underCapStatus:'NOT_ATTEMPTED'};
 try {
  const fields=['Y',String(calc),String(year),'1'];
  const original=await b.call(fields);
  verifyFullYear(original,calc,year,'unchanged Seer');
  const uncapped=await u.call(fields);
  verifyFullYear(uncapped,calc,year,'unlimited experimental42');
  assert.deepStrictEqual(uncapped,original,'uncapped full JSON year parity '+calc+'/'+year);
  record.uncappedParity=true;
  record.lengthDays=original.lengthDays;
  record.responseSha256=createHash('sha256').update(JSON.stringify(original)).digest('hex');
  try {
   const ready=await capped.call(['M']);
   assert.ok(ready?.memo,'capped research service not ready');
   record.before=await snapshot(capped.pid);
   assert.ok(record.before.effectiveLimitBytes<=maxAddressBytes,
     'kernel failed to install requested RLIMIT_AS');
   const cappedAnswer=await capped.call(fields);
   if(cappedAnswer?.ok===false||cappedAnswer?.error){
    record.underCapStatus='NATIVE_REPORTED_ERROR';
    record.underCapError=JSON.stringify(cappedAnswer).slice(0,2000);
   }else{
    verifyFullYear(cappedAnswer,calc,year,'512MiB experimental42');
    assert.deepStrictEqual(cappedAnswer,original,
      'full JSON year mismatch under 512MiB '+calc+'/'+year);
    record.underCapStatus='SUCCESS_FULL_PARITY';
   }
   record.after=await snapshot(capped.pid);
   assert.ok(record.after.effectiveLimitBytes<=maxAddressBytes);
   assert.ok(record.after.vmPeakKiB*1024<=maxAddressBytes);
  }catch(e){
   if(String(e).includes('full JSON year mismatch'))throw e;
   if(String(e).includes('kernel failed')||
      String(e).includes('exceeded requested')||
      String(e).includes('missing Linux proc field'))throw e;
   record.underCapStatus='QUERY_OR_PROCESS_FAILED_UNDER_CAP';
   record.underCapError=String(e).slice(0,2000);
   // A failure under a strict address limit is a real negative observation.
  }
 } finally {b.close();u.close();capped.close();}
 records.push(record);
}
assert.equal(records.length,6);
assert.ok(records.every(r=>r.uncappedParity),'uncapped full-year parity missing');
const result={
 schema:'seer-next-full-year-512-parity-v1',cpu:cpus()[0]?.model,
 sourceBaseline:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
 years:[4999,5000,5001],calculationDays:[2461290,2461400],
 fullYearComparisons:records.length,
 underCapSuccesses:records.filter(r=>r.underCapStatus==='SUCCESS_FULL_PARITY').length,
 allUncappedFullRepliesEqual:true,records,
 notes:['The 512MiB cap bounds virtual address space, not RSS.',
  'Full-year capped outcomes are observational; failures are retained as failures.',
  'Every successful capped output has byte-for-byte equivalent parsed full JSON content.',
  'No speed/throughput conclusion follows from this correctness and resource experiment.',
  'Main, production Seer service and default hybrid profiles are unchanged.']
};
const out=JSON.stringify(result,null,2)+'\n';
if(args.length)await writeFile(path.resolve(args[0].slice('--output='.length)),out);
else process.stdout.write(out);
