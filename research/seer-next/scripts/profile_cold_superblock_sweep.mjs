// Independent RNS superblock sweep with fixed 4 RNS/2 replay workers.
// Research-only native cold probe. Each full R reply compared to unchanged Seer.
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
if(!Number.isSafeInteger(trials)||trials<1||trials>5)throw Error('trials must be 1..5');
// Targets are derived from an unchanged Seer Year-structure response, not guessed.
const years=[4999,5000,5001];
const calculationDays=[2461290,2461400];
const cases=[];
const policies=[64,128,256,512,1024].map(superblock=>({rns:4,replay:2,superblock}));
const workspace=await mkdtemp(path.join(tmpdir(),'seer-next-cold-superblock-sweep-'));
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
 for(const c of calculationDays){
   for(const year of years){
     const meta=(await once(baseline,{},['Y',String(c),String(year),'0'])).answer;
     assert.equal(meta.year,year,'baseline Year metadata must identify requested year');
     assert.ok(Number.isSafeInteger(meta.startJdn)&&Number.isSafeInteger(meta.endJdn));
     // API Y returns inclusive first/last days. Length is end-start+1.
     assert.equal(meta.endJdn-meta.startJdn+1,meta.lengthDays,
       'year metadata must give inclusive endpoints');
     assert.ok(meta.lengthDays>=4,'located year must contain mid and penultimate');
     const destinations=[
       {kind:'mid',t:meta.startJdn+Math.floor(meta.lengthDays/2)},
       {kind:'penultimate',t:meta.endJdn-1}
     ];
     for(const d of destinations){
       assert.ok(d.t>meta.startJdn && d.t<meta.endJdn);
       cases.push({name:'Y'+year+'-'+d.kind+'-c'+c,
         c,t:d.t,year,yearLength:meta.lengthDays,targetKind:d.kind});
     }
   }
 }
 assert.equal(cases.length,years.length*calculationDays.length*2);
 for(let trial=0;trial<trials;trial++){
  for(let caseIndex=0;caseIndex<cases.length;caseIndex++){
   const sample=cases[(caseIndex+trial)%cases.length];
   const cmd=['R',String(sample.c),String(sample.t),'1'];
   // One pinned reference process per input; compare *all* policy outputs to it.
   const reference=await once(baseline,{},cmd);
   const rotated=policies.map((_,i)=>policies[(i+trial+caseIndex)%policies.length]);
   for(const policy of rotated){
    const stageFile=path.join(workspace,'weave-'+trial+'-'+caseIndex+'-block'+policy.superblock+'.tsv');
    const env={SEER_NEXT_COLD_RNS_THREADS:String(policy.rns),
      SEER_NEXT_COLD_REPLAY_THREADS:String(policy.replay),
      SEER_NEXT_COLD_SUPERBLOCK:String(policy.superblock),
      SEER_NEXT_COLD_WEAVE_STAGE_FILE:stageFile};
    const measured=await once(candidate,env,cmd);
    assert.deepStrictEqual(measured.answer,reference.answer,
      'Cold superblock full JSON mismatch '+sample.name+' '+JSON.stringify(policy));
    const trace=weaveTrace(await readFile(stageFile,'utf8'));
    results.push({trial,sample:sample.name,calcJdn:sample.c,targetJdn:sample.t,
      policy,baselineWallMs:reference.wallMs,baselineVmPeakKiB:reference.vmPeakKiB,
      baselinePeakRssKiB:reference.peakRssKiB,candidateWallMs:measured.wallMs,
      candidateVmPeakKiB:measured.vmPeakKiB,candidatePeakRssKiB:measured.peakRssKiB,
      fullJsonParity:true,weave:trace});
   }
  }
 }
 assert.equal(results.length,trials*cases.length*policies.length,
   'full trial x case x superblock policy matrix required');
 const final={schema:'seer-next-cold-superblock-sweep-v1',generated:new Date().toISOString(),
   baselineCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
   cpu:cpus()[0]?.model,trials,years,calculationDays,samples:cases,policies,results,
   correctness:'All research candidates fully match native baseline in tested one-shot workload',
   caveats:['Candidate RNS timing instrumentation adds file I/O after the algorithm.',
     'CPU, virtual-memory allocation and wall time vary among runner hosts.',
     'Only three adjacent years, two calculation days, two offsets each, and five superblock choices at fixed 4/2 workers.',
     'Hosted CI virtual CPU quota is not a guaranteed indication of local Windows CPU capacity.',
     'All replies are compared to unchanged Seer; independent canonical oracle remains a separate requirement.',
      'Superblock is research-only and default remains 512; this experiment is not a universal CPU optimum.']};
 const json=JSON.stringify(final,null,2)+'\n';
 if(args.has('output'))await writeFile(path.resolve(args.get('output')),json,'utf8');
 else process.stdout.write(json);
}finally{await rm(workspace,{recursive:true,force:true});}
