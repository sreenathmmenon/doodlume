import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhotoPlanning, photoPlanningInstructions, photoPlanningSchema,photoInventorySchema,photoInventoryInstructions } from './photo-planning.js';
import { modelConnection } from './provider.js';
import { ModelPlanError, InterpretationError } from './model.js';
import { RecognitionReviewError } from './recognition-error.js';
import { createPlanningBudget } from './planning-budget.js';
import {readGameplayPlan} from './creative-adaptation.js';
import type { RecognitionReview } from '../shared/recognition-review.js';

const connection=modelConnection({MODEL_PROVIDER:'fireworks',FIREWORKS_API_KEY:'synthetic-test-only'});
const sourceImage='data:image/png;base64,c3ludGhldGlj';
const intent='Make this picture into a meaningful playable activity.';
const plan={kind:'object-play',name:'Visible supply',description:'Synthetic protocol fixture.',theme:'grove',
  objects:[{id:'source',label:'Supply',bounds:{left:10,top:10,right:100,bottom:100}},{id:'receiver',label:'Receiver',bounds:{left:500,top:500,right:700,bottom:700}}],
  mission:{title:'Fill the receiver',instructions:'Select the supply, then the receiver.',reason:'A resource transfer requested by the creator.'},
  interactions:{version:1,objects:[{entityId:'source',carryable:false,usableInPlace:true,resource:{type:'water',capacity:3,initial:3}},{entityId:'receiver',carryable:false,resource:{type:'water',capacity:3,initial:0}}],
    actions:[{id:'fill',kind:'transfer',label:'Fill receiver',toolId:'source',targetId:'receiver',amount:3,requires:[],effects:[]}]},
  finish:{requiredInteractionIds:[],requiredResourceIds:['receiver'],requiredChoiceGroupIds:[]}};
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
function rawTransport(values:unknown[],requests:unknown[]=[]):typeof fetch {return (async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return response(values.shift());}) as typeof fetch;}
function transport(values:unknown[],requests:unknown[]=[]):typeof fetch {
  const designs=values.map(value=>{if(!value||typeof value!=='object')return value;const {objects:_,...design}=value as Record<string,unknown>;return design;});
  return rawTransport([{kind:'inventory',objects:plan.objects},...designs],requests);
}

test('compact photo contract excludes traversal mechanics and preserves explicit source/finish data',async()=>{
  const requests:any[]=[];
  const result=await runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([plan],requests),
    compile:async(candidate:any,_connection,compact)=>{assert.equal(compact,true);return candidate;}});
  assert.deepEqual(result.objects,plan.objects.map(object=>({...object,kind:'decoration',targetId:null})));
  assert.deepEqual(result.gameplay.requiredResourceIds,['receiver']);
  assert.deepEqual(result.gameplay.path,[]);
  assert.equal(result.gameplay.avatarId,null);
  assert.equal(requests[0].messages[1].content[0].text,`Adventure intent: ${intent}`);
  assert.equal(requests[0].messages[1].content[1].image_url.url,sourceImage);
  assert.ok(photoPlanningInstructions.length+JSON.stringify(photoPlanningSchema).length<15000);
  const schema=JSON.stringify(photoPlanningSchema);
  for(const excluded of ['openGate','jumpBoost','moveSpeedBoost','obstacleIds'])assert.ok(!schema.includes(excluded));
});

test('one correction cannot return replacement source inventory after physical recognition',async()=>{
  const invalid=structuredClone(plan) as any;invalid.finish=undefined;
  const moved=structuredClone(plan);moved.objects[0].bounds.left=11;
  let calls=0;
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:rawTransport([{kind:'inventory',objects:plan.objects},(({objects:_,...rest})=>rest)(invalid),moved]),compile:async()=>{calls++;}}),/outside its selected compact source contract/);
  assert.equal(calls,0);
  const requests:any[]=[];
  const result=await runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([invalid,plan],requests),compile:async()=>true});
  assert.equal(result,true);assert.equal(requests.length,3);
  assert.equal(requests[0].messages[1].content[1].image_url.url,requests[1].messages[1].content[1].image_url.url);
});

test('typed compiler errors get exactly one correction and transport errors get none',async()=>{
  const requests:unknown[]=[];let compiled=0;
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([plan,plan,plan],requests),
    compile:async()=>{compiled++;throw new ModelPlanError('Placement does not fit.');}}),/does not fit/);
  assert.equal(compiled,2);assert.equal(requests.length,3);
  let attempts=0;
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,
    transport:(async()=>{attempts++;throw new Error('synthetic transport failure');}) as typeof fetch,compile:async()=>true}));
  assert.equal(attempts,1);
});

test('outline retry uses only same-source review and never infers other objects were verified',async()=>{
  const review=new RecognitionReviewError({kind:'recognition-review',version:1,draft:{sourceImage},issues:[{id:'source-outline',objectId:'source',label:'Check source',message:'Whole outline unavailable.'}]} as RecognitionReview);
  const requests:any[]=[];let compiled=0,factsCalls=0;
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([plan,plan],requests),
    correctionFacts:async()=>{factsCalls++;return {sourceRecovery:[{id:"receiver",status:"untested"}]};},
    compile:async()=>{compiled++;if(compiled===1)throw review;throw new ModelPlanError('Replacement fails.');}}),error=>error===review);
  assert.equal(requests.length,3);assert.equal(factsCalls,2);
  assert.match(requests[2].messages[1].content[2].text,/Other IDs are UNTESTED/);
  assert.match(requests[2].messages[1].content[2].text,/sourceRecovery/);
  assert.match(requests[2].messages[1].content[2].text,/Whole outline unavailable/);
  const unrelated=new RecognitionReviewError({...review.recovery,draft:{...review.recovery.draft,sourceImage:'another source'}});
  const untouched:unknown[]=[];
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([plan,plan],untouched),compile:async()=>{throw unrelated;}}),error=>error===unrelated);
  assert.equal(untouched.length,2);
});

test('traversal handoff requires an explicit quoted initial request and cannot bypass failed object play',async()=>{
  const handoff={kind:'existing-gameplay',requestedMode:'platform',requestExcerpt:'a platform game'};
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent:'Make an investigation.',connection:{...connection,requestsRemaining:()=>0},signal:new AbortController().signal,transport:transport([{kind:'existing-gameplay',requestedMode:'investigation',requestExcerpt:'investigation'}]),compile:async()=>true}),ModelPlanError);
  assert.equal(await runPhotoPlanning({sourceImage,intent:'Make a platform game from this.',connection,signal:new AbortController().signal,transport:transport([handoff]),compile:async()=>true}),undefined);
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([handoff,handoff]),compile:async()=>true}),ModelPlanError);
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent:'Make a platform game from this.',connection,signal:new AbortController().signal,transport:transport([plan,handoff]),compile:async()=>{throw new ModelPlanError('Bad placement');}}),/initial response/);
});

test('clarification, cancellation, exhausted budgets and forbidden effects cannot produce a substitute game',async()=>{
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([{kind:'clarification',question:'Which visible object should move?'}]),compile:async()=>true}),error=>error instanceof InterpretationError&&error.message==='Which visible object should move?');
  const forbidden=structuredClone(plan) as any;forbidden.interactions.actions[0].effects=[{kind:'openGate',entityId:'receiver'}];
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection:{...connection,requestsRemaining:()=>0},signal:new AbortController().signal,transport:transport([forbidden]),compile:async()=>{throw Error('should not compile');}}),/only moveObject/);
  const controller=new AbortController();const reason=new Error('Cancelled');controller.abort(reason);
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:controller.signal,transport:transport([plan]),compile:async()=>true}),error=>error===reason);
});


test('repair scheduling or paid-quota refusal preserves the preceding actionable validation error',async()=>{
  for(const refusal of ['time','quota'] as const){
    let now=0,reservations=0;const requests:unknown[]=[];
    const actionable=new ModelPlanError('The selected item cannot fit inside this visible destination.');
    const budgeted={...connection,executionBudget:createPlanningBudget({now:()=>now}),reserveRequest:()=>{
      reservations++;if(refusal==='quota'&&reservations>2)throw new Error('Synthetic request quota exhausted');
    }};
    await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection:budgeted,signal:new AbortController().signal,transport:transport([plan,plan],requests),
      compile:async()=>{if(refusal==='time')now=90_000;throw actionable;}}),error=>error===actionable);
    assert.equal(requests.length,2,'An unaffordable correction never reaches inference.');
  }
});


const investigation={kind:'investigation',name:'Visible relationships',description:'Synthetic protocol fixture, not real generation proof.',theme:'grove',
  objects:plan.objects,mission:{title:'Follow the visible connection',instructions:'Find the clue detail, then finish at its visible counterpart.',reason:'The two actual source details have a specific pictured relationship.'},
  roles:[{id:'source',kind:'coin'},{id:'receiver',kind:'goal'}],objective:'collect',objectiveLabel:'Visible clue',destinationLabel:'Visible counterpart',
  clues:[{entityId:'source',text:'Find the narrow blue shape above its matching red rim.'},{entityId:'receiver',text:'Finish at the wider outline directly below the matched shape.'}],
  path:[{x:50,y:50,label:'Source detail'},{x:350,y:350,label:'Visible connection'},{x:600,y:600,label:'Counterpart'}],
  goalRules:{requiredCollectedIds:['source'],requiredActivatedIds:[]}};
test('compact investigation maps only explicit source roles, clues, landmarks and finish to the existing runtime',async()=>{
  const result=await runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([investigation]),
    compile:async(candidate:any,_connection,compact)=>{assert.equal(compact,false);assert.doesNotThrow(()=>readGameplayPlan(candidate.gameplay));return candidate;}});
  assert.deepEqual(result.objects,plan.objects.map((object,index)=>({...object,kind:investigation.roles[index].kind,targetId:null})));
  assert.deepEqual(result.goalRules,investigation.goalRules);assert.deepEqual(result.gameplay.clues,investigation.clues);assert.deepEqual(result.gameplay.path,investigation.path);
  assert.equal(result.gameplay.interactions,null);assert.equal(result.gameplay.avatarId,null);
  assert.deepEqual(result.gameplay.requiredInteractionIds,[]);
});

test('investigation cannot invent its finishing source or replace failed object play',async()=>{
  const invalid=structuredClone(investigation);invalid.roles[1].kind='decoration';
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection:{...connection,requestsRemaining:()=>0},signal:new AbortController().signal,transport:transport([invalid]),compile:async()=>true}),/actual source goal/);
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([plan,investigation]),compile:async()=>{throw new ModelPlanError('Bad placement');}}),/preserve the chosen activity type/);
});


test('physical inventory precedes gameplay, is frozen in design context and never retries provider or malformed inventory',async()=>{
  const requests:any[]=[];let factInputs:any[]=[];
  await runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:transport([plan],requests),correctionFacts:async candidate=>{factInputs.push(candidate);return {initialGeometry:'synthetic geometry fact'};},compile:async()=>true});
  assert.equal(requests.length,2);assert.match(requests[0].messages[0].content,/No game design/);
  assert.match(requests[1].messages[1].content[2].text,/Frozen physical inventory/);assert.match(requests[1].messages[1].content[2].text,/synthetic geometry fact/);
  assert.deepEqual(factInputs[0].objects,plan.objects.map(object=>({...object,kind:'decoration',targetId:null})));
  assert.ok(photoInventoryInstructions.length+JSON.stringify(photoInventorySchema).length<2500);
  const invalidRequests:any[]=[];
  await assert.rejects(()=>runPhotoPlanning({sourceImage,intent,connection,signal:new AbortController().signal,transport:rawTransport([{kind:'inventory',objects:[]},{kind:'inventory',objects:plan.objects}],invalidRequests),compile:async()=>true}),ModelPlanError);
  assert.equal(invalidRequests.length,1);
});


test('model transport image can differ while extraction review remains bound to canonical source pixels',async()=>{
  const analysisImage='data:image/jpeg;base64,c3ludGhldGljLXRyYW5zcG9ydA==';
  const review=new RecognitionReviewError({kind:'recognition-review',version:1,draft:{sourceImage},issues:[{id:'source-outline',objectId:'source',label:'Check source',message:'Whole outline unavailable.'}]} as RecognitionReview);
  const requests:any[]=[];let compiled=0;
  const result=await runPhotoPlanning({sourceImage,analysisImage,intent,connection,signal:new AbortController().signal,transport:transport([plan,plan],requests),compile:async()=>{if(++compiled===1)throw review;return true;}});
  assert.equal(result,true);assert.equal(requests.length,3);
  for(const request of requests)assert.equal(request.messages[1].content[1].image_url.url,analysisImage);
  assert.match(requests[2].messages[1].content[2].text,/Whole outline unavailable/);
});


test('photo design prefix stays identical across source inventories and corrections while retaining canonical input and diagnostics',async()=>{
  const captures:any[][]=[];
  for(const changed of [false,true]){
    const inventory=structuredClone(plan.objects);
    if(changed){inventory[0].label='Different visible supply';inventory[0].bounds.left=12;}
    const {objects:_,...design}=plan;
    const requests:any[]=[],analysisImage=sourceImage+'analysis';let compilations=0;
    await runPhotoPlanning({sourceImage,analysisImage,intent,connection,signal:new AbortController().signal,
      transport:rawTransport([{kind:'inventory',objects:inventory},design,design],requests),
      correctionFacts:async()=>({visibleFit:changed?'different geometry':'initial geometry'}),
      compile:async(candidate:any)=>{
        assert.deepEqual(candidate.objects,inventory.map(object=>({...object,kind:'decoration',targetId:null})));
        if(compilations++===0)throw new ModelPlanError(changed?'Different fit diagnostic':'Original fit diagnostic');
        return true;
      }});
    captures.push(requests);
    assert.equal(requests.length,3);
    for(const request of requests){
      assert.equal(request.messages[1].content[0].text,`Adventure intent: ${intent}`);
      assert.equal(request.messages[1].content[1].image_url.url,analysisImage);
    }
    assert.equal(requests[1].messages[0].content,requests[2].messages[0].content);
    const initialContext=requests[1].messages[1].content[2].text;
    const correctionContext=requests[2].messages[1].content[2].text;
    assert.match(initialContext,/Frozen physical inventory/);
    assert.ok(initialContext.includes(JSON.stringify(inventory)));
    assert.ok(correctionContext.startsWith(initialContext));
    assert.match(correctionContext,changed?/Different fit diagnostic/:/Original fit diagnostic/);
    assert.match(correctionContext,/rejectedPlan/);
    assert.doesNotMatch(requests[1].messages[0].content,/Original fit diagnostic|Different fit diagnostic|visibleFit|Different visible supply/);
  }
  assert.equal(captures[0][1].messages[0].content,captures[1][1].messages[0].content);
  assert.equal(captures[0][2].messages[0].content,captures[1][2].messages[0].content);
});
