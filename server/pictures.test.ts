import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { interpretDrawing } from "./interpret.js";
import { modelConnection } from "./provider.js";
import { validateWorld } from "../shared/world.js";
import { setupFeedback } from "../shared/setup.js";
import { imageData, cropArtwork } from "./images.js";
import { removeBoundaryPaper } from "../shared/paper-art.js";

test("picture interpretation preserves pale photographic pixels without SAM and manual review rejects invalid selections and blocked spawns", async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 252, g: 253, b: 254 },
    },
  })
    .png()
    .toBuffer();
  let request: any;
  const world = await interpretDrawing(
    imageData(source),
    "Explore this picture",
    modelConnection({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "test-only" }),
    new AbortController().signal,
    { enabled: false, apiKey: "" },
    async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: "Picture adaptation",
                  description: "Synthetic protocol fixture",
                  theme: "moon",
                  clarification: "",
                  objects: [
                    {
                      id: "subject",
                      kind: "player",
                      x: 100,
                      y: 500,
                      width: 60,
                      height: 100,
                      targetId: null,
                      label: "Subject",
                    },
                    {
                      id: "surface",
                      kind: "terrain",
                      x: 0,
                      y: 800,
                      width: 1000,
                      height: 200,
                      targetId: null,
                      label: "Surface",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    },
    "picture",
  );
  assert.match(
    request.messages[0].content,
    /photograph, printed picture or illustration/,
  );
  assert.equal(world.inputKind, "picture");
  assert.equal(world.entities[0].artMethod, "crop");
  assert.deepEqual(world.entities[0].artSource, {
    x: 100,
    y: 500,
    width: 60,
    height: 100,
  });
  const pixels = await sharp(
    Buffer.from(world.entities[0].art!.split(",")[1], "base64"),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(pixels[0], 252);
  assert.equal(pixels[1], 253);
  assert.equal(pixels[2], 254);
  assert.equal(pixels[3], 255);
  const manual = validateWorld({ ...world, source: "manual" });
  assert.equal(setupFeedback(manual).errors.length, 0);
  assert.match(setupFeedback(manual).warnings.join(" "), /no destination/);
  const blocked = structuredClone(manual);
  blocked.entities[0].y = 660;
  assert.match(setupFeedback(blocked).errors.join(" "), /Move the character/);
  const badCrop = structuredClone(manual);
  badCrop.entities[0].artSource!.width = 1000;
  assert.throws(() => validateWorld(badCrop), /selection falls outside/);

  // The white inside an actual closed outline is foreground, not paper.
  const rgba = new Uint8Array(12 * 12 * 4).fill(255);
  for (let y = 2; y <= 9; y++)
    for (let x = 2; x <= 9; x++)
      if (x === 2 || x === 9 || y === 2 || y === 9) {
        const i = (y * 12 + x) * 4;
        rgba[i] = 31;
        rgba[i + 1] = 47;
        rgba[i + 2] = 43;
      }
  const center = (5 * 12 + 5) * 4;
  rgba[center + 3] = 128; // Existing foreground alpha must not be repainted.
  rgba[0] = 239;
  rgba[1] = 241;
  rgba[2] = 243;
  rgba[3] = 128;
  const serverPixels = new Uint8Array(rgba),
    browserPixels = new Uint8ClampedArray(rgba);
  removeBoundaryPaper(serverPixels, 12, 12);
  removeBoundaryPaper(browserPixels, 12, 12);
  assert.deepEqual([...serverPixels], [...browserPixels]);
  assert.equal(serverPixels[center + 3], 128);
  assert.equal(serverPixels[(6 * 12 + 6) * 4 + 3], 255);
  assert.equal(serverPixels[(1 * 12 + 1) * 4 + 3], 0);
  assert.equal(serverPixels[3], Math.round((128 * (248 - 239)) / 22));
  for (let i = 0; i < rgba.length; i += 4)
    assert.deepEqual(serverPixels.slice(i, i + 3), rgba.slice(i, i + 3));
  const enclosedSource = await sharp(rgba, {
    raw: { width: 12, height: 12, channels: 4 },
  })
    .png()
    .toBuffer();
  const enclosed = await cropArtwork(enclosedSource, {
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  });
  assert.deepEqual(
    [
      ...(await sharp(Buffer.from(enclosed.split(",")[1], "base64"))
        .ensureAlpha()
        .raw()
        .toBuffer()),
    ],
    [...serverPixels],
  );
  const open = new Uint8Array(rgba);
  open.fill(255, (5 * 12 + 2) * 4, (5 * 12 + 2) * 4 + 4);
  removeBoundaryPaper(open, 12, 12);
  assert.equal(
    open[center + 3],
    0,
    "An open contour must not acquire an invented white fill",
  );
  assert.throws(
    () => removeBoundaryPaper(new Uint8Array(4), 2_000_001, 1),
    /smaller source image/,
  );
});
