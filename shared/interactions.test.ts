import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlayState, goalProgress, retainPlayState, validateWorld, type PlayState, type WorldDefinition } from "./world.js";
import { availableInteractions, safeAvailableInteractions, interactionEffects, interactionState, reduceInteraction, type InteractionCommand } from "./interactions.js";
import { applyWorldPatch, undoWorldPatch } from "./revisions.js";
import { validSavedWorlds } from "../src/lib/library.js";

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
