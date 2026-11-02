import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, freshExample } from "../src/lib/examples.js";
import {
  applyWorldPatch,
  undoWorldPatch,
  type WorldPatch,
} from "./revisions.js";
import { goalProgress, type PlayState } from "./world.js";

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
  const extension = applyWorldPatch(world, progress, {
    ...patch,
    additions: [],
    bounds: { width: 2880, height: 820 },
  });
  assert.equal(extension.world.width, 2880);
  assert.deepEqual(extension.state, progress);
  assert.deepEqual(extension.world.entities, world.entities);
  assert.equal(
    undoWorldPatch(extension.world, progress, extension.checkpoint).world.width,
    world.width,
  );
  assert.throws(
    () =>
      applyWorldPatch(world, progress, {
        ...patch,
        additions: [],
        bounds: { width: world.width - 1, height: world.height },
      }),
    /extend/,
  );
  assert.throws(
    () =>
      undoWorldPatch(
        extension.world,
        {
          ...progress,
          player: { x: 1700, y: 640 },
        },
        extension.checkpoint,
      ),
    /original world/,
  );
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
  patch.sourceImage =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const applied = applyWorldPatch(world, progress, patch);
  assert.equal(applied.world.sourceImage, patch.sourceImage);
  const later = {
    ...progress,
    player: { x: 900, y: 640 },
    collected: ["sunseed-one", "sunseed-two"],
  };
  const undone = undoWorldPatch(applied.world, later, applied.checkpoint);
  assert.equal(undone.world.revision, 3);
  assert.deepEqual(undone.world.entities, world.entities);
  assert.equal(undone.world.sourceImage, world.sourceImage);
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

test("changing destination rules is a reversible revision that keeps earned achievements and discoveries", () => {
  const { world, patch } = setup();
  const originalRules = structuredClone(world.goalRules);
  const earned = { ...progress, completed: true, exploring: true };
  const rules = {
    requiredCollectedIds: ["sunseed-two"],
    requiredActivatedIds: ["willow-lever"],
  };
  const changed = applyWorldPatch(world, earned, {
    ...patch,
    additions: [],
    goalRules: rules,
  });
  assert.equal(changed.world.revision, 2);
  assert.deepEqual(changed.world.goalRules, rules);
  assert.deepEqual(changed.state, earned);
  assert.equal(goalProgress(changed.world, changed.state).ready, false);
  const undone = undoWorldPatch(changed.world, earned, changed.checkpoint);
  assert.equal(undone.world.revision, 3);
  assert.deepEqual(undone.world.goalRules, originalRules);
  assert.deepEqual(undone.state, earned);
  const cleared = applyWorldPatch(changed.world, earned, {
    ...patch,
    baseRevision: 2,
    additions: [],
    goalRules: { requiredCollectedIds: [], requiredActivatedIds: [] },
  });
  assert.equal(goalProgress(cleared.world, cleared.state).total, 0);
  assert.throws(
    () =>
      applyWorldPatch(world, earned, {
        ...patch,
        additions: [],
        goalRules: {
          requiredCollectedIds: ["missing"],
          requiredActivatedIds: [],
        },
      }),
    /requirement/,
  );
  assert.deepEqual(world.goalRules, originalRules);
});


test("manual existing-object edits retain identity, art and earned progress, undo, and reject invalid updates atomically", () => {
  const {world,patch} = setup();
  const before = structuredClone(world);
  const coin = world.entities.find(entity => entity.id === "sunseed-one")!;
  const update = {id: coin.id, x: coin.x + 20, y: coin.y, width: coin.width, height: coin.height, label: "My trail seed"};
  const changed = applyWorldPatch(world, {...progress,completed:true}, {...patch,additions:[],updates:[update]});
  const moved = changed.world.entities.find(entity => entity.id === coin.id)!;
  assert.equal(moved.x,coin.x+20);
  assert.equal(moved.label,"My trail seed");
  assert.equal(moved.art,coin.art);
  assert.equal(moved.kind,coin.kind);
  assert.deepEqual(changed.state.collected,progress.collected);
  assert.equal(changed.state.completed,true);
  assert.deepEqual(undoWorldPatch(changed.world,changed.state,changed.checkpoint).world.entities,world.entities);
  for(const updates of [[{...update,id:"missing"}],[update,update],[{...update,width:-1}],[{...update,kind:"goal"}]])
    assert.throws(()=>applyWorldPatch(world,progress,{...patch,additions:[],updates:updates as typeof update[]}));
  assert.throws(()=>applyWorldPatch(world,progress,{...patch,origin:"meta",additions:[],updates:[update]}),/world editor/);
  assert.deepEqual(world,before);
});
