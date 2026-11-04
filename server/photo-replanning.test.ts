import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {interpretDrawing,RecognitionReviewError} from './interpret.js';
import {modelConnection} from './provider.js';
import {closeLocalSegmentationWorkers} from './local-segmentation.js';
import {sourceOutlineReplanningFeedback,retainsSourceInventory} from './source-review-replanning.js';
import {imageData} from './images.js';

const candidate=()=>({name:'Supply task',description:'Synthetic protocol fixture',theme:'grove',clarification:'',
  objects:[{id:'source',kind:'decoration',label:'Supply',targetId:null,bounds:{left:100,top:100,right:200,bottom:200}},
    {id:'receiver',kind:'decoration',label:'Receiver',targetId:null,bounds:{left:600,top:600,right:800,bottom:800}}],
  goalRules:{requiredCollectedIds:[],requiredActivatedIds:[]},gameplay:{mode:'creative',movement:'discover',reason:'Use actual source objects',avatarId:null,
    objective:'explore',objectiveLabel:'Fill receiver',destinationLabel:'Receiver',objectiveTitle:'Fill receiver',instructions:'Select supply, then receiver.',clues:[],obstacleIds:[],
    path:[{x:100,y:100,label:'Supply'},{x:500,y:500,label:'Middle'},{x:600,y:600,label:'Receiver'}],requiredInteractionIds:[],requiredResourceIds:['receiver'],
    interactions:{version:1,objects:[{entityId:'source',carryable:true,resource:{type:'water',capacity:2,initial:2}},{entityId:'receiver',carryable:false,resource:{type:'water',capacity:2,initial:0}}],
      actions:[{id:'fill',kind:'transfer',label:'Fill receiver',toolId:'source',targetId:'receiver',amount:2,requires:[],effects:[]}]}}});
const reply=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));

test('actual outline rejection permits one source-preserving design correction and retains review on unsafe replacements',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'doodlume-photo-replanning-'));
  const executable=join(directory,'empty-masks.cjs');
  await writeFile(executable,`#!/usr/bin/env node\nconst rl=require('node:readline');process.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');rl.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);process.stdout.write(JSON.stringify({id:r.id,records:[],ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');});`);
  await chmod(executable,0o700);
  const image=imageData(await sharp({create:{width:1000,height:1000,channels:3,background:'#abc'}}).png().toBuffer());
  const connection=modelConnection({MODEL_PROVIDER:'fireworks',FIREWORKS_API_KEY:'synthetic-test-only'});
  const segmentation={enabled:true,apiKey:'',provider:'local-sam2' as const,local:{python:executable,checkpoint:'fixture',worker:'fixture',configured:true}};
  const previous=process.env.SOURCE_PLANNING;delete process.env.SOURCE_PLANNING;
  try{
    for(const outcome of ['valid','changed-box','network','clarification']){
      const requests:any[]=[];
      const run=interpretDrawing(image,'Use the supply to fill the receiver.',connection,new AbortController().signal,segmentation,async(_url,init)=>{
        requests.push(JSON.parse(String(init?.body)));
        const plan=candidate();
        if(requests.length>1){
          if(outcome==='network')throw Error('Synthetic unavailable network');
          if(outcome==='clarification')plan.clarification='Can you confirm the supply outline?';
          if(outcome==='changed-box')plan.objects[0].bounds.right++;
          Object.assign(plan.gameplay.interactions.objects[0],{carryable:false,usableInPlace:true});
        }
        return reply(plan);
      },'picture');
      if(outcome==='valid'){
        const world=await run;
        assert.equal(world.interactions?.objects[0].usableInPlace,true);
        assert.deepEqual(world.entities.find(e=>e.id==='source')?.artSource,{x:100,y:100,width:100,height:100});
        assert.deepEqual(world.goalRules?.requiredResourceIds,['receiver']);
      }else await assert.rejects(run,error=>error instanceof RecognitionReviewError&&error.recovery.issues[0].objectId==='source');
      assert.equal(requests.length,2,'Only one actual-extraction design correction is allowed.');
      assert.deepEqual(requests[0].messages[1],requests[1].messages[1],'Source image and creator intent are unchanged.');
      const feedback=requests[1].messages[0].content;
      assert.match(feedback,/sourceReviewIssues/);assert.match(feedback,/explicitly requested lifting/);
    }
    const plan=candidate(),changed=candidate();changed.objects[0].bounds.left++;
    assert.equal(retainsSourceInventory(plan,changed),false);
    assert.equal(sourceOutlineReplanningFeedback(new Error('unrelated'),plan,image),undefined);
  }finally{closeLocalSegmentationWorkers();if(previous===undefined)delete process.env.SOURCE_PLANNING;else process.env.SOURCE_PLANNING=previous;await rm(directory,{recursive:true,force:true});}
});
