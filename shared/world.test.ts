import test from "node:test";
import assert from "node:assert/strict";
import { validateWorld, retainPlayState } from "./world.js";
import { EXAMPLES, freshExample } from "../src/lib/examples.js";

test("all three authored worlds satisfy the same world contract", () => {
  for (const example of EXAMPLES)
    assert.equal(validateWorld(example).id, example.id);
});

test("ambiguous object IDs and missing gate targets cannot enter the engine", () => {
  const duplicate = freshExample(EXAMPLES[0].id);
  duplicate.entities[1].id = duplicate.entities[0].id;
  assert.throws(() => validateWorld(duplicate));
  const missingGate = freshExample(EXAMPLES[0].id);
  missingGate.entities.find((e) => e.kind === "lever")!.targetId = "not-a-gate";
  assert.throws(() => validateWorld(missingGate));
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
