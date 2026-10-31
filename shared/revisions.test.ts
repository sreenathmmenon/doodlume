import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, freshExample } from "../src/lib/examples.js";
import {
  applyWorldPatch,
  undoWorldPatch,
  type WorldPatch,
} from "./revisions.js";
import type { PlayState } from "./world.js";

const progress: PlayState = {
  player: { x: 200, y: 640 },
  velocity: { x: 80, y: 0 },
  facingLeft: true,
  collected: ["sunseed-one"],
  activated: ["willow-lever"],
  completed: false,
};
function setup() {
  const world = freshExample(EXAMPLES[0].id);
  const patch: WorldPatch = {
    id: "edit-one",
    worldId: world.id,
    baseRevision: world.revision,
    origin: "manual",
    additions: [
      {
        id: "new-bridge",
        kind: "bridge",
        x: 520,
        y: 680,
        width: 160,
        height: 20,
      },
    ],
  };
  return { world, patch };
}

test("a world amendment preserves all old objects, position, motion and earned progress without mutating the input", () => {
  const { world, patch } = setup();
  const before = structuredClone(world);
  const result = applyWorldPatch(world, progress, patch);
  assert.equal(result.world.id, world.id);
  assert.equal(result.world.revision, 2);
  assert.deepEqual(
    result.world.entities.slice(0, before.entities.length),
    before.entities,
  );
  assert.deepEqual(result.state, progress);
  assert.deepEqual(world, before);
  assert.throws(
    () => applyWorldPatch(result.world, progress, patch),
    /older world/,
  );
  assert.throws(
    () =>
      applyWorldPatch(world, progress, { ...patch, worldId: "another-world" }),
    /older world/,
  );
});

test("new levers keep their chosen gate target and invalid or character-overlapping edits fail atomically", () => {
  const { world, patch } = setup();
  const addedGate = {
    id: "second-gate",
    kind: "gate" as const,
    x: 800,
    y: 540,
    width: 40,
    height: 150,
  };
  const addedLever = {
    id: "second-lever",
    kind: "lever" as const,
    x: 600,
    y: 625,
    width: 53,
    height: 65,
    targetId: addedGate.id,
  };
  const result = applyWorldPatch(world, progress, {
    ...patch,
    additions: [addedGate, addedLever],
  });
  assert.equal(
    result.world.entities.find((e) => e.id === "second-lever")!.targetId,
    "second-gate",
  );
  assert.throws(
    () =>
      applyWorldPatch(world, progress, {
        ...patch,
        additions: [{ ...addedLever, targetId: "missing-gate" }],
      }),
    /clear connection/,
  );
  assert.throws(
    () =>
      applyWorldPatch(world, progress, {
        ...patch,
        additions: [
          {
            id: "blocked",
            kind: "terrain",
            x: 170,
            y: 610,
            width: 90,
            height: 80,
          },
        ],
      }),
    /cover your character/,
  );
  assert.equal(world.revision, 1);
});

test("undo keeps later progress for surviving objects and increases the revision so old previews remain stale", () => {
  const { world, patch } = setup();
  const applied = applyWorldPatch(world, progress, patch);
  const later = {
    ...progress,
    player: { x: 900, y: 640 },
    collected: ["sunseed-one", "sunseed-two"],
  };
  const undone = undoWorldPatch(applied.world, later, applied.checkpoint);
  assert.equal(undone.world.revision, 3);
  assert.deepEqual(undone.world.entities, world.entities);
  assert.deepEqual(undone.state, later);
  assert.throws(
    () => applyWorldPatch(undone.world, later, patch),
    /older world/,
  );
  assert.throws(
    () => undoWorldPatch(undone.world, later, applied.checkpoint),
    /earlier version/,
  );
});
