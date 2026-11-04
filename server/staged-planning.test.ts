import test from "node:test";
import assert from "node:assert/strict";
import { readSourceInventory, readStagedDesign, runStagedPlanning, reviewCompiledSourceActivity } from "./staged-planning.js";
import { readGameplayPlan } from "./creative-adaptation.js";
import { modelConnection } from "./provider.js";
import { RecognitionReviewError } from "./recognition-error.js";
import type { RecognitionReview } from "../shared/recognition-review.js";
import { modelJSON, ModelPlanError } from "./model.js";

const inventory={kind:"inventory",objects:[
  {id:"source",label:"Visible supply",bounds:{left:10,top:20,right:100,bottom:150}},
  {id:"receiver",label:"Visible recipient",bounds:{left:500,top:400,right:650,bottom:600}},
]};
const design={kind:"object-play",name:"Source task",description:"Synthetic protocol fixture, not generation evidence.",theme:"grove",
  roles:inventory.objects.map(object=>({id:object.id,kind:"decoration",targetId:null})),
  mission:{title:"Fill the recipient",instructions:"Select the supply, then its recipient.",reason:"The creator requested a source transfer."},
  interactions:{version:1,objects:[{entityId:"source",carryable:false,usableInPlace:true,resource:{type:"water",capacity:3,initial:3}},{entityId:"receiver",carryable:false,resource:{type:"water",capacity:3,initial:0}}],
    actions:[{id:"fill",label:"Fill recipient",kind:"transfer",toolId:"source",targetId:"receiver",amount:3,requires:[],effects:[]}]},
  finish:{requiredInteractionIds:[],requiredResourceIds:["receiver"],requiredChoiceGroupIds:[]}};
const connection=modelConnection({MODEL_PROVIDER:"fireworks",FIREWORKS_API_KEY:"synthetic-test-only"});
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(value)}}]}));

test("staged design binds explicit roles to frozen source IDs and boxes, never model replacements",()=>{
  const source=readSourceInventory(structuredClone(inventory));
  assert.ok(Object.isFrozen(source)&&Object.isFrozen(source[0].bounds));
  for(const field of ["kind","theme"]){
    const malformed={...design,[field]:{toString:null}};
    assert.throws(()=>readStagedDesign(malformed,source),ModelPlanError,"Malformed JSON scalar values stay typed validation failures, never coercion exceptions.");
  }
  const parsed=readStagedDesign(structuredClone(design),source);
  const candidate=parsed.candidate as any;
  assert.equal(parsed.compactDiscover,true);
  assert.deepEqual(candidate.objects.map((object:any)=>({id:object.id,label:object.label,bounds:object.bounds})),inventory.objects);
  candidate.objects[0].bounds.left=999;
  assert.equal(source[0].bounds.left,10,"Even later compiler changes cannot change the frozen model inventory");
  for(const mutate of [
    (v:any)=>v.roles.pop(),(v:any)=>v.roles.push({...v.roles[0]}),(v:any)=>v.roles[1].id="source",
    (v:any)=>v.roles[0].id="invented",(v:any)=>v.roles[0].bounds={left:99},(v:any)=>v.roles[0].label="replacement",
    (v:any)=>v.roles[0].targetId="invented",
  ]){const invalid=structuredClone(design);mutate(invalid);assert.throws(()=>readStagedDesign(invalid,source),ModelPlanError);}
  assert.throws(()=>readSourceInventory({...inventory,objects:[inventory.objects[0],inventory.objects[0]]}),/unique/);
  assert.throws(()=>readSourceInventory({...inventory,objects:[{...inventory.objects[0],bounds:{left:100,top:0,right:90,bottom:20}}]}),/ordered source bounds/);
});

test("compact mission has explicit finish and no invented traversal data; legacy full contract remains intact",()=>{
  const source=readSourceInventory(inventory);
  const compact=readStagedDesign(design,source).candidate as any;
  assert.deepEqual(compact.gameplay.path,[]);assert.equal(compact.gameplay.avatarId,null);
  assert.deepEqual(compact.gameplay.requiredResourceIds,["receiver"]);
  assert.equal(compact.gameplay.objectiveLabel,design.mission.title);
  assert.doesNotThrow(()=>readGameplayPlan(compact.gameplay,{compactDiscover:true}));
  assert.throws(()=>readGameplayPlan(compact.gameplay),/3–6/);
  const missing=structuredClone(design) as any;delete missing.finish;
  assert.throws(()=>readStagedDesign(missing,source),/explicitly include/);
  const noFinish={...structuredClone(design),finish:{requiredInteractionIds:[],requiredResourceIds:[],requiredChoiceGroupIds:[]}};
  assert.throws(()=>readStagedDesign(noFinish,source),/at least one explicit finishing/);
  const longName={...structuredClone(design),name:"x".repeat(81)};
  assert.throws(()=>readStagedDesign(longName,source),/short name/);
  const empty=structuredClone(design);empty.interactions.actions=[];
  assert.throws(()=>readStagedDesign(empty,source),ModelPlanError);
  const traversal={...compact.gameplay,movement:"platform",mode:"source-layout",avatarId:"source",path:[{x:1,y:2,label:"Start"},{x:4,y:5,label:"Middle"},{x:9,y:10,label:"Finish"}]};
  const legacy={kind:"existing-gameplay",name:design.name,description:design.description,theme:design.theme,
    roles:[{id:"source",kind:"player",targetId:null},{id:"receiver",kind:"terrain",targetId:null}],gameplay:traversal,goalRules:{requiredCollectedIds:[],requiredActivatedIds:[]}};
  const parsed=readStagedDesign(legacy,source);
  assert.equal(parsed.compactDiscover,false);
  assert.deepEqual((parsed.candidate as any).gameplay,traversal);
  assert.equal((parsed.candidate as any).objects[0].kind,"player");
});

test("staged requests preserve the image and intent and share three calls with compilation",async()=>{
  const requests:any[]=[];let reserved=0;
  const result=await runStagedPlanning({sourceDimensions:{width:1000,height:1000},sourceImage:"data:image/png;base64,unchanged",intent:"The unchanged creator intent",inputKind:"picture",connection:{...connection,reserveRequest:()=>{reserved++;}},signal:new AbortController().signal,
    transport:async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return response(requests.length===1?inventory:requests.length===2?design:{ok:true});},
    compile:async(candidate,budget,compact)=>{
      assert.equal(compact,true);assert.equal(budget.requestsRemaining(),1);
      const check=await modelJSON(budget,{},new AbortController().signal,async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return response({verified:true});});
      assert.equal(budget.requestsRemaining(),0);
      await assert.rejects(modelJSON(budget,{},new AbortController().signal,async()=>{throw Error("Must not send a fourth request");}),/bounded planning/);
      return {candidate,check};
    }});
  assert.equal(reserved,3);assert.equal(requests.length,3);
  assert.deepEqual(requests[0].messages[1],requests[1].messages[1]);
  assert.match(requests[1].messages[0].content,/Frozen source inventory/);
  const variants=requests[1].response_format.schema.anyOf;
  const compactSchema=variants.find((variant:any)=>variant.properties?.kind?.const==="object-play");
  const legacySchema=variants.find((variant:any)=>variant.properties?.kind?.const==="existing-gameplay");
  assert.deepEqual(compactSchema.properties.roles.items.properties.kind,{const:"decoration"});
  assert.deepEqual(compactSchema.properties.roles.items.properties.targetId,{type:"null"});
  assert.ok(legacySchema.properties.roles.items.properties.kind.enum.includes("player"),"Traversal keeps its general source roles.");
  assert.deepEqual(result.check,{verified:true});
});

test("staged clarification and budget denial stop without inventing mechanics or replacing useful feedback",async()=>{
  for(const at of [1,2]){let calls=0;
    await assert.rejects(runStagedPlanning({sourceDimensions:{width:1000,height:1000},sourceImage:"same",intent:"same",inputKind:"picture",connection,signal:new AbortController().signal,
      transport:async()=>response(++calls===at?{kind:"clarification",question:"Which visible object should move?"}:inventory),
      compile:async()=>{throw Error("Clarification must not compile");}}),/Which visible object/);
    assert.equal(calls,at);
  }
  let calls=0,reservations=0;
  await assert.rejects(runStagedPlanning({sourceDimensions:{width:1000,height:1000},sourceImage:"same",intent:"same",inputKind:"picture",connection:{...connection,reserveRequest:()=>{if(++reservations>2)throw Error("Session budget exhausted");}},signal:new AbortController().signal,
    transport:async()=>response(++calls===1?inventory:{...design,roles:[]}),compile:async()=>{throw Error("Invalid roles must not compile");}}),/assign every frozen inventory ID/);
  assert.equal(calls,2);
  calls=0;let compiled=false;
  const corrected=await runStagedPlanning({sourceDimensions:{width:1000,height:1000},sourceImage:"same",intent:"same",inputKind:"picture",connection,signal:new AbortController().signal,
    transport:async()=>response(++calls===1?inventory:calls===2?{...design,roles:[]}:design),
    compile:async(candidate,budget)=>{compiled=true;assert.equal(budget.requestsRemaining(),0);return candidate;}});
  assert.equal(calls,3);assert.ok(compiled&&corrected);
});

function outlineReview():RecognitionReviewError {
  return new RecognitionReviewError({kind:"recognition-review",version:1,
    draft:{id:"editable-draft",name:"Draft",description:"Keep this editable draft",theme:"grove",source:"meta",sourceImage:"same-source",revision:1,width:400,height:300,
      entities:[{id:"source",kind:"decoration",x:10,y:20,width:90,height:130,art:"private-draft-art-not-for-feedback"}]},
    issues:[{id:"source-outline",objectId:"source",label:"Check whole object",message:"The complete source outline could not be verified."}]});
}
const revisedDesign=()=>({...structuredClone(design),name:"Revised source task"});
const stagedOptions=()=>({sourceDimensions:{width:1000,height:1000},sourceImage:"same-source",intent:"The unchanged creator request",inputKind:"picture" as const,connection,signal:new AbortController().signal});

test("one source-outline revision keeps frozen inventory, original image and intent within three requests",async()=>{
  const review=outlineReview(),requests:any[]=[],candidates:any[]=[];let reservations=0;
  const result=await runStagedPlanning({...stagedOptions(),connection:{...connection,reserveRequest:()=>{reservations++;}},
    transport:async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return response(requests.length===1?inventory:requests.length===2?design:revisedDesign());},
    compile:async(candidate,budget)=>{candidates.push(candidate);if(candidates.length===1)throw review;assert.equal(budget.requestsRemaining(),0);return candidate;}});
  assert.equal(requests.length,3);assert.equal(reservations,3);assert.equal(candidates.length,2);
  assert.deepEqual(candidates[0].objects,candidates[1].objects,"Both compilations retain frozen source IDs, labels and boxes");
  for(const request of requests.slice(1))assert.deepEqual(request.messages[1],requests[0].messages[1]);
  const feedback=requests[2].messages[0].content as string;
  assert.match(feedback,/sourceReviewIssues/);assert.match(feedback,/Visible supply/);assert.match(feedback,/whole source|complete source outline/i);
  assert.match(feedback,/Do not invent missing pixels/);assert.match(feedback,/drop an explicitly requested result or subject/);
  assert.doesNotMatch(feedback,/private-draft-art|editable-draft/);
  assert.equal((result as any).name,"Revised source task");
});

test("only same-source object-specific outline reviews permit staged replanning",async()=>{
  const changes:Array<(review:RecognitionReview)=>void>=[
    review=>{review.issues[0].id="source-route";},review=>{delete review.issues[0].objectId;},review=>{review.issues[0].objectId="unknown";},
    review=>{review.rulesNeedConfirmation=true;},review=>{review.draft.sourceImage="different-source";},
    review=>{review.issues.push({id:"unknown-kind",label:"Unknown",message:"Unrelated issue"});},
    review=>{review.kind="unknown" as any;},
  ];
  for(const change of changes){const review=outlineReview();change(review.recovery);let calls=0;
    await assert.rejects(runStagedPlanning({...stagedOptions(),transport:async()=>response(++calls===1?inventory:design),compile:async()=>{throw review;}}),error=>error===review);
    assert.equal(calls,2);
  }
});

test("failed or repeated source-review revisions preserve the original editable review without extra calls",async()=>{
  for(const failure of ["semantic","malformed","budget","repeated","inventory-change","used-budget"]){
    const review=outlineReview();let calls=0,reserved=0,compiled=0;
    await assert.rejects(runStagedPlanning({...stagedOptions(),connection:{...connection,reserveRequest:()=>{if(++reserved===3&&failure==="budget")throw Error("Session budget exhausted");}},
      transport:async()=>{calls++;if(calls===3&&failure==="malformed")return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:"{"}}]}));
        const next=revisedDesign();if(failure==="inventory-change")next.roles[0].id="invented";
        return response(calls===1?inventory:calls===2||failure==="repeated"?design:next);},
      compile:async(_candidate,budget)=>{compiled++;if(compiled===1){if(failure==="used-budget")budget.reserveRequest!();throw review;}throw new ModelPlanError("Replacement mission cannot finish");}}),error=>error===review);
    assert.equal(calls,failure==="budget"||failure==="used-budget"?2:3);
    assert.ok(compiled<=2);
  }
});

test("a revised outline review returns normally, while abort, network failure and clarification are never hidden",async()=>{
  for(const outcome of ["review","abort","network","clarification"]){
    const review=outlineReview(),nextReview=outlineReview(),controller=new AbortController();let calls=0,compiled=0;
    nextReview.recovery.issues[0].objectId="receiver";
    await assert.rejects(runStagedPlanning({...stagedOptions(),signal:controller.signal,
      transport:async()=>{calls++;if(calls===3){if(outcome==="abort"){controller.abort();throw controller.signal.reason;}if(outcome==="network")throw Error("offline");if(outcome==="clarification")return response({kind:"clarification",question:"Can you provide the whole requested source object?"});}
        return response(calls===1?inventory:calls===2?design:revisedDesign());},
      compile:async()=>{if(++compiled===1)throw review;throw nextReview;}}),error=>{
        if(outcome==="review")return error===nextReview;
        assert.notEqual(error,review);
        assert.match((error as Error).message,outcome==="abort"?/abort/i:outcome==="network"?/could not be reached/:/whole requested source/);return true;
      });
    assert.equal(calls,3);
  }
});

test("photo-only rollout uses frozen inventory while drawings keep their existing interpretation path",async()=>{
  const {interpretDrawing}=await import('./interpret.js');
  const {default:sharp}=await import('sharp');
  const image='data:image/png;base64,'+(await sharp({create:{width:1000,height:1000,channels:3,background:'#ccddee'}}).png().toBuffer()).toString('base64');
  const before=process.env.SOURCE_PLANNING;
  process.env.SOURCE_PLANNING='photos';
  try{
    const requests:any[]=[];
    const world=await interpretDrawing(image,'Supply water to the recipient',connection,new AbortController().signal,{enabled:false,apiKey:''},async(_url,init)=>{
      requests.push(JSON.parse(String(init?.body)));return response(requests.length===1?inventory:design);
    },'picture');
    assert.equal(requests.length,2);
    assert.equal(world.interactions?.objects.find(object=>object.entityId==='source')?.usableInPlace,true);
    assert.deepEqual(world.goalRules?.requiredResourceIds,['receiver']);
    assert.deepEqual(world.entities.find(object=>object.id==='source')?.artSource,{x:10,y:20,width:90,height:130});
    let drawingCalls=0;
    await assert.rejects(interpretDrawing(image,'Explore the drawing',connection,new AbortController().signal,{enabled:false,apiKey:''},async(_url,init)=>{
      drawingCalls++;const request=JSON.parse(String(init?.body));
      assert.ok(request.response_format.schema.properties.objects,'Drawings still send their original recognition/gameplay contract.');
      assert.equal(request.response_format.schema.anyOf,undefined);
      return new Response('',{status:502});
    },'drawing'),/could not complete/);
    assert.equal(drawingCalls,1);
  }finally{if(before===undefined)delete process.env.SOURCE_PLANNING;else process.env.SOURCE_PLANNING=before;}
});


test("activity review uses recovered compiled geometry and accepts small real consequences",()=>{
  const placement={id:"place",kind:"place",toolId:"piece",targetId:"surface",effects:[{kind:"moveObject",entityId:"piece",x:100,y:200}]};
  const compiled={entities:[{id:"piece",x:100,y:200}],interactions:{objects:[{entityId:"piece",carryable:true}],actions:[placement]}};
  assert.throws(()=>reviewCompiledSourceActivity(compiled),/already at that destination/);
  const recovered=structuredClone(compiled);recovered.entities[0].x=101;
  assert.doesNotThrow(()=>reviewCompiledSourceActivity(recovered),"A recovered silhouette can move even when original source box centers matched.");
  const returnTrip=structuredClone(compiled);returnTrip.interactions.actions.unshift({...placement,id:"outbound",effects:[{kind:"moveObject",entityId:"piece",x:300,y:200}]});
  assert.doesNotThrow(()=>reviewCompiledSourceActivity(returnTrip),"A real outward and return route is allowed.");
  assert.doesNotThrow(()=>reviewCompiledSourceActivity({...compiled,interactions:{...compiled.interactions,actions:[{...placement,costs:[{entityId:"battery",amount:1}]}]}}));
  assert.doesNotThrow(()=>reviewCompiledSourceActivity({...compiled,interactions:{...compiled.interactions,actions:[{kind:"transfer",toolId:"source",targetId:"receiver",amount:1,effects:[]}]}}),"One small quantity change is valid.");
  assert.doesNotThrow(()=>reviewCompiledSourceActivity({...compiled,interactions:{...compiled.interactions,objects:[{entityId:"piece",carryable:true,layer:"surface"}]}}));
});

test("drawing clarification stays a whole bounded question when a provider ignores the short schema",async()=>{
  const {interpretDrawing}=await import('./interpret.js');
  const {default:sharp}=await import('sharp');
  const image='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:3,background:'#ccddee'}}).png().toBuffer()).toString('base64');
  const question="The pictured subject cannot move freely in this mode, because this image stays in place while an explorer moves through it; would you like to use the separate explorer to collect the pictured items while keeping your original artwork intact, or choose a point-and-click activity with those same objects?";
  assert.ok(question.length>280&&question.length<600);
  for(const [clarification,expected] of [[question,question],["Explanation. ".repeat(70)+"Which visible object should the player use?","Which visible object should the player use?"],["Unbounded explanation ".repeat(40),"What should the player do with this image, and what result should finish the game?"]]){
    let calls=0;
    await assert.rejects(interpretDrawing(image,'Make a game.',connection,new AbortController().signal,{enabled:false,apiKey:''},async(_url,init)=>{
      calls++;const body=JSON.parse(String(init?.body));
      assert.equal(body.response_format.schema.properties.clarification.maxLength,280);
      return response({name:'Clarification',description:'No guessed world.',theme:'grove',clarification,objects:[],goalRules:{requiredCollectedIds:[],requiredActivatedIds:[]}});
    },'drawing'),error=>error instanceof Error&&error.message===expected);
    assert.equal(calls,1,'A human question is not retried as an invalid game plan.');
  }
});
