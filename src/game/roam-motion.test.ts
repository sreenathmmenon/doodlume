import assert from "node:assert/strict";
import test from "node:test";
import { roamSteering } from "./roam-motion.ts";

test("direct roam steering bounds diagonal speed, slows near arrival and never changes position", () => {
  const origin = { x: 20, y: 30 };
  const far = roamSteering(origin, { x: 1020, y: 1030 });
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 260) < 1e-9);
  const near = roamSteering(origin, { x: 30, y: 30 });
  assert.deepEqual(near, { x: 50, y: 0, arrived: false });
  assert.deepEqual(roamSteering(origin, { x: 22, y: 32 }), {
    x: 0,
    y: 0,
    arrived: true,
  });
  assert.deepEqual(origin, { x: 20, y: 30 });
});
