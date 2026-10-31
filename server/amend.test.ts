import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { interpretAmendment } from "./amend.js";
import { modelConnection } from "./provider.js";
import { freshExample, EXAMPLES } from "../src/lib/examples.js";
import { applyWorldPatch } from "../shared/revisions.js";
import { emptyPlayState } from "../shared/world.js";

const connection = modelConnection({
  MODEL_PROVIDER: "baseten",
  BASETEN_API_KEY: "test-only-not-a-real-key",
});
const signal = new AbortController().signal;
async function drawing(extra = true) {
  return `data:image/png;base64,${(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="white"/><path d="M10 480H990" stroke="black" stroke-width="8"/>${extra ? '<rect x="400" y="350" width="180" height="25" fill="black"/><rect x="600" y="350" width="35" height="45" fill="black"/><rect x="800" y="290" width="40" height="130" fill="black"/>' : ""}</svg>`,
      ),
    )
      .png()
      .toBuffer()
  ).toString("base64")}`;
}
async function setup() {
  return {
    ...freshExample(EXAMPLES[0].id),
    source: "meta" as const,
    sourceImage: await drawing(false),
  };
}
const object = (
  id = "fresh-bridge",
  kind = "bridge",
  targetId: string | null = null,
) => ({
  id,
  kind,
  x: 400,
  y: 580,
  width: 180,
  height: 45,
  targetId,
  label: "New ink",
  confidence: "review",
  reason: "A new horizontal ink shape appears across the gap.",
});
const proposal = (additions = [object()]) => ({
  summary: "A new path and possibilities",
  clarification: "",
  aligned: true,
  warnings: ["Check the placement before applying."],
  additions,
});
function transport(value: unknown, onBody?: (body: any) => void): typeof fetch {
  return async (_url, init) => {
    onBody?.(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(value) } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

test("page comparison sends two real images and stable world context, crops original ink, and preserves gate identities", async () => {
  const world = await setup();
  const before = structuredClone(world);
  const image = await drawing();
  const raw = proposal([
    object(),
    {
      ...object("new-lever", "lever", "new-gate"),
      x: 600,
      width: 35,
      height: 75,
    },
    { ...object("new-gate", "gate"), x: 800, y: 480, width: 40, height: 220 },
    {
      ...object("old-gate-lever", "lever", "willow-gate"),
      x: 600,
      width: 35,
      height: 75,
    },
  ]);
  const result = await interpretAmendment(
    world,
    image,
    "Add the new bridge and levers",
    connection,
    signal,
    transport(raw, (body) => {
      const parts = body.messages[1].content;
      assert.equal(parts.filter((p: any) => p.type === "image_url").length, 2);
      assert.match(parts[0].text, /willow-gate/);
      assert.equal(body.response_format, undefined);
      assert.equal(body.model, "meta-models/muse-spark-open");
    }),
  );
  assert.equal(result.patch.origin, "meta");
  assert.equal(result.patch.baseRevision, world.revision);
  assert.ok(result.patch.sourceImage?.startsWith("data:image/png"));
  const [bridge, lever, gate, other] = result.patch.additions;
  assert.notEqual(bridge.id, "fresh-bridge");
  assert.equal(lever.targetId, gate.id);
  assert.equal(other.targetId, "willow-gate");
  const pixels = await sharp(Buffer.from(bridge.art!.split(",")[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.ok(pixels.some((v, i) => i % 4 === 3 && v > 200));
  assert.ok(pixels.some((v, i) => i % 4 === 3 && v === 0));
  const applied = applyWorldPatch(world, emptyPlayState(), result.patch);
  assert.deepEqual(
    applied.world.entities.slice(0, world.entities.length),
    world.entities,
  );
  assert.deepEqual(world, before);
});

test("an ambiguous lever stays unresolved until the person chooses its gate", async () => {
  const world = await setup();
  const result = await interpretAmendment(
    world,
    await drawing(),
    "New lever",
    connection,
    signal,
    transport(
      proposal([
        { ...object("new-lever", "lever"), x: 600, width: 35, height: 75 },
      ]),
    ),
  );
  assert.equal(result.patch.additions[0].targetId, undefined);
  assert.throws(
    () => applyWorldPatch(world, emptyPlayState(), result.patch),
    /clear connection/,
  );
});

test("misaligned photos, reused identities, unsupported roles and invented gate targets never become accepted patches", async () => {
  const world = await setup();
  const image = await drawing();
  for (const raw of [
    { ...proposal(), aligned: false },
    proposal([object(world.entities[0].id)]),
    proposal([object("another-player", "player")]),
    proposal([
      {
        ...object("lever", "lever", "missing-gate"),
        x: 600,
        width: 35,
        height: 75,
      },
    ]),
  ])
    await assert.rejects(() =>
      interpretAmendment(world, image, "", connection, signal, transport(raw)),
    );
  assert.equal(world.revision, 1);
});

test("blank object crops and provider failures are explicit errors, never replacement worlds", async () => {
  const world = await setup();
  await assert.rejects(
    () =>
      interpretAmendment(
        world,
        awaitableImage,
        "",
        connection,
        signal,
        transport(
          proposal([{ ...object(), x: 30, y: 30, width: 20, height: 20 }]),
        ),
      ),
    /no clear ink/,
  );
  const failing: typeof fetch = async () =>
    new Response("private provider detail", { status: 402 });
  await assert.rejects(
    () =>
      interpretAmendment(
        world,
        awaitableImage,
        "",
        connection,
        signal,
        failing,
      ),
    (error) =>
      error instanceof Error &&
      /billing restriction/.test(error.message) &&
      !error.message.includes("private provider detail"),
  );
});
const awaitableImage = await drawing();
