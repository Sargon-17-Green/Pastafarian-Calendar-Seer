// Seer Next independent repeated confirmation of 3/3, 3/1, 4/1 and 4/3 cold RNS profiles.
// One process per sample; generated RNS internal-stage times are from research-only instrumentation.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpus,platform,arch,tmpdir} from 'node:os';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
if(platform()!=='linux'||arch()!=='x64')throw Error('Linux x64 required');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const baseline=path.join(root,'prototype','build','seer_engine_service');
const candidate=path.join(root,'research','seer-next','build','seer_next_cold_probe_service');
const args=new Map(process.argv.slice(2).map(x=>{
  const m=/^--([a-z-]+)=(.*)$/.exec(x);if(!m)throw Error('invalid arg '+x);return [m[1],m[2]];
}));
const trials=Number(args.get('trials')??2);
if(!Number.isSafeInteger(trials)||trials<1||trials>12)throw Error('trials must be 1..12');
const cases=[
  {name:'early-second-day',c:2461290,t:2458962},
  {name:'mid-year',c:2461290,t:2460984},
  {name:'penultimate',c:2461290,t:2463006},
  {name:'foundation',c:-13334246,t:-13334246}
];
const policies=[
  {rns:3,replay:3},{rns:3,replay:1},
  {rns:4,replay:1},{rns:4,replay:3}
];
const workspace=await mkdtemp(path.join(tmpdir(),'seer-next-cold-rns-confirm-'));
async function once(binary,env,cmd){
  const start=process.hrtime.bigint();
  const p=spawn(binary,[],{cwd,env:{...process.env,
    SEER_NEXT_DAY_CACHE_BYTES:'0',SEER_NEXT_CACHE_BYTES:'0',...env},stdio:['pipe','pipe','pipe']});
  let pending=null,buffer='',stderr='',closed=null;
  p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
  p.stderr.on('data',x=>stderr=(stderr+x).slice(-5000));
  p.stdout.on('data',x=>{
    buffer+=x;
    if(buffer.length>32*1024*1024){closed=Error('oversized native reply');pending?.reject(closed);pending=null;p.kill();return;}
    const i=buffer.indexOf('\n');
    if(i>=0&&pending){
      const q=pending;pending=null;
      try{q.resolve(JSON.parse(buffer.slice(0,i)));}catch(e){q.reject(e);}
    }
  });
  p.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
  p.on('close',(code,signal)=>{
    closed=closed??Error('native closed '+code+'/'+signal+': '+stderr);
    pending?.reject(closed);pending=null;
  });
  let timeout;
  try{
    const promise=new Promise((resolve,reject)=>pending={resolve,reject});
    timeout=setTimeout(()=>{
      closed=Error('native cold timeout');pending?.reject(closed);pending=null;p.kill();
    },120000);
    p.stdin.write(cmd.join('\t')+'\n');
    const answer=await promise;
    const wallMs=Number(process.hrtime.bigint()-start)/1e6;
    const status=await readFile('/proc/'+p.pid+'/status','utf8');
    const m=/^VmPeak:\s+(\d+) kB/m.exec(status);
    const hwm=/^VmHWM:\s+(\d+) kB/m.exec(status);
    if(!m||!hwm)throw Error('missing VmPeak/VmHWM evidence');
    return {answer,wallMs,vmPeakKiB:Number(m[1]),peakRssKiB:Number(hwm[1])};
  }finally{clearTimeout(timeout);p.stdin.end();p.kill();}
}
function weaveTrace(str){
  const rows=str.trim().split(/\r?\n/).filter(Boolean);
  if(rows.length!==1)throw Error('Expected exactly one RNS diagnostic row, got '+rows.length);
  const n=rows[0].split('\t').map(Number);
  if(n.length!==22||n.some(x=>!Number.isFinite(x)||x<0))throw Error('Invalid RNS metrics '+rows[0]);
  const cols=['months','yearLength','stopPositions','rnsPrimes','basis','rankWidth',
    'sizingMs','rnsEngineMs','rankMs','predictorSetupMs','replayExecutionMs',
    'rnsCountMs','rnsFracMetadataMs','predictionMs','replayMs','resetMs','crtMs','fallbackMs',
    'certifications','exactFallbacks','splits','failedSpeculations'];
  return Object.fromEntries(cols.map((key,i)=>[key,n[i]]));
}
const results=[];
try{
 for(let trial=0;trial<trials;trial++){
  for(let caseIndex=0;caseIndex<cases.length;caseIndex++){
   const sample=cases[(caseIndex+trial)%cases.length];
   const cmd=['R',String(sample.c),String(sample.t),'1'];
   // One pinned reference process per input; compare *all* policy outputs to it.
   const reference=await once(baseline,{},cmd);
   const rotated=policies.map((_,i)=>policies[(i+trial+caseIndex)%policies.length]);
   for(const policy of rotated){
    const stageFile=path.join(workspace,'weave-'+trial+'-'+caseIndex+'-'+policy.rns+'-'+policy.replay+'.tsv');
    const env={SEER_NEXT_COLD_RNS_THREADS:String(policy.rns),
      SEER_NEXT_COLD_REPLAY_THREADS:String(policy.replay),
      SEER_NEXT_COLD_WEAVE_STAGE_FILE:stageFile};
    const measured=await once(candidate,env,cmd);
    assert.deepStrictEqual(measured.answer,reference.answer,
      'Cold factorial full JSON mismatch '+sample.name+' '+JSON.stringify(policy));
    const trace=weaveTrace(await readFile(stageFile,'utf8'));
    results.push({trial,sample:sample.name,calcJdn:sample.c,targetJdn:sample.t,
      policy,baselineWallMs:reference.wallMs,baselineVmPeakKiB:reference.vmPeakKiB,
      baselinePeakRssKiB:reference.peakRssKiB,candidateWallMs:measured.wallMs,
      candidateVmPeakKiB:measured.vmPeakKiB,candidatePeakRssKiB:measured.peakRssKiB,
      fullJsonParity:true,weave:trace});
   }
  }
 }
 const final={schema:'seer-next-cold-rns-confirm-v1',generated:new Date().toISOString(),
   baselineCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
   cpu:cpus()[0]?.model,trials,samples:cases,policies,results,
   correctness:'All research candidates fully match native baseline in tested one-shot workload',
   caveats:['Candidate RNS timing instrumentation adds file I/O after the algorithm.',
     'CPU, virtual-memory allocation and wall time vary among runner hosts.',
     'Only four calculation/target cases, six trials and four worker configurations (3 or 4 RNS threads).',
     'Hosted CI virtual CPU quota is not a guaranteed indication of local Windows CPU capacity.',
     'No result is automatically promoted to production; complete independent oracle remains separate.']};
 const json=JSON.stringify(final,null,2)+'\n';
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),json,'utf8');
 else process.stdout.write(json);
}finally{await rm(workspace,{recursive:true,force:true});}
