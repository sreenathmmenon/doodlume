import test from "node:test";
import assert from "node:assert/strict";
import { coverImagePlane } from "./home-image-layout";

test("photo overlays share the visible cover crop at desktop and portrait sizes", () => {
  const wide = coverImagePlane(1200, 480, 1440, 960)!;
  assert.deepEqual(wide, {width:1200, height:800, left:0, top:-160});
  // A pictured point at source y=600 appears at y=340, not 300 from stretching.
  assert.equal(wide.top + wide.height * 600 / 960, 340);
  const tall = coverImagePlane(600, 800, 1440, 960)!;
  assert.deepEqual(tall, {width:1200, height:800, left:-300, top:0});
  assert.equal(tall.left + tall.width / 2, 300);
  assert.equal(coverImagePlane(0, 480, 1440, 960), null);
});
