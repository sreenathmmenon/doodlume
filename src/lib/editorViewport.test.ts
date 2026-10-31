import assert from "node:assert/strict";
import test from "node:test";
import {
  editorCenter,
  editorFitScale,
  editorPoint,
  editorView,
} from "./editorViewport.ts";

test("expanded-world fit and detail preserve exact coordinate mapping at phone and desktop sizes", () => {
  for (const viewport of [
    { width: 328, height: 320 },
    { width: 960, height: 380 },
  ]) {
    const world = { width: 12000, height: 5000 };
    const fit = editorFitScale(world, viewport);
    const overview = editorView(world, viewport, fit, { x: 6000, y: 2500 });
    assert.ok(overview.width >= world.width - 1e-9);
    assert.ok(overview.height >= world.height - 1e-9);
    assert.ok(
      Math.abs(overview.width - world.width) < 1e-9 ||
        Math.abs(overview.height - world.height) < 1e-9,
    );
    assert.deepEqual(
      editorPoint(overview, viewport, {
        x: viewport.width / 2,
        y: viewport.height / 2,
      }),
      { x: 6000, y: 2500 },
    );
    const detail = editorView(world, viewport, 1, { x: 11800, y: 4900 });
    assert.ok(detail.x >= 0 && detail.x + detail.width <= world.width);
    assert.ok(detail.y >= 0 && detail.y + detail.height <= world.height);
    assert.equal(detail.width, viewport.width);
    assert.deepEqual(
      editorPoint(detail, viewport, {
        x: viewport.width / 2,
        y: viewport.height / 2,
      }),
      editorCenter(detail),
    );
    const clamped = editorView(world, viewport, 2, { x: -1000, y: -1000 });
    assert.deepEqual([clamped.x, clamped.y], [0, 0]);
  }
});

test("fitting a short world centers it without stretching source artwork", () => {
  const world = { width: 1440, height: 820 },
    viewport = { width: 328, height: 320 };
  const view = editorView(world, viewport, editorFitScale(world, viewport), {
    x: 720,
    y: 410,
  });
  const topLeft = editorPoint(view, viewport, {
    x: 0,
    y: -view.y * editorFitScale(world, viewport),
  });
  assert.ok(Math.abs(topLeft.x) < 1e-9 && Math.abs(topLeft.y) < 1e-9);
  assert.ok(
    Math.abs(view.width / viewport.width - view.height / viewport.height) <
      1e-9,
  );
});
