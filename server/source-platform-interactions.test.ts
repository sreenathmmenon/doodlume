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
  const impossible = structuredClone(plan);
  impossible.interactions!.objects[0].resource!.initial=0;
  assert.equal(await compile(impossible),null);
  assert.match(reason,/cannot be completed/);
});
