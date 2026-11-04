import test from "node:test";
import assert from "node:assert/strict";
import { checkRoamRoute } from "./roam-route.js";
import type { WorldEntity } from "../shared/world.js";
import type { PlannedInteractions } from "./interaction-planning.js";

const entity = (id: string, kind: WorldEntity["kind"], x: number, y = 200, width = 40, height = 40): WorldEntity => ({ id, kind, x, y, width, height, label: id });
function fixture() {
  const guide = entity("explorer", "player", 30, 40, 36, 36);
  const entities = [guide, entity("charge", "decoration", 100), entity("unused-recipient", "decoration", 220),
    entity("control", "decoration", 320), entity("door", "gate", 480, 0, 40, 600), entity("destination", "goal", 900)];
  const interactions: PlannedInteractions = { version: 1, objects: [
    { entityId: "charge", carryable: true, resource: { type: "charge", capacity: 2, initial: 2 } },
    { entityId: "unused-recipient", resource: { type: "charge", capacity: 2, initial: 0 } },
    { entityId: "control", resource: { type: "charge", capacity: 2, initial: 0 } },
  ], actions: [
    { id: "spend", kind: "transfer", label: "Spend charge", toolId: "charge", targetId: "unused-recipient", amount: 2 },
    { id: "open", kind: "transfer", label: "Open the door", toolId: "charge", targetId: "control", amount: 2, effects: [{ kind: "openGate", entityId: "door" }] },
  ] };
  return { guide, entities, interactions };
}
const rules = { requiredCollectedIds: [], requiredActivatedIds: [] };

test("source route explores alternative resource allocations instead of accepting model action order as a solution", () => {
  for (const reverse of [false, true]) {
    const f = fixture();
    if (reverse) f.interactions.actions.reverse();
    assert.doesNotThrow(() => checkRoamRoute(1000, 600, f.guide, f.entities, rules, f.interactions));
    assert.equal(f.entities.find(entity => entity.id === "door")!.x, 480, "Source obstacles remain unchanged");
  }
});

test("a key behind its own gate cannot make a source route pass", () => {
  const f = fixture();
  f.entities.find(entity => entity.id === "charge")!.x = 800;
  assert.throws(() => checkRoamRoute(1000, 600, f.guide, f.entities, rules, f.interactions), /obstacles block the route/);
});

test("an unreachable optional interaction prop does not invalidate a reachable mission", () => {
  const f = fixture();
  f.entities.find(entity => entity.id === "destination")!.x = 300;
  f.entities.find(entity => entity.id === "unused-recipient")!.x = 800;
  assert.doesNotThrow(() => checkRoamRoute(1000, 600, f.guide, f.entities, rules, f.interactions));
});

test("an unreachable explicitly required action still rejects the mission", () => {
  const f = fixture();
  f.entities.find(entity => entity.id === "destination")!.x = 300;
  f.entities.find(entity => entity.id === "unused-recipient")!.x = 800;
  assert.throws(() => checkRoamRoute(1000, 600, f.guide, f.entities, { ...rules, requiredInteractionIds: ["spend"] }, f.interactions), /obstacles block the route/);
});

test("chained visible switches can open a route while an enclosed destination stays rejected", () => {
  const guide = entity("explorer", "player", 30, 40, 36, 36);
  const entities = [guide, { ...entity("switch-one", "lever", 200), targetId: "door-one" },
    entity("door-one", "gate", 400, 0, 30, 600), { ...entity("switch-two", "lever", 550), targetId: "door-two" },
    entity("door-two", "gate", 700, 0, 30, 600), entity("destination", "goal", 900)];
  assert.doesNotThrow(() => checkRoamRoute(1000, 600, guide, entities, rules));
  entities.find(entity => entity.id === "switch-two")!.x = 900;
  assert.throws(() => checkRoamRoute(1000, 600, guide, entities, rules), /obstacles block the route/);
});

test("a moved target must be reachable at its new position for the next required action", () => {
  const guide = entity("explorer", "player", 30, 40, 36, 36);
  const entities = [guide, entity("tool", "decoration", 100), entity("moving-target", "decoration", 200),
    entity("door", "gate", 480, 0, 40, 600)];
  const interactions: PlannedInteractions = { version: 1, objects: [
    { entityId: "tool", carryable: true }, { entityId: "moving-target", carryable: false },
  ], actions: [
    { id: "send", kind: "use", label: "Send across", toolId: "tool", targetId: "moving-target", effects: [{ kind: "moveObject", entityId: "moving-target", x: 800, y: 200 }] },
    { id: "retrieve", kind: "use", label: "Retrieve", toolId: "tool", targetId: "moving-target", requires: ["send"], effects: [{ kind: "moveObject", entityId: "moving-target", x: 200, y: 200 }] },
  ] };
  assert.throws(() => checkRoamRoute(1000, 600, guide, entities, { ...rules, requiredInteractionIds: ["retrieve"] }, interactions), /obstacles block the route/);
});

test("nested mounted targets follow their moved parent before later required actions", () => {
  for (const destinationX of [300, 800]) {
    const guide = entity("explorer", "player", 30, 40, 36, 36);
    const entities = [guide, entity("part", "decoration", 100), entity("mount", "decoration", 180),
      entity("machine", "decoration", 280, 200, 80, 80), entity("tool", "decoration", 100, 350),
      entity("wall", "terrain", 480, 0, 40, 600)];
    const interactions: PlannedInteractions = { version: 1, objects: [
      { entityId: "part", carryable: true }, { entityId: "mount", carryable: true },
      { entityId: "machine", carryable: false }, { entityId: "tool", carryable: true },
    ], actions: [
      { id: "fit-part", kind: "attach", label: "Fit part", toolId: "part", targetId: "mount", effects: [{ kind: "moveSpeedBoost", multiplier: 1.1 }] },
      { id: "fit-mount", kind: "attach", label: "Fit mount", toolId: "mount", targetId: "machine", requires: ["fit-part"], effects: [{ kind: "moveObject", entityId: "machine", x: destinationX, y: 200 }] },
      { id: "calibrate", kind: "use", label: "Calibrate part", toolId: "tool", targetId: "part", requires: ["fit-mount"], effects: [{ kind: "moveSpeedBoost", multiplier: 1.2 }] },
    ] };
    const run = () => checkRoamRoute(1000, 600, guide, entities, { ...rules, requiredInteractionIds: ["calibrate"] }, interactions);
    if (destinationX === 300) assert.doesNotThrow(run);
    else assert.throws(run, /obstacles block the route/);
  }
});

test("independent optional capabilities do not exhaust the route search before a causal gate sequence", () => {
  const f = fixture();
  const open = f.interactions.actions.find(action => action.id === "open")!;
  f.interactions.actions = Array.from({ length: 10 }, (_, index) => ({
    id: `optional-${index}`, kind: "use", label: "Optional capability", toolId: "charge", targetId: "unused-recipient",
    effects: [{ kind: "moveSpeedBoost", multiplier: 1.1 }],
  }));
  for (let index = 0; index < 5; index++) f.interactions.actions.push({
    id: `prepare-${index}`, kind: "use", label: "Prepare control", toolId: "charge", targetId: "control",
    requires: index ? [`prepare-${index - 1}`] : [], effects: [{ kind: "moveSpeedBoost", multiplier: 1.1 }],
  });
  f.interactions.actions.push({ ...open, requires: ["prepare-4"] });
  assert.doesNotThrow(() => checkRoamRoute(1000, 600, f.guide, f.entities, rules, f.interactions));
});
