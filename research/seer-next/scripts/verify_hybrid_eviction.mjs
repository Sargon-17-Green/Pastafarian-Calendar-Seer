// Seer Next: deterministic bounded-cache eviction and full JSON parity.
// This file tests native experiments only; it does not change production interfaces.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bins={
  baseline:path.join(root,'prototype','build','seer_engine_service'),
  hybrid:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service')
};
const outputArg=process.argv.slice(2);
if(outputArg.length>1 || (outputArg.length===1 && !outputArg[0].startsWith('--output=')))
  throw Error('Usage: node verify_hybrid_eviction.mjs [--output=path]');
function client(binary,env) {
  const child=spawn(binary,[],{cwd,env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
  let pending=null,buffer='',failure=null,stderr='';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    if(buffer.length>32*1024*1024){
      failure=new Error('unframed output limit');pending?.reject(failure);pending=null;child.kill();return;
    }
    let i;
    while((i=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,i);buffer=buffer.slice(i+1);
      if(!pending){failure=new Error('unsolicited reply');child.kill();return;}
      const task=pending;pending=null;
      try{task.resolve(JSON.parse(line));}catch(e){task.reject(e);}
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',part=>{stderr=(stderr+part).slice(-4096);});
  child.on('error',e=>{failure=e;pending?.reject(e);pending=null;});
  child.on('close',(code,signal)=>{
    failure=failure??new Error('native exit '+code+'/'+signal+' '+stderr);
    pending?.reject(failure);pending=null;
  });
  return {
    async call(args){
      if(failure)throw failure;
      if(pending)throw Error('concurrent call in serial harness');
      const response=new Promise((resolve,reject)=>{pending={resolve,reject};});
      let timeout;
      try{
        timeout=setTimeout(()=>{
          failure=new Error('native request timeout: '+args.join(' '));
          pending?.reject(failure);pending=null;child.kill();
        },120000);
        child.stdin.write(args.join('\t')+'\n');
        return await response;
      } finally {clearTimeout(timeout);}
    },
    close(){child.stdin.end();child.kill();}
  };
}
const q=(c,t,n=1)=>['R',String(c),String(t),String(n)];
const c0=2461290;
const t1=2460984,t2=2461290,t3=2463007,t4=2458961;
const phases=[
 {id:'both-disabled',year:0,day:0,promote:2,expect:{yearBuilds:0,dayStores:0},
   calls:[q(c0,t1),q(c0,t1),q(c0,t2),q(c0,t3)]},
 {id:'two-record-day-cache-eviction',year:0,day:80,promote:2,
   expect:{yearBuilds:0,dayHitsMin:2,dayEvictionsMin:2},
   calls:[q(c0,t1),q(c0,t1),q(c0,t2),q(c0,t2),q(c0,t3),q(c0,t1),q(c0,t4),q(c0,t4),q(c0,t3)]},
 {id:'one-year-table-eviction',year:180000,day:0,promote:1,
   expect:{yearBuildsMin:3,yearEvictionsMin:1},
   calls:[q(c0,t1),q(c0+1,t1),q(c0+2,t1),q(c0,t1)]},
 {id:'hybrid-and-year-promotion',year:180000,day:80,promote:2,
   expect:{yearBuildsMin:1,dayHitsMin:1,dayEvictionsMin:1},
   calls:[q(c0,t1),q(c0,t1),q(c0,t2),q(c0,t3),q(c0,t2),q(c0,t1),q(c0,t4)]},
 {id:'range-crosses-boundary',year:180000,day:80,promote:2,
   expect:{},calls:[q(c0,2463003,8),q(c0,2463003,8),q(c0,2460984,4),q(c0,2460984,4)]}
];
const evidence=[];
for(const phase of phases){
  const env={SEER_NEXT_CACHE_BYTES:String(phase.year),
    SEER_NEXT_DAY_CACHE_BYTES:String(phase.day),
    SEER_NEXT_PROMOTE_AFTER:String(phase.promote)};
  const left=client(bins.baseline,env),right=client(bins.hybrid,env);
  const digest=createHash('sha256');
  try{
    for(let i=0;i<phase.calls.length;i++){
      const cmd=phase.calls[i];
      const a=await left.call(cmd),b=await right.call(cmd);
      assert.deepStrictEqual(b,a,'baseline/hybrid mismatch in '+phase.id+' at '+i);
      digest.update(JSON.stringify({cmd,answer:a})+'\n');
    }
    const info=await right.call(['M']);
    assert.equal(info.schema,1);
    const m=info.memo;
    assert.ok(m,'missing candidate memo diagnostics');
    assert.equal(m.payloadBudgetBytes,phase.year);
    assert.equal(m.dayBudgetBytes,phase.day);
    assert.ok(m.payloadBytes<=phase.year,'year payload exceeds cap');
    assert.ok(m.dayPayloadBytes<=phase.day,'day payload exceeds cap');
    assert.ok(m.dayEntries<=2048,'unbounded day key count');
    assert.ok(m.keys<=256,'unbounded year key count');
    assert.equal(m.promoteAfter,phase.promote);
    if('yearBuilds' in phase.expect)assert.equal(m.builds,phase.expect.yearBuilds);
    if('dayStores' in phase.expect)assert.equal(m.dayStores,phase.expect.dayStores);
    if('yearBuildsMin' in phase.expect)assert.ok(m.builds>=phase.expect.yearBuildsMin,'year builds absent');
    if('yearEvictionsMin' in phase.expect)assert.ok(m.evictions>=phase.expect.yearEvictionsMin,'year eviction absent');
    if('dayHitsMin' in phase.expect)assert.ok(m.dayHits>=phase.expect.dayHitsMin,'day hits absent');
    if('dayEvictionsMin' in phase.expect)assert.ok(m.dayEvictions>=phase.expect.dayEvictionsMin,'day eviction absent');
    evidence.push({id:phase.id,count:phase.calls.length,
      responseHash:digest.digest('hex'),fullReplyParity:true,memo:m});
  } finally {left.close();right.close();}
}
const result={schema:'seer-next-hybrid-eviction-v1',commitAtStart:'ffa3bf0584e31367b77223419d303a1d3f96c484',
  verdict:'ALL_PHASES_MATCH_BASELINE_AND_CACHE_INVARIANTS',phaseCount:evidence.length,
  evidence,caveat:'Caps apply to cache record payloads, not RSS/heap metadata/temporary weaving.'};
const out=JSON.stringify(result,null,2)+'\n';
if(outputArg.length)await writeFile(path.resolve(outputArg[0].slice('--output='.length)),out,'utf8');
else process.stdout.write(out);