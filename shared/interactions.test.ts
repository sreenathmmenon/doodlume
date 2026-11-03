import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlayState, goalProgress, retainPlayState, validateWorld, type PlayState, type WorldDefinition } from "./world.js";
import { availableInteractions, interactionEffects, interactionState, reduceInteraction, type InteractionCommand } from "./interactions.js";
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
