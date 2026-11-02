import assert from "node:assert/strict";
import test from "node:test";
import { artworkRasterSize } from "./artwork-raster.ts";
import {
  containArtwork,
  imageDirection,
  sourceColorField,
} from "./image-direction.ts";

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
  const wide = containArtwork(800, 200, 110, 88);
  const tall = containArtwork(200, 800, 72, 88);
  assert.ok(
    Math.abs(wide.width - 110) < 1e-9 && Math.abs(wide.height - 27.5) < 1e-9,
  );
  assert.ok(
    Math.abs(tall.width - 22) < 1e-9 && Math.abs(tall.height - 88) < 1e-9,
  );
  const bright = imageDirection(
    new Uint8ClampedArray([255, 255, 255, 255, 10, 100, 180, 255]),
  );
  const dark = imageDirection(
    new Uint8ClampedArray([0, 0, 0, 255, 10, 100, 180, 255]),
  );
  assert.equal(
    bright.accent,
    dark.accent,
    "source accent survives bright or dark neutral backgrounds",
  );
  assert.equal(bright.lightSource, true);
  assert.equal(dark.lightSource, false);
  assert.equal(
    imageDirection([255, 0, 0, 0]).accent,
    imageDirection([]).accent,
    "transparent colors do not invent a palette",
  );
  assert.notEqual(
    imageDirection([210, 50, 30, 255]).accent,
    bright.accent,
    "palette follows source pixels rather than file names or themes",
  );
  const checker = new Uint8ClampedArray(6 * 4 * 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 6; x++) {
      const i = (y * 6 + x) * 4;
      checker[i] = (x + y) % 2 ? 255 : 0;
      checker[i + 1] = (x + y) % 2 ? 0 : 255;
      checker[i + 3] = 255;
    }
  const unchanged = [...checker];
  assert.deepEqual(
    sourceColorField(checker, 6, 4),
    Array(6).fill(0x808000),
    "platform atmosphere retains only six mean colors, discarding fine source detail",
  );
  assert.deepEqual(
    [...checker],
    unchanged,
    "the original source pixels remain unchanged",
  );
});
