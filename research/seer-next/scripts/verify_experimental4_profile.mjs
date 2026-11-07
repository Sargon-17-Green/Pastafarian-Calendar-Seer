// Full wire parity of experimental4 and experimental42 profiles, across R/Y/D and canonical years.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const binaries={
  baseline:path.join(root,'prototype','build','seer_engine_service'),
  research:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service')
};
const arg=process.argv.slice(2);
if(arg.length>1||(arg.length===1&&!arg[0].startsWith('--output=')))
  throw Error('Usage: node verify_experimental4_profile.mjs [--output=path]');
function client(binary,profile) {
 const child=spawn(binary,[],{cwd,env:{...process.env,
   SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0',
   SEER_NEXT_EXECUTION_PROFILE:profile},stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',stderr='',closed=null;
 child.stdout.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
  buffer+=chunk;
  if(buffer.length>32*1024*1024){
    closed=Error('native reply limit');pending?.reject(closed);pending=null;child.kill();return;
  }
  let i;
  while((i=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,i);buffer=buffer.slice(i+1);
   if(!pending){closed=Error('unsolicited line');child.kill();return;}
   const p=pending;pending=null;
   try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);}
  }
 });
 child.stderr.setEncoding('utf8');child.stderr.on('data',x=>stderr=(stderr+x).slice(-4096));
 child.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
   closed=closed??Error('native exit '+code+'/'+signal+' '+stderr);
   pending?.reject(closed);pending=null;
 });
 return {
   async call(fields){
     if(closed)throw closed;
     if(pending)throw Error('concurrent native calls');
     let timer;
     try {
       const response=new Promise((resolve,reject)=>{pending={resolve,reject};});
       timer=setTimeout(()=>{
         closed=Error('native request timed out '+fields.join(' '));
         pending?.reject(closed);pending=null;child.kill();
       },120000);
       child.stdin.write(fields.join('\t')+'\n');
       return await response;
     }finally{clearTimeout(timer);}
   },
   close(){child.stdin.end();child.kill();}
 };
}
const requests=[
 ['R','2461290','2458961','1'],
 ['R','2461290','2458962','1'],
 ['R','2461290','2460984','1'],
 ['R','2461290','2461290','1'],
 ['R','2461290','2463006','1'],
 ['R','2461290','2463007','1'],
 ['R','2461290','2463003','8'],
 ['R','2461291','2460984','4'],
 ['R','2461400','2461300','5'],
 ['R','-13334246','-13334246','1'],
 ['R','-13334245','-13334245','1'],
 ['Y','2461290','5000','0'],
 ['Y','2461290','5000','1'],
 ['D','2461290','5','1'],
 ['D','2461400','4','-1']
];
// Derive additional full-wire R targets from independently computed reference Y
// metadata; do not hardcode year boundaries or assume a fixed year structure.
const discovery=client(binaries.baseline,'latency');
try {
 for(const calc of [2461290,2461400]){
  for(const year of [4999,5000,5001]){
   const meta=await discovery.call(['Y',String(calc),String(year),'0']);
   assert.equal(meta.year,year,'native reference year metadata identity');
   assert.ok(Number.isSafeInteger(meta.startJdn)&&Number.isSafeInteger(meta.endJdn));
   assert.equal(meta.endJdn-meta.startJdn+1,meta.lengthDays,
     'native service year boundaries must be inclusive');
   assert.ok(meta.lengthDays>=4);
   for(const day of [meta.startJdn+Math.floor(meta.lengthDays/2),meta.endJdn-1]){
    assert.ok(day>meta.startJdn&&day<meta.endJdn);
    requests.push(['R',String(calc),String(day),'1']);
   }
  }
 }
}finally{discovery.close();}
assert.equal(requests.length,27,'complete cross-year full-wire request suite');
const evidence=[];
for(const profile of ['experimental42','experimental4','latency','memory']){
 const a=client(binaries.baseline,profile),b=client(binaries.research,profile);
 const digest=createHash('sha256');
 try {
  for(let i=0;i<requests.length;i++){
   const request=requests[i];
   const expected=await a.call(request);
   const actual=await b.call(request);
   assert.deepStrictEqual(actual,expected,
     'full-wire parity '+profile+' request '+i+' '+request.join(' '));
   if(actual?.ok===false || actual?.error)
     throw Error('Unexpected native service response for '+request.join(' ')+': '+JSON.stringify(actual));
   digest.update(JSON.stringify({request,expected})+'\n');
  }
  const memo=(await b.call(['M'])).memo;
  assert.ok(memo && memo.keys===0 && memo.dayEntries===0,
    'cache budgets were not fully disabled in profile parity');
  evidence.push({profile,comparisons:requests.length,fullWireParity:true,
    responseSha256:digest.digest('hex')});
 } finally {a.close();b.close();}
}
const result={schema:'seer-next-experimental42-profile-parity-v2',
  baselineCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
  profiles:evidence,requests,allPassed:true,
  caveats:['One Linux host and limited cases; not proof of all-domain equivalence.',
           'Experimental4 is 4 RNS and 1 replay worker; experimental42 is 4 RNS and 2 replay workers for R and Y paths.',
           'Diagonal D uses its existing one-worker-per-record exact compute profile.',
           'Cross-year R requests are derived from original Seer inclusive Year metadata for each calculation day.',
           'No cache and no production Seer source changes.']};
const output=JSON.stringify(result,null,2)+'\n';
if(arg.length)await writeFile(path.resolve(arg[0].slice('--output='.length)),output);
else process.stdout.write(output);
