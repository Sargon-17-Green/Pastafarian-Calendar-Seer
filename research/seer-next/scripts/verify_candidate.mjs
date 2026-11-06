// Seer Next: cross-calculation, budgeted-eviction, boundary & error differential stress.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const cwd = path.join(root,'prototype','data');
const binaries = [
  path.join(root,'prototype','build','seer_engine_service'),
  path.join(root,'research','seer-next','build','seer_next_engine_service'),
];
const args = new Map(process.argv.slice(2).map(x => {
  const m=/^--([a-z-]+)=(.*)$/.exec(x);
  if(!m)throw Error('bad argument: '+x);
  return [m[1],m[2]];
}));
function client(bin, label, extraEnv={}) {
  const p=spawn(bin,[],{cwd,env:{...process.env,...extraEnv},stdio:['pipe','pipe','pipe']});
  let buffer='',pending=null,closed=null,stderr='';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data',chunk=>{
    buffer+=chunk;
    if(buffer.length>32*1024*1024){closed=Error(label+' output limit');pending?.reject(closed);pending=null;p.kill();return;}
    while(buffer.includes('\n')){
      const cut=buffer.indexOf('\n'),line=buffer.slice(0,cut);
      buffer=buffer.slice(cut+1);
      if(!pending){closed=Error(label+' unsolicited reply');p.kill();return;}
      const q=pending;pending=null;
      try{q.resolve(JSON.parse(line));}catch(e){q.reject(e);}
    }
  });
  p.stderr.setEncoding('utf8');
  p.stderr.on('data',s=>{stderr=(stderr+s).slice(-4096);});
  p.on('error',e=>{closed=e;pending?.reject(e);pending=null;});
  p.on('close',(code,signal)=>{
    closed=closed??Error(label+' closed '+code+'/'+signal+': '+stderr);
    pending?.reject(closed);pending=null;
  });
  return {
    async call(fields) {
      if(closed)throw closed;
      if(pending)throw Error(label+' concurrent query');
      let timer;
      try{
        const promise=new Promise((resolve,reject)=>pending={resolve,reject});
        timer=setTimeout(()=>{closed=Error(label+' timeout');pending?.reject(closed);pending=null;p.kill();},120000);
        p.stdin.write(fields.join('\t')+'\n','utf8');
        return await promise;
      } finally{clearTimeout(timer);}
    },
    close(){p.stdin.end();p.kill();}
  };
}
const cs=[2461290,2461291,2461292,2461294,2461295,2461299,2461310,2461400,2461500];
const queries=[];
const fixedTargets=[2458961,2460984,2461290,2463007];
for(const c of cs)for(const t of fixedTargets)queries.push(['R',String(c),String(t),'1']);
for(let i=0;i<8;i++)queries.push(['R','2461290','2460984','1']);
let seed=0x39a6b587;
for(let i=0;i<96;i++){
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;
  const c=cs[seed%cs.length];
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;
  const t=2461290+((seed%3201)-1600);
  queries.push(['R',String(c),String(t),String(i%17===0?7:1)]);
}
for(const c of cs)queries.push(['R',String(c),String(c),'1']);
queries.push(['R','2461290','2463003','8']);
queries.push(['Y','2461290','5000','0']);
queries.push(['Y','2461290','5000','1']);
queries.push(['D','2461290','5','1']);
queries.push(['R','999999999999','2461290','1']);
queries.push(['R','2461290','999999999999','1']);
queries.push(['R','2461290','2460984','0']);
const base=client(binaries[0],'baseline');
const next=client(binaries[1],'candidate',{
  SEER_NEXT_CACHE_BYTES:'180000',
  SEER_NEXT_PROMOTE_AFTER:'2',
  SEER_SERVICE_MAX_CALCS:'8'
});
try {
  const hash=createHash('sha256');
  for(const [index,cmd] of queries.entries()){
    const left=await base.call(cmd),right=await next.call(cmd);
    assert.deepStrictEqual(right,left,
      'Native A/B mismatch at query '+index+': '+JSON.stringify(cmd));
    hash.update(JSON.stringify({cmd,result:right})+'\n');
  }
  const result={
    schema:'seer-next-differential-stress-v1',
    baselineCommit:'7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
    scenario:'nine distinct calculation JDNs, 180000-byte payload budget, LRU eviction, seeded randomized single/range, boundary, Y, D and errors',
    queryCount:queries.length,
    numericAndErrorResponses:'ALL_MATCH_BASELINE',
    resultSequenceSHA256:hash.digest('hex'),
    caveat:'Matching Seer baseline is not an independent proof of canonical correctness.'
  };
  const json=JSON.stringify(result,null,2)+'\n';
  if(args.has('output'))await writeFile(path.resolve(args.get('output')),json);
  else process.stdout.write(json);
} finally {base.close();next.close();}
