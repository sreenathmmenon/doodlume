import test from "node:test";
import assert from "node:assert/strict";
import {emptyPlayState, type WorldDefinition} from "../../shared/world";
import {reduceInteraction} from "../../shared/interactions";
import {canvasCostSummary, interactionOutcomeMessage, previewInteraction} from "../../shared/interaction-preview";
import {withActionCosts} from "./action-cost-authoring";

function fixture(): WorldDefinition {
  return {id:"cost-editor", name:"Workshop", description:"Test", theme:"grove", width:1440,height:820,revision:1,source:"manual",sourceImage:"/art/test.png",
    gameplay:{movement:"platform",objectiveTitle:"Open the gate",instructions:"Use the supplies."},
    entities:[
      {id:"supply",kind:"decoration",label:"Battery",x:100,y:100,width:60,height:60},
      {id:"control",kind:"decoration",label:"Control",x:300,y:100,width:60,height:60},
      {id:"water",kind:"decoration",label:"Water tank",x:500,y:100,width:60,height:60},
      {id:"gate",kind:"gate",label:"Gate",x:700,y:100,width:60,height:100},
      {id:"hero",kind:"player",x:10,y:10,width:30,height:30},
    ],goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["operate"]},
    interactions:{version:1,objects:[
      {entityId:"supply",carryable:true,resource:{type:"energy",capacity:2,initial:2}},
      {entityId:"control",resource:{type:"energy",capacity:2,initial:0}},
      {entityId:"water",resource:{type:"water",capacity:1,initial:1}},
    ],actions:[
      {id:"charge",kind:"transfer",toolId:"supply",targetId:"control",label:"Charge control",amount:2},
      {id:"operate",kind:"operate",toolId:"control",targetId:"control",label:"Open gate",effects:[{kind:"openGate",entityId:"gate"}]},
    ]}};
}

test("cost editing preserves unrelated fields and leaves the committed plan unchanged when rejected",()=>{
  const world=fixture(), plan=world.interactions!, original=structuredClone(plan);
  const costs=[{entityId:"control",amount:2},{entityId:"water",amount:0.125}];
  const changed=withActionCosts(world,plan,"operate",costs);
  assert.deepEqual(plan,original);
  assert.deepEqual(changed.actions[0],plan.actions[0]);
  assert.deepEqual(changed.actions[1],{...plan.actions[1],costs});
  assert.deepEqual(world.goalRules!.requiredInteractionIds,["operate"]);
  assert.throws(()=>withActionCosts(world,plan,"operate",[{entityId:"control",amount:3}]),/positive amounts within their capacities/);
  assert.throws(()=>withActionCosts(world,plan,"charge",costs),/does not transfer/);
  assert.deepEqual(plan,original);
  assert.equal(withActionCosts(world,changed,"operate",[]).actions[1].costs,undefined);
});

test("cost preview states exact spending, remains pure, and reports a refill unlocking the real operation",()=>{
  const world=fixture();world.interactions=withActionCosts(world,world.interactions!,"operate",[{entityId:"control",amount:2},{entityId:"water",amount:0.123456789}]);
  const action=world.interactions.actions[1], initial=emptyPlayState(), before=JSON.stringify([world,initial]);
  const blocked=previewInteraction(world,initial,action);
  assert.equal(blocked.available,false); assert.match(blocked.reason!,/Not enough left in Control/);
  assert.match(blocked.consequence,/^Spends 2 from Control; 0\.123456789 from Water tank\. Opens Gate\./);
  assert.equal(JSON.stringify([world,initial]),before);
  const held=reduceInteraction(world,initial,{type:"pickup",entityId:"supply"}).state;
  const charged=reduceInteraction(world,held,{type:"perform",actionId:"charge"});assert.equal(charged.ok,true,charged.reason);
  assert.equal(interactionOutcomeMessage(world,held,charged.state,world.interactions.actions[0]),"Unlocked: Open gate");
  assert.equal(previewInteraction(world,charged.state,action).available,true);
  const operated=reduceInteraction(world,charged.state,{type:"perform",actionId:action.id});assert.equal(operated.ok,true,operated.reason);
  assert.equal(operated.state.interactions!.quantities.control,0);
  assert.ok(Math.abs(operated.state.interactions!.quantities.water-0.876543211)<1e-10);
});


test("canvas spending keeps normal costs exact and explicitly counts long-list omissions",()=>{
  const short="Spends 1 from Battery; 2 from Tank. Opens Gate.";
  assert.equal(canvasCostSummary([{amount:1,name:"Battery"},{amount:2,name:"Tank"}],short,"Opens Gate.",false),short);
  const costs=Array.from({length:8},(_,i)=>({amount:i+1,name:`Supply ${i+1} with a very long creator label`}));
  const summary=canvasCostSummary(costs,"Spends "+costs.map(c=>`${c.amount} from ${c.name}`).join("; ")+". Opens Gate.","Opens Gate.",true);
  assert.ok(summary.length<=160,summary);
  assert.match(summary,/Spends 1 from Supply 1/);
  assert.match(summary,/\+[67] supplies/);
  assert.match(summary,/Opens Gate\./);
  assert.match(summary,/Other options close\./);
  assert.match(summary,/Details in Object controls\./);
});

test("full DOM preview retains every source while the canvas summary stays bounded",()=>{
  const world=fixture();const action=world.interactions!.actions[1];
  action.costs=[];
  for(let i=0;i<8;i++) {
    const id=`extra-${i}`,name=`Long source label number ${i} that remains complete in Object controls`;
    world.entities.push({id,kind:"decoration",label:name,x:10+i*70,y:500,width:60,height:60});
    world.interactions!.objects.push({entityId:id,resource:{type:"energy",capacity:10,initial:10}});
    action.costs.push({entityId:id,amount:i+1});
  }
  const preview=previewInteraction(world,emptyPlayState(),action);
  for(let i=0;i<8;i++)assert.ok(preview.consequence.includes(`${i+1} from Long source label number ${i} that remains complete in Object controls`));
  assert.ok(preview.canvasConsequence!.length<=160);
  assert.match(preview.canvasConsequence!,/supplies/);
  assert.match(preview.canvasConsequence!,/Opens Gate/);
});


test("full details retain long outcome names with and without costs",()=>{
  const world=fixture(), action=world.interactions!.actions[1];
  const name="Far garden gate with a distinct final identifying label";
  world.entities.find(entity=>entity.id==="gate")!.label=name;
  for(const costs of [undefined,[{entityId:"water",amount:0.5}]]) {
    action.costs=costs;
    const preview=previewInteraction(world,emptyPlayState(),action);
    assert.ok(preview.consequence.includes(`Opens ${name}.`));
    const canvas=preview.canvasConsequence ?? preview.consequence;
    assert.ok(canvas.length<=160);
    assert.match(canvas,/Opens Far garden gate/);
  }
});
