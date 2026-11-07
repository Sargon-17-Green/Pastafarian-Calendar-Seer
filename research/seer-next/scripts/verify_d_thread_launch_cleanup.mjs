// Research-only deterministic recovery test for partially launched D worker pool.
// A test-only std::system_error after one worker was launched must never abort
// the entire native process. Validate protocol and exact original R/Y afterward.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {cpus,platform,arch} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bins={
 original:path.join(root,'prototype','build','seer_engine_service'),
 hybrid:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
 probe:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const flags=new Map(process.argv.slice(2).map(s=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(s);
 if(!m)throw Error('Unknown command option '+s);
 return [m[1],m[2]];
}));
const engines=(flags.get('engines')??'hybrid,probe').split(',');
if(!engines.length||engines.some(x=>!['hybrid','probe'].includes(x))||
 new Set(engines).size!==engines.length)
 throw Error('Engines must be hybrid,probe or probe');
function client(mode){
 const env={...process.env,
  SEER_NEXT_EXECUTION_PROFILE:'experimental42',
  SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0',
  SEER_NEXT_Y_MEMO_DIRECT:'0',SEER_NEXT_Y_STRUCT_REUSE:'0',
  SEER_NEXT_COLD_RNS_THREADS:'4',SEER_NEXT_COLD_REPLAY_THREADS:'2',
  SEER_NEXT_COLD_RNS_ENGINE_REUSE:'0',
  SEER_NEXT_D_CAP_POLICY:'0',SEER_DIAGONAL_THREADS:'3',
  OMP_NUM_THREADS:'4',OMP_THREAD_LIMIT:'8',OMP_STACKSIZE:'2M',
  OMP_DYNAMIC:'FALSE'
 };
 if(mode!=='original')env.SEER_NEXT_TEST_D_LAUNCH_FAIL_AFTER='1';
 else delete env.SEER_NEXT_TEST_D_LAUNCH_FAIL_AFTER;
 const p=spawn(bins[mode],[],{cwd,env,stdio:['pipe','pipe','pipe']});
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 let buf='',pending=null,closed=null,stderr='';
 p.stderr.on('data',x=>stderr=(stderr+x).slice(-5000));
 p.stdout.on('data',x=>{
  buf+=x;
  if(buf.length>64*1024*1024){
   closed=Error('Oversized native response');
   pending?.reject(closed);pending=null;p.kill();return;
  }
  let i;
  while((i=buf.indexOf('\n'))>=0){
   const line=buf.slice(0,i);buf=buf.slice(i+1);
   if(!pending){closed=Error('Unsolicited response: '+line.slice(0,200));p.kill();return;}
   const q=pending;pending=null;
   try{q.resolve(JSON.parse(line));}catch(e){q.reject(e);}
  }
 });
 p.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
 p.on('close',(code,signal)=>{
  closed??=Error('Native exited: '+code+' '+signal+' '+stderr);
  pending?.reject(closed);pending=null;
 });
 return {
  async call(cmd){
   if(closed)throw closed;
   if(pending)throw Error('Concurrent request prohibited');
   let timer;
   try{
    const reply=new Promise((resolve,reject)=>pending={resolve,reject});
    timer=setTimeout(()=>{
     closed=Error('Native timeout '+cmd.join(','));
     pending?.reject(closed);pending=null;p.kill();
    },90000);
    p.stdin.write(cmd.join('\t')+'\n');
    return await reply;
   }finally{clearTimeout(timer);}
  },
  close(){p.stdin.end();p.kill();}
 };
}
const calc=2461290;
const oracle=client('original');
let rCmd, yCmd, referenceR, referenceY;
try{
 yCmd=['Y',String(calc),'4999','0'];
 referenceY=await oracle.call(yCmd);
 assert.ok(referenceY&&!referenceY.error&&referenceY.ok!==false);
 const target=referenceY.startJdn+Math.floor(referenceY.lengthDays/2);
 rCmd=['R',String(calc),String(target),'1'];
 referenceR=await oracle.call(rCmd);
 assert.ok(referenceR&&!referenceR.error&&referenceR.ok!==false);
}finally{oracle.close();}
const results=[];
for(const engine of engines){
 const p=client(engine);
 try{
  assert.deepStrictEqual(await p.call(rCmd),referenceR,
   'R before injected D failure not equal to original');
  for(let i=0;i<2;i++){
   const error=await p.call(['D',String(calc+20*i),'6','1']);
   assert.equal(error.ok,false,'Injected D launch failure must return well-formed error');
   assert.match(String(error.error),/research-injected D worker launch failure/);
   assert.match(String(error.error),/Resource temporarily unavailable/);
   // Running again in the same process proves no joinable worker destructors
   // triggered std::terminate or left native state permanently poisoned.
   assert.deepStrictEqual(await p.call(rCmd),referenceR,
    'R after D thread launch failure must equal original');
  }
  assert.deepStrictEqual(await p.call(yCmd),referenceY,
   'Y after partially launched D worker must equal original');
  results.push({engine,partialWorkerLaunchInjected:true,
   rejectedDRequests:2,successfulOriginalEqualRReplies:3,
   successfulOriginalEqualYReplies:1,nativeProcessSurvived:true});
 }finally{p.close();}
}
const report={schema:'seer-next-d-thread-launch-recovery-v1',
 cpu:cpus()[0]?.model,platform:platform(),arch:arch(),
 engines,sourceOracleReplies:2,cases:results.length,
 fullyVerified:results.every(x=>x.nativeProcessSurvived&&x.rejectedDRequests===2),
 results,caveats:[
  'The error is intentionally injected after a first native worker starts, before launching the second; this is NOT an actual low-memory failure.',
  'The research-only fault injection is disabled when SEER_NEXT_TEST_D_LAUNCH_FAIL_AFTER is absent.',
  'Both failed D requests must return protocol errors, not process SIGABRT; valid R/Y requests before/after equal original Seer completely.',
  'This verifies the specific partial thread-launch unwinding path, not every possible OpenMP abort cause.',
  'No released Seer, original baseline, production default or branch main modification.'
 ]};
const out=JSON.stringify(report,null,2)+'\n';
if(flags.has('output'))await writeFile(path.resolve(flags.get('output')),out);
else process.stdout.write(out);
