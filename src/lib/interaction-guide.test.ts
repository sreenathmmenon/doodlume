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
