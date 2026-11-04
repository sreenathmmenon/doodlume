import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { interpretDrawing } from "./interpret.js";
import { modelConnection } from "./provider.js";
import { validateWorld } from "../shared/world.js";
import { setupFeedback } from "../shared/setup.js";
import { imageData, photoAnalysisData, cropArtwork } from "./images.js";
import { removeBoundaryPaper } from "../shared/paper-art.js";
import { groundDrawingBoxes } from "./ink-grounding.js";

test('photo model transport keeps source dimensions and leaves lossless artwork unchanged',async()=>{
  const source=await sharp({create:{width:345,height:217,channels:3,background:'#b8c8d8'}}).png().toBuffer();
  const original=Buffer.from(source),transport=await photoAnalysisData(source);
  assert.match(transport,/^data:image\/jpeg;base64,/);
  const size=await sharp(Buffer.from(transport.split(',')[1],'base64')).metadata();
  assert.deepEqual([size.width,size.height],[345,217]);
  assert.deepEqual(source,original);
  assert.match(imageData(source),/^data:image\/png;base64,/);
});

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

  // Photographed/shaded paper must not be treated as a binary ink mask.
  const platform = { kind: "terrain", x: 100, y: 600, width: 700, height: 200 };
  const photograph = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#beb4a5"/><rect x="40" y="40" width="420" height="420" fill="#dededc"/><rect x="50" y="300" width="350" height="100" fill="#473561"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  assert.deepEqual(await groundDrawingBoxes(photograph, [platform]), [
    platform,
  ]);
  const greyDrawing = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#dededc"/><rect x="100" y="100" width="60" height="90" fill="#ba4949"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const located = (
    await groundDrawingBoxes(greyDrawing, [
      { kind: "player", x: 220, y: 150, width: 120, height: 170 },
    ])
  )[0];
  assert.ok(located.x < 200 && located.y < 200);
  assert.ok(located.width >= 120 && located.height >= 180);
  const blank = (
    await groundDrawingBoxes(greyDrawing, [
      { kind: "coin", x: 700, y: 700, width: 40, height: 40 },
    ])
  )[0];
  assert.ok("groundingIssue" in blank);
  assert.match(String(blank.groundingIssue), /could not be isolated/);
  const whitePage = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="white"/><rect x="50" y="300" width="350" height="100" fill="#473561"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const refined = (await groundDrawingBoxes(whitePage, [platform]))[0];
  assert.ok(refined.y <= platform.y);
  assert.ok(
    refined.y + refined.height >= platform.y + platform.height,
    "A support edge cannot replace the full platform artwork with a thin strip",
  );

  const shadedPaper = new Uint8Array(rgba);
  for (let i = 0; i < shadedPaper.length; i += 4)
    if (shadedPaper[i] > 226) {
      shadedPaper[i] = 220;
      shadedPaper[i + 1] = 222;
      shadedPaper[i + 2] = 219;
    }
  shadedPaper[0] = 220;
  shadedPaper[1] = 222;
  shadedPaper[2] = 219;
  const paleStroke = (1 * 12 + 1) * 4;
  shadedPaper[paleStroke] = 198;
  shadedPaper[paleStroke + 1] = 199;
  shadedPaper[paleStroke + 2] = 197;
  const photographedOriginal = new Uint8Array(shadedPaper);
  assert.equal(
    removeBoundaryPaper(shadedPaper, 12, 12).photographedPaper,
    true,
  );
  assert.equal(shadedPaper[(1 * 12 + 10) * 4 + 3], 0);
  assert.equal(shadedPaper[center + 3], 128);
  assert.equal(shadedPaper[paleStroke + 3], 255);
  for (let i = 0; i < shadedPaper.length; i += 4)
    assert.deepEqual(
      shadedPaper.slice(i, i + 3),
      photographedOriginal.slice(i, i + 3),
    );
  const colouredEdge = new Uint8Array(12 * 12 * 4);
  for (let i = 0; i < colouredEdge.length; i += 4)
    colouredEdge.set([190, 162, 117, 255], i);
  assert.equal(
    removeBoundaryPaper(colouredEdge, 12, 12).photographedPaper,
    false,
  );
  assert.equal(colouredEdge[3], 255);
});
