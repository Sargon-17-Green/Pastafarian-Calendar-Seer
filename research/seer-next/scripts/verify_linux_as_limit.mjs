// Linux RLIMIT_AS research contract. This bounds virtual mappings, not cgroup RSS.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {platform} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(platform()!=='linux')throw Error('RLIMIT_AS experiment requires Linux');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const cwd=path.join(root,'prototype','data');
const bin=path.join(root,'research','seer-next','build','seer_next_hybrid_engine_service');
const options=new Map(process.argv.slice(2).map(x=>{
 const m=/^--([a-z-]+)=(.*)$/.exec(x);if(!m)throw Error('invalid arg '+x);return [m[1],m[2]];
}));
function client(limit,profile){
 const child=spawn(bin,[],{cwd,env:{...process.env,
   SEER_NEXT_MAX_VIRTUAL_BYTES:String(limit),
   ...(profile?{SEER_NEXT_EXECUTION_PROFILE:profile}:{}),
   SEER_NEXT_CACHE_BYTES:'8388608',
   SEER_NEXT_DAY_CACHE_BYTES:'0'},stdio:['pipe','pipe','pipe']});
 let buf='',err='',task=null,failed=null;
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
   buf+=chunk;
   if(buf.length>32*1024*1024){failed=Error('buffer overflow');task?.reject(failed);task=null;child.kill();return;}
   while(buf.includes('\n')){
     const cut=buf.indexOf('\n'),line=buf.slice(0,cut);buf=buf.slice(cut+1);
     if(!task){failed=Error('unsolicited reply');child.kill();return;}
     const resolve=task;task=null;
     try{resolve.resolve(JSON.parse(line));}catch(e){resolve.reject(e);}
   }
 });
 child.stderr.on('data',x=>err=(err+x).slice(-8192));
 child.on('error',e=>{failed=e;task?.reject(e);task=null;});
 child.on('close',(code,signal)=>{
   failed=failed??Error('native close '+code+'/'+signal+': '+err);
   task?.reject(failed);task=null;
 });
 return {pid:child.pid,
   async call(fields){
     if(failed)throw failed;
     if(task)throw Error('concurrent request');
     let timer;
     try{
       const p=new Promise((resolve,reject)=>task={resolve,reject});
       timer=setTimeout(()=>{failed=Error('resource-limit query timeout');task?.reject(failed);task=null;child.kill();},120000);
       child.stdin.write(fields.join('\t')+'\n');
       return await p;
     }finally{clearTimeout(timer);}
   },
   close(){child.stdin.end();child.kill();}
 };
}
async function snapshot(pid){
 const [limits,status]=await Promise.all([
   readFile('/proc/'+pid+'/limits','utf8'),readFile('/proc/'+pid+'/status','utf8')]);
 const cap=/^Max address space\s+(\d+)\s+/m.exec(limits);
 const size=/^VmSize:\s+(\d+) kB/m.exec(status);
 const peak=/^VmPeak:\s+(\d+) kB/m.exec(status);
 const hwm=/^VmHWM:\s+(\d+) kB/m.exec(status);
 if(!cap||!size||!peak)throw Error('missing memory limit evidence in Linux /proc');
 return {effectiveLimitBytes:Number(cap[1]),vmSizeKiB:Number(size[1]),
   vmPeakKiB:Number(peak[1]),rssHighWaterKiB:hwm?Number(hwm[1]):null};
}
const trials=[
 {name:'2GiB-latency',limit:2147483648,profile:'latency',requiresSuccess:true},
 {name:'64MiB-memory',limit:67108864,profile:'memory',requiresSuccess:true},
 {name:'64MiB-latency-refused',limit:67108864,profile:'latency',requiresSuccess:false,expectRefusal:true}
];
const results=[];
for(const t of trials){
 const s=client(t.limit,t.profile);
 const record={name:t.name,requestedBytes:t.limit,profile:t.profile};
 try{
   // Synchronize startup with a real request: the process applies its limit
   // inside main, so reading /proc immediately after spawn is a race.
   if(t.expectRefusal){
     let rejected;
     try{await s.call(['M']);}catch(e){rejected=String(e);}
     if(!rejected||!rejected.includes('requires SEER_NEXT_EXECUTION_PROFILE=memory'))
       throw Error('Low-cap latency mode was not explicitly refused: '+rejected);
     record.outcome='EXPLICIT_STARTUP_REFUSAL';
     record.failure=rejected;
     results.push(record);
     continue;
   }
   const ready=await s.call(['M']);
   assert.ok(ready?.memo,'native service did not become ready');
   const before=await snapshot(s.pid);
   assert.ok(before.effectiveLimitBytes<=t.limit,'setrlimit did not enforce requested cap');
   record.before=before;
   for(let i=0;i<3;i++){
     const ans=await s.call(['R','2461290',String(i%2?2461290:2460984),'1']);
     if(ans?.ok===false){
       if(t.requiresSuccess)throw Error('required profile produced failed computation '+JSON.stringify(ans));
       record.outcome='EXPLICIT_QUERY_ERROR_UNDER_CAP';
       record.error=ans;
       break;
     }
     assert.equal(ans.records?.length,1);
     record.successfulQueries=(record.successfulQueries??0)+1;
   }
   if(!record.outcome)record.outcome='SUCCESS_UNDER_CAP';
   record.after=await snapshot(s.pid);
   assert.ok(record.after.effectiveLimitBytes<=t.limit);
   assert.ok(record.after.vmPeakKiB*1024<=t.limit,
     'process exceeded requested VM limit after limit installation');
   assert.ok(record.after.vmSizeKiB*1024<=t.limit);
   if(t.requiresSuccess)assert.equal(record.successfulQueries,3);
   if(t.profile==='memory'){
     const memo=(await s.call(['M'])).memo;
     assert.ok(memo.builds>=1,'64MiB memory-profile full-year build not exercised');
     record.memo={fullYearBuilds:memo.builds,dayStores:memo.dayStores,
       yearPayloadBytes:memo.payloadBytes};
   }
 }catch(e){
   if(t.requiresSuccess||t.expectRefusal)throw e;
   record.outcome='PROCESS_OR_QUERY_FAILED_UNDER_STRICT_LIMIT';
   record.failure=String(e);
   // Low-memory pressure is not silently treated as successful calculation.
   if(record.before){
     assert.ok(record.before.effectiveLimitBytes<=t.limit);
   }
 }finally{s.close();}
 results.push(record);
}
const result={schema:'seer-next-linux-rlimit-as-v1',kernelEnforcement:'RLIMIT_AS',
  outcome:'2GiB latency and 64MiB memory profiles must succeed; 64MiB latency mode must refuse at startup',
  results,
  qualifications:['This is an address-space limit, NOT an RSS limit, and only Linux is implemented.',
    'The limit is installed early in main, after the system loader has mapped shared libraries.',
    'Under 64MiB the explicit memory profile uses 1 OpenMP + 1 replay worker; its acceptance is only tested for selected inputs.',
    'The startup refusal for latency profile under 512MiB is conservative policy, not a proven lower bound.',
    'RNS and thread stacks count toward virtual memory. This experiment does not establish a safe minimum.',
    'No Windows Job Object or cgroup memory.max was implemented.']};
const output=JSON.stringify(result,null,2)+'\n';
if(options.has('output'))await writeFile(path.resolve(options.get('output')),output);
else process.stdout.write(output);
