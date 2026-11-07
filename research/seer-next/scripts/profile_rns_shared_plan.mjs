// RNS per-eight-prime-pack phase decomposition and shared-plan A/B.
// Single executable, two reversible modes. Correctness is full JSON parity to
// unchanged Seer; output is raw sampled data, not an accepted performance change.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus,arch,platform,tmpdir} from 'node:os';
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bins={reference:path.join(root,'prototype','build','seer_engine_service'),
  research:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')};
if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const opt=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);if(!m)throw Error('invalid argument: '+x);
 return [m[1],m[2]];
}));
const trials=Number(opt.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>8)throw Error('trials must be 1..8');
const work=await mkdtemp(path.join(tmpdir(),'seer-next-shared-plan-'));
const contexts=[2461290,2461291,2461292,2461294,2461295,2461299,2461310,2461400];
const cases=[
 {id:'interior',t:2460984},
 {id:'other-interior',t:2461290},
 {id:'late',t:2463006},
 {id:'foundation',t:-13334246,c:-13334246},
 {id:'foundation-next',t:-13334245,c:-13334245}
];
const requests=[
 ...contexts.flatMap(c=>cases.slice(0,3).map(t=>({c,t:t.t,id:t.id}))),
 ...cases.slice(3).map(x=>({...x}))
];
function open(bin,tag,extra){
 const p=spawn(bin,[],{cwd,env:{...process.env,SEER_NEXT_CACHE_BYTES:'0',
 SEER_NEXT_DAY_CACHE_BYTES:'0',...extra},stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',failed=null,stderr='';
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 p.stdout.on('data',chunk=>{
  buffer+=chunk;
  if(buffer.length>32*1024*1024){failed=Error(tag+': oversized reply');pending?.reject(failed);pending=null;p.kill();return;}
  let pos;while((pos=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);
   if(!pending){failed=Error(tag+': unsolicited output');p.kill();return;}
   const q=pending;pending=null;
   try{q.resolve(JSON.parse(line));}catch(e){q.reject(e);}
  }
 });
 p.stderr.setEncoding('utf8');p.stderr.on('data',part=>stderr=(stderr+part).slice(-4096));
 p.on('error',e=>{failed=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
  failed=failed??Error(tag+': native closed '+code+'/'+signal+': '+stderr);
  pending?.reject(failed);pending=null;
 });
 return {
  async call(fields){
   if(failed)throw failed;
   if(pending)throw Error(tag+': concurrent request');
   let timer;const begin=process.hrtime.bigint();
   try{
    const reply=new Promise((resolve,reject)=>pending={resolve,reject});
    timer=setTimeout(()=>{
     failed=Error(tag+': timeout '+fields.join(' '));pending?.reject(failed);pending=null;p.kill();
    },120000);
    p.stdin.write(fields.join('\t')+'\n');
    const answer=await reply;
    return {answer,ms:Number(process.hrtime.bigint()-begin)/1e6};
   }finally{clearTimeout(timer);}
  },
  close(){p.stdin.end();p.kill();}
 };
}
function parse(line){
 const row=line.trim().split('\t').map(Number);
 if(row.length!==12||row.some(x=>!Number.isFinite(x)||x<0))
  throw Error('RNS pack-stage record shape invalid: '+line);
 const [yearLength,rnsPrimes,primePacks,shared,repeatLenCount,planGroupCount,
    inversesPackMs,pascalPackMs,dpPackMs,maxInversesPackMs,maxPascalPackMs,maxDpPackMs]=row;
 return {yearLength,rnsPrimes,primePacks,shared,repeatLenCount,planGroupCount,
   inversesPackMs,pascalPackMs,dpPackMs,maxInversesPackMs,maxPascalPackMs,maxDpPackMs};
}
const results=[];
try{
 for(let trial=0;trial<trials;trial++){
  const detailOff=path.join(work,'off-'+trial+'.tsv');
  const detailOn=path.join(work,'on-'+trial+'.tsv');
  const variants={
   reference:open(bins.reference,'reference',{}),
   off:open(bins.research,'off',{SEER_NEXT_RNS_SHARED_PLAN:'0',SEER_NEXT_RNS_PACK_DETAIL_FILE:detailOff}),
   on:open(bins.research,'on',{SEER_NEXT_RNS_SHARED_PLAN:'1',SEER_NEXT_RNS_PACK_DETAIL_FILE:detailOn})
  };
  try{
   // Reorder cases to avoid always measuring one context first.
   const sequence=requests.map((_,i)=>requests[(i+(trial*7))%requests.length]);
   for(const [index,{c,t,id}] of sequence.entries()){
    const cmd=['R',String(c),String(t),'1'];
    const names=(index+trial)%2===0?['off','on']:['on','off'];
    const r={};
    r.reference=await variants.reference.call(cmd);
    for(const name of names)r[name]=await variants[name].call(cmd);
    assert.deepStrictEqual(r.off.answer,r.reference.answer,
      'reference mismatch with original pack plan '+c+'/'+t);
    assert.deepStrictEqual(r.on.answer,r.reference.answer,
      'reference mismatch with shared pack plan '+c+'/'+t);
    results.push({trial,index,c,t,id,fullJsonParity:true,
      baselineMs:r.reference.ms,offMs:r.off.ms,onMs:r.on.ms});
   }
   const offLines=(await readFile(detailOff,'utf8')).trim().split(/\r?\n/).filter(Boolean);
   const onLines=(await readFile(detailOn,'utf8')).trim().split(/\r?\n/).filter(Boolean);
   assert.equal(offLines.length,sequence.length);
   assert.equal(onLines.length,sequence.length);
   for(let index=0;index<sequence.length;index++){
    const row=results.find(x=>x.trial===trial&&x.index===index);
    row.packOff=parse(offLines[index]);
    row.packOn=parse(onLines[index]);
    assert.equal(row.packOff.shared,0);
    assert.equal(row.packOn.shared,1);
    assert.equal(row.packOff.rnsPrimes,row.packOn.rnsPrimes);
    assert.equal(row.packOff.primePacks,row.packOn.primePacks);
    assert.equal(row.packOff.yearLength,row.packOn.yearLength);
   }
  }finally{for(const variant of Object.values(variants))variant.close();}
 }
 const sum=f=>results.reduce((a,x)=>a+f(x),0);
 const final={schema:'seer-next-rns-shared-plan-v1',utc:new Date().toISOString(),
  pinnedBaseSha:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
  cpu:cpus()[0]?.model,trials,queriesPerTrial:requests.length,
  fullJsonParity:'ALL_TESTED_REQUESTS_MATCH_NATIVE_BASELINE',
  totalsMs:{baseline:sum(x=>x.baselineMs),planOff:sum(x=>x.offMs),planOn:sum(x=>x.onMs)},
  ratio:sum(x=>x.offMs)/sum(x=>x.onMs),results,
  limitations:['Two trials on GitHub virtualized Linux CPU; host frequency and scheduling noise.',
    'Shared plan is recomputed per RnsEngine (per cold request) but only once, not per prime pack.',
    'Metrics are pack worker-time sums, not elapsed wall time; concurrent workers overlap.',
    'No global speedup or full-domain semantic proof; no storage or energy comparison.']};
 const json=JSON.stringify(final,null,2)+'\n';
 if(opt.has('output'))await writeFile(path.resolve(opt.get('output')),json,'utf8');
 else process.stdout.write(json);
}finally{await rm(work,{recursive:true,force:true});}
