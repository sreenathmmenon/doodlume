import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { decodeMaskToRaster } from "@meta-sam/parser";
import { extractArtwork, segmentationConnection } from "./segmentation.js";
import { interpretDrawing } from "./interpret.js";
import { interpretAmendment } from "./amend.js";
import { modelConnection } from "./provider.js";
import { imageData } from "./images.js";
import { applyWorldPatch } from "../shared/revisions.js";
import { emptyPlayState } from "../shared/world.js";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localSegmentationArtwork, closeLocalSegmentationWorkers } from "./local-segmentation.js";

// Published Meta wire-format example, used as synthetic protocol data only.
// It is not an inference result from this app or a drawing-recognition benchmark.
const payload = "~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(";
const mask = { encoding: "lossless" as const, width: 60, height: 27, payload };
const line = `<0f>1<|box;x1=20;y1=30;x2=79;y2=56;w=100;h=100;c=0.96|><|mask;x=0;y=0;c=0.96;data=27,60,${payload}|>`;
const object = { id: "hero", x: 200, y: 300, width: 600, height: 270 };
const direct = modelConnection({
  MODEL_PROVIDER: "meta",
  MODEL_API_KEY: "test-only-key",
});
const sam = { enabled: true, apiKey: "test-only-key" };
const signal = new AbortController().signal;
const image = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="50" y="30" width="30" height="27" fill="#45678a"/><rect y="90" width="100" height="10" fill="black"/></svg>',
  ),
)
  .png()
  .toBuffer();

test("local cutout replies cannot change crop dimensions, failures stay local and cancellation stops an owned worker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doodlume-local-mask-test-"));
  const wrongSizePng = (await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer()).toString("base64");
  const makeConfig = async (name: string, reply: boolean) => {
    const executable = join(directory, name);
    await writeFile(executable, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');\nprocess.stdin.setEncoding('utf8');let pending='';process.stdin.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\\n'))!==-1){const request=JSON.parse(pending.slice(0,end));pending=pending.slice(end+1);${reply ? `process.stdout.write(JSON.stringify({id:request.id,records:[{id:'hero',png:'${wrongSizePng}',score:.9,visible:10,pixels:1620}],ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');` : ""}}});\n`);
    await chmod(executable, 0o700);
    return { python: executable, checkpoint: "synthetic-protocol-only", worker: "synthetic-protocol-only", configured: true };
  };
  const boxes = [{ id: "hero", left: 20, top: 30, right: 80, bottom: 57 }];
  try {
    const malformed = await makeConfig("wrong-dimensions", true);
    await assert.rejects(() => localSegmentationArtwork(image, boxes, malformed, new AbortController().signal), /dimensions/);
    let paid = 0, remote = 0;
    const fallback = await extractArtwork(image, [object], {
      enabled: true, apiKey: "", provider: "local-sam2", local: malformed,
      reserveRequest: () => { paid++; },
    }, new AbortController().signal, async () => { remote++; throw new Error("Remote must not be called"); });
    assert.equal(paid, 0); assert.equal(remote, 0);
    assert.equal(fallback.get("hero")?.artMethod, "paper");
    assert.match(fallback.get("hero")?.artNote ?? "", /Local Meta SAM 2.1 cutout unavailable/);
    const cancellation = new AbortController();
    const waiting = await makeConfig("wait-for-cancellation", false);
    const timer = setTimeout(() => cancellation.abort(), 80);
    try { await assert.rejects(() => localSegmentationArtwork(image, boxes, waiting, cancellation.signal)); }
    finally { clearTimeout(timer); }
  } finally { closeLocalSegmentationWorkers(); await rm(directory, { recursive: true, force: true }); }
});
const json = (value: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  );

function stream(text = line, completed = true) {
  const lane = {
    item_id: "segmentation-test",
    output_index: 0,
    content_index: 0,
  };
  const events = [
    { type: "response.output_text.delta", ...lane, delta: text.slice(0, 57) },
    { type: "response.output_text.delta", ...lane, delta: text.slice(57) },
    { type: "response.output_text.done", ...lane, text },
    ...(completed ? [{ type: "response.completed" }] : []),
  ];
  const bytes = new TextEncoder().encode(
    events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""),
  );
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + 37));
        offset += 37;
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

test("first-drawing pipeline uses SAM masks on original RGB artwork without moving objects or erasing white interiors", async () => {
  let calls = 0,
    reserved = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("chat/completions"))
      return json({
        name: "Synthetic wire test",
        description: "Protocol fixture",
        theme: "grove",
        clarification: "",
        objects: [
          {
            ...object,
            kind: "player",
            targetId: null,
            label: "White-filled hero",
          },
          {
            id: "floor",
            x: 0,
            y: 900,
            width: 1000,
            height: 100,
            kind: "terrain",
            targetId: null,
            label: "Floor",
          },
        ],
      });
    assert.equal(String(url), "https://api.meta.ai/v1/responses");
    assert.equal(body.model, "sam-3.1");
    assert.equal(body.metadata.include_confidence, "true");
    assert.match(
      body.input[0].content[0].text,
      /1<\|box;x1=20;y1=30;x2=79;y2=56;w=100;h=100\|>/,
    );
    const sent = Buffer.from(
      body.input[0].content[1].image_url.split(",")[1],
      "base64",
    );
    assert.deepEqual(
      await sharp(sent).ensureAlpha().raw().toBuffer(),
      await sharp(image).ensureAlpha().raw().toBuffer(),
    );
    return stream();
  };
  const world = await interpretDrawing(
    imageData(image),
    "Explore",
    direct,
    signal,
    {
      ...sam,
      reserveRequest: () => {
        reserved++;
      },
    },
    transport,
  );
  assert.equal(calls, 2);
  assert.equal(reserved, 1);
  const hero = world.entities[0];
  assert.equal(hero.artMethod, "sam");
  assert.equal(world.entities[1].artMethod, "paper"); // Missing mask is per-object fallback.
  assert.equal(hero.x, object.x * 1.44);
  const pixels = await sharp(Buffer.from(hero.art!.split(",")[1], "base64"))
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(pixels.info.width, 60);
  assert.equal(pixels.info.height, 27);
  const expected = decodeMaskToRaster(mask);
  for (let i = 0; i < expected.length; i++)
    assert.equal(pixels.data[i * 4 + 3], expected[i] * 255);
  assert.equal(pixels.data[5 * 4], 255); // White inside the mask stays white and opaque.
  assert.equal(pixels.data[5 * 4 + 3], 255);
});

test("incomplete, displaced, malformed, oversized or failed SAM responses fall back explicitly; cancellation and budget stop extra calls", async () => {
  for (const response of [
    () => stream(line, false),
    () => stream(""),
    () => stream(line.replace("data=27,60,", "data=900000,900000,")),
    () => stream(line.replace("w=100;h=100", "w=200;h=100")),
    () =>
      stream(line.replace("x1=20;y1=30;x2=79;y2=56", "x1=0;y1=0;x2=9;y2=9")),
    () => stream(line.replace("c=0.96", "c=0.1")),
    () => stream(line.replace(payload, "!broken")),
    () => new Response("private provider billing details", { status: 402 }),
  ]) {
    const result = await extractArtwork(
      image,
      [object],
      sam,
      signal,
      async () => response(),
    );
    assert.equal(result.get("hero")?.artMethod, "paper");
    assert.doesNotMatch(result.get("hero")?.artNote || "", /private provider/);
  }
  let calls = 0;
  await extractArtwork(
    image,
    [object],
    {
      ...sam,
      reserveRequest: () => {
        throw new Error("limit");
      },
    },
    signal,
    async () => {
      calls++;
      return stream();
    },
  );
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(() =>
    extractArtwork(image, [object], sam, controller.signal, async () => {
      controller.abort();
      throw new Error("aborted transport");
    }),
  );
  const baseten = modelConnection({ MODEL_PROVIDER: "baseten" });
  assert.equal(
    segmentationConnection({ MODEL_API_KEY: "test" }, baseten).enabled,
    false,
  );
  assert.equal(
    segmentationConnection(
      { MODEL_API_KEY: "test", SAM_ENABLED: "true" },
      baseten,
    ).enabled,
    true,
  );
});

test("revised-page SAM cutouts retain existing identities and collected progress, with batches capped at sixteen objects", async () => {
  const world = await interpretDrawing(
    imageData(image),
    "",
    direct,
    signal,
    { enabled: false, apiKey: "" },
    async () =>
      json({
        name: "Synthetic world",
        description: "Protocol fixture",
        theme: "grove",
        clarification: "",
        objects: [
          { ...object, kind: "player", targetId: null, label: "Hero" },
          {
            id: "floor",
            x: 0,
            y: 900,
            width: 1000,
            height: 100,
            kind: "terrain",
            targetId: null,
            label: "Floor",
          },
          {
            id: "seed",
            x: 500,
            y: 350,
            width: 100,
            height: 100,
            kind: "coin",
            targetId: null,
            label: "Seed",
          },
        ],
      }),
  );
  const before = structuredClone(world);
  // The revised page adds a distinct real mark; existing source pixels stay unchanged.
  const revised = await sharp(image)
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="50" y="60" width="30" height="27" fill="#45678a"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const result = await interpretAmendment(
    world,
    imageData(revised),
    "Add decoration",
    direct,
    signal,
    async (url) =>
      String(url).endsWith("responses")
        ? stream(
            line.replace("x1=20;y1=30;x2=79;y2=56", "x1=20;y1=60;x2=79;y2=86"),
          )
        : json({
            summary: "Added mark",
            clarification: "",
            aligned: true,
            warnings: [],
            additions: [
              {
                ...object,
                x: 500,
                y: 600,
                width: 300,
                id: "new-mark",
                kind: "decoration",
                targetId: null,
                label: "Mark",
                confidence: "high",
                reason: "Synthetic test mark",
              },
            ],
          }),
    sam,
  );
  assert.equal(result.patch.additions[0].artMethod, "sam");
  assert.notEqual(result.patch.sourceImage, world.sourceImage);
  const applied = applyWorldPatch(
    world,
    { ...emptyPlayState(), collected: ["seed"] },
    result.patch,
  );
  assert.deepEqual(
    applied.world.entities.slice(0, world.entities.length),
    world.entities,
  );
  assert.deepEqual(applied.state.collected, ["seed"]);
  assert.deepEqual(world, before);
  let calls = 0;
  await extractArtwork(
    image,
    Array.from({ length: 17 }, (_, i) => ({ ...object, id: `object-${i}` })),
    sam,
    signal,
    async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      const prompt = body.input[0].content[0].text;
      assert.equal(
        (prompt.match(/<\|box;/g) || []).length,
        calls === 1 ? 16 : 1,
      );
      return stream("");
    },
  );
  assert.equal(calls, 2);
});
