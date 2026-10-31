import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, freshExample } from "./examples.js";
import { emptyPlayState, continueExploration } from "../../shared/world.js";
import { applyWorldPatch } from "../../shared/revisions.js";
import {
  mergeLibraryRecords,
  parseBackup,
  serializeBackup,
  type SavedWorld,
} from "./library.js";

test("a growing library keeps every world; imports preserve existing versions and copies keep valid history", () => {
  const items: SavedWorld[] = Array.from({ length: 12 }, (_, index) => ({
    world: { ...freshExample(EXAMPLES[0].id), id: `creation-${index}` },
    state: emptyPlayState(),
    savedAt: new Date(2026, 9, 31, 0, index).toISOString(),
    history: [],
  }));
  const initial = mergeLibraryRecords([], items.slice(0, 9));
  const grown = mergeLibraryRecords([], initial.entries, items.slice(9));
  assert.equal(grown.entries.length, 12);
  const futureLegacy = {
    ...items[0],
    savedAt: "2099-01-01T00:00:00Z",
    world: { ...items[0].world, name: "Stale migration" },
  };
  assert.equal(
    mergeLibraryRecords([futureLegacy], [items[0]]).entries[0].world.name,
    items[0].world.name,
  );

  assert.deepEqual(
    new Set(grown.entries.map((i) => i.world.id)),
    new Set(items.map((i) => i.world.id)),
  );
  const incoming = {
    ...items[0],
    world: { ...items[0].world, name: "An older backup" },
  };
  const imported = mergeLibraryRecords([], grown.entries, [incoming], "import");
  assert.equal(imported.skipped, 1);
  assert.equal(
    imported.entries.find((i) => i.world.id === incoming.world.id)!.world.name,
    items[0].world.name,
  );
  const patch = applyWorldPatch(items[0].world, emptyPlayState(), {
    id: "extra-space",
    worldId: items[0].world.id,
    baseRevision: 1,
    origin: "manual",
    additions: [],
    bounds: { width: 2880, height: 820 },
  });
  const earned = continueExploration({
    ...patch.state,
    completed: true,
    collected: [items[0].world.entities.find((e) => e.kind === "coin")!.id],
  });
  const revised = {
    world: patch.world,
    state: earned,
    history: [patch.checkpoint],
    savedAt: items[0].savedAt,
  };
  const copy = mergeLibraryRecords([], [revised], [revised], "copies");
  assert.equal(copy.entries.length, 2);
  const duplicate = copy.entries.find((i) => i.world.id !== revised.world.id)!;
  assert.equal(duplicate.history![0].before.id, duplicate.world.id);
  assert.deepEqual(duplicate.state, earned);
  assert.deepEqual(parseBackup(serializeBackup(copy.entries)), copy.entries);
});

test("malformed backups fail as a whole without changing existing work; continuation keeps earned state", () => {
  const item: SavedWorld = {
    world: freshExample(EXAMPLES[0].id),
    state: emptyPlayState(),
    savedAt: new Date().toISOString(),
    history: [],
  };
  const original = structuredClone(item);
  const backup = JSON.parse(serializeBackup([item]));
  backup.worlds.push({
    ...item,
    world: { ...item.world, id: "invalid" },
    state: { ...item.state, player: { x: Infinity, y: 1 } },
  });
  assert.throws(
    () => parseBackup(JSON.stringify(backup)),
    /invalid world data/,
  );
  assert.throws(
    () => parseBackup('{"format":"other","worlds":[]}'),
    /supported/,
  );
  assert.deepEqual(item, original);
  const state = {
    ...emptyPlayState(),
    completed: true,
    player: { x: 900, y: 640 },
    collected: ["sunseed-one"],
    activated: ["willow-lever"],
    velocity: { x: 80, y: 0 },
    facingLeft: true,
  };
  const before = structuredClone(state);
  const continued = continueExploration(state);
  assert.deepEqual(continued, { ...before, exploring: true });
  assert.deepEqual(state, before);
  const saved = { ...item, state: continued };
  assert.deepEqual(parseBackup(serializeBackup([saved]))[0].state, continued);
});
