import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {repairSourceBackgroundDetailed} from './source-background.js';

test('cancelling background repair terminates its process before freeing the next repair slot',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'doodlume-background-abort-'));
  const executable=join(directory,'worker.cjs'),pidFile=join(directory,'pid'),finishFile=join(directory,'finish');
  await writeFile(executable,`#!/usr/bin/env node\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{if(fs.existsSync(${JSON.stringify(finishFile)}))process.stdout.write(Buffer.from(JSON.parse(input).source,'base64'));else setInterval(()=>{},1000);});`);
  await chmod(executable,0o700);
  const names=['LOCAL_SAM_PYTHON','LOCAL_SAM_CHECKPOINT','LOCAL_BACKGROUND_REPAIR'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.LOCAL_SAM_PYTHON=executable;process.env.LOCAL_SAM_CHECKPOINT=executable;process.env.LOCAL_BACKGROUND_REPAIR='classical';
  const controller=new AbortController(),reason=new DOMException('Creator closed the source review','AbortError');
  let pending:Promise<unknown>|undefined;
  try{
    const source=await sharp({create:{width:20,height:20,channels:3,background:'#b8b9ba'}}).png().toBuffer();
    pending=repairSourceBackgroundDetailed(source,source,controller.signal).then(()=>null,error=>error);
    let pid=0;
    // Wait for actual readiness; a busy inference worker can delay process startup.
    const readyDeadline=Date.now()+10_000;
    while(!pid&&Date.now()<readyDeadline){try{pid=Number(await readFile(pidFile,'utf8'));}catch{await new Promise(resolve=>setTimeout(resolve,20));}}
    assert.ok(pid,'The actual child starts before cancellation.');
    controller.abort(reason);
    assert.equal(await pending,reason);
    assert.throws(()=>process.kill(pid,0),{code:'ESRCH'},'The cancelled worker is no longer consuming CPU when the promise rejects.');
    await writeFile(finishFile,'finish');
    const repaired=await repairSourceBackgroundDetailed(source,source);
    assert.deepEqual(repaired?.image,source,'A subsequent repair can start immediately after completed cancellation.');
    await rm(pidFile);
    await assert.rejects(repairSourceBackgroundDetailed(source,source,controller.signal),error=>error===reason);
    await assert.rejects(readFile(pidFile),{code:'ENOENT'},'An already cancelled request never starts a worker.');
  }finally{
    controller.abort(reason);
    await pending;
    for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
    await rm(directory,{recursive:true,force:true});
  }
});
