import test from "node:test";
import assert from "node:assert/strict";
import {
  validateWorld,
  retainPlayState,
  goalProgress,
  emptyPlayState,
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
