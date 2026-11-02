import assert from "node:assert/strict";
import test from "node:test";
import { emptyPlayState, validateWorld } from "../../shared/world.ts";
import { canDiscover, nextDiscoveryClue } from "./discovery-progress.ts";

test("discovery keeps optional details free while enforcing ordered clues, activation and finish", () => {
  const world = validateWorld({
    id: "discovery-rules-test",
    name: "Authored rule fixture",
    description: "Synthetic rule test, no recognition.",
    source: "manual",
    sourceImage: "/art/grove-drawing.svg",
    width: 1440,
    height: 820,
    theme: "grove",
    revision: 1,
    gameplay: {
      movement: "discover",
      objectiveTitle: "Find the details",
      instructions: "Follow the authored clues.",
      clues: [
        { entityId: "red", text: "Find the red detail." },
        { entityId: "blue", text: "Find the blue detail." },
        { entityId: "button", text: "Activate the button." },
        { entityId: "home", text: "Find the destination." },
      ],
    },
    entities: [
      { id: "red", kind: "coin", x: 100, y: 100, width: 50, height: 50 },
      { id: "blue", kind: "coin", x: 300, y: 100, width: 50, height: 50 },
      { id: "optional", kind: "coin", x: 500, y: 100, width: 50, height: 50 },
      { id: "button", kind: "lever", x: 700, y: 100, width: 50, height: 50 },
      { id: "home", kind: "goal", x: 1000, y: 100, width: 50, height: 50 },
      {
        id: "alternate-home",
        kind: "goal",
        x: 1200,
        y: 100,
        width: 50,
        height: 50,
      },
    ],
    goalRules: {
      requiredCollectedIds: ["red", "blue"],
      requiredActivatedIds: ["button"],
    },
  });
  const state = emptyPlayState();
  assert.equal(canDiscover(world, state, "optional"), true);
  assert.equal(canDiscover(world, state, "blue"), false);
  assert.equal(canDiscover(world, state, "home"), false);
  assert.equal(canDiscover(world, state, "alternate-home"), false);
  state.collected.push("optional", "red");
  assert.equal(nextDiscoveryClue(world, state)?.entityId, "blue");
  state.collected.push("blue");
  assert.equal(canDiscover(world, state, "home"), false);
  state.activated.push("button");
  assert.equal(canDiscover(world, state, "home"), true);
  assert.equal(
    canDiscover(world, state, "alternate-home"),
    true,
    "any destination works after action clues and prerequisites",
  );
  state.completed = true;
  assert.equal(canDiscover(world, state, "optional"), false);
  state.exploring = true;
  state.collected = state.collected.filter((id) => id !== "optional");
  assert.equal(canDiscover(world, state, "optional"), true);
  assert.equal(canDiscover(world, state, "missing"), false);
});
