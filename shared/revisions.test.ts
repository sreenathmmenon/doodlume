import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, freshExample } from "../src/lib/examples.js";
import {
  applyWorldPatch,
  undoWorldPatch,
  type WorldPatch,
} from "./revisions.js";
import { emptyPlayState, getRetryCheckpoint, goalProgress, pinRetryCheckpoint, validateWorld, type PlayState } from "./world.js";
import { reduceInteraction } from "./interactions.js";

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

test("retryable dead ends require recovery before edits; successful revisions clear old recovery checkpoints",()=>{
  const source=freshExample(EXAMPLES[0].id);
  const world=validateWorld({...source,id:"retry-revision",interactions:{version:1,completionPolicy:"retryable",objects:[
    {entityId:"supply",carryable:true,resource:{type:"charge",capacity:2,initial:2}},
    {entityId:"receiver",resource:{type:"charge",capacity:2,initial:0}},
    {entityId:"other",resource:{type:"charge",capacity:2,initial:0}},
  ],actions:[
    {id:"fill",kind:"transfer",label:"Fill",toolId:"supply",targetId:"receiver",amount:2},
    {id:"spend",kind:"transfer",label:"Other allocation",toolId:"supply",targetId:"other",amount:1},
  ]},entities:[...source.entities,...["supply","receiver","other"].map((id,index)=>({id,kind:"decoration",x:100+index*100,y:100,width:40,height:40}))],
    goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:["receiver"]}});
  const before=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"supply"}).state;
  const attempted=reduceInteraction(world,before,{type:"perform",actionId:"spend"});
  assert.equal(attempted.ok,true,attempted.reason);
  const failed=pinRetryCheckpoint(world,before,attempted.state), unchanged=structuredClone(failed);
  const patch:WorldPatch={id:"grow",worldId:world.id,baseRevision:world.revision,origin:"manual",additions:[],bounds:{width:world.width+200,height:world.height}};
  assert.throws(()=>applyWorldPatch(world,failed,patch),/Recover your last solvable position or restart/);
  assert.deepEqual(failed,unchanged);
  const recovered=getRetryCheckpoint(world,failed)!;
  const withPriorCheckpoint={...recovered,retryCheckpoint:failed.retryCheckpoint};
  const changed=applyWorldPatch(world,withPriorCheckpoint,patch);
  assert.equal(changed.state.retryCheckpoint,undefined,"Do not carry recovery state into a new revision.");
  const later=reduceInteraction(changed.world,changed.state,{type:"perform",actionId:"spend"});
  assert.equal(later.ok,true,later.reason);
  const laterFailed=pinRetryCheckpoint(changed.world,changed.state,later.state);
  assert.throws(()=>undoWorldPatch(changed.world,laterFailed,changed.checkpoint),/Recover your last solvable position or restart/);
  const restored=undoWorldPatch(changed.world,getRetryCheckpoint(changed.world,laterFailed)!,changed.checkpoint);
  assert.equal(restored.state.retryCheckpoint,undefined);
});

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

test("source scenery remains protected from manual object geometry edits", async () => {
  const { isSourceBackdrop, SOURCE_SCENERY_NOTE } = await import("./source-scenery.js");
  const world = freshExample(EXAMPLES[0].id);
  const scenery = { id: "source-scenery", kind: "decoration" as const, x: 0, y: 0,
    width: world.width, height: world.height, artNote: SOURCE_SCENERY_NOTE };
  world.entities.push(scenery);
  assert.equal(isSourceBackdrop(scenery), true);
  assert.throws(() => applyWorldPatch(world, progress, { id: "move-scenery", worldId: world.id,
    baseRevision: world.revision, origin: "manual", additions: [], updates: [{ id: scenery.id,
      x: 40, y: 0, width: scenery.width, height: scenery.height }] }), /original image and object identities/);
  assert.equal(scenery.x, 0);
});

test("image amendments require matching regenerated scenery and preserve it through apply and undo", async () => {
  const { SOURCE_SCENERY_NOTE } = await import("./source-scenery.js");
  const world = freshExample(EXAMPLES[0].id);
  const oldArt = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  const newArt = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=";
  world.entities.push({ id: "source-scenery", kind: "decoration", x: 0, y: 0,
    width: world.width, height: world.height, art: oldArt, artNote: SOURCE_SCENERY_NOTE });
  const patch: WorldPatch = { id: "refresh-scenery", worldId: world.id, baseRevision: world.revision,
    origin: "meta", additions: [{ id: "new-star", kind: "coin", x: 500, y: 300, width: 20, height: 20 }], sourceImage: newArt };
  assert.throws(() => applyWorldPatch(world, progress, patch), /refreshed scenery/);
  assert.throws(() => applyWorldPatch(world, progress, { ...patch, sourceScenery: { id: "other", art: newArt } }), /does not match/);
  const manual = applyWorldPatch(world, progress, { ...patch, origin: "manual", sourceScenery: { id: "source-scenery", art: newArt } });
  assert.equal(manual.world.entities.find(entity => entity.id === "source-scenery")!.art, newArt);
  assert.throws(() => applyWorldPatch(world, progress, { ...patch, sourceScenery: { id: "source-scenery", art: "javascript:alert(1)" } }));
  const result = applyWorldPatch(world, progress, { ...patch, sourceScenery: { id: "source-scenery", art: newArt } });
  assert.equal(result.world.entities.find(entity => entity.id === "source-scenery")!.art, newArt);
  assert.deepEqual(result.state.collected, progress.collected);
  const restored = undoWorldPatch(result.world, result.state, result.checkpoint);
  assert.equal(restored.world.entities.find(entity => entity.id === "source-scenery")!.art, oldArt);
  assert.equal(world.entities.at(-1)!.art, oldArt);
});

test("unchanged terrain overlap in saved progress does not block a remote edit or its undo", () => {
  const { world, patch } = setup();
  world.entities.push({ id: "old-overlap", kind: "terrain", x: 170, y: 610, width: 90, height: 80 });
  const result = applyWorldPatch(world, progress, patch);
  assert.deepEqual(result.state.player, progress.player);
  assert.deepEqual(undoWorldPatch(result.world, result.state, result.checkpoint).state.player, progress.player);
  assert.throws(() => applyWorldPatch(world, progress, { ...patch,
    additions: [{ id: "new-overlap", kind: "bridge", x: 175, y: 615, width: 80, height: 50 }] }), /cover your character/);
});
