// Independent cold-start paired measurement of unchanged Seer and stage-instrumented Seer Next.
// Exact response comparison for each one-shot process. Stage timing is diagnostic, not proof of speedup.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {cpus,tmpdir,platform,arch} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(platform()!=='linux')throw Error('Linux-only native stage probe');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const binaries={
 base:path.join(root,'prototype','build','seer_engine_service'),
 probe:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const opts=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);if(!m)throw Error('bad arg '+x);return [m[1],m[2]];
}));
const trials=Number(opts.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>6)throw Error('trials 1..6');
const temp=await mkdtemp(path.join(tmpdir(),'seer-next-cold-stages-'));
const cases=[
 {id:'first-year-day',c:2461290,t:2458961},
 {id:'second-year-day',c:2461290,t:2458962},
 {id:'interior',c:2461290,t:2460984},
 {id:'calc-equals-target',c:2461290,t:2461290},
 {id:'late-year',c:2461290,t:2463006},
 {id:'last-year-day',c:2461290,t:2463007},
 {id:'shifted-c',c:2461291,t:2460984},
 {id:'foundation',c:-13334246,t:-13334246},
 {id:'next-year',c:2461290,t:2464000}
];
async function once(binary,env,fields){
 const t0=process.hrtime.bigint();
 const p=spawn(binary,[],{cwd,env:{...process.env,
   SEER_NEXT_DAY_CACHE_BYTES:'0',SEER_NEXT_CACHE_BYTES:'0',...env},
   stdio:['pipe','pipe','pipe']});
 let buf='',stderr='',pending=null,closed=null;
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 p.stderr.on('data',x=>stderr=(stderr+x).slice(-8192));
 p.stdout.on('data',chunk=>{
   buf+=chunk;
   if(buf.length>32*1024*1024){const e=Error('oversized native reply');closed=e;pending?.reject(e);pending=null;p.kill();return;}
   const i=buf.indexOf('\n');
   if(i>=0&&pending){
     const item=pending;pending=null;
     try{item.resolve(JSON.parse(buf.slice(0,i)));}catch(e){item.reject(e);}
   }
 });
 p.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
   closed=closed??Error('native closed '+code+'/'+signal+' '+stderr);
   pending?.reject(closed);pending=null;
 });
 let timer;
 try{
   const answerPromise=new Promise((resolve,reject)=>{pending={resolve,reject};});
   timer=setTimeout(()=>{
     closed=Error('native cold request timeout '+fields.join(' '));
     pending?.reject(closed);pending=null;p.kill();
   },120000);
   p.stdin.write(fields.join('\t')+'\n');
   const result=await answerPromise;
   const totalMs=Number(process.hrtime.bigint()-t0)/1e6;
   return {result,totalMs};
 } finally{clearTimeout(timer);p.stdin.end();p.kill();}
}
function parseStages(text){
 return text.trim().split(/\r?\n/).filter(Boolean).map(line=>{
   const v=line.split('\t');
   if(v.length!==9)throw Error('invalid stage row '+line);
   const nums=v.slice(1).map(Number);
   if(nums.some(x=>!Number.isFinite(x)||x<0 && v[0]==='segment' && v[4]==='0' && false))
     throw Error('invalid numeric stage data');
   return {operation:v[0],calcJdn:nums[0],firstJdn:nums[1],lastJdn:nums[2],
     edge:!!nums[3],sauceUs:nums[4],structureUs:nums[5],weaveUs:nums[6],recordUs:nums[7]};
 });
}
const out=[];
try{
 for(let trial=0;trial<trials;trial++){
   for(const item of cases){
     const env={SEER_NEXT_COLD_STAGE_FILE:path.join(temp,'stage-'+trial+'-'+item.id+'.tsv')};
     const cmd=['R',String(item.c),String(item.t),'1'];
     const order=(trial+cases.indexOf(item))%2===0?['base','probe']:['probe','base'];
     const r={};
     for(const which of order)r[which]=await once(binaries[which],which==='probe'?env:{},cmd);
     assert.deepStrictEqual(r.probe.result,r.base.result,
       'one-shot response disagreement for '+item.id+' trial '+trial);
     if(r.base.result?.ok===false)throw Error('unexpected invalid query '+item.id);
     const traces=parseStages(await readFile(env.SEER_NEXT_COLD_STAGE_FILE,'utf8'));
     assert.equal(traces.length,1,'exactly one segment expected per query');
     assert.equal(traces[0].calcJdn,item.c);
     assert.equal(traces[0].firstJdn,item.t);
     assert.equal(traces[0].lastJdn,item.t);
     if(item.id==='first-year-day'||item.id==='last-year-day')
       assert.equal(traces[0].edge,true,'year edge must avoid weave');
     else if(item.id==='interior') assert.equal(traces[0].edge,false);
     out.push({trial,id:item.id,calc:item.c,target:item.t,baselineWallMs:r.base.totalMs,
       instrumentedWallMs:r.probe.totalMs,stages:traces,
       fullJsonParity:true});
   }
 }
 const result={schema:'seer-next-cold-stages-v1',
   baselineSource:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
   platform:platform(),arch:arch(),cpu:cpus()[0]?.model,trials,
   resultCount:out.length,cases:out,
   interpretation:'Each cold query has a fresh process; only research C++ core instruments sauce, structure, weave and record emission.',
   limits:['Stage timings are in-process and exclude process spawn/anchor/pipe overhead.',
      'Instrumentation adds clock/read/write operations and is not a proof of speedup.',
      'Small finite exact response parity sample; no global canonical guarantee.']};
 const data=JSON.stringify(result,null,2)+'\n';
 if(opts.has('output'))await writeFile(path.resolve(opts.get('output')),data,'utf8');
 else process.stdout.write(data);
}finally{await rm(temp,{recursive:true,force:true});}
