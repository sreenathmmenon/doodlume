import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceScenery } from './source-scenery.js';
import { imageData } from './images.js';
import type { WorldEntity } from '../shared/world.js';

test('creator outline repairs every covered pixel and preserves all uncovered pixels even when a worker changes the whole crop', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doodlume-confirmed-outline-'));
  const executable = join(directory, 'repair-worker.cjs');
  // Synthetic repair transport deliberately changes every pixel. The compositor
  // must protect original pixels outside the creator's mask independently.
  await writeFile(executable, `#!/usr/bin/env node\nconst sm=require(${JSON.stringify(fileURLToPath(import.meta.resolve('sharp')))}),sharp=sm.default??sm;let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',async()=>{const r=JSON.parse(input),m=await sharp(Buffer.from(r.source,'base64')).metadata();process.stdout.write(await sharp({create:{width:m.width,height:m.height,channels:4,background:{r:240,g:20,b:30,alpha:1}}}).png().toBuffer());});`);
  await chmod(executable, 0o700);
  const names = ['LOCAL_SAM_PYTHON', 'LOCAL_SAM_CHECKPOINT', 'LOCAL_BACKGROUND_REPAIR'] as const;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.LOCAL_SAM_PYTHON = executable; process.env.LOCAL_SAM_CHECKPOINT = executable; process.env.LOCAL_BACKGROUND_REPAIR = 'classical';
  try {
    const source = await sharp({create:{width:100,height:80,channels:4,background:{r:80,g:90,b:100,alpha:1}}}).png().toBuffer();
    const mask = await sharp(source).extract({left:20,top:20,width:20,height:20}).ensureAlpha().raw().toBuffer();
    for(let y=0;y<20;y++)for(let x=0;x<20;x++) mask[(y*20+x)*4+3] = x>=7&&x<12&&y>=6&&y<14 ? 255 : x===12&&y===10 ? 128 : 0;
    const art=imageData(await sharp(mask,{raw:{width:20,height:20,channels:4}}).png().toBuffer());
    const entity:WorldEntity={id:'part',kind:'decoration',label:'Confirmed part',x:200,y:200,width:200,height:250,
      artSource:{x:200,y:250,width:200,height:250},sourceLayer:{x:200,y:200,width:200,height:250},art,artMethod:'outline'};
    let actualRepair:Buffer|undefined;
    const result=await sourceScenery(source,[entity],undefined,async(_,repair)=>{actualRepair=await sharp(repair).greyscale().raw().toBuffer();});
    const output=await sharp(Buffer.from(result.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    assert.ok(actualRepair);
    let changed=0;
    for(let y=0;y<80;y++)for(let x=0;x<100;x++) {
      const xx=x-20,yy=y-20,alpha=xx>=0&&yy>=0&&xx<20&&yy<20?mask[(yy*20+xx)*4+3]:0;
      const index=(y*100+x)*4;
      if(alpha) {changed++;assert.equal(actualRepair![y*100+x],255);assert.equal(output[index],240);}
      else {assert.equal(actualRepair![y*100+x],0);assert.deepEqual([...output.subarray(index,index+4)],[80,90,100,255]);}
    }
    assert.equal(changed,41,'Every covered pixel is fully repaired; no padding, paper dilation, or worker expansion enlarges the confirmed mask.');
    const controller=new AbortController(),cancelled=new DOMException('Review closed','AbortError');
    await assert.rejects(sourceScenery(source,[entity],undefined,async()=>{controller.abort(cancelled);},undefined,controller.signal),error=>error===cancelled,'Scenery forwards cancellation before starting the repair worker.');
  } finally {
    for(const name of names) {if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
    await rm(directory,{recursive:true,force:true});
  }
});

test('an object bordering a drawn surface uses structural repair even when most of its perimeter is white paper', async () => {
  const blank=await sharp({create:{width:100,height:100,channels:4,background:'#eeeeee'}}).png().toBuffer();
  const art=imageData(await sharp({create:{width:40,height:40,channels:4,background:'#2255aa'}}).png().toBuffer());
  const entity:WorldEntity={id:'object',kind:'decoration',x:30,y:30,width:40,height:40,
    artSource:{x:300,y:300,width:400,height:400},sourceLayer:{x:30,y:30,width:40,height:40},art,artMethod:'sam'};
  let requested=false;
  await sourceScenery(blank,[entity],undefined,async()=>{requested=true;});
  assert.equal(requested,false,'Blank paper on every side retains the direct paper path.');
  const surface=await sharp({create:{width:100,height:16,channels:4,background:'#976b45'}}).png().toBuffer();
  const mixed=await sharp(blank).composite([{input:surface,left:0,top:72}]).png().toBuffer();
  const captured=new Error('Captured before inference');
  await assert.rejects(sourceScenery(mixed,[entity],undefined,async(_,mask)=>{
    const pixels=await sharp(mask).greyscale().raw().toBuffer();
    assert.equal(pixels[50*100+50],255,'The removed object needs reconstruction with its surrounding drawn surface.');
    throw captured;
  }),error=>error===captured);
});

test('mixed masks retain automatic repair expansion and only the creator explicitly chosen cleanup margin',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'doodlume-mixed-outline-'));
  const executable=join(directory,'repair-worker.cjs');
  // The fake learned transport paints everything; only the exact permitted
  // union may survive. It does not run LaMa or change the input artwork.
  await writeFile(executable,`#!/usr/bin/env node\nconst sm=require(${JSON.stringify(fileURLToPath(import.meta.resolve('sharp')))}),sharp=sm.default??sm;let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',async()=>{const r=JSON.parse(input),m=await sharp(Buffer.from(r.source,'base64')).metadata();process.stdout.write(await sharp({create:{width:m.width,height:m.height,channels:4,background:'#f0141e'}}).png().toBuffer());});`);
  await chmod(executable,0o700);
  const names=['LOCAL_SAM_PYTHON','LOCAL_SAM_CHECKPOINT','LOCAL_LAMA_CHECKPOINT','LOCAL_BACKGROUND_REPAIR'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.LOCAL_SAM_PYTHON=executable;process.env.LOCAL_SAM_CHECKPOINT=executable;process.env.LOCAL_LAMA_CHECKPOINT=executable;process.env.LOCAL_BACKGROUND_REPAIR='lama';
  try{
    const source=await sharp({create:{width:100,height:80,channels:4,background:'#505a64'}}).png().toBuffer();
    const makeArt=async()=>{
      const rgba=Buffer.alloc(10*10*4);rgba.set([80,90,100,128],(5*10+5)*4);
      return imageData(await sharp(rgba,{raw:{width:10,height:10,channels:4}}).png().toBuffer());
    };
    const art=await makeArt();
    const edgePixels=Buffer.alloc(10*10*4);edgePixels.set([80,90,100,128],0);
    const edgeArt=imageData(await sharp(edgePixels,{raw:{width:10,height:10,channels:4}}).png().toBuffer());
    const sourceBox={x:0,y:0,width:100,height:125};
    const manual:WorldEntity={id:'confirmed',kind:'decoration',x:0,y:0,width:10,height:10,artSource:sourceBox,sourceLayer:{x:0,y:0,width:10,height:10},art:edgeArt,artMethod:'outline',
      sourceOutline:{sourceFingerprint:'0'.repeat(64),sourceBox,repairMargin:4}};
    const automatic:WorldEntity={id:'automatic',kind:'decoration',x:65,y:40,width:10,height:10,artSource:{x:650,y:500,width:100,height:125},sourceLayer:{x:65,y:40,width:10,height:10},art,artMethod:'sam'};
    let radius=0;
    const result=await sourceScenery(source,[manual,automatic],undefined,undefined,details=>{assert.equal(details.method,'lama');radius=details.dilationPixels;});
    assert.equal(radius,8);
    const output=await sharp(Buffer.from(result.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    for(let y=0;y<80;y++)for(let x=0;x<100;x++){
      const dy=Math.abs(y-45),dx=Math.abs(x-70);
      const permitted:boolean=y<=4&&x<=Math.round(Math.sqrt(16-y*y)) || dy<=radius&&dx<=Math.round(Math.sqrt(radius*radius-dy*dy));
      assert.deepEqual([...output.subarray((y*100+x)*4,(y*100+x)*4+4)],permitted?[240,20,30,255]:[80,90,100,255],`Pixel ${x},${y} must match the exact mixed repair union.`);
    }
    assert.equal(output[(45*100+78)*4],240,'Automatic edge cleanup survives even when a creator mask exists.');
    assert.equal(output[4*4],240,'The chosen four-pixel cleanup survives at the image edge.');
    assert.equal(output[5*4],80,'Creator cleanup never exceeds the chosen margin, even though the learned worker expands further.');
    assert.equal(manual.art,edgeArt,'The creator foreground alpha and RGB are unchanged.');
  }finally{
    for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
    await rm(directory,{recursive:true,force:true});
  }
});

test('photo repair preserves transparent cutout holes and stationary neighbors outside exact moving coverage',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'doodlume-photo-repair-coverage-'));
  const executable=join(directory,'repair-worker.cjs');
  // Deliberately expansive synthetic learned output proves the compositor owns
  // write permission independently of the repair worker's inference mask.
  await writeFile(executable,`#!/usr/bin/env node\nconst sm=require(${JSON.stringify(fileURLToPath(import.meta.resolve('sharp')))}),sharp=sm.default??sm;let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',async()=>{const r=JSON.parse(input),m=await sharp(Buffer.from(r.source,'base64')).metadata();process.stdout.write(await sharp({create:{width:m.width,height:m.height,channels:4,background:'#f0141e'}}).png().toBuffer());});`);
  await chmod(executable,0o700);
  const names=['LOCAL_SAM_PYTHON','LOCAL_SAM_CHECKPOINT','LOCAL_LAMA_CHECKPOINT','LOCAL_BACKGROUND_REPAIR'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.LOCAL_SAM_PYTHON=executable;process.env.LOCAL_SAM_CHECKPOINT=executable;process.env.LOCAL_LAMA_CHECKPOINT=executable;process.env.LOCAL_BACKGROUND_REPAIR='lama';
  try{
    const source=await sharp({create:{width:80,height:60,channels:4,background:'#505a64'}}).png().toBuffer();
    const rgba=await sharp(source).extract({left:20,top:20,width:20,height:20}).ensureAlpha().raw().toBuffer();
    for(let y=0;y<20;y++)for(let x=0;x<20;x++)rgba[(y*20+x)*4+3]=x>=3&&x<17&&y>=3&&y<17&&!(x>=8&&x<12&&y>=8&&y<12)?255:0;
    const art=imageData(await sharp(rgba,{raw:{width:20,height:20,channels:4}}).png().toBuffer());
    const entity:WorldEntity={id:'moving',kind:'decoration',x:20,y:20,width:20,height:20,art,
      artSource:{x:250,y:1000/3,width:250,height:1000/3},sourceLayer:{x:20,y:20,width:20,height:20},artMethod:'sam'};
    let reportedRadius=0;
    const result=await sourceScenery(source,[entity],undefined,undefined,details=>{reportedRadius=details.dilationPixels;},undefined,'picture');
    assert.equal(reportedRadius,8,'Broad model context remains available even though photo writeback is exact.');
    const backdrop=await sharp(Buffer.from(result.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    let covered=0;
    for(let y=0;y<60;y++)for(let x=0;x<80;x++){
      const xx=x-20,yy=y-20,inside=xx>=0&&yy>=0&&xx<20&&yy<20&&rgba[(yy*20+xx)*4+3]>0;
      assert.deepEqual([...backdrop.subarray((y*80+x)*4,(y*80+x)*4+4)],inside?[240,20,30,255]:[80,90,100,255]);
      if(inside)covered++;
    }
    assert.equal(covered,180,'The internal hole and transparent perimeter remain original scene pixels.');
    const recomposed=await sharp(Buffer.from(result.split(',')[1],'base64')).composite([{input:Buffer.from(art.split(',')[1],'base64'),left:20,top:20}]).raw().toBuffer();
    assert.deepEqual(recomposed,await sharp(source).ensureAlpha().raw().toBuffer(),'Before movement the foreground exactly restores the original photograph.');
  }finally{
    for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
    await rm(directory,{recursive:true,force:true});
  }
});
