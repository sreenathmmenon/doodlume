import test from "node:test";
import assert from "node:assert/strict";
import { copyExample } from "./example-copy.js";
import { EXAMPLES, freshExample } from "./examples.js";
import { emptyPlayState, validateWorld } from "../../shared/world.js";
import { applyWorldPatch, undoWorldPatch } from "../../shared/revisions.js";

test("personal example copies have independent identity while preserving objects, progress and usable undo history", () => {
  const world = freshExample(EXAMPLES[0].id);
  const progress = { ...emptyPlayState(), collected: [world.entities.find(entity => entity.kind === "coin")!.id] };
  const edit = applyWorldPatch(world, progress, {
    id: "copy-rule-edit", worldId: world.id, baseRevision: world.revision,
    origin: "manual", additions: [], goalRules: { requiredCollectedIds: [], requiredActivatedIds: [] },
  });
  const personal = copyExample(edit.world, [edit.checkpoint]);
  assert.notEqual(personal.world.id, world.id);
  assert.equal(personal.world.source, "manual");
  assert.deepEqual(personal.world.entities, edit.world.entities);
  assert.equal(personal.history[0].before.id, personal.world.id);
  assert.equal(validateWorld(personal.world).id, personal.world.id);
  const undone = undoWorldPatch(personal.world, edit.state, personal.history[0]);
  assert.equal(undone.world.id, personal.world.id);
  assert.equal(undone.world.source, "manual");
  assert.deepEqual(undone.state.collected, progress.collected);
  assert.equal(world.source, "example");
  assert.equal(edit.checkpoint.before.id, world.id);
  assert.notEqual(copyExample(edit.world, []).world.id, personal.world.id);
  assert.equal(copyExample(personal.world, personal.history).world, personal.world);
});
