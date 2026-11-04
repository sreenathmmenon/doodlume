import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {photoSourceFacts} from './photo-source-facts.js';
import type {SegmentationConnection, SourceRecoveryCache} from './segmentation.js';
import type {SourceSelection} from './creative-adaptation.js';

const objects=[
  {id:'available',label:'Visible item',bounds:{left:20,top:20,right:120,bottom:140}},
  {id:'rejected',label:'Other item',bounds:{left:200,top:200,right:350,bottom:350}},
  {id:'untested',label:'Stationary item',bounds:{left:500,top:500,right:700,bottom:700}},
];
const local={configured:true,python:'synthetic-python',checkpoint:'synthetic-checkpoint',worker:'synthetic-worker'};
// These are synthetic internal extraction records, never generated-mask proof.
// The key deliberately exercises the exact image/selection/config isolation.
function cacheKey(source:Buffer,object:typeof objects[number]) {
  const b=object.bounds;
  return JSON.stringify([createHash('sha256').update(source).digest('hex'),b.left,b.top,b.right-b.left,b.bottom-b.top,
    local.python,local.checkpoint,local.worker,'compact-self-empty-surfaces-v1']);
}
async function fixture(){
  const source=await sharp({create:{width:200,height:120,channels:3,background:'#aabbcc'}}).png().toBuffer();
  const cache:SourceRecoveryCache=new Map();
  const accepted:SourceSelection={id:'original-id',kind:'decoration',label:'Synthetic mask record',x:15,y:18,width:110,height:125,
    artwork:{art:'data:image/png;base64,DO_NOT_SEND_CUTOUT_RGB',artMethod:'sam'}};
  cache.set(cacheKey(source,objects[0]),accepted);
  cache.set(cacheKey(source,objects[1]),{id:'another-id',kind:'decoration',label:'Synthetic rejected record',x:200,y:200,width:150,height:150,groundingIssue:'No complete outline'});
  const segmentation:SegmentationConnection={enabled:true,apiKey:'',provider:'local-sam2',local,sourceRecoveryCache:cache};
  return {source,cache,segmentation};
}

test('source facts distinguish positive, negative and untested extraction without leaking source pixels',async()=>{
  const {source,segmentation}=await fixture();const candidate={objects:structuredClone(objects)};
  const facts=await photoSourceFacts(source,candidate,segmentation);
  assert.ok(facts);
  assert.deepEqual(facts.sourceRecovery.map(item=>({id:item.id,status:item.status})),[
    {id:'available',status:'mask-available'},{id:'rejected',status:'requires-outline'},{id:'untested',status:'untested'},
  ]);
  assert.deepEqual(facts.sourceRecovery[0].recoveredBounds,{left:15,top:18,right:125,bottom:143});
  assert.equal(facts.sourceRecovery[1].recoveredBounds,undefined);
  assert.equal(facts.sourceRecovery[2].recoveredBounds,undefined);
  assert.deepEqual(candidate.objects,objects,'Facts never rewrite the recognized source boxes.');
  assert.ok(!JSON.stringify(facts).includes('DO_NOT_SEND_CUTOUT_RGB'));
  assert.match(facts.scope,/does not certify semantic identity/);
});

test('source evidence cannot cross image, selection or extraction configuration boundaries',async()=>{
  const {source,segmentation}=await fixture();
  const otherSource=await sharp({create:{width:200,height:120,channels:3,background:'#aabbcd'}}).png().toBuffer();
  const cases=[
    {source:otherSource,candidate:{objects},segmentation},
    {source,candidate:{objects:objects.map(item=>({...item,bounds:{...item.bounds,left:item.bounds.left+1}}))},segmentation},
    {source,candidate:{objects},segmentation:{...segmentation,local:{...local,checkpoint:'different-checkpoint'}}},
  ];
  for(const scenario of cases){const facts=await photoSourceFacts(scenario.source,scenario.candidate,scenario.segmentation);assert.ok(facts);assert.ok(facts.sourceRecovery.every(item=>item.status==='untested'));}
  assert.equal(await photoSourceFacts(source,{objects:[{...objects[0],bounds:{left:500,top:0,right:100,bottom:10}}]},segmentation),undefined);
});
