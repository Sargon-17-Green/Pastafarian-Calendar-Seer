import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createExactEngine } from '../exact-engine.mjs';

async function executable(dir, name, body) {
  const file = path.join(dir, name);
  await writeFile(file, `#!/usr/bin/env node\n${body}\n`, 'utf8');
  await chmod(file, 0o755);
  return file;
}

function structureProgram(callLog) {
  return `
const fs=require('fs'); const [calc,year,include]=process.argv.slice(2).map(Number);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({calc,year,include})+'\\n');
const cutlets=[
 {cutletIndex:0,startOffset:0,endOffset:1,lengthDays:2},
 {cutletIndex:1,startOffset:2,endOffset:3,lengthDays:2},
 {cutletIndex:2,startOffset:4,endOffset:5,lengthDays:2},
 {cutletIndex:3,startOffset:6,endOffset:6,lengthDays:1},
 {cutletIndex:4,startOffset:7,endOffset:7,lengthDays:1}
];
const months=[{monthIndex:0,lengthDays:4},{monthIndex:1,lengthDays:4}];
const payload={schema:1,engine:'fake-year-structure',calcJdn:calc,year,startJdn:100,endJdn:107,lengthDays:8,cutlets,months};
if(include){const seen=[0,0]; payload.days=Array.from({length:8},(_,i)=>{const mi=i%2; seen[mi]++; let ci=i<2?0:i<4?1:i<6?2:i===6?3:4; let ds=i<2?i+1:i<4?i-1:i<6?i-3:1; return {targetJdn:100+i,year,cutletIndex:ci,dayInCutlet:ds,monthIndex:mi,dayInMonth:seen[mi],cutletCount:5,monthCount:2};});}
process.stdout.write(JSON.stringify(payload));`;
}

test('year structure fast path bypasses locator and batch when days are not requested', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'seer-opt03-'));
  const generatedDir=path.join(root,'generated'), dataDir=path.join(root,'prototype','data');
  await mkdir(generatedDir,{recursive:true}); await mkdir(dataDir,{recursive:true});
  const calls=path.join(root,'structure.log'), old=path.join(root,'old.log');
  const structure=await executable(root,'structure',structureProgram(calls));
  const batch=await executable(root,'batch',`require('fs').appendFileSync(${JSON.stringify(old)},'batch\\n');process.exit(9);`);
  const locator=await executable(root,'locator',`require('fs').appendFileSync(${JSON.stringify(old)},'locator\\n');process.exit(9);`);
  const engine=createExactEngine({generatedDir,dataDir,yearBatchBinary:batch,yearLocatorBinary:locator,yearStructureBinary:structure});
  const result=await engine.year({calculationJdn:900n,year:5000n,includeDays:false});
  assert.equal(result.year.lengthDays,8); assert.equal(result.year.cutlets.length,5); assert.equal(result.year.months.length,2); assert.equal(result.year.days,undefined);
  assert.equal((await readFile(calls,'utf8')).trim(),'{"calc":900,"year":5000,"include":0}');
  await assert.rejects(()=>readFile(old,'utf8'),(e)=>e.code==='ENOENT');
});

test('year structure fast path can continue from the same structure to full days', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'seer-opt03-days-'));
  const generatedDir=path.join(root,'generated'), dataDir=path.join(root,'prototype','data');
  await mkdir(generatedDir,{recursive:true}); await mkdir(dataDir,{recursive:true});
  const calls=path.join(root,'structure.log');
  const structure=await executable(root,'structure',structureProgram(calls));
  const dead=await executable(root,'dead','process.exit(9);');
  const engine=createExactEngine({generatedDir,dataDir,yearBatchBinary:dead,yearLocatorBinary:dead,yearStructureBinary:structure});
  const result=await engine.year({calculationJdn:900n,year:5000n,includeDays:true});
  assert.equal(result.year.days.length,8); assert.equal(result.year.days[7].targetJdn,107);
  assert.equal((await readFile(calls,'utf8')).trim(),'{"calc":900,"year":5000,"include":1}');
});
