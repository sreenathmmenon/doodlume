import test from "node:test";
import assert from "node:assert/strict";
import {
  fullPage,
  pageTransform,
  projectPoint,
  rectifyPixels,
  type PageCorners,
} from "./alignment.js";
const corners: PageCorners = [
  { x: 0.2, y: 0.15 },
  { x: 0.8, y: 0.05 },
  { x: 0.9, y: 0.85 },
  { x: 0.1, y: 0.95 },
];
test("projective page alignment maps every chosen corner exactly and rejects crossed or collapsed pages", () => {
  const m = pageTransform(corners);
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].forEach(([u, v], i) => {
    const p = projectPoint(m, u, v);
    assert.ok(Math.abs(p.x - corners[i].x) < 1e-9);
    assert.ok(Math.abs(p.y - corners[i].y) < 1e-9);
  });
  assert.throws(
    () => pageTransform([corners[0], corners[2], corners[1], corners[3]]),
    /order/,
  );
  assert.throws(
    () =>
      pageTransform([{ x: -0.1, y: 0 }, ...corners.slice(1)] as PageCorners),
    /inside/,
  );
  assert.throws(
    () =>
      pageTransform([
        { x: 0.4, y: 0.4 },
        { x: 0.41, y: 0.4 },
        { x: 0.41, y: 0.41 },
        { x: 0.4, y: 0.41 },
      ]),
    /order|larger/,
  );
});
test("pixel rectification preserves an unchanged page and samples a tilted page's actual pixels", () => {
  const pixels = new Uint8ClampedArray(100 * 100 * 4);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const i = (y * 100 + x) * 4;
      pixels[i] = x;
      pixels[i + 1] = y;
      pixels[i + 2] = 80;
      pixels[i + 3] = 255;
    }
  assert.deepEqual(
    rectifyPixels(pixels, 100, 100, fullPage(), 100, 100),
    pixels,
  );
  const result = rectifyPixels(pixels, 100, 100, corners, 21, 21),
    m = pageTransform(corners);
  for (const [x, y] of [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
    [10, 10],
  ]) {
    const p = projectPoint(m, x / 20, y / 20),
      i = (y * 21 + x) * 4;
    assert.ok(Math.abs(result[i] - p.x * 99) <= 0.51);
    assert.ok(Math.abs(result[i + 1] - p.y * 99) <= 0.51);
    assert.equal(result[i + 3], 255);
  }
});
