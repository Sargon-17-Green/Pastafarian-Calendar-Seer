// Research-only boundary/negative tests for RLIMIT_AS-aware D dispatch.
// Valid complete native wire replies must match unchanged Seer in full JSON.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,platform,arch,cpus} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const binary={
 original:path.join(root,'prototype','build','seer_engine_service'),
 hybrid:path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service'),
 probe:path.join(root,'research','seer-next','build','seer_next_cold_probe_service')
};
const opts=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);
 if(!m)throw Error('Unknown option '+x);
 return [m[1],m[2]];
}));
const scratch=await mkdtemp(path.join(tmpdir(),'seer-next-d-policy-edge-'));
const mark=()=>process.hrtime.bigint();
const delta=t=>Number(mark()-t)/1e6;
const MiB=1048576;
function start(mode,scenario,label){
 const trace=path.join(scratch,'d-policy-'+label+'.tsv');
 const env={...process.env,
  SEER_NEXT_EXECUTION_PROFILE:scenario.profile??'experimental42',
  SEER_NEXT_CACHE_BYTES:'0',SEER_NEXT_DAY_CACHE_BYTES:'0',
  SEER_NEXT_Y_MEMO_DIRECT:'0',SEER_NEXT_Y_STRUCT_REUSE:'0',
  SEER_NEXT_COLD_RNS_THREADS:'4',SEER_NEXT_COLD_REPLAY_THREADS:'2',
  SEER_NEXT_COLD_SUPERBLOCK:'512',SEER_NEXT_COLD_ADAPT_SUPERBLOCK:'0',
  SEER_NEXT_COLD_RNS_ENGINE_REUSE:mode==='probe'?'1':'0',
  SEER_NEXT_COLD_RNS_ENGINE_SLOTS:'2',
  SEER_NEXT_COLD_RNS_ENGINE_SCOPE:'thread',
  SEER_DIAGONAL_THREADS:String(scenario.requested??1),
  SEER_NEXT_MAX_VIRTUAL_BYTES:String((scenario.limitMiB??0)*MiB),
  SEER_NEXT_D_CAP_POLICY_TRACE_FILE:trace,
  OMP_NUM_THREADS:'4',OMP_THREAD_LIMIT:'8',
  OMP_STACKSIZE:'2M',OMP_DYNAMIC:'FALSE'
 };
 if(scenario.policy===null)delete env.SEER_NEXT_D_CAP_POLICY;
 else env.SEER_NEXT_D_CAP_POLICY=scenario.policy??'0';
 const child=spawn(binary[mode],[],{cwd,env,stdio:['pipe','pipe','pipe']});
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 let buffer='',pending=null,err=null,stderr='';
 child.stderr.on('data',s=>stderr=(stderr+s).slice(-4000));
 child.stdout.on('data',s=>{
  buffer+=s;
  if(buffer.length>96*1024*1024){
   err=Error('Native response too large');pending?.reject(err);pending=null;child.kill();return;
  }
  let at;
  while((at=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
   if(!pending){err=Error('Unsolicited native reply');child.kill();return;}
   const task=pending;pending=null;
   try{task.resolve(JSON.parse(line));}catch(e){task.reject(e);}
  }
 });
 child.on('error',e=>{err=e;pending?.reject(e);pending=null;});
 child.on('close',(code,signal)=>{
  err??=Error('Native exited: '+code+' '+signal+' '+stderr);
  pending?.reject(err);pending=null;
 });
 return {pid:child.pid,trace,
  async call(command){
   if(err)throw err;
   if(pending)throw Error('Overlapping native commands forbidden');
   let timeout;
   const startTime=mark();
   try{
    const reply=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
     err=Error('Native timeout '+command.join(','));
     pending?.reject(err);pending=null;child.kill();
    },180000);
    child.stdin.write(command.join('\t')+'\n');
    return {reply:await reply,ms:delta(startTime)};
   }finally{clearTimeout(timeout);}
  },
  close(){child.stdin.end();child.kill();}
 };
}
async function procInfo(pid){
 const limits=await readFile('/proc/'+pid+'/limits','utf8');
 const match=/^Max address space\s+(unlimited|\d+)\s+/m.exec(limits);
 if(!match)throw Error('Kernel Max address space missing');
 const limit=match[1]==='unlimited'?null:Number(match[1]);
 const status=await readFile('/proc/'+pid+'/status','utf8');
 const get=name=>{
  const x=new RegExp('^'+name+':\\s+(\\d+) kB','m').exec(status);
  if(!x)throw Error('Missing '+name+' in /proc status');
  return Number(x[1]);
 };
 return {limitBytes:limit,vmPeakKiB:get('VmPeak'),vmHwmKiB:get('VmHWM')};
}
async function metadata(calc,year){
 const p=start('original',{policy:null,requested:1},'meta-'+calc+'-'+year);
 try{
  const {reply}=await p.call(['Y',String(calc),String(year),'0']);
  assert.equal(reply.calcJdn,calc);
  assert.equal(reply.year,year);
  assert.ok(reply.lengthDays>0);
  return reply;
 }finally{p.close();}
}
function commands(calc,a,b){
 const center=x=>x.startJdn+Math.floor(x.lengthDays/2);
 return [
  ['R',String(calc),String(center(a)),'1'],
  ['R',String(calc),String(center(b)),'1'],
  ['D',String(calc),'6','1'],
  ['D',String(calc+20),'9','-1'],
  ['R',String(calc),String(center(a)+1),'1'],
  ['Y',String(calc),'5000','0'],
  ['D',String(calc+40),'12','1'],
  ['R',String(calc),String(center(b)+1),'1']
 ];
}
const cases=[
 {key:'below-boundary',limitMiB:767,requested:3,policy:'1',expectedWorkers:1},
 {key:'at-boundary',limitMiB:768,requested:3,policy:'1',expectedWorkers:2},
 {key:'respect-requested-one',limitMiB:1024,requested:1,policy:'1',expectedWorkers:1},
 {key:'unlimited',limitMiB:0,requested:3,policy:'1',expectedWorkers:3},
 {key:'memory-profile',limitMiB:768,requested:3,policy:'1',profile:'memory',expectedWorkers:1},
 {key:'explicitly-off',limitMiB:0,requested:3,policy:'0',expectedWorkers:3},
 {key:'default-absent',limitMiB:0,requested:3,policy:null,expectedWorkers:3}
];
const results=[];
try{
 const oracleByCalc={};
 for(const calc of [2461290,2461400]){
  const a=await metadata(calc,4999),b=await metadata(calc,5000);
  assert.notDeepStrictEqual(a.months.map(x=>x.lengthDays),
    b.months.map(x=>x.lengthDays),'Two distinct RNS key years required');
  const cmds=commands(calc,a,b),p=start('original',{policy:null,requested:1},'oracle-'+calc);
  try{
   const replies=[];
   for(const cmd of cmds){
    const {reply}=await p.call(cmd);
    assert.ok(reply&&reply.ok!==false&&!reply.error,'Original oracle returned an error');
    replies.push(reply);
   }
   oracleByCalc[calc]={cmds,replies};
  }finally{p.close();}
 }
 for(const calc of [2461290,2461400]){
  const {cmds,replies}=oracleByCalc[calc];
  for(const scenario of cases){
   for(const mode of ['hybrid','probe']){
    const label=calc+'-'+scenario.key+'-'+mode;
    const p=start(mode,scenario,label);
    try{
     const timings=[];
     for(let i=0;i<cmds.length;i++){
      let output;
      try{output=await p.call(cmds[i]);}catch(e){
       throw new Error('Edge native failure '+JSON.stringify({
        calc,scenario:scenario.key,mode,commandIndex:i,command:cmds[i],
        cause:String(e)}),{cause:e});
      }
      assert.ok(output.reply&&!output.reply.error&&output.reply.ok!==false,
       'Native error '+JSON.stringify({calc,scenario:scenario.key,mode,index:i,error:output.reply}));
      assert.deepStrictEqual(output.reply,replies[i],
        'Complete original Seer wire mismatch '+JSON.stringify({
          calc,scenario:scenario.key,mode,index:i}));
      timings.push(output.ms);
     }
     const proc=await procInfo(p.pid);
     const requestedBytes=scenario.limitMiB*MiB;
     if(requestedBytes){
      assert.equal(proc.limitBytes,requestedBytes,'Kernel RLIMIT_AS differs');
      assert.ok(proc.vmPeakKiB*1024<=requestedBytes,'VmPeak above requested limit');
     }else assert.equal(proc.limitBytes,null,
       'Uncapped test requires verified unlimited kernel RLIMIT_AS');
     let dispatch=[];
     if(scenario.policy==='1'){
      const lines=(await readFile(p.trace,'utf8')).trim().split(/\r?\n/).filter(Boolean);
      dispatch=lines.map(line=>{
       const fields=line.split('\t').map(Number);
       assert.equal(fields.length,4,'Malformed four-field D dispatcher trace');
       assert.ok(fields.every(Number.isSafeInteger),'D dispatch fields must be integers');
       return fields;
      });
      assert.equal(dispatch.length,3,'Must have one trace for each D request');
      // The built-in memory profile overrides the requested concurrency.
      const effectiveRequested=scenario.profile==='memory'?1:scenario.requested;
      assert.deepStrictEqual(dispatch.map(x=>x[0]),
       [effectiveRequested,effectiveRequested,effectiveRequested]);
      assert.deepStrictEqual(dispatch.map(x=>x[1]),
       [scenario.expectedWorkers,scenario.expectedWorkers,scenario.expectedWorkers],
       'Unexpected selected worker count at cap/mode boundary');
      assert.deepStrictEqual(dispatch.map(x=>x[2]),
       [requestedBytes,requestedBytes,requestedBytes],'Kernel limit not reflected');
      assert.deepStrictEqual(dispatch.map(x=>x[3]),[6,9,12]);
     }else{
      try{
       const raw=await readFile(p.trace,'utf8');
       assert.equal(raw,'','Disabled/default policy wrote a dispatcher trace');
      }catch(e){
       if(e?.code!=='ENOENT')throw e;
      }
     }
     results.push({calc,case:scenario.key,mode,limitMiB:scenario.limitMiB,
      profile:scenario.profile??'experimental42',requested:scenario.requested,
      selected:scenario.expectedWorkers,policy:scenario.policy,
      requests:cmds.length,fullParity:true,dispatch,
      totalMs:timings.reduce((a,b)=>a+b,0),memory:proc});
    }finally{p.close();}
   }
  }
 }
 // Invalid policy should reject only the D command; it must not corrupt
 // a previously valid service, and subsequent non-D operations still work.
 const negative=[];
 for(const mode of ['hybrid','probe']){
  const {cmds,replies}=oracleByCalc[2461290];
  for(const invalid of ['2','invalid']){
   const p=start(mode,{policy:invalid,requested:3,limitMiB:0},'invalid-'+mode+'-'+invalid);
   try{
    const first=(await p.call(cmds[0])).reply;
    assert.deepStrictEqual(first,replies[0],'Invalid policy unexpectedly affected R query');
    const response=(await p.call(cmds[2])).reply;
    assert.equal(response.ok,false,'Invalid policy must reject D request');
    assert.match(String(response.error),/SEER_NEXT_D_CAP_POLICY must be 0 or 1/);
    const after=(await p.call(cmds[1])).reply;
    assert.deepStrictEqual(after,replies[1],
     'Invalid-policy D rejection poisoned a subsequent R operation');
    negative.push({mode,invalid,validated:true,error:response.error,
     previousRMatches:true,followingRMatches:true});
   }finally{p.close();}
  }
 }
 assert.equal(results.length,28,'2 calc × 7 scenarios × 2 research engines required');
 assert.equal(negative.length,4);
 const report={schema:'seer-next-d-cap-policy-boundaries-v1',
  cpu:cpus()[0]?.model,platform:platform(),arch:arch(),
  originalFullReplies:16,candidateFullReplies:results.length*8,
  scenarioCount:cases.length,contexts:results.length,
  fullParity:results.every(x=>x.fullParity),
  kernelCapEvidence:results.every(x=>x.limitMiB===0?
   x.memory.limitBytes===null:x.memory.limitBytes===x.limitMiB*MiB),
  allPolicyTracesExact:results.every(x=>x.policy!=='1'||x.dispatch.length===3),
  negativeCaseCount:negative.length,
  cases,results,negative,
  caveats:[
   'Real Linux /proc/PID/limits was checked for each native process, including unlimited RLIMIT_AS.',
   'The thresholds 767/768MiB are opt-in experimental policy cutoffs, not universal success guarantees.',
   'Memory execution profile is required to retain exactly one D worker independently of the address-space ceiling.',
   'Policy absent or explicitly disabled must not create policy diagnostic rows.',
   'Research-only hybrid and cold-probe binaries are validated independently; untouched original Seer supplies full wire JSON replies.',
   'This is a narrow boundary and error-path test, not a byte-bounded RAM scheme, throughput claim, or production release authorization.'
  ]};
 const out=JSON.stringify(report,null,2)+'\n';
 if(opts.has('output'))await writeFile(path.resolve(opts.get('output')),out);
 else process.stdout.write(out);
}finally{await rm(scratch,{recursive:true,force:true});}
