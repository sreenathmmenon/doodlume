import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlayState, goalProgress, retainPlayState, validateWorld, type PlayState, type WorldDefinition } from "./world.js";
import { availableInteractions, safeAvailableInteractions, playerAvailableInteractions, interactionCompletionStatus, interactionEffects, interactionState, reduceInteraction, validateInteractionChoiceOutcomes, type InteractionCommand } from "./interactions.js";
import { applyWorldPatch, undoWorldPatch } from "./revisions.js";
import { validSavedWorlds } from "../src/lib/library.js";
import { inspectInteractionTarget, previewInteraction, incompatibleTargetReason } from "./interaction-preview.js";

function world(): WorldDefinition {
  return validateWorld({
    id: "fixture", name: "Interaction fixture", description: "Test", theme: "grove", width: 1440, height: 820,
    source: "manual", sourceImage: "/art/test.png", revision: 1,
    gameplay: { movement: "roam", objectiveTitle: "Open the path", instructions: "Use what you find.", clues: [] },
    entities: [
      { id: "hero", kind: "player", x: 20, y: 20, width: 30, height: 30 },
      { id: "supply", kind: "decoration", x: 100, y: 100, width: 50, height: 50 },
      { id: "receiver", kind: "decoration", x: 300, y: 100, width: 50, height: 50 },
      { id: "part", kind: "decoration", x: 200, y: 100, width: 50, height: 50 },
      { id: "barrier", kind: "gate", x: 500, y: 100, width: 50, height: 100 },
    ],
    interactions: { version: 1, objects: [
      {entityId: "supply", carryable: true, resource: {type: "charge", capacity: 10, initial: 10}},
      {entityId: "receiver", resource: {type: "charge", capacity: 10, initial: 0}},
      {entityId: "part", carryable: true},
    ], actions: [
      {id: "fill", kind: "transfer", label: "Charge", toolId: "supply", targetId: "receiver", amount: 6},
      {id: "fit", kind: "attach", label: "Fit the part", toolId: "part", targetId: "receiver", requires: ["fill"], effects: [{kind: "openGate", entityId: "barrier"}]},
      {id: "extra", kind: "transfer", label: "Add more", toolId: "supply", targetId: "receiver", amount: 6},
    ]},
    goalRules: { requiredCollectedIds: [], requiredActivatedIds: [], requiredInteractionIds: ["fill", "fit"] },
  });
}
function step(w: WorldDefinition, s: PlayState, command: InteractionCommand) {
  const result = reduceInteraction(w, s, command);
  assert.equal(result.ok, true, result.reason);
  return result.state;
}
function filled(w: WorldDefinition) {
  return step(w, step(w, emptyPlayState(), {type: "pickup", entityId: "supply"}), {type: "perform", actionId: "fill"});
}

test("inspection predicts a transfer without spending supplies and explains unsafe allocation", () => {
  const w = world(), start = step(w, emptyPlayState(), {type: "pickup", entityId: "supply"});
  const original = structuredClone(start);
  const previews = inspectInteractionTarget(w, start, "receiver");
  assert.equal(previews.find(p => p.id === "fill")?.available, true);
  assert.match(previews.find(p => p.id === "fill")!.consequence, /0 → 6 \/ 10/);
  assert.match(previews.find(p => p.id === "fill")!.consequence, /One use/);
  assert.equal(previews.find(p => p.id === "extra")?.available, false);
  assert.match(previews.find(p => p.id === "extra")!.reason!, /block completion/);
  assert.deepEqual(start, original);
  const after = step(w, start, {type: "perform", actionId: "fill"});
  assert.equal(after.interactions!.quantities.receiver, 6);
  assert.equal(inspectInteractionTarget(w, after, "receiver").some(p => p.id === "fill"), false, "Completed one-time actions must not block picking up their now-ready receiver.");
  assert.equal(previewInteraction(w, after, w.interactions!.actions[0]).available, false);
});

test("a used transfer explains its one-use limit without implying every action on the pair is spent", () => {
  const w=world();
  w.goalRules!.requiredInteractionIds=[];
  w.interactions!.actions=[{id:"small",kind:"transfer",label:"Pour two",toolId:"supply",targetId:"receiver",amount:2}];
  validateWorld(w);
  const before=step(w,emptyPlayState(),{type:"pickup",entityId:"supply"});
  const after=step(w,before,{type:"perform",actionId:"small"});
  assert.equal(after.interactions!.quantities.supply,8);
  assert.equal(after.interactions!.quantities.receiver,2);
  assert.deepEqual(inspectInteractionTarget(w,after,"receiver"),[]);
  assert.equal(incompatibleTargetReason(w,after,"receiver"),"This action has already been used. Choose another target.");
  w.interactions!.actions.push({id:"another",kind:"transfer",label:"Another two",toolId:"supply",targetId:"receiver",amount:2});
  validateWorld(w);
  assert.equal(incompatibleTargetReason(w,after,"receiver"),undefined,"Multiple distinct actions can share one tool-target pair.");
  const both=step(w,after,{type:"perform",actionId:"another"});
  assert.equal(incompatibleTargetReason(w,both,"receiver"),"These actions have already been used. Choose another target.");
  w.interactions!.choiceGroups=[{id:"delivery",label:"Delivery",actionIds:["small","another"]}];
  w.interactions!.actions[1].label="A longer alternative delivery name that must preserve the one-use explanation";
  w.entities.find(entity=>entity.id==="receiver")!.label="An unusually long receiver name for preview clipping";
  validateWorld(w);
  assert.match(previewInteraction(w,before,w.interactions!.actions[0]).consequence.slice(0,160),/One use/);
  w.interactions!.objects.find(object=>object.entityId==="receiver")!.carryable=true;
  assert.equal(incompatibleTargetReason(w,both,"receiver"),undefined,"A free carryable receiver must remain available for pickup.");
});

test("inspection follows edited prerequisites and never silently equips the matching tool", () => {
  const w = world(), start = emptyPlayState(), action = w.interactions!.actions.find(a => a.id === "fit")!;
  assert.equal(inspectInteractionTarget(w, start, "receiver").length, 0);
  const held = step(w, start, {type: "pickup", entityId: "part"});
  assert.equal(previewInteraction(w, held, action).reason, "First: Charge");
  w.interactions!.actions.find(a => a.id === "fill")!.label = "Recharge the receiver";
  assert.equal(previewInteraction(w, held, action).reason, "First: Recharge the receiver");
  assert.equal(start.interactions, undefined);
});

test("transfer conserves resources, enforces possession/capacity, and rejects atomically", () => {
  const w = world(), start = emptyPlayState();
  assert.equal(reduceInteraction(w, start, {type: "perform", actionId: "fill"}).state, start);
  const s = filled(w);
  assert.deepEqual(s.interactions!.quantities, {supply: 4, receiver: 6});
  for (const actionId of ["fill", "extra", "fit"]) {
    const result = reduceInteraction(w, s, {type: "perform", actionId});
    assert.equal(result.ok, false);
    assert.equal(result.state, s);
  }
  const held = step(w, start, {type: "pickup", entityId: "supply"});
  const trapped = reduceInteraction(w, held, {type: "perform", actionId: "extra"});
  assert.equal(trapped.ok, false, "An optional transfer must not spend the required supply.");
  assert.equal(trapped.state, held);
  assert.match(trapped.reason!, /block completion/);
  assert.deepEqual(start, emptyPlayState());
  assert.equal(availableInteractions(w, s).length, 0);
});

function allocationWorld(): WorldDefinition {
  const w = world();
  w.interactions!.objects.find(object => object.entityId === "part")!.resource = {type:"charge",capacity:10,initial:0};
  w.interactions!.actions.push({id:"wrong-allocation",kind:"transfer",label:"Charge the part",toolId:"supply",targetId:"part",amount:6});
  return validateWorld(w);
}

test("retryable allocation permits a legal losing move only by explicit opt-in while hints remain safe", () => {
  for (const policy of [undefined, "protected", "retryable"] as const) {
    const w = allocationWorld();
    w.interactions!.completionPolicy = policy;
    validateWorld(w);
    const before = step(w, emptyPlayState(), {type:"pickup",entityId:"supply"});
    const snapshot = structuredClone(before);
    assert.equal(interactionCompletionStatus(w,before),"possible");
    assert.ok(availableInteractions(w,before).some(action=>action.id==="wrong-allocation"));
    assert.equal(safeAvailableInteractions(w,before).some(action=>action.id==="wrong-allocation"),false);
    assert.equal(playerAvailableInteractions(w,before,"part").some(action=>action.id==="wrong-allocation"),policy==="retryable");
    const result = reduceInteraction(w,before,{type:"perform",actionId:"wrong-allocation"});
    assert.equal(result.ok,policy==="retryable");
    assert.deepEqual(before,snapshot,"Neither a successful mistake nor rejection mutates the undo snapshot.");
    if (policy !== "retryable") { assert.equal(result.state,before); continue; }
    assert.deepEqual(interactionState(w,result.state).quantities,{supply:4,receiver:0,part:6});
    assert.equal(interactionCompletionStatus(w,result.state),"impossible");
    assert.equal(goalProgress(w,result.state).ready,false);
    assert.deepEqual(safeAvailableInteractions(w,result.state),[]);
    for (const actionId of ["fill","wrong-allocation","fit"]) {
      const rejected=reduceInteraction(w,result.state,{type:"perform",actionId});
      assert.equal(rejected.ok,false,"Short supplies, repeated actions and unmet prerequisites still reject.");
      assert.equal(rejected.state,result.state);
    }
    assert.equal(reduceInteraction(w,emptyPlayState(),{type:"perform",actionId:"wrong-allocation"}).ok,false,"Retryable never equips the tool implicitly.");
  }
});

test("retryable mistakes replay from receipts, survive save, and recover through snapshot undo or restart", () => {
  const w=allocationWorld(); w.interactions!.completionPolicy="retryable";
  const before=step(w,emptyPlayState(),{type:"pickup",entityId:"supply"});
  const after=step(w,before,{type:"perform",actionId:"wrong-allocation"});
  const forged=structuredClone(after);
  forged.interactions!.quantities={supply:10000,receiver:10,part:0};
  const restored=validSavedWorlds(JSON.parse(JSON.stringify([{world:w,state:forged,savedAt:new Date().toISOString()}])))[0];
  assert.ok(restored,"An initially solvable retryable world can save a losing run.");
  assert.equal(restored.world.interactions!.completionPolicy,"retryable");
  assert.deepEqual(restored.state.interactions!.quantities,{supply:4,receiver:0,part:6});
  assert.equal(interactionCompletionStatus(w,restored.state),"impossible");
  const protectedWorld=structuredClone(w); protectedWorld.interactions!.completionPolicy="protected";
  assert.deepEqual(interactionState(protectedWorld,restored.state),interactionState(w,restored.state),"Changing mistake policy does not rewrite earned resource transfers.");
  const undo=JSON.parse(JSON.stringify(before));
  assert.equal(interactionCompletionStatus(w,undo),"possible");
  assert.ok(playerAvailableInteractions(w,undo).some(action=>action.id==="fill"));
  assert.equal(interactionCompletionStatus(w,emptyPlayState()),"possible");
  assert.deepEqual(interactionState(w,emptyPlayState()).quantities,{supply:10,receiver:0,part:0});
  let success=step(w,undo,{type:"perform",actionId:"fill"});
  // Extra still cannot overdraw the supply or overflow the receiver.
  assert.equal(reduceInteraction(w,success,{type:"perform",actionId:"extra"}).ok,false);
  success=step(w,step(w,success,{type:"drop"}),{type:"pickup",entityId:"part"});
  success=step(w,success,{type:"perform",actionId:"fit"});
  assert.equal(goalProgress(w,success).ready,true);
});

test("retryable policy keeps initial feasibility and generated choice admission strict", () => {
  const full=allocationWorld(); full.interactions!.completionPolicy="retryable";
  full.interactions!.objects.find(object=>object.entityId==="part")!.resource!.initial=9;
  validateWorld(full);
  const held=step(full,emptyPlayState(),{type:"pickup",entityId:"supply"});
  const overflow=reduceInteraction(full,held,{type:"perform",actionId:"wrong-allocation"});
  assert.equal(overflow.ok,false,"A full target still rejects even when the supply has enough.");
  assert.equal(overflow.state,held);
  const invalid=allocationWorld();
  (invalid.interactions as unknown as {completionPolicy:string}).completionPolicy="anything";
  assert.throws(()=>validateWorld(invalid),/supported interaction plan/);
  const impossible=allocationWorld(); impossible.interactions!.completionPolicy="retryable";
  impossible.interactions!.objects[0].resource!.initial=0;
  assert.throws(()=>validateWorld(impossible),/required tasks cannot be completed/);
  const fixed=choiceWorld(); fixed.interactions!.completionPolicy="retryable";
  fixed.goalRules!.requiredInteractionIds=["gate-route"];
  validateWorld(fixed);
  assert.throws(()=>validateInteractionChoiceOutcomes(fixed),/no completing run/);
});

test("attachment unlocks actual gate only after prerequisites and preserves progress on JSON save", () => {
  const w = world();
  let s = step(w, filled(w), {type: "drop"});
  s = step(w, s, {type: "pickup", entityId: "part"});
  assert.deepEqual(availableInteractions(w, s).map(a => a.id), ["fit"]);
  s = step(w, s, {type: "perform", actionId: "fit"});
  assert.equal(s.interactions!.heldEntityId, null);
  assert.deepEqual(s.interactions!.attachments, {part: "receiver"});
  assert.deepEqual(interactionEffects(w, s).openGateIds, ["barrier"]);
  assert.equal(goalProgress(w, s).ready, true);
  assert.equal(reduceInteraction(w, s, {type: "pickup", entityId: "part"}).ok, false);
  const saved = validSavedWorlds(JSON.parse(JSON.stringify([{world: w, state: s, savedAt: new Date().toISOString()}])));
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].state, s);
});

test("receipt replay ignores forged counters and invalidated meanings while retaining labels", () => {
  const w = world(), s = filled(w);
  const tampered = structuredClone(s);
  tampered.interactions!.quantities = {supply: 999999, receiver: Infinity};
  tampered.interactions!.attachments = {part: "barrier"};
  assert.deepEqual(interactionState(w, tampered).quantities, {supply: 4, receiver: 6});
  assert.deepEqual(interactionState(w, tampered).attachments, {});
  const relabelled = structuredClone(w);
  relabelled.interactions!.actions[0].label = "Fill this";
  assert.deepEqual(interactionState(relabelled, s).completed, ["fill"]);
  const revised = structuredClone(w);
  const action = revised.interactions!.actions[0];
  if (action.kind === "transfer") action.amount = 2;
  assert.deepEqual(interactionState(revised, s).completed, []);
  assert.deepEqual(interactionState(revised, s).quantities, {supply: 10, receiver: 0});
});

test("new drawn part and its behavior can be amended then undone without losing old transfers", () => {
  const w = world(), s = filled(w);
  const base = structuredClone(w);
  base.interactions!.actions = base.interactions!.actions.filter(a => a.id !== "fit");
  base.interactions!.objects = base.interactions!.objects.filter(o => o.entityId !== "part");
  base.entities = base.entities.filter(e => e.id !== "part");
  base.goalRules!.requiredInteractionIds = ["fill"];
  const changed = applyWorldPatch(base, s, { id: "new-part", worldId: base.id, baseRevision: 1, origin: "manual",
    additions: [w.entities.find(e => e.id === "part")!], interactions: w.interactions, goalRules: w.goalRules });
  let next = step(changed.world, changed.state, {type: "drop"});
  next = step(changed.world, next, {type: "pickup", entityId: "part"});
  next = step(changed.world, next, {type: "perform", actionId: "fit"});
  assert.throws(() => undoWorldPatch(changed.world, { ...next, player: {x: 520, y: 150} }, changed.checkpoint), /cover your character/);
  const undone = undoWorldPatch(changed.world, next, changed.checkpoint);
  assert.deepEqual(undone.state.interactions!.completed, ["fill"]);
  assert.deepEqual(undone.state.interactions!.quantities, {supply: 4, receiver: 6});
  assert.deepEqual(interactionEffects(undone.world, undone.state).openGateIds, []);
  const legacy = structuredClone(base); delete legacy.interactions; delete legacy.goalRules!.requiredInteractionIds;
  legacy.gameplay = {movement: "roam", objectiveTitle: "Explore", instructions: "Explore."};

  assert.deepEqual(retainPlayState(validateWorld(legacy), emptyPlayState()), emptyPlayState());
});

test("malformed plans, cycles, false capabilities and incompatible resources are rejected", () => {
  for (const mutate of [
    (w: WorldDefinition) => { w.interactions!.actions[0].requires = ["fit"]; },
    (w: WorldDefinition) => { w.interactions!.objects[0].resource!.type = "water"; },
    (w: WorldDefinition) => { w.interactions!.actions[1].effects = [{kind: "openGate", entityId: "receiver"}]; },
    (w: WorldDefinition) => { w.interactions!.actions[1].effects = [{kind: "jumpBoost", multiplier: 2}]; },
    (w: WorldDefinition) => { w.interactions!.actions[1].effects = []; },
    (w: WorldDefinition) => { w.gameplay!.movement = "discover"; w.entities = w.entities.filter(e => e.kind !== "player"); },
    (w: WorldDefinition) => { w.goalRules!.requiredInteractionIds = ["unknown"]; },
    (w: WorldDefinition) => {
      w.interactions!.objects[0].resource = {type: "charge", capacity: 1, initial: 1};
      for (const action of w.interactions!.actions) if (action.kind === "transfer") action.amount = 1;
      w.goalRules!.requiredInteractionIds = ["fill", "extra"];
    },
    (w: WorldDefinition) => { w.entities.find(e => e.id === "supply")!.kind = "coin"; },
    (w: WorldDefinition) => { (w.interactions!.actions[0] as unknown as Record<string, unknown>).execute = "arbitrary code"; },
  ]) {
    const w = world(); mutate(w); assert.throws(() => validateWorld(w));
  }
  // Deliberately removing the last ability leaves a valid free-play object scene.
  const free = world();
  free.gameplay!.movement = "discover";
  free.entities = free.entities.filter(e => e.kind !== "player");
  free.interactions!.actions = [];
  free.goalRules!.requiredInteractionIds = [];
  validateWorld(free);
  const playing = step(free, emptyPlayState(), {type: "pickup", entityId: "supply"});
  assert.equal(playing.completed, false);
  assert.equal(goalProgress(free, playing).total, 0);
  assert.equal(playing.interactions!.heldEntityId, "supply");
});

test("a newly drawn part moves the original prop after earned tasks and survives save/undo without rewriting its source", () => {
  const episode = world();
  const vehicle = episode.entities.find(e => e.id === "receiver")!;
  vehicle.art = "/art/seed.svg"; // Fixture artwork; no inference or real repair is claimed.
  const attachment = episode.interactions!.actions.find(a => a.id === "fit")!;
  attachment.effects = [{kind: "moveObject", entityId: "receiver", x: 700, y: 180, durationMs: 900}];
  validateWorld(episode);
  const base = structuredClone(episode);
  base.entities = base.entities.filter(e => e.id !== "part");
  base.interactions!.objects = base.interactions!.objects.filter(o => o.entityId !== "part");
  base.interactions!.actions = base.interactions!.actions.filter(a => a.id !== "fit");
  base.goalRules!.requiredInteractionIds = ["fill"];
  const earned = {...filled(base), completed: true};
  const revised = applyWorldPatch(base, earned, {id: "invention",worldId:base.id,baseRevision:base.revision,origin:"manual",
    additions:[episode.entities.find(e=>e.id==="part")!],interactions:episode.interactions,goalRules:episode.goalRules});
  assert.deepEqual(revised.state.interactions!.completed,["fill"]);
  assert.equal(revised.state.completed, true, "Earlier completion remains earned.");
  assert.equal(revised.state.exploring, true, "New required invention remains playable after completion.");
  assert.deepEqual(interactionEffects(revised.world,revised.state).objectMoves,{});
  const invalid = reduceInteraction(revised.world,revised.state,{type:"perform",actionId:"fit"});
  assert.equal(invalid.ok,false);
  assert.equal(invalid.state,revised.state);
  let state = step(revised.world,revised.state,{type:"drop"});
  state = step(revised.world,state,{type:"pickup",entityId:"part"});
  state = step(revised.world,state,{type:"perform",actionId:"fit"});
  assert.deepEqual(interactionEffects(revised.world,state).objectMoves,{receiver:{x:700,y:180,durationMs:900,actionId:"fit"}});
  assert.equal(goalProgress(revised.world,state).ready,true);
  assert.deepEqual(revised.world.entities.find(e=>e.id==="receiver"),vehicle);
  const restored=validSavedWorlds(JSON.parse(JSON.stringify([{world:revised.world,state,savedAt:new Date().toISOString()}])))[0];
  assert.deepEqual(interactionEffects(restored.world,restored.state).objectMoves,interactionEffects(revised.world,state).objectMoves);
  const continuation = structuredClone(revised.world.interactions!);
  continuation.objects.push({entityId:"return-part",carryable:true});
  // Deliberately put the later action first: receipt order, not array order, wins.
  continuation.actions.unshift({id:"return",kind:"attach",label:"Return home",toolId:"return-part",targetId:"receiver",requires:["fit"],effects:[{kind:"moveObject",entityId:"receiver",x:vehicle.x,y:vehicle.y}]});
  const extended=applyWorldPatch(revised.world,state,{id:"next-invention",worldId:revised.world.id,baseRevision:revised.world.revision,origin:"manual",
    additions:[{id:"return-part",kind:"decoration",x:900,y:200,width:35,height:35,art:"/art/seed.svg"}],interactions:continuation,
    goalRules:{...revised.world.goalRules!,requiredInteractionIds:["fill","fit","return"]}});
  let continued=step(extended.world,extended.state,{type:"pickup",entityId:"return-part"});
  continued=step(extended.world,continued,{type:"perform",actionId:"return"});
  assert.deepEqual(interactionEffects(extended.world,continued).objectMoves.receiver,{x:vehicle.x,y:vehicle.y,durationMs:900,actionId:"return"});
  const reopened=validSavedWorlds(JSON.parse(JSON.stringify([{world:extended.world,state:continued,savedAt:new Date().toISOString()}])))[0];
  assert.equal(interactionEffects(reopened.world,reopened.state).objectMoves.receiver.actionId,"return");
  const previousTrip=undoWorldPatch(extended.world,continued,extended.checkpoint);
  assert.equal(interactionEffects(previousTrip.world,previousTrip.state).objectMoves.receiver.actionId,"fit");
  for(const change of [
    (w:WorldDefinition)=>{w.interactions!.actions[0].requires=[];},
    (w:WorldDefinition)=>{w.interactions!.actions[0].effects=[{kind:"moveObject",entityId:"receiver",x:700,y:180}];},
    (w:WorldDefinition)=>{w.interactions!.actions[0].effects!.push({kind:"moveObject",entityId:"receiver",x:600,y:180});},
  ]){const invalid=structuredClone(extended.world);change(invalid);assert.throws(()=>validateWorld(invalid));}
  const undone=undoWorldPatch(revised.world,state,revised.checkpoint);
  assert.deepEqual(interactionEffects(undone.world,undone.state).objectMoves,{});
  assert.deepEqual(undone.state.interactions!.quantities,{supply:4,receiver:6});
  for (const change of [
    (w:WorldDefinition)=>{w.entities.find(e=>e.id==="receiver")!.art=undefined;},
    (w:WorldDefinition)=>{w.interactions!.objects.find(o=>o.entityId==="receiver")!.carryable=true;},
    (w:WorldDefinition)=>{w.interactions!.actions.find(a=>a.id==="fit")!.effects=[{kind:"moveObject",entityId:"receiver",x:1430,y:180}];},
  ]) {const invalid=structuredClone(episode);change(invalid);assert.throws(()=>validateWorld(invalid));}
});


test("resource goals accept either ordering but prevent optional depletion and require simultaneous final levels", () => {
  const w = world();
  w.goalRules!.requiredInteractionIds = [];
  w.goalRules!.requiredResourceIds = ["receiver"];
  w.interactions!.objects.find(o => o.entityId === "receiver")!.carryable = true;
  w.interactions!.objects.find(o => o.entityId === "part")!.resource = {type:"charge",capacity:10,initial:0};
  w.interactions!.actions = [
    {id:"six",kind:"transfer",label:"Transfer six",toolId:"supply",targetId:"receiver",amount:6},
    {id:"four",kind:"transfer",label:"Transfer four",toolId:"supply",targetId:"receiver",amount:4},
    {id:"waste",kind:"transfer",label:"Optional transfer",toolId:"supply",targetId:"part",amount:1},
    {id:"drain",kind:"transfer",label:"Take one back",toolId:"receiver",targetId:"supply",amount:1},
  ];
  validateWorld(w);
  for (const order of [["six","four"],["four","six"]]) {
    let state = step(w,emptyPlayState(),{type:"pickup",entityId:"supply"});
    assert.equal(reduceInteraction(w,state,{type:"perform",actionId:"waste"}).ok,false);
    assert.deepEqual(safeAvailableInteractions(w,state).map(action=>action.id),["six","four"]);
    assert.deepEqual(safeAvailableInteractions(w,{...state,player:{x:99,y:99}},"part"),[],"Movement cannot expose an unsafe target.");
    assert.equal(goalProgress(w,state).ready,false);
    for (const actionId of order) state=step(w,state,{type:"perform",actionId});
    assert.equal(goalProgress(w,state).ready,true);
    assert.equal(goalProgress(w,state).total,1);
    state=step(w,step(w,state,{type:"drop"}),{type:"pickup",entityId:"receiver"});
    assert.equal(reduceInteraction(w,state,{type:"perform",actionId:"drain"}).ok,false);
  }
  const optional=structuredClone(w); optional.goalRules!.requiredResourceIds=[];
  const holding=step(optional,emptyPlayState(),{type:"pickup",entityId:"supply"});
  assert.equal(safeAvailableInteractions(optional,holding).some(action=>action.id==="waste"),true);
  optional.goalRules!.requiredResourceIds=["receiver"];
  assert.equal(safeAvailableInteractions(optional,holding).some(action=>action.id==="waste"),false,"Edited goals invalidate eligibility cache.");
  optional.goalRules!.requiredResourceIds=[];
  const spent=step(optional,step(optional,emptyPlayState(),{type:"pickup",entityId:"supply"}),{type:"perform",actionId:"waste"});
  assert.throws(()=>applyWorldPatch(optional,spent,{id:"new-goal",worldId:optional.id,baseRevision:optional.revision,origin:"manual",additions:[],goalRules:w.goalRules}),/current supplies/);
  assert.deepEqual(spent.interactions!.completed,["waste"]);
  const readiness=structuredClone(w);
  readiness.goalRules!.requiredInteractionIds=["finish"];
  readiness.interactions!.actions.push({id:"finish",kind:"attach",label:"Fit the charged mechanism",toolId:"part",targetId:"receiver",requiresResourceIds:["receiver"],effects:[{kind:"openGate",entityId:"barrier"}]});
  validateWorld(readiness);
  let waiting=step(readiness,emptyPlayState(),{type:"pickup",entityId:"part"});
  const premature=reduceInteraction(readiness,waiting,{type:"perform",actionId:"finish"});
  assert.equal(premature.ok,false);
  assert.equal(premature.state,waiting);
  assert.match(premature.reason!,/Fill/);
  assert.equal(safeAvailableInteractions(readiness,waiting).length,0);
  waiting=step(readiness,step(readiness,waiting,{type:"drop"}),{type:"pickup",entityId:"supply"});
  waiting=step(readiness,waiting,{type:"perform",actionId:"four"});
  waiting=step(readiness,waiting,{type:"perform",actionId:"six"});
  waiting=step(readiness,step(readiness,waiting,{type:"drop"}),{type:"pickup",entityId:"part"});
  assert.deepEqual(safeAvailableInteractions(readiness,waiting).map(action=>action.id),["finish"]);
  waiting=step(readiness,waiting,{type:"perform",actionId:"finish"});
  assert.equal(goalProgress(readiness,waiting).ready,true);
  assert.deepEqual(interactionEffects(readiness,waiting).openGateIds,["barrier"]);
  const invalidReadiness=structuredClone(readiness);invalidReadiness.interactions!.actions.at(-1)!.requiresResourceIds=["unknown"];
  assert.throws(()=>validateWorld(invalidReadiness),/readiness condition/);
  const invalid=structuredClone(w); invalid.goalRules!.requiredResourceIds=["receiver","part"];
  assert.throws(()=>validateWorld(invalid),/cannot be completed/);
  invalid.goalRules!.requiredResourceIds=["unknown"];
  assert.throws(()=>validateWorld(invalid),/resource task/);
});

test("fractional supplies reach exact full/empty levels and remain completed after save", () => {
  const w = world();
  w.interactions!.objects[0].resource = {type:"charge", capacity:0.3, initial:0.3};
  w.interactions!.objects[1].resource = {type:"charge", capacity:0.3, initial:0};
  w.interactions!.actions = [
    {id:"small", kind:"transfer", label:"Add a little", toolId:"supply", targetId:"receiver", amount:0.1},
    {id:"large", kind:"transfer", label:"Add the rest", toolId:"supply", targetId:"receiver", amount:0.2},
    {id:"finish", kind:"use", label:"Start the mechanism", toolId:"part", targetId:"receiver", requiresResourceIds:["receiver"], effects:[{kind:"openGate",entityId:"barrier"}]},
  ];
  w.goalRules!.requiredInteractionIds = ["finish"];
  w.goalRules!.requiredResourceIds = ["receiver"];
  validateWorld(w);
  for (const order of [["small","large"],["large","small"]]) {
    let s = step(w, emptyPlayState(), {type:"pickup", entityId:"supply"});
    for (const actionId of order) s = step(w, s, {type:"perform", actionId});
    assert.deepEqual(s.interactions!.quantities, {supply:0, receiver:0.3});
    s = step(w, step(w, s, {type:"drop"}), {type:"pickup", entityId:"part"});
    s = step(w, s, {type:"perform", actionId:"finish"});
    assert.equal(goalProgress(w,s).ready,true);
    const restored = validSavedWorlds(JSON.parse(JSON.stringify([{world:w,state:s,savedAt:new Date().toISOString()}])))[0];
    assert.equal(goalProgress(restored.world,restored.state).ready,true);
    assert.deepEqual(restored.state.interactions!.quantities, {supply:0,receiver:0.3});
  }
});

test("unrelated optional interactions cannot crowd a valid resource route out of verification", () => {
  const w = world();
  w.interactions!.actions = [
    {id:"finish", kind:"use", label:"Start the mechanism", toolId:"part", targetId:"receiver", requiresResourceIds:["receiver"], effects:[{kind:"openGate",entityId:"barrier"}]},
    {id:"consume", kind:"attach", label:"Attach the supply", toolId:"supply", targetId:"receiver", effects:[{kind:"openGate",entityId:"barrier"}]},
    ...Array.from({length:16}, (_,i) => ({id:`optional-${i}`, kind:"use" as const, label:`Optional capability ${i}`, toolId:"part", targetId:"receiver", effects:[{kind:"openGate" as const,entityId:"barrier"}]})),
    {id:"fill", kind:"transfer", label:"Fill", toolId:"supply", targetId:"receiver", amount:10},
  ];
  w.goalRules!.requiredInteractionIds = ["finish"];
  validateWorld(w);
  let s = step(w, emptyPlayState(), {type:"pickup",entityId:"supply"});
  assert.deepEqual(safeAvailableInteractions(w,s).map(a=>a.id),["fill"]);
  assert.equal(reduceInteraction(w,s,{type:"perform",actionId:"consume"}).ok,false);
  s = step(w,s,{type:"perform",actionId:"fill"});
  s = step(w,step(w,s,{type:"drop"}),{type:"pickup",entityId:"part"});
  assert.equal(safeAvailableInteractions(w,s).some(a=>a.id==="optional-0"),true,"Unrelated optional play remains available when safe.");
  s = step(w,s,{type:"perform",actionId:"finish"});
  assert.equal(goalProgress(w,s).ready,true);
});

test("placing a carried object changes its location, releases it, and preserves ordered placements on save", () => {
  const w = world();
  const part = w.entities.find(entity => entity.id === "part")!;
  part.art = "/art/seed.svg";
  w.interactions!.actions = [
    {id:"place-first", kind:"place", label:"Place beside the mechanism", toolId:"part", targetId:"receiver", effects:[{kind:"moveObject",entityId:"part",x:360,y:100}]},
    {id:"place-next", kind:"place", label:"Return beside the supply", toolId:"part", targetId:"supply", requires:["place-first"], effects:[{kind:"moveObject",entityId:"part",x:140,y:180}]},
  ];
  w.goalRules!.requiredInteractionIds = ["place-first","place-next"];
  validateWorld(w);
  let s = emptyPlayState();
  assert.equal(reduceInteraction(w,s,{type:"perform",actionId:"place-first"}).ok,false,"Placement requires actually holding the object.");
  s = step(w,s,{type:"pickup",entityId:"part"});
  assert.equal(reduceInteraction(w,s,{type:"perform",actionId:"place-next"}).ok,false,"Later placement must wait for its prerequisite.");
  s = step(w,s,{type:"perform",actionId:"place-first"});
  assert.equal(s.interactions!.heldEntityId,null);
  assert.deepEqual(s.interactions!.attachments,{},"Placement leaves the object free to pick up again.");
  assert.deepEqual(interactionEffects(w,s).objectMoves.part,{x:360,y:100,durationMs:900,actionId:"place-first"});
  assert.equal(part.x,200,"Original source geometry is unchanged.");
  s = step(w,s,{type:"pickup",entityId:"part"});
  assert.deepEqual(safeAvailableInteractions(w,s).map(action=>action.id),["place-next"]);
  s = step(w,s,{type:"perform",actionId:"place-next"});
  const restored = validSavedWorlds(JSON.parse(JSON.stringify([{world:w,state:s,savedAt:new Date().toISOString()}])))[0];
  assert.equal(goalProgress(restored.world,restored.state).ready,true);
  assert.deepEqual(interactionEffects(restored.world,restored.state).objectMoves.part,{x:140,y:180,durationMs:900,actionId:"place-next"});
  assert.equal(step(w,restored.state,{type:"pickup",entityId:"part"}).interactions!.heldEntityId,"part");
  for (const mutate of [
    (invalid:WorldDefinition)=>{invalid.interactions!.actions[0].kind="use";},
    (invalid:WorldDefinition)=>{invalid.interactions!.actions[0].effects=[{kind:"moveObject",entityId:"receiver",x:600,y:100}];},
    (invalid:WorldDefinition)=>{invalid.interactions!.actions[0].effects!.push({kind:"openGate",entityId:"barrier"});},
    (invalid:WorldDefinition)=>{invalid.interactions!.actions[1].requires=[];},
    (invalid:WorldDefinition)=>{invalid.entities.find(entity=>entity.id==="part")!.art=undefined;},
    (invalid:WorldDefinition)=>{invalid.interactions!.actions[0].targetId="part";},
  ]) { const invalid=structuredClone(w); mutate(invalid); assert.throws(()=>validateWorld(invalid)); }
});


test("inspection reports actual capability when a weaker upgrade leaves the stronger one active", () => {
  const w = world();
  w.interactions!.actions = [2, 1.5].map((multiplier, index) => ({id:`boost-${index}`,kind:"use" as const,label:"Speed",toolId:"part",targetId:"receiver",effects:[{kind:"moveSpeedBoost" as const,multiplier}]}));
  w.goalRules!.requiredInteractionIds = [];
  validateWorld(w);
  let s = step(w, emptyPlayState(), {type:"pickup",entityId:"part"});
  assert.equal(previewInteraction(w,s,w.interactions!.actions[0]).consequence,"Movement speed ×1 → ×2.");
  s = step(w,s,{type:"perform",actionId:"boost-0"});
  assert.equal(previewInteraction(w,s,w.interactions!.actions[1]).consequence,"Movement speed stays ×2.");
  assert.equal(interactionEffects(w,step(w,s,{type:"perform",actionId:"boost-1"})).moveSpeedMultiplier,2);
});

function choiceWorld(): WorldDefinition {
  const w = world();
  w.interactions!.actions = [w.interactions!.actions[0],
    {id:"gate-route",kind:"attach",label:"Open the gate",toolId:"part",targetId:"receiver",requires:["fill"],effects:[{kind:"openGate",entityId:"barrier"}]},
    {id:"speed-route",kind:"attach",label:"Power the fast route",toolId:"part",targetId:"supply",requires:["fill"],effects:[{kind:"moveSpeedBoost",multiplier:1.8}]},
  ];
  w.interactions!.choiceGroups = [{id:"route",label:"a route",actionIds:["gate-route","speed-route"]}];
  w.goalRules = {requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["route"]};
  return validateWorld(w);
}
function choiceReady(w: WorldDefinition) {
  return step(w,step(w,filled(w),{type:"drop"}),{type:"pickup",entityId:"part"});
}

test("exclusive attachments create different physical capabilities and either satisfies one OR goal",()=>{
  const w=choiceWorld();
  const pending=goalProgress(w,emptyPlayState());
  assert.equal(pending.total,1);assert.equal(pending.done,0);assert.match(pending.hint,/choose a route/);
  assert.deepEqual(pending.missingChoiceGroupIds,["route"]);
  for(const selected of ["gate-route","speed-route"]){
    const before=choiceReady(w);
    assert.deepEqual(safeAvailableInteractions(w,before).map(action=>action.id),["gate-route","speed-route"]);
    const state=step(w,before,{type:"perform",actionId:selected});
    const effects=interactionEffects(w,state);
    assert.deepEqual(effects.openGateIds,selected==="gate-route"?["barrier"]:[]);
    assert.equal(effects.moveSpeedMultiplier,selected==="speed-route"?1.8:1);
    assert.deepEqual(state.interactions!.attachments,{part:selected==="gate-route"?"receiver":"supply"});
    assert.equal(goalProgress(w,state).ready,true);assert.equal(goalProgress(w,state).done,1);
    const excluded=selected==="gate-route"?"speed-route":"gate-route";
    const rejected=reduceInteraction(w,state,{type:"perform",actionId:excluded});
    assert.equal(rejected.ok,false);assert.equal(rejected.state,state);assert.match(rejected.reason!,/already chosen/);
    assert.doesNotMatch(rejected.reason!,/undo/i);
    const restored=validSavedWorlds(JSON.parse(JSON.stringify([{world:w,state,savedAt:new Date().toISOString()}])))[0];
    assert.deepEqual(interactionEffects(w,restored.state),effects);
    assert.equal(goalProgress(w,restored.state).ready,true);
    // Restoring the complete pre-action snapshot is sufficient for play undo:
    // the choice lock, attachment and capability all come from the receipts.
    assert.deepEqual(safeAvailableInteractions(w,before).map(action=>action.id),["gate-route","speed-route"]);
    assert.deepEqual(interactionEffects(w,before).openGateIds,[]);
    assert.equal(interactionEffects(w,before).moveSpeedMultiplier,1);
  }
});

function branchWorld(): WorldDefinition {
  const w=choiceWorld();
  w.interactions!.actions=w.interactions!.actions.map(action=>action.kind==="attach"?{...action,kind:"use"}:action);
  w.entities.find(entity=>entity.id==="receiver")!.art="/art/seed.svg";
  w.interactions!.actions.push(
    {id:"gate-arrival",kind:"use",label:"Bring the mechanism through the gate",toolId:"supply",targetId:"receiver",requires:["gate-route"],effects:[{kind:"moveObject",entityId:"receiver",x:700,y:120}]},
    {id:"speed-arrival",kind:"use",label:"Bring the mechanism along the fast route",toolId:"supply",targetId:"receiver",requires:["speed-route"],effects:[{kind:"moveObject",entityId:"receiver",x:900,y:320}]},
  );
  w.interactions!.choiceGroups!.push({id:"arrival",label:"an arrival",actionIds:["gate-arrival","speed-arrival"]});
  w.goalRules!.requiredChoiceGroupIds=["arrival"];
  return validateWorld(w);
}

test("generated choices must each participate in completion while manual fixed-route rules remain valid",()=>{
  const w=branchWorld();
  const snapshot=JSON.stringify(w);
  validateInteractionChoiceOutcomes(w);
  assert.equal(JSON.stringify(w),snapshot,"Admission checks must not rewrite a plan or its requirements.");
  const fixed=structuredClone(w);
  fixed.goalRules!.requiredInteractionIds=["gate-route"];
  validateWorld(fixed);
  assert.throws(()=>validateInteractionChoiceOutcomes(fixed),/route offers action speed-route, but no completing run/);
  const unreachable=choiceWorld();
  unreachable.interactions!.actions.find(action=>action.id==="speed-route")!.requiresResourceIds=["receiver"];
  validateWorld(unreachable); // Gate route still completes; six units cannot fill a ten-unit receiver.
  assert.throws(()=>validateInteractionChoiceOutcomes(unreachable),/route offers action speed-route, but no completing run/);
  const legacy=world();
  validateInteractionChoiceOutcomes(legacy);
});

test("inspection preserves inherited branch locks rather than directing players to the excluded prerequisite",()=>{
  const w=branchWorld();
  let state=step(w,choiceReady(w),{type:"perform",actionId:"gate-route"});
  state=step(w,step(w,state,{type:"drop"}),{type:"pickup",entityId:"supply"});
  const action=w.interactions!.actions.find(action=>action.id==="speed-arrival")!;
  const preview=previewInteraction(w,state,action);
  assert.equal(preview.available,false);
  assert.equal(preview.reason,"Open the gate already chosen.");
  assert.doesNotMatch(preview.reason!,/First:/);
});

test("OR feasibility follows alternative prerequisites and inherited branch assignments through actual movements",()=>{
  const w=branchWorld();
  for(const branch of ["gate","speed"]){
    let state=step(w,choiceReady(w),{type:"perform",actionId:`${branch}-route`});
    const excluded=branch==="gate"?"speed":"gate";
    const before=state;
    const blocked=reduceInteraction(w,state,{type:"perform",actionId:`${excluded}-arrival`});
    assert.equal(blocked.ok,false);assert.equal(blocked.state,before);assert.match(blocked.reason!,/already chosen/);
    assert.equal(goalProgress(w,state).ready,false,"Selecting a route alone does not earn its later outcome.");
    state=step(w,step(w,state,{type:"drop"}),{type:"pickup",entityId:"supply"});
    assert.deepEqual(safeAvailableInteractions(w,state).map(action=>action.id),[`${branch}-arrival`]);
    state=step(w,state,{type:"perform",actionId:`${branch}-arrival`});
    assert.equal(goalProgress(w,state).ready,true);
    assert.equal(interactionEffects(w,state).objectMoves.receiver.x,branch==="gate"?700:900);
  }
  // The arrival group is not what proves these moves exclusive: their distinct
  // ancestor assignments suffice even when the ending actions are ungrouped.
  const inherited=structuredClone(w);
  inherited.interactions!.choiceGroups=inherited.interactions!.choiceGroups!.filter(group=>group.id!=="arrival");
  inherited.goalRules!.requiredChoiceGroupIds=["route"];
  validateWorld(inherited);
  const unproven=structuredClone(inherited);
  unproven.interactions!.actions.find(action=>action.id==="speed-arrival")!.requires=["fill"];
  assert.throws(()=>validateWorld(unproven),/explicit prerequisite sequence or mutually exclusive branches/);
  const noOp=structuredClone(w);
  noOp.interactions!.actions.push({id:"stay",kind:"use",label:"Stay",toolId:"supply",targetId:"receiver",requires:["gate-arrival"],effects:[{kind:"moveObject",entityId:"receiver",x:700,y:120}]});
  assert.throws(()=>validateWorld(noOp),/different position from the preceding step/);
});

test("exclusive receipt replay rejects forged dual choices and invalidates changed membership without invalidating labels",()=>{
  const w=choiceWorld(), before=choiceReady(w);
  const gate=step(w,before,{type:"perform",actionId:"gate-route"});
  const speed=step(w,before,{type:"perform",actionId:"speed-route"});
  const forged=structuredClone(gate);
  forged.interactions!.completed.push("speed-route");
  forged.interactions!.completedSignatures!["speed-route"]=speed.interactions!.completedSignatures!["speed-route"];
  assert.deepEqual(interactionState(w,forged).completed,["fill","gate-route"]);
  assert.equal(interactionEffects(w,forged).moveSpeedMultiplier,1);
  const relabelled=structuredClone(w);
  relabelled.interactions!.choiceGroups![0].label="a different name";
  relabelled.interactions!.choiceGroups![0].actionIds.reverse();
  assert.deepEqual(interactionState(relabelled,gate).completed,["fill","gate-route"]);
  const changed=structuredClone(w);
  changed.interactions!.actions.push({id:"third-route",kind:"attach",label:"Another speed",toolId:"part",targetId:"receiver",requires:["fill"],effects:[{kind:"moveSpeedBoost",multiplier:1.4}]});
  changed.interactions!.choiceGroups![0].actionIds.push("third-route");
  validateWorld(changed);
  assert.deepEqual(interactionState(changed,gate).completed,["fill"]);
  assert.deepEqual(interactionEffects(changed,gate).openGateIds,[]);
  assert.equal(goalProgress(changed,gate).ready,false);
  assert.deepEqual(interactionState(changed,gate).quantities,{supply:4,receiver:6});
  const ungrouped=world(), legacy=filled(ungrouped);
  assert.equal(legacy.interactions!.completedSignatures!.fill,JSON.stringify({kind:"transfer",toolId:"supply",targetId:"receiver",requires:[],effects:[],amount:6}));
});

test("choice validation rejects malformed memberships, impossible prerequisites and AND goals across alternatives",()=>{
  for(const mutate of [
    (w:WorldDefinition)=>{w.interactions!.choiceGroups![0].actionIds=["gate-route"];},
    (w:WorldDefinition)=>{w.interactions!.choiceGroups![0].actionIds=["gate-route","gate-route"];},
    (w:WorldDefinition)=>{w.interactions!.choiceGroups![0].actionIds=["gate-route","missing"];},
    (w:WorldDefinition)=>{w.interactions!.choiceGroups![0].label="";},
    (w:WorldDefinition)=>{w.interactions!.choiceGroups!.push({id:"other",label:"Other",actionIds:["gate-route","fill"]});},
    (w:WorldDefinition)=>{w.interactions!.choiceGroups!.push({...w.interactions!.choiceGroups![0]});},
    (w:WorldDefinition)=>{w.goalRules!.requiredChoiceGroupIds=["missing"];},
    (w:WorldDefinition)=>{w.goalRules!.requiredChoiceGroupIds=["route","route"];},
    (w:WorldDefinition)=>{delete w.interactions;},
    (w:WorldDefinition)=>{w.interactions!.actions[1].requires=["speed-route"];},
    (w:WorldDefinition)=>{w.interactions!.actions.push({id:"both",kind:"use",label:"Both routes",toolId:"supply",targetId:"receiver",requires:["gate-route","speed-route"],effects:[{kind:"openGate",entityId:"barrier"}]});},
    (w:WorldDefinition)=>{w.goalRules!.requiredInteractionIds=["gate-route","speed-route"];},
    (w:WorldDefinition)=>{w.interactions!.objects[0].resource!.initial=0;},
    (w:WorldDefinition)=>{delete w.interactions!.choiceGroups;w.goalRules!.requiredChoiceGroupIds=[];},
  ]){const invalid=choiceWorld();mutate(invalid);assert.throws(()=>validateWorld(invalid));}
  const conflict=branchWorld();conflict.goalRules!.requiredInteractionIds=["gate-arrival","speed-arrival"];
  assert.throws(()=>validateWorld(conflict),/Required actions choose incompatible branches/);
  const cycle=choiceWorld();
  cycle.interactions!.actions.find(action=>action.id==="gate-route")!.toolId="supply";
  cycle.interactions!.actions.find(action=>action.id==="gate-route")!.targetId="part";
  cycle.interactions!.actions.find(action=>action.id==="speed-route")!.targetId="supply";
  assert.throws(()=>validateWorld(cycle),/attach to each other in a circle/,"Attachment cycles remain conservatively rejected across alternatives.");
});

test("choice goals participate in safety caching and prevent a resource allocation from eliminating every route",()=>{
  const w=choiceWorld();
  w.interactions!.objects.find(object=>object.entityId==="part")!.resource={type:"charge",capacity:10,initial:0};
  w.interactions!.actions.push({id:"waste",kind:"transfer",label:"Spend the charge",toolId:"supply",targetId:"part",amount:5});
  w.goalRules!.requiredChoiceGroupIds=[];
  validateWorld(w);
  const state=step(w,emptyPlayState(),{type:"pickup",entityId:"supply"});
  assert.ok(safeAvailableInteractions(w,state).some(action=>action.id==="waste"));
  w.goalRules!.requiredChoiceGroupIds=["route"];
  assert.equal(safeAvailableInteractions(w,state).some(action=>action.id==="waste"),false,"An in-place OR-goal edit invalidates the availability cache.");
  const rejected=reduceInteraction(w,state,{type:"perform",actionId:"waste"});
  assert.equal(rejected.ok,false);assert.equal(rejected.state,state);assert.match(rejected.reason!,/block completion/);
  const held=choiceReady(w);
  w.goalRules!.requiredInteractionIds=["gate-route"];
  assert.deepEqual(safeAvailableInteractions(w,held).map(action=>action.id),["gate-route"],"A fixed required branch takes precedence over the alternative OR goal.");
});

test("attachments inherit exclusive ancestor assignments while independent OR groups still must be jointly feasible",()=>{
  const w=branchWorld();
  w.interactions!.choiceGroups=w.interactions!.choiceGroups!.filter(group=>group.id==="route");
  w.goalRules!.requiredChoiceGroupIds=["route"];
  w.interactions!.actions=w.interactions!.actions.map(action=>action.id.endsWith("-arrival")
    ? {...action,kind:"attach",targetId:action.id==="gate-arrival"?"receiver":"part"}:action);
  validateWorld(w);
  for(const branch of ["gate","speed"]){
    let state=step(w,choiceReady(w),{type:"perform",actionId:`${branch}-route`});
    state=step(w,step(w,state,{type:"drop"}),{type:"pickup",entityId:"supply"});
    state=step(w,state,{type:"perform",actionId:`${branch}-arrival`});
    assert.equal(state.interactions!.attachments.supply,branch==="gate"?"receiver":"part");
    assert.equal(interactionEffects(w,state).objectMoves.receiver.x,branch==="gate"?700:900);
  }
  const impossible=choiceWorld();
  for(const branch of ["gate","speed"]){
    const actionIds=[`${branch}-outcome-a`,`${branch}-outcome-b`];
    impossible.interactions!.choiceGroups!.push({id:`require-${branch}`,label:`${branch} outcome`,actionIds});
    for(const id of actionIds)impossible.interactions!.actions.push({id,kind:"use",label:id,toolId:"supply",targetId:"receiver",requires:[`${branch}-route`],effects:[{kind:"openGate",entityId:"barrier"}]});
  }
  impossible.goalRules!.requiredChoiceGroupIds=["require-gate","require-speed"];
  assert.throws(()=>validateWorld(impossible),/cannot be completed/,"Individually reachable OR goals cannot require mutually exclusive ancestor choices together.");
});
