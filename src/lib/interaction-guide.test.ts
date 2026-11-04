import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlayState, validateWorld } from "../../shared/world";
import { reduceInteraction, type InteractionCommand } from "../../shared/interactions";
import { nextInteractionHint } from "./interaction-guide";

function fixture() {
  return validateWorld({ id:"hint-fixture",name:"Garden",description:"Test",theme:"grove",width:1440,height:820,source:"manual",sourceImage:"/art/test.png",revision:1,
    gameplay:{movement:"discover",objectiveTitle:"Water the garden",instructions:"Use the supplies."},
    entities:[
      {id:"pitcher",kind:"decoration",label:"Jug",x:100,y:100,width:60,height:60},
      {id:"cup",kind:"decoration",label:"Cup",x:200,y:100,width:60,height:60},
      {id:"plant",kind:"decoration",label:"Fern",x:400,y:100,width:60,height:60},
      {id:"waste",kind:"decoration",label:"Drain",x:600,y:100,width:60,height:60},
    ], interactions:{version:1,objects:[
      {entityId:"pitcher",carryable:true,resource:{type:"water",capacity:2,initial:2}},
      {entityId:"cup",carryable:true,resource:{type:"water",capacity:2,initial:0}},
      {entityId:"plant",resource:{type:"water",capacity:2,initial:0}},
      {entityId:"waste",resource:{type:"water",capacity:2,initial:0}},
    ],actions:[
      {id:"waste-water",kind:"transfer",label:"Empty the jug",toolId:"pitcher",targetId:"waste",amount:2},
      {id:"refill",kind:"transfer",label:"Fill the cup",toolId:"pitcher",targetId:"cup",amount:2},
      {id:"water",kind:"transfer",label:"Water the fern",toolId:"cup",targetId:"plant",amount:2},
    ]},goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:["plant"]},
  });
}

test("hints follow a refill chain, reject wasteful choices, and never perform the move",()=>{
  const world=fixture(); let state=emptyPlayState();
  const snapshot=JSON.stringify(state);
  assert.equal(nextInteractionHint(world,state)?.entityId,"pitcher");
  assert.equal(JSON.stringify(state),snapshot);
  const step=(command:InteractionCommand)=>{const result=reduceInteraction(world,state,command);assert.equal(result.ok,true,result.reason);state=result.state;};
  step({type:"pickup",entityId:"pitcher"});
  assert.deepEqual(nextInteractionHint(world,state),{entityId:"cup",text:"Fill the cup · Cup"});
  step({type:"perform",actionId:"refill"});
  assert.equal(nextInteractionHint(world,state)?.entityId,"cup");
  step({type:"drop"});step({type:"pickup",entityId:"cup"});
  assert.deepEqual(nextInteractionHint(world,state),{entityId:"plant",text:"Water the fern · Fern"});
  step({type:"perform",actionId:"water"});
  assert.equal(nextInteractionHint(world,{...state,completed:true}),undefined);
});

test("hints respect incomplete action prerequisites and creator labels",()=>{
  const world=fixture();
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["water"]};
  world.interactions!.actions[2].requires=["refill"];
  world.entities[0].label="My rain cloud";
  assert.match(nextInteractionHint(world,emptyPlayState())!.text,/Take My rain cloud to fill the cup/);
  const noInteractions=structuredClone(world);delete noInteractions.interactions;
  assert.equal(nextInteractionHint(noInteractions,emptyPlayState()),undefined);
});

test("a full receiver leads to making room before suggesting the required delivery",()=>{
  const world=fixture();
  world.interactions!.objects.find(object=>object.entityId==="cup")!.resource!.initial=2;
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["refill"]};
  assert.equal(nextInteractionHint(world,emptyPlayState())?.entityId,"cup");
  const held=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"cup"}).state;
  assert.equal(nextInteractionHint(world,held)?.entityId,"plant");
});

test("a required choice offers the alternatives without choosing a route or mutating play",()=>{
  const world=fixture();
  world.interactions!.choiceGroups=[{id:"water-choice",label:"Choose where the water goes",actionIds:["refill","waste-water"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["water-choice"]};
  validateWorld(world);
  const state=emptyPlayState(),before=JSON.stringify(state);
  const hint=nextInteractionHint(world,state);
  assert.equal(hint?.entityId,"pitcher");
  assert.match(hint!.text,/^Choose:/);
  assert.match(hint!.text,/Fill the cup/);
  assert.match(hint!.text,/Empty the jug/);
  assert.equal(JSON.stringify(state),before);
  const held=reduceInteraction(world,state,{type:"pickup",entityId:"pitcher"}).state;
  const selected=reduceInteraction(world,held,{type:"perform",actionId:"refill"});
  assert.equal(selected.ok,true,selected.reason);
  assert.doesNotMatch(nextInteractionHint(world,selected.state)?.text ?? "",/Empty the jug|^Choose:/);
});

test("hints skip independent preparation that only serves an excluded branch",()=>{
  const world=fixture();
  world.gameplay!.movement="roam";
  world.entities.push({id:"hero",kind:"player",x:20,y:20,width:30,height:30});
  world.interactions!.actions=[
    {id:"slow",kind:"use",label:"Choose the garden route",toolId:"cup",targetId:"plant",effects:[{kind:"moveSpeedBoost",multiplier:1.2}]},
    {id:"fast",kind:"use",label:"Choose the fast route",toolId:"cup",targetId:"plant",effects:[{kind:"moveSpeedBoost",multiplier:1.8}]},
    {id:"prepare-fast",kind:"use",label:"Prepare the fast route",toolId:"pitcher",targetId:"plant",effects:[{kind:"moveSpeedBoost",multiplier:1.1}]},
    {id:"finish-slow",kind:"use",label:"Finish the garden route",toolId:"cup",targetId:"plant",requires:["slow"],effects:[{kind:"moveSpeedBoost",multiplier:1.3}]},
    {id:"finish-fast",kind:"use",label:"Finish the fast route",toolId:"cup",targetId:"plant",requires:["fast","prepare-fast"],effects:[{kind:"moveSpeedBoost",multiplier:2}]},
  ];
  world.interactions!.choiceGroups=[
    {id:"route",label:"Route",actionIds:["slow","fast"]},
    {id:"finish",label:"Finish",actionIds:["finish-slow","finish-fast"]},
  ];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["finish"]};
  validateWorld(world);
  let state=emptyPlayState();
  for(const command of [{type:"pickup",entityId:"cup"},{type:"perform",actionId:"slow"},{type:"drop"},{type:"pickup",entityId:"pitcher"}] as InteractionCommand[]){
    const result=reduceInteraction(world,state,command);assert.equal(result.ok,true,result.reason);state=result.state;
  }
  const before=JSON.stringify(state);
  assert.deepEqual(nextInteractionHint(world,state),{entityId:"cup",text:"Take Cup to finish the garden route."});
  assert.equal(JSON.stringify(state),before);
});


test("choice previews name the foregone outcome and successful preparation reveals its real next step",async()=>{
  const {previewInteraction,interactionOutcomeMessage}=await import("../../shared/interaction-preview");
  const world=fixture();
  world.interactions!.choiceGroups=[{id:"route",label:"Water route",actionIds:["refill","waste-water"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["route"]};
  world.interactions!.actions.find(action=>action.id==="water")!.requires=["refill"];
  const before=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"pitcher"}).state;
  const action=world.interactions!.actions.find(action=>action.id==="refill")!;
  const unchanged=JSON.stringify(before);
  assert.match(previewInteraction(world,before,action).consequence,/Closes “Empty the jug”/);
  const after=reduceInteraction(world,before,{type:"perform",actionId:action.id}).state;
  assert.equal(interactionOutcomeMessage(world,before,after,action),"Unlocked: Water the fern");
  assert.equal(JSON.stringify(before),unchanged);
  const completed=reduceInteraction(world,reduceInteraction(world,reduceInteraction(world,after,{type:"drop"}).state,{type:"pickup",entityId:"cup"}).state,{type:"perform",actionId:"water"}).state;
  assert.equal(interactionOutcomeMessage(world,after,completed,world.interactions!.actions.find(action=>action.id==="water")!),"Water the fern — done");
});

test("outcome feedback detects replenished supplies and freed receiver capacity without inventing prerequisites",async()=>{
  const {interactionOutcomeMessage}=await import("../../shared/interaction-preview");
  const world=fixture();
  const action=world.interactions!.actions.find(action=>action.id==="refill")!;
  const before=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"pitcher"}).state;
  const after=reduceInteraction(world,before,{type:"perform",actionId:action.id}).state;
  const unchanged=JSON.stringify([world,before,after]);
  assert.equal(interactionOutcomeMessage(world,before,after,action),"Unlocked: Water the fern");
  assert.equal(JSON.stringify([world,before,after]),unchanged,"Counterfactual possession must not alter saved state or the plan.");

  world.interactions!.objects.find(object=>object.entityId==="cup")!.resource!.initial=2;
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["refill"]};
  const drain=world.interactions!.actions.find(action=>action.id==="water")!;
  const full=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"cup"}).state;
  const emptied=reduceInteraction(world,full,{type:"perform",actionId:drain.id}).state;
  assert.equal(interactionOutcomeMessage(world,full,emptied,drain),"Unlocked: Fill the cup");
});

test("long choice previews retain named tradeoffs inside the canvas menu cutoff",async()=>{
  const {previewInteraction}=await import("../../shared/interaction-preview");
  const world=fixture();
  const refill=world.interactions!.actions.find(action=>action.id==="refill")!;
  world.entities.find(entity=>entity.id==="cup")!.label="A long source object description ".repeat(3).slice(0,120);
  const first="Empty toward the distant garden drain ".repeat(2).slice(0,80);
  const second="Offer water toward the fern instead ".repeat(2).slice(0,80);
  world.interactions!.actions.find(action=>action.id==="waste-water")!.label=first;
  world.interactions!.actions.push({...refill,id:"other-fill",label:second});
  world.interactions!.choiceGroups=[{id:"route",label:"Water route",actionIds:["refill","waste-water","other-fill"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["route"]};
  validateWorld(world);
  const held=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"pitcher"}).state;
  const preview=previewInteraction(world,held,refill);
  const canvasDetail=preview.consequence.length>160?`${preview.consequence.slice(0,157)}…`:preview.consequence;
  assert.match(canvasDetail,/Closes/);
  assert.ok(canvasDetail.includes(first.slice(0,31).trimEnd()+"…"));
  assert.ok(canvasDetail.includes(second.slice(0,31).trimEnd()+"…"));
  assert.match(preview.consequence,/0 → 2 \/ 2/);
});

test("a branch payoff does not claim to close an option already excluded by the earlier choice",async()=>{
  const {previewInteraction}=await import("../../shared/interaction-preview");
  const world=fixture();
  const water=world.interactions!.actions.find(action=>action.id==="water")!;
  water.requires=["refill"];
  world.interactions!.actions.push({...water,id:"other-payoff",label:"Finish the other route",toolId:"waste",requires:["waste-water"]});
  world.interactions!.objects.find(object=>object.entityId==="waste")!.carryable=true;
  world.interactions!.choiceGroups=[
    {id:"route",label:"Choose route",actionIds:["refill","waste-water"]},
    {id:"payoff",label:"Finish route",actionIds:["water","other-payoff"]},
  ];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["payoff"]};
  validateWorld(world);
  let state=emptyPlayState();
  for(const command of [{type:"pickup",entityId:"pitcher"},{type:"perform",actionId:"refill"},{type:"drop"},{type:"pickup",entityId:"cup"}] as InteractionCommand[]){
    const result=reduceInteraction(world,state,command);assert.equal(result.ok,true,result.reason);state=result.state;
  }
  const preview=previewInteraction(world,state,water);
  assert.equal(preview.available,true);
  assert.doesNotMatch(preview.consequence,/Closes|other route/);
  assert.match(preview.consequence,/Fern: 0 → 2 \/ 2/);
});
