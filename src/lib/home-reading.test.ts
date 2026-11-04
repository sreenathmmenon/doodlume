import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateWorld } from "../../shared/world.js";
import { countBeats, goalTitle, readBoxes, readRelations, ruleSentences } from "./home-reading.js";

const load = (name: string) =>
  validateWorld(JSON.parse(readFileSync(new URL(`../../public/art/showcase/${name}.json`, import.meta.url), "utf8")));
const worlds = Object.fromEntries(["rooftop-run", "rooftop-springs", "patio-care", "rover"].map(name => [name, load(name)]));

test("boxes exclude the source image, stay inside 0-100 and stay within six", () => {
  for (const world of Object.values(worlds)) {
    const boxes = readBoxes(world);
    assert.ok(boxes.length > 0 && boxes.length <= 6);
    assert.ok(boxes.every(b => !/source|backdrop/.test(b.id)));
    for (const b of boxes) {
      for (const value of [b.x, b.y, b.w, b.h]) assert.ok(value >= 0 && value <= 100, `${b.id} ${value}`);
      assert.ok(b.x + b.w <= 100.001 && b.y + b.h <= 100.001);
      assert.ok(b.verb.split(" ").length <= 3 && !b.verb.endsWith("."));
    }
  }
});

test("rooftop boxes lead with the cat, goal and fish", () => {
  const boxes = readBoxes(worlds["rooftop-run"]);
  assert.deepEqual(boxes.slice(0, 3).map(b => b.id), ["cat-player", "fish-goal", "fish-coin"]);
  assert.equal(boxes[0].verb, "is you");
  assert.equal(readBoxes(worlds["rooftop-springs"])[0].verb, "can wear it");
});

test("patio care reads the watering can and its relation", () => {
  const can = readBoxes(worlds["patio-care"]).find(b => b.name === "Watering can");
  assert.equal(can?.verb, "waters");
  assert.deepEqual(readRelations(worlds["patio-care"]), [{ from: "watering_can", to: "potted_plant", label: "water" }]);
});

test("rover relations are deduplicated per pair", () => {
  const relations = readRelations(worlds.rover);
  const pairs = relations.map(r => `${r.from}>${r.to}`);
  assert.equal(new Set(pairs).size, pairs.length);
  assert.ok(relations.some(r => r.from === "crystal-1" && r.to === "beacon-tower" && r.label === "power"));
});

test("rover rules merge crystals and offer can't first", () => {
  const sentences = ruleSentences(worlds.rover);
  assert.ok(sentences.length <= 3);
  const crystals = sentences.find(s => s.subject === "crystals");
  assert.ok(crystals);
  assert.deepEqual(crystals.verbs[0], { label: "can't power", actionIds: [] });
  assert.ok(crystals.verbs.some(v => v.label === "powers" && v.actionIds.length > 0));
  assert.ok(sentences.some(s => s.verbs.some(v => v.label === "fits")));
});

test("rooftop-run beats name the cat and the fish", () => {
  const beats = countBeats(worlds["rooftop-run"]);
  assert.equal(beats.length, 3);
  assert.match(beats[0].title, /cat/);
  assert.match(beats[0].title, /fish/);
  assert.deepEqual(beats.map(b => b.note), ["A need.", "A goal.", "A way."]);
  assert.deepEqual(countBeats(worlds.rover), []);
});

test("goalTitle prefers the objective title", () => {
  assert.equal(goalTitle(worlds["patio-care"]), "Water the Succulents");
  assert.equal(goalTitle({ ...worlds.rover, gameplay: undefined }), "Lunar rescue");
});
