import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sourcePlatformScene } from "./source-platform-scene.js";
import type { GameplayPlan, SourceSelection } from "./creative-adaptation.js";
import { validateWorld } from "../shared/world.js";

const object = (id: string, kind: SourceSelection["kind"], x: number, y: number, width: number, height: number): SourceSelection => ({id, kind, label: id, x, y, width, height});
test("source platform action preflight preserves independent artwork and rejects impossible resource prerequisites", async () => {
  const source = await sharp({create: {width: 1000, height: 600, channels: 3, background: "#fff8ee"}}).png().toBuffer();
  const objects = [object("hero", "player", 180, 480, 60, 100), object("left", "terrain", 100, 600, 300, 150),
    object("right", "terrain", 450, 550, 400, 200), object("supply", "decoration", 110, 540, 35, 55),
    object("target", "decoration", 320, 540, 35, 55), object("part", "decoration", 270, 540, 35, 55),
    object("barrier", "gate", 700, 450, 30, 100), object("finish", "goal", 780, 450, 35, 55)];
  const plan: GameplayPlan = {mode: "source-layout", movement: "platform", avatarId: "hero", objective: "explore", reason: "Source surfaces", objectiveLabel: "Open", objectiveTitle: "Prepare and open", instructions: "Use your objects to open the way.", destinationLabel: "Finish", obstacleIds: [], clues: [], path: [{x:200,y:600,label:"Left"},{x:500,y:550,label:"Right"},{x:780,y:550,label:"Finish"}],
    requiredInteractionIds: ["fill", "fit"], interactions: {version: 1, objects: [
      {entityId:"supply",carryable:true,resource:{type:"charge",capacity:4,initial:4}},
      {entityId:"target",resource:{type:"charge",capacity:4,initial:0}}, {entityId:"part",carryable:true},
    ], actions:[
      {id:"fill",kind:"transfer",label:"Charge",toolId:"supply",targetId:"target",amount:4},
      {id:"fit",kind:"attach",label:"Fit",toolId:"part",targetId:"target",requires:["fill"],effects:[{kind:"openGate",entityId:"barrier"}]},
    ]}};
  let reason = "";
  const compile = (plan: GameplayPlan, sceneObjects = objects) => sourcePlatformScene({source,inputKind:"drawing",name:"Test",description:"Test",theme:"grove",objects:sceneObjects,plan,
    segmentation:{enabled:false,apiKey:""},signal:new AbortController().signal,transport:fetch,
    requested:{requiredCollectedIds:[],requiredActivatedIds:[]},finishRules:(_entities,defaults)=>defaults,onReject:message=>{reason=message;}});
  const result = await compile(plan);
  assert.ok(result, reason);
  validateWorld(result);
  assert.deepEqual(result.goalRules!.requiredInteractionIds,["fill","fit"]);
  const part = result.entities.find(e=>e.id==="part")!;
  assert.ok(part.art && part.artSource && part.sourceLayer, "The actual source part is a separate movable layer");
  assert.equal(result.entities.filter(e=>e.id==="part").length,1);
  const continuous = objects.filter(object => object.id !== "right").map(object => object.id === "left" ? {...object, width: 750} : object);
  assert.ok(await compile(plan, continuous), `A continuous surface remains playable: ${reason}`);
  // Geometry from the failed real interpretation: a background counter line
  // crosses the actor even though its near-foot matchbox supports its pose.
  const falseHorizon = objects.map(object => object.id === "hero" ? {...object, x:42,y:500,width:96,height:175}
    : object.id === "left" ? {...object,x:0,y:562,width:1000,height:45}
    : object.id === "right" ? {...object,x:9,y:675,width:155,height:23} : object);
  assert.equal(await compile(plan, falseHorizon), null);
  assert.match(reason, /ledge crosses the character's body.*foreground support/);
  const imperfectFeet = continuous.map(object => object.id === "hero" ? {...object,y:500,height:110} : object);
  assert.ok(await compile(plan, imperfectFeet), `Small foot overlap remains accepted: ${reason}`);
  const choicePlan = structuredClone(plan);
  choicePlan.requiredInteractionIds = ["fill"];
  choicePlan.requiredChoiceGroupIds = ["assembly"];
  choicePlan.interactions!.actions.push({...structuredClone(choicePlan.interactions!.actions[1]), id:"fit-fast",
    effects:[{kind:"openGate",entityId:"barrier"},{kind:"moveSpeedBoost",multiplier:1.1}]});
  choicePlan.interactions!.choiceGroups = [{id:"assembly",label:"Choose an assembly",actionIds:["fit","fit-fast"]}];
  const separatedGate = objects.map(object=>object.id==="barrier" ? {...object,x:410,y:0,width:30,height:1000} : object);
  const safeChoices = await compile(choicePlan, separatedGate);
  assert.ok(safeChoices, reason);
  assert.deepEqual(safeChoices.goalRules?.requiredChoiceGroupIds, ["assembly"]);
  assert.ok(await compile(choicePlan, continuous), `Both gate-opening choices work on one continuous support: ${reason}`);
  const jumpChoices = structuredClone(choicePlan);
  jumpChoices.interactions!.actions.find(action=>action.id==="fit-fast")!.effects = [{kind:"jumpBoost",multiplier:1.6}];
  const continuousBarrier = continuous.map(object=>object.id==="barrier" ? {...object,x:550,y:380,width:30,height:220} : object);
  const openOrJump = await compile(jumpChoices, continuousBarrier);
  assert.ok(openOrJump, `Opening the passage or jumping over the closed gate both finish: ${reason}`);
  assert.deepEqual(openOrJump.entities.find(entity=>entity.id==="barrier")?.artSource, {x:550,y:380,width:30,height:220}, "Proof-only splitting keeps the source gate unchanged");
  jumpChoices.interactions!.actions.find(action=>action.id==="fit-fast")!.effects = [{kind:"jumpBoost",multiplier:1.05}];
  assert.equal(await compile(jumpChoices, continuousBarrier), null, "An insufficient boost must not walk through the same-support gate");
  assert.match(reason,/choice|route/);
  for (const reverse of [false, true]) {
    const blockedChoice = structuredClone(choicePlan);
    blockedChoice.interactions!.actions.find(action=>action.id==="fit-fast")!.effects = [{kind:"moveSpeedBoost",multiplier:1.1}];
    if (reverse) blockedChoice.interactions!.actions.reverse();
    const blockedObjects = objects.map(object=>object.id==="barrier" ? {...object,x:410,y:0,width:30,height:1000} : object);
    assert.equal(await compile(blockedChoice, blockedObjects), null, "A successful sibling cannot hide a locked route");
    assert.match(reason,/choice|route|connections/);
  }
  const impossible = structuredClone(plan);
  impossible.interactions!.objects[0].resource!.initial=0;
  assert.equal(await compile(impossible),null);
  assert.match(reason,/cannot be completed/);
});
