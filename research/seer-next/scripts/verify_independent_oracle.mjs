// Independent saved-sum reference comparison for Seer Next; NOT a performance test.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const data=path.join(root,'prototype','data');
const oracle=path.join(root,'research','seer-next','build','independent_canonical_oracle');
const hybrid=path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service');
const baseline=path.join(root,'prototype','build','seer_engine_service');
const posGates=path.join(data,'gates_100k_u16.bin');
const negGates=path.join(data,'gates_negative_100k_u16.bin');
const args=new Map(process.argv.slice(2).map(x=>{
  const m=/^--([a-z-]+)=(.*)$/.exec(x);
  if(!m)throw Error('invalid arg '+x);
  return [m[1],m[2]];
}));
function open(bin,label){
 const p=spawn(bin,[],{cwd:data,env:{...process.env,SEER_NEXT_CACHE_BYTES:'8388608',
   SEER_NEXT_DAY_CACHE_BYTES:'65536',SEER_NEXT_PROMOTE_AFTER:'2'},stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',failed=null,stderr='';
 p.stdout.setEncoding('utf8');
 p.stdout.on('data',c=>{
   buffer+=c;
   if(buffer.length>32*1024*1024){failed=Error(label+' buffer overflow');pending?.reject(failed);pending=null;p.kill();return;}
   while(buffer.includes('\n')){
     const i=buffer.indexOf('\n'),line=buffer.slice(0,i);
     buffer=buffer.slice(i+1);
     if(!pending){failed=Error(label+' unsolicited stdout');p.kill();return;}
     const q=pending;pending=null;
     try{q.resolve(JSON.parse(line));}catch(e){q.reject(e);}
   }
 });
 p.stderr.setEncoding('utf8');p.stderr.on('data',s=>{stderr=(stderr+s).slice(-8192);});
 p.on('error',e=>{failed=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
   failed=failed??Error(label+' closed '+code+'/'+signal+': '+stderr);
   pending?.reject(failed);pending=null;
 });
 return {
   async call(parts){
     if(failed)throw failed;
     if(pending)throw Error('parallel requests unsupported');
     let timer;
     try{
       const ready=new Promise((resolve,reject)=>{pending={resolve,reject};});
       timer=setTimeout(()=>{failed=Error(label+' timeout: '+parts.join(' '));pending?.reject(failed);pending=null;p.kill();},120000);
       p.stdin.write(parts.join('\t')+'\n');
       return await ready;
     } finally{clearTimeout(timer);}
   },
   close(){p.stdin.end();p.kill();}
 };
}
function reference(c,t){
 const stdout=execFileSync(oracle,[posGates,String(c),String(t),'--negative-gates='+negGates],
   {cwd:data,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
 const dict=Object.fromEntries([...stdout.matchAll(/([A-Za-z_]+)=(-?\d+(?::-?\d+)?)/g)]
   .map(m=>[m[1],m[2]]));
 const int=k=>{
   if(!(k in dict))throw Error('Oracle missing '+k+': '+stdout);
   const v=Number(dict[k]);
   if(!Number.isSafeInteger(v))throw Error('Oracle integer conversion out of range for '+k);
   return v;
 };
 return {
   year:int('year'),cutletIndex:int('cutlet_idx'),dayInCutlet:int('day_cutlet'),
   monthIndex:int('month_idx'),dayInMonth:int('day_month'),
   cutletCount:int('cutlets'),monthCount:int('months')
 };
}
const foundation=-13334246;
const cases=[
 [2461290,2458961], [2461290,2460984], [2461290,2461290],
 [2461290,2463007], [2461290,2458950], [2461290,2463015],
 [2461291,2460984], [2461400,2461400], [foundation,foundation],
 [foundation,foundation+1], [foundation+1,foundation],
];
const b=open(baseline,'unchanged-Seer');
const h=open(hybrid,'hybrid-Seer');
const rows=[];
try {
 const digest=createHash('sha256');
 for(const [c,t] of cases){
   const ref=reference(c,t);
   const input=['R',String(c),String(t),'1'];
   const left=await b.call(input);
   const first=await h.call(input);
   const second=await h.call(input);
   assert.deepStrictEqual(first,left,'Hybrid/baseline first-call JSON mismatch '+c+'/'+t);
   assert.deepStrictEqual(second,left,'Hybrid/baseline repeat-call JSON mismatch '+c+'/'+t);
   assert.equal(left.records?.length,1);
   for(const [field,expected] of Object.entries(ref))
     assert.equal(left.records[0][field],expected,'Independent oracle '+c+'/'+t+' field '+field);
   digest.update(JSON.stringify({input,result:left})+'\n');
   rows.push({calculationJdn:c,targetJdn:t,oracle:ref,result:left.records[0]});
 }
 const stats=await h.call(['M']);
 assert.equal(stats?.schema,1);
 assert.ok(stats.memo?.dayHits>=cases.length,'Hybrid did not reuse every repeated single day');
 assert.ok(stats.memo?.dayPayloadBytes<=stats.memo?.dayBudgetBytes);
 const result={
   schema:'seer-next-independent-oracle-v1',
   source:'prototype/tools/canonical_vector_oracle.cpp + canonical_saved_sum_reference.hpp',
   cases:rows,
   count:cases.length,
   fingerprint:digest.digest('hex'),
   verdict:'ALL_FULL_JSON_AND_INDEPENDENT_ORACLE_FIELDS_MATCH',
   hybridMemo:stats.memo,
   caveat:'Finite selected fixtures; no proof of global correctness.'
 };
 const out=JSON.stringify(result,null,2)+'\n';
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),out,'utf8');
 else process.stdout.write(out);
} finally {b.close();h.close();}
