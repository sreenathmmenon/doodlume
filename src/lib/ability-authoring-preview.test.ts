import test from "node:test";
import assert from "node:assert/strict";
import type {WorldDefinition} from "../../shared/world";
import {abilityRuleLabel, previewAuthoredAbility} from "./ability-authoring-preview";

function fixture(): WorldDefinition {
  return {id:"preview",name:"Workshop",description:"Test",theme:"grove",width:1000,height:700,revision:1,source:"manual",sourceImage:"/art/test.png",
    gameplay:{movement:"discover",objectiveTitle:"Fill the tank",instructions:"Use the battery."},
    entities:[
      {id:"battery",kind:"decoration",label:"Battery",x:100,y:100,width:60,height:60},
      {id:"tank",kind:"decoration",label:"Tank",x:300,y:100,width:60,height:60},
      {id:"gate",kind:"gate",label:"Garden gate",x:500,y:100,width:60,height:100},
    ],goalRules:{requiredCollectedIds:[],requiredActivatedIds:[]},
    interactions:{version:1,objects:[
      {entityId:"battery",usableInPlace:true,resource:{type:"energy",capacity:2,initial:2}},
      {entityId:"tank",resource:{type:"energy",capacity:2,initial:0}},
    ],actions:[
      {id:"charge",kind:"transfer",toolId:"battery",targetId:"tank",label:"Charge",amount:2},
      {id:"open",kind:"operate",toolId:"tank",targetId:"tank",label:"Open",requires:["charge"],effects:[{kind:"openGate",entityId:"gate"}]},
    ]}};
}

test("author preview computes the real transfer in an isolated fresh run",()=>{
  const world=fixture(), before=structuredClone(world);
  const result=previewAuthoredAbility(world,world.interactions!.actions[0]);
  assert.equal(result.available,true);
  assert.match(result.text,/Tank: 0 → 2 \/ 2/);
  assert.deepEqual(world,before);
});

test("author preview does not invent completed prerequisites",()=>{
  const world=fixture(), before=structuredClone(world);
  const result=previewAuthoredAbility(world,world.interactions!.actions[1]);
  assert.equal(result.available,false);
  assert.match(result.text,/First: Charge/);
  assert.doesNotMatch(result.text,/Opens Garden gate/);
  assert.deepEqual(world,before);
});

test("controller labels distinguish the actual affected target",()=>{
  const world=fixture();
  assert.equal(abilityRuleLabel(world,world.interactions!.actions[1]),"Tank → Open → Garden gate");
  assert.equal(abilityRuleLabel(world,world.interactions!.actions[0]),"Battery → Charge → Tank");
});
