import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import sharp from "sharp";
import { installSourceScenery } from "./source-scenery-route.js";
import { applyWorldPatch, undoWorldPatch, type WorldPatch } from "../shared/revisions.js";
import { emptyPlayState, validateWorld, type WorldDefinition } from "../shared/world.js";
import { SOURCE_SCENERY_NOTE, sourceLayerArtworkBounds, sourceLayerForEdit } from "../shared/source-scenery.js";

async function fixture() {
  const art = "data:image/png;base64," + (await sharp({ create: { width: 183, height: 80, channels: 4, background: "#206f39" } }).png().toBuffer()).toString("base64");
  const source = "data:image/png;base64," + (await sharp({ create: { width: 1440, height: 820, channels: 4, background: "#ffffff" } })
    .composite([{ input: Buffer.from(art.split(",")[1], "base64"), left: 400, top: 475 }]).png().toBuffer()).toString("base64");
  const world: WorldDefinition = validateWorld({
    id: "source-edit-fixture", name: "Source layer", description: "Synthetic regression fixture", source: "meta", theme: "grove", inputKind: "drawing",
    sourceImage: source, width: 1440, height: 820, revision: 1,
    entities: [
      { id: "backdrop", kind: "decoration", x: 0, y: 0, width: 1440, height: 820, art: source, artNote: SOURCE_SCENERY_NOTE },
      { id: "hero", kind: "player", x: 100, y: 640, width: 40, height: 50 },
      { id: "floor", kind: "terrain", x: 0, y: 700, width: 1440, height: 24 },
      { id: "ledge", kind: "terrain", x: 400, y: 475, width: 183, height: 24, art, artMethod: "paper", artSource: { x: 400 / 1440 * 1000, y: 475 / 820 * 1000, width: 183 / 1440 * 1000, height: 80 / 820 * 1000 } },
      { id: "finish", kind: "goal", x: 1200, y: 640, width: 40, height: 50 },
    ],
  });
  const patch: WorldPatch = { id: "move-ledge", worldId: world.id, baseRevision: 1, origin: "manual", additions: [], updates: [{ id: "ledge", x: 400, y: 430, width: 350, height: 24 }] };
  return { world, patch };
}

test("source geometry cannot apply without prepared scenery; rename needs no preparation", async () => {
  const { world, patch } = await fixture();
  const before = structuredClone(world);
  assert.throws(() => applyWorldPatch(world, emptyPlayState(), patch), /source background/);
  assert.deepEqual(world, before);
  const original = world.entities.find(e => e.id === "ledge")!;
  const renamed = applyWorldPatch(world, emptyPlayState(), { ...patch, updates: [{ id: original.id, x: original.x, y: original.y, width: original.width, height: original.height, label: "My ledge" }] });
  assert.equal(renamed.world.entities.find(e => e.id === "ledge")!.sourceLayer, undefined);
  assert.equal(sourceLayerForEdit(world, original, original), undefined);
});

test("local edit preparation removes old source pixels, preserves full art, and survives undo/serialization", async () => {
  const { world, patch } = await fixture();
  const app = Fastify({ bodyLimit: 12_000_000 });
  installSourceScenery(app);
  try {
    const response = await app.inject({ method: "POST", url: "/api/source-scenery", payload: { world, image: world.sourceImage, additions: [], updates: patch.updates } });
    assert.equal(response.statusCode, 200, response.body);
    const result = applyWorldPatch(world, emptyPlayState(), { ...patch, sourceScenery: response.json().sourceScenery });
    const restored = validateWorld(JSON.parse(JSON.stringify(result.world)));
    const ledge = restored.entities.find(e => e.id === "ledge")!;
    assert.equal(ledge.art, world.entities.find(e => e.id === "ledge")!.art);
    const visual = sourceLayerArtworkBounds(ledge, restored.entities[0]);
    assert.equal(visual.x, 400);
    assert.equal(visual.y, 430);
    assert.ok(Math.abs(visual.width - 350) < 0.001);
    assert.ok(Math.abs(visual.height - 80) < 0.001, "painted underside must not compress to collision height");
    const { data, info } = await sharp(Buffer.from(restored.entities[0].art!.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (500 * info.width + 480) * 4;
    assert.deepEqual([...data.subarray(at, at + 3)], [255, 255, 255], "original ledge must disappear from backdrop");
    assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
    const second = applyWorldPatch(restored, emptyPlayState(), { ...patch, baseRevision: restored.revision, updates: [{ ...patch.updates![0], x: 500 }] });
    assert.deepEqual(second.world.entities.find(e => e.id === "ledge")!.sourceLayer, ledge.sourceLayer, "subsequent moves retain original placement without another preparation request");
    const undo = undoWorldPatch(result.world, result.state, result.checkpoint);
    assert.equal(undo.world.entities[0].art, world.entities[0].art);
    assert.equal(undo.world.entities.find(e => e.id === "ledge")!.sourceLayer, undefined);
  } finally { await app.close(); }
});

test("reapplying a legacy geometry edit recovers baseline from original source coordinates", async () => {
  const { world, patch } = await fixture();
  const legacy = structuredClone(world);
  const ledge = legacy.entities.find(e => e.id === "ledge")!;
  ledge.y = 430; ledge.width = 350;
  const baseline = sourceLayerForEdit(legacy, ledge, { ...ledge, x: 410 })!;
  assert.ok(Math.abs(baseline.width - 183) < 0.001);
  assert.ok(Math.abs(baseline.y - 475) < 0.001);
  assert.equal(baseline.height, 24);
  assert.throws(() => applyWorldPatch(legacy, emptyPlayState(), { ...patch, updates: [{ ...patch.updates![0], x: 410 }] }), /source background/);
});

test("source preparation respects expanded bounds and gate connection transitions", async () => {
  const { world, patch } = await fixture();
  const app = Fastify({ bodyLimit: 12_000_000 }); installSourceScenery(app);
  try {
    const expanded = { ...patch, bounds: { width: 1800, height: world.height }, updates: [{ ...patch.updates![0], x: 1500, width: 250 }] };
    const moved = await app.inject({ method: "POST", url: "/api/source-scenery", payload: { world, image: world.sourceImage, additions: [], updates: expanded.updates, bounds: expanded.bounds } });
    assert.equal(moved.statusCode, 200);
    assert.equal(applyWorldPatch(world, emptyPlayState(), { ...expanded, ...moved.json() }).world.width, 1800);
    const gateWorld = structuredClone(world);
    gateWorld.gameplay = { movement: "roam", objectiveTitle: "Open the way", instructions: "Use the switch.", clues: [] };
    gateWorld.entities.find(entity => entity.id === "ledge")!.kind = "gate";
    gateWorld.entities.push({ id: "switch", kind: "lever", x: 150, y: 650, width: 30, height: 30 });
    const connect: WorldPatch = { ...patch, updates: [{ id: "switch", x: 150, y: 650, width: 30, height: 30, targetId: "ledge" }] };
    const connectResponse = await app.inject({ method: "POST", url: "/api/source-scenery", payload: { world: gateWorld, image: gateWorld.sourceImage, additions: [], updates: connect.updates } });
    assert.equal(connectResponse.statusCode, 200);
    const linked = applyWorldPatch(gateWorld, emptyPlayState(), { ...connect, ...connectResponse.json() }).world;
    assert.notEqual(linked.entities[0].art, gateWorld.entities[0].art);
    const disconnect = { ...connect, baseRevision: linked.revision, updates: [{ ...connect.updates![0], targetId: null }] };
    const disconnectResponse = await app.inject({ method: "POST", url: "/api/source-scenery", payload: { world: linked, image: linked.sourceImage, additions: [], updates: disconnect.updates } });
    assert.equal(disconnectResponse.statusCode, 200);
    const unlinked = applyWorldPatch(linked, emptyPlayState(), { ...disconnect, ...disconnectResponse.json() }).world;
    const data = await sharp(Buffer.from(unlinked.entities[0].art!.split(",")[1], "base64")).ensureAlpha().raw().toBuffer();
    const at = (500 * 1440 + 480) * 4;
    assert.deepEqual([...data.subarray(at, at + 3)], [32, 111, 57], "unlinked gate returns to the original source backdrop");
  } finally { await app.close(); }
});
