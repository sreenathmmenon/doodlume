import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import sharp from 'sharp';
import {mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installSourceRefinement} from './source-refinement.js';
import {imageData,cropArtwork} from './images.js';
import {sourceOutlineFingerprint} from './source-outline.js';
import {SOURCE_SCENERY_NOTE} from '../shared/source-scenery.js';
import {emptyPlayState,getRetryCheckpoint,pinRetryCheckpoint,validateWorld,type WorldDefinition} from '../shared/world.js';
import {reduceInteraction,interactionState} from '../shared/interactions.js';
import {applyWorldPatch,undoWorldPatch} from '../shared/revisions.js';
import {validSavedWorlds} from '../src/lib/library.js';

test('saved source refinement preserves paid progress, geometry and source pixels through save and undo; stale edits never start repair',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'doodlume-refinement-'));
  const executable=join(directory,'worker.cjs'),calls=join(directory,'calls');
  await writeFile(executable,`#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},'repair\\n');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>process.stdout.write(Buffer.from(JSON.parse(input).source,'base64')));`);
  await chmod(executable,0o700);
  const names=['LOCAL_SAM_PYTHON','LOCAL_SAM_CHECKPOINT','LOCAL_BACKGROUND_REPAIR'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.LOCAL_SAM_PYTHON=executable;process.env.LOCAL_SAM_CHECKPOINT=executable;process.env.LOCAL_BACKGROUND_REPAIR='classical';
  const app=Fastify();installSourceRefinement(app);
  try{
    const source=await sharp({create:{width:120,height:80,channels:3,background:'#505a64'}}).png().toBuffer();
    const box={x:100,y:250,width:200,height:250},art=await cropArtwork(source,box,false);
    const world:WorldDefinition=validateWorld({id:'paid-refinement',name:'Paid movement',description:'Synthetic regression',theme:'grove',source:'meta',sourceImage:imageData(source),width:1440,height:960,revision:3,
      gameplay:{movement:'discover',objectiveTitle:'Move the controller',instructions:'Use its stored power.'},
      entities:[{id:'backdrop',kind:'decoration',x:0,y:0,width:1440,height:960,art:imageData(source),artMethod:'crop',artSource:{x:0,y:0,width:1000,height:1000},artNote:SOURCE_SCENERY_NOTE+' Background reconstructed with local LaMa.'},
        {id:'controller',kind:'decoration',label:'Controller',x:144,y:240,width:288,height:240,art,artMethod:'sam',artSource:box,sourceLayer:{x:144,y:240,width:288,height:240}},
        {id:'stock',kind:'decoration',label:'Stock',x:1000,y:100,width:100,height:100}],
      interactions:{version:1,completionPolicy:'retryable',objects:[{entityId:'controller'},{entityId:'stock',resource:{type:'charge',capacity:3,initial:3}}],actions:[{id:'move',kind:'operate',toolId:'controller',targetId:'controller',label:'Move',costs:[{entityId:'stock',amount:2}],effects:[{kind:'moveObject',entityId:'controller',x:600,y:240}]}]},
      goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:['move']}});
    const paid=reduceInteraction(world,emptyPlayState(),{type:'perform',actionId:'move'});assert.equal(paid.ok,true);
    assert.equal(interactionState(world,paid.state).quantities.stock,1);
    const paidWithRecovery=pinRetryCheckpoint(world,emptyPlayState(),paid.state);
    assert.ok(getRetryCheckpoint(world,paidWithRecovery));
    const rgba=await sharp(Buffer.from(art.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    for(let y=0;y<20;y++)for(let x=0;x<24;x++)rgba[(y*24+x)*4+3]=x>=5&&x<18&&y>=4&&y<16?128:0;
    const mask=imageData(await sharp(rgba,{raw:{width:24,height:20,channels:4}}).png().toBuffer());
    const correction={entityId:'controller',sourceBox:box,mask,sourceFingerprint:sourceOutlineFingerprint(world.sourceImage),repairMargin:4};
    const response=await app.inject({method:'POST',url:'/api/source-refinement',payload:{world,outlines:[correction]}});
    assert.equal(response.statusCode,200,response.body);
    const patch=response.json().patch;
    const applied=applyWorldPatch(world,paidWithRecovery,patch);
    assert.deepEqual(applied.world.interactions,world.interactions);
    assert.equal(applied.world.entities.find(entity=>entity.id==='backdrop')!.artNote,SOURCE_SCENERY_NOTE+' Background reconstructed with local classical inpainting.');
    assert.deepEqual(getRetryCheckpoint(applied.world,applied.state),emptyPlayState(),'Visual refinement rebases the validated recovery point.');
    assert.deepEqual(applied.world.goalRules,world.goalRules);
    assert.equal(applied.world.sourceImage,world.sourceImage);
    const before=world.entities.find(entity=>entity.id==='controller')!,after=applied.world.entities.find(entity=>entity.id==='controller')!;
    for(const key of ['x','y','width','height','artSource','sourceLayer'] as const)assert.deepEqual(after[key],before[key]);
    assert.equal(after.sourceOutline!.repairMargin,4);
    const decoded=await sharp(Buffer.from(after.art!.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    assert.deepEqual(decoded,rgba,'Only the explicitly supplied alpha changes; original RGB stays exact.');
    assert.deepEqual(interactionState(applied.world,applied.state),interactionState(world,paid.state),'Refinement never refunds, repeats, or drops a paid action.');
    const persisted=validSavedWorlds(JSON.parse(JSON.stringify([{world:applied.world,state:applied.state,history:[applied.checkpoint],savedAt:new Date().toISOString()}])))[0];
    assert.equal(persisted.world.entities.find(entity=>entity.id==='controller')!.sourceOutline!.repairMargin,4);
    assert.equal(interactionState(persisted.world,persisted.state).quantities.stock,1);
    assert.deepEqual(getRetryCheckpoint(persisted.world,persisted.state),emptyPlayState(),'Recovery survives normal save normalization.');
    const undone=undoWorldPatch(persisted.world,persisted.state,persisted.history![0]);
    assert.equal(undone.world.entities.find(entity=>entity.id==='controller')!.art,art);
    assert.deepEqual(interactionState(undone.world,undone.state),interactionState(world,paid.state));
    assert.deepEqual(getRetryCheckpoint(undone.world,undone.state),emptyPlayState(),'Undoing only artwork also preserves recovery.');
    const staleRecovery=structuredClone(paidWithRecovery);staleRecovery.retryCheckpoint!.revision--;
    assert.equal(applyWorldPatch(world,staleRecovery,patch).state.retryCheckpoint,undefined,'A stale checkpoint is never legitimized by an artwork edit.');
    const expanded=applyWorldPatch(applied.world,applied.state,{id:'expand',worldId:world.id,baseRevision:applied.world.revision,origin:'manual',additions:[],bounds:{width:1600,height:960}});
    assert.equal(expanded.state.retryCheckpoint,undefined,'Actual world changes still invalidate recovery.');
    for(const changed of [{...correction,sourceFingerprint:'0'.repeat(64)},{...correction,sourceBox:{...box,x:101}},{...correction,repairMargin:13}]){
      const rejected=await app.inject({method:'POST',url:'/api/source-refinement',payload:{world,outlines:[changed]}});
      assert.equal(rejected.statusCode,400,rejected.body);
    }
    assert.equal(await readFile(calls,'utf8'),'repair\n','Invalid source bindings/margins fail before background work.');
  }finally{
    await app.close();for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
    await rm(directory,{recursive:true,force:true});
  }
});
