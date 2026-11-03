import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { interpretDrawing } from "./interpret.js";
import { modelConnection } from "./provider.js";
import { imageData } from "./images.js";
import { reduceInteraction } from "../shared/interactions.js";
import { emptyPlayState, goalProgress } from "../shared/world.js";

const connection = modelConnection({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "synthetic-test-only" });
async function compile(options: { prefix?: string; amount?: number; initial?: number; required?: string[]; targetId?: string; carryable?: boolean } = {}) {
  const prefix = options.prefix ?? "fixture";
  const source = `${prefix}-source`, target = `${prefix}-target`;
  const image = imageData(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="#eee"/><path d="M100 100h100v100H100z" fill="#54a"/><circle cx="700" cy="350" r="60" fill="#7a5"/></svg>')).png().toBuffer());
  const value = {
    name: "Synthetic source interaction", description: "Protocol fixture, not live model evidence.", theme: "grove", clarification: "",
    objects: [
      { id: source, kind: "decoration", label: "Supply", targetId: null, bounds: { left: 100, top: 160, right: 200, bottom: 340 } },
      { id: target, kind: "decoration", label: "Recipient", targetId: null, bounds: { left: 640, top: 480, right: 760, bottom: 690 } },
    ],
    goalRules: { requiredCollectedIds: [], requiredActivatedIds: [] },
    gameplay: {
      mode: "creative", movement: "discover", reason: "Use source objects in place.", avatarId: null,
      objective: "explore", objectiveLabel: "Restore the supply", destinationLabel: "Task complete", objectiveTitle: "Help the recipient",
      instructions: "Pick up the supply, then select the recipient.", clues: [], obstacleIds: [],
      path: [{ x: 100, y: 160, label: "Supply" }, { x: 500, y: 400, label: "Workspace" }, { x: 700, y: 600, label: "Recipient" }],
      requiredInteractionIds: options.required ?? ["supply"],
      interactions: { version: 1,
        objects: [{ entityId: source, carryable: options.carryable ?? true, resource: { type: "water", initial: options.initial ?? 3, capacity: 3 } }, { entityId: target, carryable: false, resource: { type: "water", initial: 0, capacity: 5 } }],
        actions: [{ id: "supply", label: "Fill the recipient", toolId: source, targetId: options.targetId ?? target, kind: "transfer", amount: options.amount ?? 2, requires: [], effects: [] }],
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
