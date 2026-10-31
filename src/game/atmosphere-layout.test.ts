import assert from "node:assert/strict";
import test from "node:test";
import { atmosphereLayout } from "./atmosphere-layout.ts";

test("atmosphere canvas backing stays viewport-sized at phone, follow and maximum-map overview zoom", () => {
  for (const viewport of [
    { width: 328, height: 300 },
    { width: 960, height: 420 },
  ]) {
    const overviewZoom = Math.min(
      viewport.width / 12000,
      viewport.height / 5000,
    );
    for (const zoom of [overviewZoom, 0.5, 1, 1.18, 2]) {
      const layout = atmosphereLayout(viewport.width, viewport.height, zoom);
      assert.equal(layout.canvasWidth, viewport.width);
      assert.equal(layout.canvasHeight, viewport.height);
      assert.ok(Math.abs(layout.displayWidth * zoom - viewport.width) < 1e-9);
      assert.ok(Math.abs(layout.displayHeight * zoom - viewport.height) < 1e-9);
      assert.equal(
        layout.textureScale,
        Math.max(viewport.width / 1440, viewport.height / 820),
      );
      assert.ok(layout.canvasWidth * layout.canvasHeight * 4 <= 960 * 420 * 4);
    }
  }
});
