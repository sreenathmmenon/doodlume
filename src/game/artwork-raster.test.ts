import assert from "node:assert/strict";
import test from "node:test";
import { artworkRasterSize } from "./artwork-raster.ts";

test("SVG raster budgets preserve normal artwork and bound extreme display sizes without aspect distortion", () => {
  assert.deepEqual(artworkRasterSize(79, 95), { width: 237, height: 285 });
  for (const [width, height] of [
    [12020, 5020],
    [5020, 12020],
    [2048, 2048],
    [12020, 4],
    [4, 12020],
    [1440, 820],
  ]) {
    const raster = artworkRasterSize(width, height);
    assert.ok(raster.width >= 1 && raster.height >= 1);
    assert.ok(Math.max(raster.width, raster.height) <= 2048);
    assert.ok(raster.width * raster.height <= 2_000_000);
    assert.ok(raster.width <= width * 3 && raster.height <= height * 3);
    // Flooring at the budget can remove less than one raster pixel per axis.
    assert.ok(
      Math.abs(raster.width / width - raster.height / height) <
        1 / width + 1 / height,
    );
    assert.deepEqual(artworkRasterSize(height, width), {
      width: raster.height,
      height: raster.width,
    });
  }
});
