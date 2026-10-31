import assert from "node:assert/strict";
import test from "node:test";
import { sceneBoundsVisible, sceneView } from "./scene-visibility.ts";
import { terrainTiles } from "./terrain-tiles.ts";

test("static terrain visibility follows camera motion, boundary padding, zoom, resize and complete-world overview", () => {
  const camera = { width: 960, height: 420, zoom: 1, scrollX: 0, scrollY: 400 };
  const near = { x: 0, y: 670, width: 1000, height: 170 };
  const far = { x: 11000, y: 670, width: 1000, height: 170 };
  assert.equal(sceneBoundsVisible(near, sceneView(camera)), true);
  assert.equal(sceneBoundsVisible(far, sceneView(camera)), false);
  assert.equal(
    sceneBoundsVisible(
      { x: 1056, y: 500, width: 10, height: 10 },
      sceneView(camera),
    ),
    true,
  );
  camera.scrollX = 11040;
  assert.equal(sceneBoundsVisible(near, sceneView(camera)), false);
  assert.equal(sceneBoundsVisible(far, sceneView(camera)), true);
  const zoom = 960 / 12000;
  const overview = sceneView({
    width: 960,
    height: 420,
    zoom,
    scrollX: 6000 - 480,
    scrollY: 2500 - 210,
  });
  assert.equal(overview.width, 12000);
  assert.equal(sceneBoundsVisible(near, overview), true);
  assert.equal(sceneBoundsVisible(far, overview), true);
  const resized = sceneView({
    width: 328,
    height: 320,
    zoom: 0.5,
    scrollX: 1000,
    scrollY: 400,
  });
  assert.deepEqual(resized, { x: 836, y: 240, width: 656, height: 640 });
  assert.equal(sceneBoundsVisible(near, resized), true);
  assert.equal(sceneBoundsVisible(far, resized), false);
});

test("terrain raster planning covers exact padded bounds with bounded seamless tiles and an aggregate allocation budget", () => {
  const bounds = { x: 999.3, y: 666.7, width: 2050.5, height: 180.4 };
  const plan = terrainTiles(bounds, 8_000_000, 128)!;
  assert.ok(plan);
  assert.equal(plan.tiles[0].x, Math.floor(bounds.x));
  assert.equal(plan.tiles[0].y, Math.floor(bounds.y));
  assert.equal(
    plan.tiles.at(-1)!.x + plan.tiles.at(-1)!.width,
    Math.ceil(bounds.x + bounds.width),
  );
  assert.equal(
    plan.tiles.at(-1)!.y + plan.tiles.at(-1)!.height,
    Math.ceil(bounds.y + bounds.height),
  );
  assert.equal(
    plan.pixels,
    plan.tiles.reduce(
      (sum, tile) => sum + tile.textureWidth * tile.textureHeight,
      0,
    ),
  );
  for (const tile of plan.tiles) {
    assert.ok(tile.textureWidth <= 1024 && tile.textureHeight <= 1024);
    assert.equal(tile.textureWidth, tile.width + tile.gutter * 2);
    assert.equal(tile.textureHeight, tile.height + tile.gutter * 2);
  }
  for (let index = 1; index < plan.tiles.length; index++)
    assert.equal(
      plan.tiles[index - 1].x + plan.tiles[index - 1].width,
      plan.tiles[index].x,
    );
  assert.equal(terrainTiles(bounds, plan.pixels - 1, 128), null);
  assert.equal(terrainTiles(bounds, 8_000_000, 1), null);
  assert.equal(
    terrainTiles({ x: 0, y: 0, width: 12000, height: 5000 }, 8_000_000, 128),
    null,
  );
  let remaining = 8_000_000;
  let pieces = 128;
  for (let item = 0; item < 160; item++) {
    const next = terrainTiles(
      { x: item * 1000, y: 670, width: 1016, height: 178 },
      remaining,
      pieces,
    );
    if (!next) break;
    remaining -= next.pixels;
    pieces -= next.tiles.length;
  }
  assert.ok(remaining >= 0 && pieces >= 0);
});
