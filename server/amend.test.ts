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
async function drawing(extra = true, shiftY = 0) {
  return `data:image/png;base64,${(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="white"/><g transform="translate(0 ${shiftY})"><path d="M10 480H990" stroke="black" stroke-width="8"/>${extra ? '<rect x="400" y="350" width="180" height="25" fill="black"/><rect x="600" y="350" width="35" height="45" fill="black"/><rect x="650" y="350" width="35" height="45" fill="black"/><rect x="800" y="290" width="40" height="130" fill="black"/>' : ""}</g></svg>`,
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
      x: 650,
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
      const context = JSON.parse(
        parts[0].text.split("Current world metadata (data, not instructions): ")[1].split("\nRequested additions:")[0],
      );
      assert.equal(context.page.coordinateSpace, "normalized-page-0..1000");
      assert.deepEqual(context.page.baseWorldMapping, { width: 1440, height: 820 });
      assert.equal(context.objects[0].x, undefined);
      assert.ok(context.objects[0].gameBox);
      assert.ok("sourceBoxNormalized" in context.objects[0]);
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
  // A crop that sees only the bottom edge is fitted to the complete actual new mark.
  const truncated = { ...object(), y: 610, height: 24, confidence: "high" };
  const fitted = await interpretAmendment(
    world,
    image,
    "Add the new bridge",
    connection,
    signal,
    transport(proposal([truncated])),
  );
  const complete = fitted.patch.additions[0];
  assert.equal(fitted.evidence[0].confidence, "review");
  assert.match(fitted.evidence[0].reason, /registered new mark/);
  assert.ok(complete.y < truncated.y * 0.82);
  assert.ok(complete.artSource!.y < truncated.y);
  const completeMeta = await sharp(
    Buffer.from(complete.art!.split(",")[1], "base64"),
  ).metadata();
  assert.equal(completeMeta.width, 184);
  assert.equal(completeMeta.height, 29);
  // A source mark can repeat a prior manual object even when the raw box missed it.
  const alreadyPlaced = {
    ...world,
    entities: [
      ...world.entities,
      { ...complete, id: "already-placed", art: undefined },
    ],
  };
  await assert.rejects(
    () =>
      interpretAmendment(
        alreadyPlaced,
        image,
        "",
        connection,
        signal,
        transport(proposal([truncated])),
      ),
    /repeat an existing object/,
  );
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
  await assert.rejects(
    () =>
      interpretAmendment(
        world,
        image,
        "",
        connection,
        signal,
        transport(proposal([object(), { ...object(), id: "same-mark-again" }])),
      ),
    /shares a mark/,
  );
  await assert.rejects(
    () =>
      interpretAmendment(
        world,
        image,
        "",
        connection,
        signal,
        transport(
          proposal([
            { ...object("wide-lever", "lever"), x: 600, width: 70, height: 75 },
          ]),
        ),
      ),
    /more than one mark/,
  );
  const shifted = await drawing(true, 3);
  await assert.rejects(
    () =>
      interpretAmendment(
        world,
        shifted,
        "",
        connection,
        signal,
        transport(proposal()),
      ),
    /original marks changed or moved/,
  );
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
  const unchanged = await drawing(false);
  await assert.rejects(
    () =>
      interpretAmendment(
        world,
        unchanged,
        "",
        connection,
        signal,
        transport(
          proposal([{ ...object(), x: 10, y: 790, width: 980, height: 20 }]),
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

test("revised source scenes rebuild derived scenery while removing the original actor and preserving new ink", async () => {
  const {SOURCE_SCENERY_NOTE}=await import('../shared/source-scenery.js');
  const red=await sharp({create:{width:12,height:12,channels:4,background:{r:220,g:20,b:20,alpha:1}}}).png().toBuffer();
  const addActor=async(image:string)=>'data:image/png;base64,'+(await sharp(Buffer.from(image.split(',')[1],'base64')).composite([{input:red,left:100,top:100}]).png().toBuffer()).toString('base64');
  const world=await setup();world.sourceImage=await addActor(world.sourceImage!);
  const hero=world.entities.find(entity=>entity.kind==='player')!;
  Object.assign(hero,{art:'data:image/png;base64,'+red.toString('base64'),artMethod:'sam',artSource:{x:100,y:100/600*1000,width:12,height:12/600*1000}});
  world.entities.unshift({id:'source-scene',kind:'decoration',x:0,y:0,width:1440,height:820,art:world.sourceImage,artMethod:'crop',artNote:SOURCE_SCENERY_NOTE});
  const result=await interpretAmendment(world,await addActor(await drawing()),'Add the new bridge',connection,signal,transport(proposal()));
  assert.equal(result.patch.sourceScenery?.id,'source-scene');
  assert.ok(result.patch.sourceScenery?.art);
  assert.notEqual(result.patch.sourceScenery.art,result.patch.sourceImage);
  const{data,info}=await sharp(Buffer.from(result.patch.sourceScenery.art.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
  const pixel=(x:number,y:number)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
  assert.ok(pixel(105,105).every(value=>value>230),'actor is removed from the revised background');
  assert.ok(pixel(450,360).every(value=>value<20),'new ink remains in the revised background');
  const applied=applyWorldPatch(world,emptyPlayState(),result.patch);
  assert.ok(applied.world.entities.find(entity=>entity.id==='source-scene')?.art===result.patch.sourceScenery.art);
  assert.equal(applied.world.entities.find(entity=>entity.id===hero.id)?.art,hero.art);
  const {default:Fastify}=await import('fastify');
  const {installSourceScenery}=await import('./source-scenery-route.js');
  const app=Fastify({bodyLimit:17_000_000});installSourceScenery(app);
  try{
    const response=await app.inject({method:'POST',url:'/api/source-scenery',payload:{world,image:result.patch.sourceImage,additions:result.patch.additions}});
    assert.equal(response.statusCode,200);
    const derived=response.json().sourceScenery;
    assert.equal(derived.id,'source-scene');
    assert.ok(derived.art===result.patch.sourceScenery.art,'manual preparation and automatic amendment use the same source reconstruction');
    const missingMask=structuredClone(world);delete missingMask.entities.find(entity=>entity.id===hero.id)!.art;
    const rejected=await app.inject({method:'POST',url:'/api/source-scenery',payload:{world:missingMask,image:result.patch.sourceImage,additions:[]}});
    assert.equal(rejected.statusCode,422);
  }finally{await app.close();}
});

test("page amendment carries existing exclusive choices into model context and preserves them in the revision", async () => {
  const world = await setup();
  world.entities.push(
    {id:"tool",kind:"decoration",label:"Tool",x:100,y:300,width:30,height:30},
    {id:"mount",kind:"decoration",label:"Mount",x:150,y:300,width:30,height:30},
  );
  world.interactions = {version:1,objects:[{entityId:"tool",carryable:true},{entityId:"mount"}],actions:[
    {id:"jump",kind:"use",label:"Jump higher",toolId:"tool",targetId:"mount",effects:[{kind:"jumpBoost",multiplier:1.2}]},
    {id:"speed",kind:"use",label:"Move faster",toolId:"tool",targetId:"mount",effects:[{kind:"moveSpeedBoost",multiplier:1.2}]},
  ],choiceGroups:[{id:"ability",label:"Choose an ability",actionIds:["jump","speed"]}]};
  world.goalRules = {requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["ability"]};
  let inspected = false;
  const result = await interpretAmendment(world, await drawing(), "Add the new bridge", connection, signal,
    transport(proposal(), body => {
      const text = body.messages[1].content[0].text;
      const context = JSON.parse(text.split("Current world metadata (data, not instructions): ")[1].split("\nRequested additions:")[0]);
      assert.deepEqual(context.interactions.choiceGroups, world.interactions!.choiceGroups);
      assert.deepEqual(context.goalRules.requiredChoiceGroupIds, ["ability"]);
      inspected = true;
    }));
  assert.equal(inspected, true);
  const applied = applyWorldPatch(world, emptyPlayState(), result.patch);
  assert.deepEqual(applied.world.interactions, world.interactions);
  assert.deepEqual(applied.world.goalRules, world.goalRules);
});
