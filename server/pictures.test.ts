import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { interpretDrawing } from "./interpret.js";
import { modelConnection } from "./provider.js";
import { validateWorld } from "../shared/world.js";
import { setupFeedback } from "../shared/setup.js";
import { imageData } from "./images.js";

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
});
