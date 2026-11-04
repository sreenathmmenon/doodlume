import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareSourceInteractionReview } from "./creative-adaptation.js";
import { interpretDrawing } from "./interpret.js";
import { modelConnection } from "./provider.js";
import { imageData } from "./images.js";
import { interactionEffects, reduceInteraction } from "../shared/interactions.js";
import { emptyPlayState, goalProgress } from "../shared/world.js";

const connection = modelConnection({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "synthetic-test-only" });
async function compile(options: { prefix?: string; amount?: number; initial?: number; required?: string[]; targetId?: string; carryable?: boolean; move?:boolean; resourceGoal?:boolean; requiresResource?:"source"|"target"; placement?:"place"|"use"; edgePlacement?:boolean } = {}) {
  const prefix = options.prefix ?? "fixture";
  const source = `${prefix}-source`, target = `${prefix}-target`;
  const image = imageData(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="#eee"/><path d="M100 100h100v100H100z" fill="#54a"/><circle cx="700" cy="350" r="60" fill="#7a5"/></svg>')).png().toBuffer());
  const value = {
    name: "Synthetic source interaction", description: "Protocol fixture, not live model evidence.", theme: "grove", clarification: "",
    objects: [
      { id: source, kind: "decoration", label: "Supply", targetId: null, bounds: { left: 100, top: 160, right: 200, bottom: 340 } },
      ...(options.move ? [{id:"dock",kind:"decoration",label:"Dock",targetId:null,bounds:{left:800,top:100,right:950,bottom:400}}] : []),
      { id: target, kind: "decoration", label: "Recipient", targetId: null, bounds: options.edgePlacement ? { left: 980, top: 480, right: 1000, bottom: 690 } : { left: 640, top: 480, right: 760, bottom: 690 } },
    ],
    goalRules: { requiredCollectedIds: [], requiredActivatedIds: [] },
    gameplay: {
      mode: "creative", movement: "discover", reason: "Use source objects in place.", avatarId: null,
      objective: "explore", objectiveLabel: options.resourceGoal ? "" : "Restore the supply", destinationLabel: options.resourceGoal ? "" : "Task complete", objectiveTitle: "Help the recipient",
      instructions: "Pick up the supply, then select the recipient.", clues: [], obstacleIds: [],
      path: [{ x: 100, y: 160, label: "Supply" }, { x: 500, y: 400, label: "Workspace" }, { x: 700, y: 600, label: "Recipient" }],
      requiredInteractionIds: options.required ?? (options.resourceGoal ? [] : ["supply"]),
      requiredResourceIds: options.resourceGoal ? [target] : [],
      interactions: { version: 1,
        objects: [{ entityId: source, carryable: options.carryable ?? true, resource: { type: "water", initial: options.initial ?? 3, capacity: 3 } }, { entityId: target, carryable: false, resource: { type: "water", initial: 0, capacity: options.resourceGoal ? 2 : 5 } }],
        actions: [{ id: "supply", label: "Fill the recipient", toolId: source, targetId: options.targetId ?? target, kind: options.placement ?? "transfer", ...(options.placement ? {} : {amount: options.amount ?? 2}), requires: [], ...(options.requiresResource ? {requiresResourceIds:[options.requiresResource === "source" ? source : target]} : {}), effects: options.placement ? [{kind:"moveObject",entityId:source,destinationId:target,durationMs:900}] : options.move ? [{kind:"moveObject",entityId:target,destinationId:"dock",durationMs:900}] : [] }],
      },
    },
  };
  return interpretDrawing(image, "Pick up the supply and fill the recipient.", connection, new AbortController().signal,
    { enabled: false, apiKey: "" }, async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] })), "picture");
}

test("source interaction compilation preserves distinct input IDs and geometry without creating collection tokens", async () => {
  for (const prefix of ["garden", "workbench"]) {
    const world = await compile({ prefix });
    assert.equal(world.gameplay?.movement, "discover");
    assert.deepEqual(world.gameplay?.clues, []);
    assert.equal(world.entities.filter(e => e.kind !== "decoration").length, 0);
    assert.deepEqual(world.goalRules?.requiredInteractionIds, ["supply"]);
    const source = world.entities.find(e => e.id === `${prefix}-source`)!;
    assert.deepEqual(source.artSource, { x: 100, y: 160, width: 100, height: 180 });
    assert.match(source.art!, /^data:image\/png;base64,/);
    assert.deepEqual(source.sourceLayer, { x: source.x, y: source.y, width: source.width, height: source.height });
    assert.notEqual(world.entities[0].art, world.sourceImage, "movable source pixels must leave the playable backdrop");
    assert.equal(world.entities.find(e => e.id === `${prefix}-target`)?.art, undefined, "stationary receivers retain their original backdrop pixels");
    const picked = reduceInteraction(world, emptyPlayState(), { type: "pickup", entityId: `${prefix}-source` });
    assert.equal(picked.ok, true);
    const applied = reduceInteraction(world, picked.state, { type: "perform", actionId: "supply" });
    assert.equal(applied.ok, true);
    assert.equal(applied.state.interactions?.quantities[`${prefix}-source`], 1);
    assert.equal(applied.state.interactions?.quantities[`${prefix}-target`], 2);
    assert.equal(goalProgress(world, applied.state).ready, true);
    assert.deepEqual(goalProgress(world, applied.state).missingInteractionIds, []);
  }
});

test("source planning rejects absent target instead of generating a substitute", async () => {
  await assert.rejects(compile({ targetId: "invented-source" }), /lost its original source object/);
});

test("source planning rejects an impossible required transfer before exposing the world", async () => {
  await assert.rejects(compile({ amount: 4 }), /usable amount|cannot be completed/);
  await assert.rejects(compile({ initial: 1, amount: 2 }), /cannot be completed/);
});

test("source planning rejects unmatched requirements and unusable tools", async () => {
  await assert.rejects(compile({ required: ["invented-action"] }), /finishing action/);
  await assert.rejects(compile({ carryable: false }), /carried source/);
});


test("model destination moves compile from source geometry and prepare actual moving artwork", async () => {
  const world=await compile({move:true});
  const target=world.entities.find(e=>e.id==='fixture-target')!,dock=world.entities.find(e=>e.id==='dock')!;
  const effect=world.interactions!.actions[0].effects![0];
  assert.equal(effect.kind,'moveObject');
  if(effect.kind!=='moveObject') throw new Error('Expected movement');
  assert.equal(effect.x,dock.x+(dock.width-target.width)/2);
  assert.equal(effect.y,dock.y+(dock.height-target.height)/2);
  assert.equal('destinationId' in effect,false);
  assert.ok(target.art && target.sourceLayer);
  assert.equal(dock.art,undefined,'The destination remains original stationary scenery');
});


test("model resource goals survive compilation and depend on the actual receiver quantity",async()=>{
  const world=await compile({resourceGoal:true});
  assert.deepEqual(world.goalRules?.requiredResourceIds,['fixture-target']);
  assert.equal(goalProgress(world,emptyPlayState()).ready,false);
  const picked=reduceInteraction(world,emptyPlayState(),{type:'pickup',entityId:'fixture-source'});
  const filled=reduceInteraction(world,picked.state,{type:'perform',actionId:'supply'});
  assert.equal(filled.ok,true); assert.equal(goalProgress(world,filled.state).ready,true);
});


test("source review re-extracts edited bounds while preserving the existing resource game",async()=>{
  const draft=await compile({resourceGoal:true});
  const supply=draft.entities.find(entity=>entity.id==='fixture-source')!;
  supply.artSource={x:110,y:170,width:110,height:190};
  const rebuilt=await prepareSourceInteractionReview(draft,{enabled:false,apiKey:""},new AbortController().signal);
  assert.deepEqual(rebuilt.interactions,draft.interactions);
  assert.deepEqual(rebuilt.goalRules?.requiredResourceIds,draft.goalRules?.requiredResourceIds);
  assert.deepEqual(rebuilt.entities.find(e=>e.id===supply.id)?.artSource,supply.artSource);
  assert.ok(rebuilt.entities.find(e=>e.id===supply.id)?.sourceLayer);
  assert.equal(rebuilt.gameplay?.movement,'discover');
  assert.equal(rebuilt.id,draft.id); assert.equal(rebuilt.revision,draft.revision);
});


test("model resource prerequisites survive compilation and reject impossible filled-target dependencies",async()=>{
  const world=await compile({requiresResource:"source"});
  assert.deepEqual(world.interactions?.actions[0].requiresResourceIds,["fixture-source"]);
  const picked=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"fixture-source"});
  assert.equal(reduceInteraction(world,picked.state,{type:"perform",actionId:"supply"}).ok,true);
  await assert.rejects(compile({requiresResource:"target"}),/cannot be completed/);
});


test("model placement compiles real source objects, releases the object and earns the mission through its actual move", async () => {
  const world = await compile({ placement: "place" });
  const source = world.entities.find(entity => entity.id === "fixture-source")!;
  const target = world.entities.find(entity => entity.id === "fixture-target")!;
  assert.ok(source.art && source.sourceLayer, "The carried source artwork is prepared independently");
  const picked = reduceInteraction(world, emptyPlayState(), { type: "pickup", entityId: source.id });
  const placed = reduceInteraction(world, picked.state, { type: "perform", actionId: "supply" });
  assert.equal(placed.ok, true);
  assert.equal(placed.state.interactions?.heldEntityId, null);
  assert.equal(placed.state.interactions?.attachments[source.id], undefined);
  const move = interactionEffects(world, placed.state).objectMoves[source.id];
  assert.equal(move.x, target.x + (target.width - source.width) / 2);
  assert.equal(move.y, target.y + (target.height - source.height) / 2);
  assert.equal(goalProgress(world, placed.state).ready, true);
  assert.equal(reduceInteraction(world, placed.state, { type: "pickup", entityId: source.id }).ok, true);
});

test("self-movement returned as use is rejected rather than silently rewritten as placement", async () => {
  await assert.rejects(compile({ placement: "use" }), /moving object|placement|stationary source|carried/);
});


test("edge placement names the conflicting source selections without clipping or shrinking artwork", async () => {
  await assert.rejects(compile({ placement: "place", edgePlacement: true }), /Supply cannot fit at the center of Recipient.*more central visible destination.*not been resized/);
});
