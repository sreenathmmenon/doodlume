import test from "node:test";
import assert from "node:assert/strict";
import {
  validateWorld,
  retainPlayState,
  goalProgress,
  emptyPlayState,
  withGoalRules,
} from "./world.js";
import { EXAMPLES, freshExample } from "../src/lib/examples.js";

test("all three authored worlds satisfy the same world contract", () => {
  for (const example of EXAMPLES)
    assert.equal(validateWorld(example).id, example.id);
  const first = freshExample(EXAMPLES[0].id);
  const second = freshExample(EXAMPLES[0].id);
  assert.notEqual(first.id, second.id);
  assert.equal(first.exampleId, EXAMPLES[0].id);
  assert.equal(validateWorld(first).id, first.id);
});

test("ambiguous object IDs and missing gate targets cannot enter the engine", () => {
  const duplicate = freshExample(EXAMPLES[0].id);
  duplicate.entities[1].id = duplicate.entities[0].id;
  assert.throws(() => validateWorld(duplicate));
  const missingGate = freshExample(EXAMPLES[0].id);
  missingGate.entities.find((e) => e.kind === "lever")!.targetId = "not-a-gate";
  assert.throws(() => validateWorld(missingGate));
  const world = freshExample(EXAMPLES[0].id);
  for (const art of [false, 0, "", null])
    assert.throws(
      () =>
        validateWorld({
          ...world,
          entities: world.entities.map((e, i) => (i === 0 ? { ...e, art } : e)),
        }),
      /Unsupported artwork format/,
    );
  for (const label of [false, 0, null, "x".repeat(121)])
    assert.throws(
      () =>
        validateWorld({
          ...world,
          entities: world.entities.map((e, i) =>
            i === 0 ? { ...e, label } : e,
          ),
        }),
      /Object names/,
    );
  for (const label of [undefined, "", "x".repeat(120)])
    assert.doesNotThrow(() =>
      validateWorld({
        ...world,
        entities: world.entities.map((e, i) =>
          i === 0 ? { ...e, art: undefined, label } : e,
        ),
      }),
    );
});

test("restoring progress keeps surviving objects and drops stale object IDs", () => {
  const world = freshExample(EXAMPLES[0].id);
  assert.deepEqual(
    retainPlayState(world, {
      player: { x: 900, y: 640 },
      collected: ["sunseed-one", "removed-seed"],
      activated: ["willow-lever", "removed-lever"],
      completed: false,
    }),
    {
      player: { x: 900, y: 640 },
      collected: ["sunseed-one"],
      activated: ["willow-lever"],
      completed: false,
    },
  );
});

test("only selected collectible and lever IDs gate a destination, with explicit missing-object feedback", () => {
  const world = freshExample(EXAMPLES[0].id);
  delete world.goalRules; // A legacy reach-only world stays compatible.
  const start = emptyPlayState();
  assert.equal(goalProgress(world, start).ready, true);
  assert.equal(goalProgress(world, start).total, 0);
  world.goalRules = {
    requiredCollectedIds: ["sunseed-one"],
    requiredActivatedIds: ["willow-lever"],
  };
  validateWorld(world);
  const blocked = goalProgress(world, start);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.done, 0);
  assert.equal(blocked.total, 2);
  assert.deepEqual(blocked.missingCollectedIds, ["sunseed-one"]);
  assert.deepEqual(blocked.missingActivatedIds, ["willow-lever"]);
  assert.match(blocked.hint, /collect .* and activate /);
  const collected = { ...start, collected: ["sunseed-one"] };
  assert.equal(goalProgress(world, collected).done, 1);
  assert.deepEqual(goalProgress(world, collected).missingCollectedIds, []);
  const ready = goalProgress(world, {
    ...collected,
    activated: ["willow-lever"],
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.done, 2);
  assert.equal(
    world.entities.filter((e) => e.kind === "coin").length >
      collected.collected.length,
    true,
  );
  assert.deepEqual(start, emptyPlayState());
  for (const rules of [
    {
      requiredCollectedIds: ["sunseed-one", "sunseed-one"],
      requiredActivatedIds: [],
    },
    { requiredCollectedIds: ["willow-lever"], requiredActivatedIds: [] },
    { requiredCollectedIds: [], requiredActivatedIds: ["missing"] },
    { requiredCollectedIds: [], requiredActivatedIds: null },
  ])
    assert.throws(
      () => validateWorld({ ...world, goalRules: rules }),
      /requirement/,
    );
  assert.throws(
    () =>
      validateWorld({
        ...world,
        entities: world.entities.filter((e) => e.kind !== "goal"),
      }),
    /destination/,
  );
});


test("discovery keeps required clues synchronized without making optional objects prerequisites", () => {
  const world = freshExample(EXAMPLES[0].id);
  world.entities = world.entities.filter(entity => entity.kind !== "player");
  const coins = world.entities.filter(entity => entity.kind === "coin");
  const destination = world.entities.find(entity => entity.kind === "goal")!;
  world.gameplay = {movement:"discover",objectiveTitle:"Find the original marks",instructions:"Follow each clue in the original image.",clues:[{entityId:coins[0].id,text:"Find the first mark."},{entityId:destination.id,text:"Return home."}]};
  world.goalRules = {requiredCollectedIds:[coins[0].id],requiredActivatedIds:[]};
  validateWorld(world);
  const changed = withGoalRules(world,{requiredCollectedIds:[coins[1].id],requiredActivatedIds:[]},{[coins[1].id]:"Find the brighter mark."});
  assert.deepEqual(changed.gameplay!.clues,[{entityId:coins[1].id,text:"Find the brighter mark."},{entityId:destination.id,text:"Return home."}]);
  assert.throws(() => validateWorld({...world,goalRules:changed.goalRules}),/discovery clue/);
  assert.throws(() => withGoalRules(world,changed.goalRules!,{[coins[1].id]:""}),/discovery clue/);
  assert.doesNotThrow(() => validateWorld({...world,entities:world.entities.filter(entity=>entity.kind!=="terrain"&&entity.kind!=="bridge")}));
  const malformed=structuredClone(world);malformed.gameplay!.clues![0].entityId="not-an-object";
  assert.throws(()=>validateWorld(malformed,{allowIncomplete:true}),/discovery clue/);
});


test("authored platform jump strength is bounded and keeps legacy defaults", () => {
  const world = freshExample(EXAMPLES[0].id);
  world.gameplay = { movement: "platform", objectiveTitle: "Cross the drawing", instructions: "Hold jump to reach the next source ledge." };
  assert.equal(validateWorld(world).gameplay?.jumpStrength, undefined);
  world.gameplay.jumpStrength = 1.5;
  assert.equal(validateWorld(world).gameplay?.jumpStrength, 1.5);
  for (const strength of [0, 0.99, 1.61, Infinity, NaN])
    assert.throws(() => validateWorld({ ...world, gameplay: { ...world.gameplay, jumpStrength: strength } }));
  assert.throws(() => validateWorld({ ...world, gameplay: { ...world.gameplay, movement: "roam" } }));
});
