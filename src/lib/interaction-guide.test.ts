import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlayState, validateWorld } from "../../shared/world";
import { reduceInteraction, type InteractionCommand } from "../../shared/interactions";
import { nextInteractionHint, interactionResourceChanges } from "./interaction-guide";

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

test("retryable losing allocations show actual shortfall only when a hint is requested",()=>{
  const world=fixture();world.interactions!.completionPolicy="retryable";
  const held=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"pitcher"}).state;
  const result=reduceInteraction(world,held,{type:"perform",actionId:"waste-water"});
  assert.equal(result.ok,true,result.reason);
  const before=JSON.stringify(result.state),hint=nextInteractionHint(world,result.state);
  assert.equal(hint?.recovery,true);
  assert.equal(hint?.entityId,"plant");
  assert.match(hint!.text,/Fern still needs 2 more/);
  assert.match(hint!.text,/Revisit your last choice or restart/);
  assert.equal(JSON.stringify(result.state),before);
});

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
  const canvas=preview.canvasConsequence ?? preview.consequence;
  const canvasDetail=canvas.length>160?`${canvas.slice(0,157)}…`:canvas;
  assert.ok(preview.consequence.includes(first));
  assert.ok(preview.consequence.includes(second));
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

test("stationary-source hints say Select, inspect the active source, and allow switching while carrying", async () => {
  const {inspectInteractionTarget, incompatibleTargetReason} = await import("../../shared/interaction-preview");
  const {selectInteractionSourceCommand, activeInteractionSource} = await import("../../shared/interactions");
  const world = fixture();
  const source = world.interactions!.objects.find(object => object.entityId === "pitcher")!;
  delete source.carryable; source.usableInPlace = true;
  validateWorld(world);
  const initial = emptyPlayState(), before = JSON.stringify(initial);
  assert.match(nextInteractionHint(world, initial)!.text, /^Select Jug to fill the cup/);
  assert.equal(JSON.stringify(initial), before);
  const carried = reduceInteraction(world, initial, {type:"pickup",entityId:"cup"});
  assert.equal(carried.ok, true, carried.reason);
  assert.equal(incompatibleTargetReason(world, carried.state, "pitcher"), undefined);
  const selected = reduceInteraction(world, carried.state, selectInteractionSourceCommand(world, "pitcher"));
  assert.equal(selected.ok, true, selected.reason);
  assert.equal(activeInteractionSource(selected.state.interactions!), "pitcher");
  assert.equal(selected.state.interactions!.heldEntityId, null);
  assert.deepEqual(nextInteractionHint(world, selected.state), {entityId:"cup",text:"Fill the cup · Cup"});
  const actions = inspectInteractionTarget(world, selected.state, "cup");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, "refill");
  assert.equal(actions[0].available, true);
  assert.match(incompatibleTargetReason(world, selected.state, "plant")!, /Jug has no action with Fern/);
});

test("stationary-source outcome probes discover refilled sources without changing selection or saved state", async () => {
  const {interactionOutcomeMessage} = await import("../../shared/interaction-preview");
  const {selectInteractionSourceCommand} = await import("../../shared/interactions");
  const world = fixture();
  for (const id of ["pitcher", "cup"]) {
    const source = world.interactions!.objects.find(object => object.entityId === id)!;
    delete source.carryable; source.usableInPlace = true;
  }
  validateWorld(world);
  const before = reduceInteraction(world, emptyPlayState(), selectInteractionSourceCommand(world, "pitcher")).state;
  const action = world.interactions!.actions.find(action => action.id === "refill")!;
  const result = reduceInteraction(world, before, {type:"perform",actionId:action.id});
  assert.equal(result.ok, true, result.reason);
  const snapshot = JSON.stringify([world,before,result.state]);
  assert.equal(interactionOutcomeMessage(world, before, result.state, action), "Unlocked: Water the fern");
  assert.match(nextInteractionHint(world, result.state)!.text, /^Select Cup to water the fern/);
  assert.equal(JSON.stringify([world,before,result.state]), snapshot);
});

test("direct controls reveal preparation, become usable without pickup, and preserve real selection", async () => {
  const {inspectInteractionTarget,incompatibleTargetReason,interactionOutcomeMessage} = await import("../../shared/interaction-preview");
  const world=fixture();
  world.interactions!.objects.find(object=>object.entityId==="cup")!.carryable=false;
  world.entities.find(entity=>entity.id==="cup")!.label="Pump control";
  world.entities.find(entity=>entity.id==="plant")!.art="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  world.interactions!.actions=world.interactions!.actions.filter(action=>action.id==="refill");
  world.interactions!.actions.push({id:"start",kind:"operate",label:"Start the pump",toolId:"cup",targetId:"cup",requiresResourceIds:["cup"],effects:[{kind:"moveObject",entityId:"plant",x:650,y:200,durationMs:900}]});
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["start"]};
  validateWorld(world);
  const initial=emptyPlayState(), blocked=inspectInteractionTarget(world,initial,"cup");
  assert.equal(blocked.length,1); assert.equal(blocked[0].available,false);assert.match(blocked[0].reason!,/Fill Pump control first/);
  assert.match(nextInteractionHint(world,initial)!.text,/Take Jug/);
  const held=reduceInteraction(world,initial,{type:"pickup",entityId:"pitcher"}).state;
  const refill=world.interactions!.actions[0], result=reduceInteraction(world,held,{type:"perform",actionId:refill.id});
  assert.equal(result.ok,true,result.reason);
  const snapshot=JSON.stringify([world,held,result.state]);
  assert.equal(interactionOutcomeMessage(world,held,result.state,refill),"Unlocked: Start the pump");
  assert.equal(incompatibleTargetReason(world,result.state,"cup"),undefined);
  const preview=inspectInteractionTarget(world,result.state,"cup");
  assert.deepEqual(preview.map(action=>action.id),["start"]);assert.equal(preview[0].available,true);
  assert.deepEqual(nextInteractionHint(world,result.state),{entityId:"cup",text:"Start the pump · Pump control"});
  assert.equal(JSON.stringify([world,held,result.state]),snapshot);
  const noHands=reduceInteraction(world,result.state,{type:"drop"}).state;
  assert.equal(inspectInteractionTarget(world,noHands,"cup")[0].available,true);
  const operated=reduceInteraction(world,noHands,{type:"perform",actionId:"start"});
  assert.equal(operated.ok,true,operated.reason);
  assert.deepEqual(inspectInteractionTarget(world,operated.state,"cup"),[]);
  assert.match(incompatibleTargetReason(world,operated.state,"cup")!,/already been completed/);
});

test("source selection skips spent or excluded abilities but preserves future refill uses",async()=>{
  const {canSelectInteractionSource}=await import("../../shared/interaction-preview");
  const world=fixture();
  assert.equal(canSelectInteractionSource(world,emptyPlayState(),"pitcher"),true);
  assert.equal(canSelectInteractionSource(world,emptyPlayState(),"cup"),true,"An empty source can be filled before its later use.");
  world.interactions!.choiceGroups=[{id:"allocation",label:"Choose delivery",actionIds:["waste-water","refill"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["allocation"]};
  validateWorld(world);
  const held=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"pitcher"}).state;
  const filled=reduceInteraction(world,held,{type:"perform",actionId:"refill"}).state;
  const dropped=reduceInteraction(world,filled,{type:"drop"}).state;
  assert.equal(canSelectInteractionSource(world,dropped,"pitcher"),false,"Both completed and closed sibling uses are spent.");
  assert.equal(canSelectInteractionSource(world,dropped,"cup"),true);
});

function preparedRouteFixture(resourceOnly = false) {
  const world=fixture();
  world.gameplay!.movement="platform";
  world.entities.push({id:"floor",kind:"terrain",x:0,y:700,width:1440,height:120},{id:"hero",kind:"player",label:"Robot",x:20,y:20,width:30,height:30}, {id:"gate",kind:"gate",label:"Gate",x:700,y:100,width:60,height:150});
  world.entities.find(entity=>entity.id==="pitcher")!.label="Battery";
  world.entities.find(entity=>entity.id==="cup")!.label="Button";
  world.entities.find(entity=>entity.id==="plant")!.label="Spring";
  world.interactions!.objects.find(object=>object.entityId==="cup")!.carryable=false;
  world.interactions!.objects.find(object=>object.entityId==="plant")!.carryable=true;
  world.interactions!.objects.push({entityId:"hero"});
  world.interactions!.actions=[
    {id:"charge",kind:"transfer",label:"Charge the button",toolId:"pitcher",targetId:"cup",amount:2},
    {id:"operate-gate",kind:"operate",label:"Press button to open gate",toolId:"cup",targetId:"cup",...(resourceOnly ? {requiresResourceIds:["cup"]} : {requires:["charge"]}),effects:[{kind:"openGate",entityId:"gate"}]},
    {id:"fit-spring",kind:"attach",label:"Fit spring to jump higher",toolId:"plant",targetId:"hero",effects:[{kind:"jumpBoost",multiplier:1.5}]},
  ];
  world.interactions!.choiceGroups=[{id:"route",label:"Choose a way through",actionIds:["operate-gate","fit-spring"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["route"]};
  return validateWorld(world);
}

test("requested hints show prepared and immediate routes before suggesting one route's preparation",()=>{
  for(const resourceOnly of [false,true]) {
    const world=preparedRouteFixture(resourceOnly), initial=emptyPlayState();
    const before=JSON.stringify([world,initial]);
    const hint=nextInteractionHint(world,initial);
    assert.match(hint!.text,/^Choose: Press button to open gate \(first: Charge the button\) or Fit spring to jump higher/);
    assert.equal(JSON.stringify([world,initial]),before,"A choice hint neither performs preparation nor changes the chosen route.");
    const held=reduceInteraction(world,initial,{type:"pickup",entityId:"pitcher"}).state;
    const charged=reduceInteraction(world,held,{type:"perform",actionId:"charge"});
    assert.equal(charged.ok,true,charged.reason);
    const ready=nextInteractionHint(world,charged.state)!;
    assert.match(ready.text,/^Choose: Press button to open gate or Fit spring to jump higher/);
    assert.doesNotMatch(ready.text,/first:|prepare first/);
  }
});

test("route hints honor a fixed manual branch, committed choices, and individually impossible outcomes",()=>{
  const world=preparedRouteFixture(), initial=emptyPlayState();
  const fixed=structuredClone(world);fixed.goalRules!.requiredInteractionIds=["operate-gate"];validateWorld(fixed);
  const forced=nextInteractionHint(fixed,initial)!;
  assert.match(forced.text,/Take Battery to charge the button/);
  assert.doesNotMatch(forced.text,/^Choose:|Fit spring/);
  const held=reduceInteraction(world,initial,{type:"pickup",entityId:"plant"}).state;
  const chosen=reduceInteraction(world,held,{type:"perform",actionId:"fit-spring"});
  assert.equal(chosen.ok,true,chosen.reason);
  assert.doesNotMatch(nextInteractionHint(world,chosen.state)?.text ?? "",/^Choose:|Charge|button|Battery/);
  const unavailable=preparedRouteFixture(true);
  unavailable.interactions!.objects.find(object=>object.entityId==="cup")!.resource!.capacity=3;
  validateWorld(unavailable); // The OR goal remains solvable through the spring.
  const hint=nextInteractionHint(unavailable,initial)!;
  assert.doesNotMatch(hint.text,/^Choose:|Press button/);
  assert.match(hint.text,/Fit spring|fit spring/);
});

test("replay invitation requires a completed required choice with a feasible different branch", async () => {
  const {hasAlternativeInteractionRoute}=await import("./interaction-replay");
  const world=fixture();
  world.interactions!.choiceGroups=[{id:"route",label:"Route",actionIds:["refill","waste-water"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["route"]};
  let state=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"pitcher"}).state;
  state=reduceInteraction(world,state,{type:"perform",actionId:"refill"}).state;
  assert.equal(hasAlternativeInteractionRoute(world,state),false);
  state={...state,completed:true};
  const before=JSON.stringify({world,state});
  assert.equal(hasAlternativeInteractionRoute(world,state),true);
  assert.equal(JSON.stringify({world,state}),before);
  assert.equal(hasAlternativeInteractionRoute(world,{...state,exploring:true}),false);
  world.goalRules.requiredInteractionIds=["refill"];
  assert.equal(hasAlternativeInteractionRoute(world,state),false,"Fixed route excludes the nominal alternative.");
  world.goalRules.requiredInteractionIds=[];
  world.goalRules.requiredChoiceGroupIds=[];
  assert.equal(hasAlternativeInteractionRoute(world,state),false,"An incidental choice is not advertised as another route.");
});

test("a completed controller can still be selected for its remaining resource use with empty hands",async()=>{
  const {canSelectInteractionSource,incompatibleTargetReason}=await import("../../shared/interaction-preview");
  const world=fixture();
  const control=world.interactions!.objects.find(object=>object.entityId==="pitcher")!;
  control.carryable=false;control.usableInPlace=true;
  world.entities.find(entity=>entity.id==="plant")!.art="/art/test.png";
  world.interactions!.actions.unshift({id:"position",kind:"operate",label:"Position the fern",toolId:"pitcher",targetId:"pitcher",effects:[{kind:"moveObject",entityId:"plant",x:450,y:100}]});
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["position","refill"]};
  validateWorld(world);
  const operated=reduceInteraction(world,emptyPlayState(),{type:"perform",actionId:"position"});
  assert.equal(operated.ok,true,operated.reason);
  assert.equal(canSelectInteractionSource(world,operated.state,"pitcher"),true);
  assert.equal(incompatibleTargetReason(world,operated.state,"pitcher"),undefined);
  const selected=reduceInteraction(world,operated.state,{type:"selectSource",entityId:"pitcher"});
  assert.equal(selected.ok,true,selected.reason);
  assert.equal(reduceInteraction(world,selected.state,{type:"perform",actionId:"refill"}).ok,true);
});

test("paid route hints expose refill preparation without choosing an alternative for the player",()=>{
  const world=preparedRouteFixture();
  const gate=world.interactions!.actions.find(action=>action.id==="operate-gate")!;
  gate.requires=[];gate.requiresResourceIds=[];gate.costs=[{entityId:"cup",amount:2}];
  validateWorld(world);
  const initial=emptyPlayState(),before=JSON.stringify([world,initial]);
  assert.match(nextInteractionHint(world,initial)!.text,/^Choose: Press button to open gate \(first: Charge the button\) or Fit spring/);
  const held=reduceInteraction(world,initial,{type:"pickup",entityId:"pitcher"}).state;
  const charged=reduceInteraction(world,held,{type:"perform",actionId:"charge"}).state;
  assert.match(nextInteractionHint(world,charged)!.text,/^Choose: Press button to open gate or Fit spring/);
  assert.equal(JSON.stringify([world,initial]),before);
});

test("blocked paid actions disclose their exact known price without predicting effects or spending",async()=>{
  const {previewInteraction}=await import("../../shared/interaction-preview");
  const world=preparedRouteFixture();
  const action=world.interactions!.actions.find(action=>action.id==="operate-gate")!;
  action.requires=["charge"]; action.requiresResourceIds=[]; action.costs=[{entityId:"cup",amount:2}];
  const initial=emptyPlayState(),before=JSON.stringify([world,initial]);
  const blocked=previewInteraction(world,initial,action);
  assert.equal(blocked.available,false);
  assert.match(blocked.reason!,/^First: Charge the button/);
  assert.equal(blocked.costDescription,"Spends 2 from Button.");
  assert.doesNotMatch(blocked.costDescription!,/Opens|Moves|Jump|Speed/);
  action.requires=[]; action.requiresResourceIds=[];
  const insufficient=previewInteraction(world,initial,action);
  assert.equal(insufficient.available,false);
  assert.match(insufficient.reason!,/Not enough left in Button/);
  assert.equal(insufficient.costDescription,blocked.costDescription);
  action.requires=["charge"];
  // Only the intentional test setup changed; neither preview touched progress.
  assert.equal(JSON.stringify(initial),JSON.stringify(emptyPlayState()));
  assert.equal(JSON.stringify([world,initial]),before);
});

test("hints find spending that frees capacity for a required refill and later paid operation",()=>{
  const world=preparedRouteFixture();
  world.interactions!.choiceGroups=[];
  world.interactions!.objects.find(object=>object.entityId==="cup")!.resource!.initial=2;
  world.interactions!.actions=world.interactions!.actions.filter(action=>action.id!=="fit-spring");
  const gate=world.interactions!.actions.find(action=>action.id==="operate-gate")!;
  gate.requires=[];gate.requiresResourceIds=["cup"];gate.costs=[{entityId:"cup",amount:2}];
  world.interactions!.actions.push({id:"finish",kind:"operate",label:"Power the return journey",toolId:"cup",targetId:"cup",requires:["charge"],costs:[{entityId:"cup",amount:2}],effects:[{kind:"moveSpeedBoost",multiplier:1.5}]});
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["finish"]};
  validateWorld(world);
  let state=emptyPlayState();
  assert.match(nextInteractionHint(world,state)!.text,/^Press button to open gate/);
  state=reduceInteraction(world,state,{type:"perform",actionId:"operate-gate"}).state;
  assert.match(nextInteractionHint(world,state)!.text,/Take Battery to charge the button/);
  state=reduceInteraction(world,state,{type:"pickup",entityId:"pitcher"}).state;
  state=reduceInteraction(world,state,{type:"perform",actionId:"charge"}).state;
  assert.match(nextInteractionHint(world,state)!.text,/^Power the return journey/);
});


test("quantity receipts reflect both real transfer ends and never mutate progress", () => {
  const world = fixture();
  const selected = reduceInteraction(world, emptyPlayState(), {type: "pickup", entityId: "pitcher"}).state;
  const after = reduceInteraction(world, selected, {type: "perform", actionId: "refill"});
  assert.equal(after.ok, true, after.reason);
  const snapshot = JSON.stringify([selected, after.state]);
  assert.deepEqual(interactionResourceChanges(world, selected, after.state), [
    {entityId: "pitcher", delta: -2}, {entityId: "cup", delta: 2},
  ]);
  assert.deepEqual(interactionResourceChanges(world, after.state, after.state), []);
  assert.equal(JSON.stringify([selected, after.state]), snapshot);
});

test("blocked actions and source selection never produce a quantity receipt", () => {
  const world = fixture(), initial = emptyPlayState();
  const selected = reduceInteraction(world, initial, {type: "pickup", entityId: "cup"}).state;
  assert.deepEqual(interactionResourceChanges(world, initial, selected), []);
  const blocked = reduceInteraction(world, selected, {type: "perform", actionId: "water"});
  assert.equal(blocked.ok, false);
  assert.deepEqual(interactionResourceChanges(world, selected, blocked.state), []);
});
