import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateInteractions, reduceInteraction, interactionCompletionStatus } from "../shared/interactions.js";
import { emptyPlayState, type WorldDefinition } from "../shared/world.js";
import { validateGeneratedRetryablePlan } from "./retryable-planning.js";

function fixture(): WorldDefinition {
  const ids=["a","b","goal","receiver-a","receiver-b"];
  return {id:"allocation",name:"Synthetic allocation fixture",description:"Protocol fixture",theme:"grove",width:800,height:600,revision:1,source:"manual",sourceImage:"",
    gameplay:{movement:"discover",objectiveTitle:"Fill the goal",instructions:"Choose the allocation"},
    entities:ids.map((id,i)=>({id,kind:"decoration",x:50+i*100,y:100,width:40,height:40})),
    interactions:{version:1,completionPolicy:"retryable",objects:ids.map(id=>({entityId:id,carryable:id==="a"||id==="b",resource:{type:"water",initial:id==="a"||id==="b"?2:0,capacity:2}})),
      actions:[{id:"a-finish",toolId:"a",targetId:"goal",amount:2},{id:"b-finish",toolId:"b",targetId:"goal",amount:2},
        {id:"a-other",toolId:"a",targetId:"receiver-a",amount:1},{id:"b-other",toolId:"b",targetId:"receiver-b",amount:1}]
        .map(action=>({...action,kind:"transfer",label:action.id}))},
    goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:["goal"]}};
}

test("retryable admission finds a consequential allocation after earlier preparation",()=>{
  const world=fixture(); validateInteractions(world); validateGeneratedRetryablePlan(world);
  // Both side allocations belong to winning routes individually; doing both loses.
  for(const first of ["a","b"]){
    let state=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:first}).state;
    state=reduceInteraction(world,state,{type:"perform",actionId:`${first}-other`}).state;
    const next=first==="a"?"b":"a";
    state=reduceInteraction(world,state,{type:"drop"}).state;
    state=reduceInteraction(world,state,{type:"pickup",entityId:next}).state;
    assert.equal(reduceInteraction(world,state,{type:"perform",actionId:`${next}-other`}).ok,true);
  }
});

test("retryable admission rejects interchangeable successful actions and traversal modes",()=>{
  const world=fixture();
  world.interactions!.actions=world.interactions!.actions.filter(action=>action.id.endsWith("finish"));
  validateInteractions(world);
  assert.throws(()=>validateGeneratedRetryablePlan(world),/real allocation decision/);
  world.gameplay!.movement="roam";
  assert.throws(()=>validateGeneratedRetryablePlan(world),/require movement:"discover"/);
  world.interactions!.completionPolicy="protected";
  validateGeneratedRetryablePlan(world);
});

test("retryable admission cannot accept an initially impossible mission or post-win mistakes",()=>{
  const world=fixture();
  world.interactions!.actions=world.interactions!.actions.filter(action=>!action.id.endsWith("finish"));
  assert.throws(()=>validateGeneratedRetryablePlan(world),/no completing run/);
  const alreadyWon=fixture();
  alreadyWon.goalRules!.requiredResourceIds=[];
  assert.throws(()=>validateGeneratedRetryablePlan(alreadyWon),/real allocation decision/);
});

test("retryable admission rejects uncertainty at its fixed state budget",()=>{
  const world=fixture();
  const recipients=Array.from({length:12},(_,index)=>`recipient-${index}`);
  world.entities=[{id:"a",kind:"decoration",x:0,y:0,width:20,height:20},...recipients.map((id,index)=>({id,kind:"decoration" as const,x:index*30,y:100,width:20,height:20}))];
  world.interactions!.objects=[{entityId:"a",carryable:true,resource:{type:"water",initial:12,capacity:12}},...recipients.map(entityId=>({entityId,resource:{type:"water",initial:0,capacity:1}}))];
  world.interactions!.actions=recipients.map((targetId,index)=>({id:`fill-${index}`,kind:"transfer",label:"Fill",toolId:"a",targetId,amount:1}));
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:recipients};
  validateInteractions(world);
  assert.throws(()=>validateGeneratedRetryablePlan(world),/too complex to verify/);
});


test("retryable witness traversal selects fixed sources and can switch between them",()=>{
  const world=fixture();
  for(const object of world.interactions!.objects)if(object.carryable){object.carryable=false;object.usableInPlace=true;}
  validateInteractions(world);validateGeneratedRetryablePlan(world);
});


test("retryable proof executes a prepared stationary control without inventing a pickup",async()=>{
  const world=fixture();
  const art=`data:image/png;base64,${(await sharp({create:{width:30,height:30,channels:4,background:"#456"}}).png().toBuffer()).toString("base64")}`;
  world.entities.push({id:"payload",kind:"decoration",x:10,y:300,width:30,height:30,art});
  world.interactions!.objects.push({entityId:"payload"});
  world.interactions!.actions.push({id:"launch",kind:"operate",label:"Launch",toolId:"goal",targetId:"goal",requiresResourceIds:["goal"],effects:[{kind:"moveObject",entityId:"payload",x:500,y:300}]});
  world.goalRules!.requiredInteractionIds=["launch"];
  validateInteractions(world);validateGeneratedRetryablePlan(world);
});

test("retryable admission proves a shared-cost fork after preparation without relying on transfers",async()=>{
  const world=fixture();
  const art=`data:image/png;base64,${(await sharp({create:{width:30,height:30,channels:4,background:"#456"}}).png().toBuffer()).toString("base64")}`;
  for(const entity of world.entities)entity.art=art;
  world.interactions!.objects=[{entityId:"a",resource:{type:"power",capacity:4,initial:4}},
    ...["b","goal","receiver-a","receiver-b"].map(entityId=>({entityId}))];
  world.interactions!.actions=[
    {id:"prepare",kind:"operate",label:"Position the carrier",toolId:"goal",targetId:"goal",costs:[{entityId:"a",amount:1}],effects:[{kind:"moveObject",entityId:"b",x:100,y:200}]},
    {id:"delivery",kind:"operate",label:"Deliver the first object",toolId:"goal",targetId:"goal",requires:["prepare"],costs:[{entityId:"a",amount:2}],effects:[{kind:"moveObject",entityId:"receiver-a",x:500,y:200}]},
    {id:"detour",kind:"operate",label:"Move the other object",toolId:"goal",targetId:"goal",requires:["prepare"],costs:[{entityId:"a",amount:2}],effects:[{kind:"moveObject",entityId:"receiver-b",x:600,y:200}]},
    {id:"finish",kind:"operate",label:"Return the carrier",toolId:"goal",targetId:"goal",requires:["delivery"],costs:[{entityId:"a",amount:1}],effects:[{kind:"moveObject",entityId:"b",x:100,y:300}]},
  ];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["finish"]};
  validateInteractions(world);validateGeneratedRetryablePlan(world);
  const before=JSON.stringify(world);
  const prepared=reduceInteraction(world,emptyPlayState(),{type:"perform",actionId:"prepare"});assert.equal(prepared.ok,true);
  for(const [id,status] of [["delivery","possible"],["detour","impossible"]] as const){
    const result=reduceInteraction(world,prepared.state,{type:"perform",actionId:id});
    assert.equal(result.ok,true);assert.equal(result.state.interactions!.heldEntityId,null);
    assert.equal(interactionCompletionStatus(world,result.state),status);
  }
  assert.equal(JSON.stringify(world),before);
  const enoughForBoth=structuredClone(world);enoughForBoth.interactions!.objects[0].resource={type:"power",capacity:6,initial:6};
  validateInteractions(enoughForBoth);
  assert.throws(()=>validateGeneratedRetryablePlan(enoughForBoth),/real allocation decision/,"Spending alone does not establish a meaningful losing allocation.");
});
