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
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { localSegmentationArtwork, closeLocalSegmentationWorkers } from "./local-segmentation.js";
import { groundWholeActor } from "./actor-grounding.js";
import { compileCreativeAdaptation, readGameplayPlan } from "./creative-adaptation.js";
import { RecognitionReviewError } from "./recognition-error.js";
import { prepareMovingSourceArt, MovableArtworkReviewError } from "./moving-source-art.js";
import type { SourceRecoveryCache } from "./segmentation.js";

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

test("whole-object fallback separates prompt from output bounds and still requires independent agreement", async () => {
  const directory=await mkdtemp(join(tmpdir(),"doodlume-context-test-"));
  const source=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="34" y="36" width="12" height="25" fill="#45678a"/></svg>')).png().toBuffer();
  const crop=await sharp(source).extract({left:24,top:34,width:32,height:32}).ensureAlpha().raw().toBuffer();
  let visible=0;
  for(let i=0;i<32*32;i++){crop[i*4+3]=crop[i*4]===255?0:255;if(crop[i*4+3])visible++;}
  const png=(await sharp(crop,{raw:{width:32,height:32,channels:4}}).png().toBuffer()).toString('base64');
  const actor={id:'subject',kind:'decoration' as const,label:'Subject',x:300,y:400,width:200,height:200};
  const configFor=async(name:string,agree:boolean)=>{
    const executable=join(directory,name);
    await writeFile(executable,`#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');let pending='';process.stdin.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\\n'))!==-1){const r=JSON.parse(pending.slice(0,end));pending=pending.slice(end+1);const objects=r.objects.filter(o=>o.prompt);const records=objects.filter((o,i)=>${agree?'true':'i===0'}).map(o=>({id:o.id,png:'${png}',score:.9,visible:${visible},pixels:1024}));process.stdout.write(JSON.stringify({id:r.id,records,ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');}});`);
    await chmod(executable,0o700);
    return {python:executable,checkpoint:'synthetic-protocol-only',worker:'synthetic-protocol-only',configured:true};
  };
  try{
    const recovered=await groundWholeActor(source,actor,await configFor('agree',true),signal,[],undefined,true);
    assert.ok(recovered.artwork);
    assert.deepEqual({x:recovered.x,y:recovered.y,width:recovered.width,height:recovered.height},{x:340,y:360,width:120,height:250});
    assert.match(recovered.artwork.artNote!,/Tight object prompts agreed/);
    const actual=await sharp(Buffer.from(recovered.artwork.art!.split(',')[1],'base64')).removeAlpha().raw().toBuffer();
    assert.deepEqual(actual,await sharp(source).extract({left:34,top:36,width:12,height:25}).removeAlpha().raw().toBuffer());
    const uncertain=await groundWholeActor(source,actor,await configFor('no-agreement',false),signal,[],undefined,true);
    assert.equal(uncertain.artwork,undefined,"One bounded mask is not enough to bypass the outline review.");
    const config=await configFor('invalid-prompt',true);
    for(const prompt of [{left:0,top:34,right:46,bottom:61},{left:34.5,top:36,right:46,bottom:61},{left:46,top:36,right:34,bottom:61}])
      await assert.rejects(()=>localSegmentationArtwork(source,[{id:'subject',left:24,top:34,right:56,bottom:66,prompt}],config,signal),/prompts must fit/);
  }finally{closeLocalSegmentationWorkers();await rm(directory,{recursive:true,force:true});}
});

test("an agreed tight fragment cannot discard a long appendage outside a clipped model box", async () => {
  const directory=await mkdtemp(join(tmpdir(),"doodlume-appendage-test-"));
  const executable=join(directory,'mask-worker.cjs');
  // Synthetic protocol fixture: broad prompts see the whole body and tail;
  // every tight prompt consistently misses the tail. Agreement alone is unsafe.
  const source=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="31" y="41" width="18" height="18" fill="#45678a"/><rect x="49" y="45" width="19" height="4" fill="#ac5723"/></svg>')).png().toBuffer();
  await writeFile(executable,`#!/usr/bin/env node\nconst sharpModule=require(${JSON.stringify(fileURLToPath(import.meta.resolve('sharp')))});const sharp=sharpModule.default??sharpModule;const readline=require('node:readline');process.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');readline.createInterface({input:process.stdin}).on('line',async line=>{const r=JSON.parse(line),records=[];for(const o of r.objects){const width=o.right-o.left,height=o.bottom-o.top;const data=await sharp(Buffer.from(r.image,'base64')).extract({left:o.left,top:o.top,width,height}).ensureAlpha().raw().toBuffer();let visible=0;for(let i=0;i<width*height;i++){const keep=data[i*4]===69||(!o.prompt&&data[i*4]===172);data[i*4+3]=keep?255:0;if(keep)visible++;}if(!visible)continue;const png=(await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer()).toString('base64');records.push({id:o.id,png,visible,pixels:width*height,score:.9});}process.stdout.write(JSON.stringify({id:r.id,records,ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');});`);
  await chmod(executable,0o700);
  try{
    const actor={id:'subject',kind:'decoration' as const,label:'Subject',x:300,y:400,width:199,height:200};
    const recovered=await groundWholeActor(source,actor,{python:executable,checkpoint:'synthetic-protocol-only',worker:'synthetic-protocol-only',configured:true},signal,[],undefined,true);
    assert.equal(recovered.artwork,undefined,"Conflicting whole-subject evidence must retain review instead of deleting the tail.");
    assert.deepEqual(recovered,actor,"The original source selection must remain recoverable.");
  }finally{closeLocalSegmentationWorkers();await rm(directory,{recursive:true,force:true});}
});

test("batched cutouts compare every source RGB pixel at each crop offset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doodlume-batch-rgb-test-"));
  const executable = join(directory, "worker.cjs");
  // Synthetic protocol data isolates validation from model recognition. The
  // second reply alters a transparent edge pixel in the last, offset crop.
  const pixels = Buffer.from(Array.from({ length: 17 * 13 * 3 }, (_, at) => (at * 37) % 256));
  const source = await sharp(pixels, { raw: { width: 17, height: 13, channels: 3 } }).png().toBuffer();
  const boxes = [
    { id: "top-left", left: 0, top: 0, right: 6, bottom: 5 },
    { id: "middle", left: 4, top: 3, right: 12, bottom: 10 },
    { id: "bottom-right", left: 12, top: 9, right: 17, bottom: 13 },
  ];
  await writeFile(executable, `#!/usr/bin/env node
const imported=require(${JSON.stringify(fileURLToPath(import.meta.resolve('sharp')))}),sharp=imported.default??imported;
let count=0;
process.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line',async line=>{
 const request=JSON.parse(line),records=[];count++;
 for(const [index,box] of request.objects.entries()){
  const width=box.right-box.left,height=box.bottom-box.top;
  const data=await sharp(Buffer.from(request.image,'base64')).extract({left:box.left,top:box.top,width,height}).ensureAlpha().raw().toBuffer();
  data[(width*height-1)*4+3]=0;
  if(count===2&&index===2)data[(width*height-1)*4]^=1;
  const png=(await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer()).toString('base64');
  records.push({id:box.id,png,score:.9,visible:width*height-1,pixels:width*height});
 }
 process.stdout.write(JSON.stringify({id:request.id,records,ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');
});`);
  await chmod(executable, 0o700);
  const config = { python: executable, checkpoint: "synthetic-protocol-only", worker: "synthetic-protocol-only", configured: true };
  try {
    const result = await localSegmentationArtwork(source, boxes, config, signal);
    assert.deepEqual([...result.keys()], boxes.map(box => box.id));
    await assert.rejects(() => localSegmentationArtwork(source, boxes, config, signal), /changed original source pixels/);
  } finally { closeLocalSegmentationWorkers(); await rm(directory, { recursive: true, force: true }); }
});

test("one artwork review reports every unverified moving source and preserves the editable image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doodlume-all-outline-reviews-"));
  const executable = join(directory, "empty-worker.cjs");
  // Synthetic local protocol returns no accepted masks for either moving prop.
  // The real compiler must inspect both and expose one complete editable review.
  await writeFile(executable, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);process.stdout.write(JSON.stringify({id:request.id,records:[],ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');
});`);
  await chmod(executable, 0o700);
  const source = await sharp({create:{width:100,height:80,channels:3,background:"#527391"}}).png().toBuffer();
  const objects = [
    {id:"first",kind:"decoration" as const,label:"First supply",x:100,y:100,width:100,height:100},
    {id:"second",kind:"decoration" as const,label:"Second supply",x:300,y:100,width:100,height:100},
    {id:"recipient",kind:"decoration" as const,label:"Recipient",x:600,y:600,width:300,height:300},
  ];
  const plan = readGameplayPlan({mode:"creative",movement:"discover",reason:"Arrange the two separate supplies.",avatarId:null,
    objective:"explore",objectiveLabel:"Arrange supplies",destinationLabel:"Supplies arranged",objectiveTitle:"Arrange supplies",
    instructions:"Place both supplies on the recipient.",clues:[],obstacleIds:[],
    path:[{x:100,y:100,label:"First supply"},{x:300,y:100,label:"Second supply"},{x:750,y:750,label:"Recipient"}],
    requiredInteractionIds:["place-first","place-second"],requiredResourceIds:[],
    interactions:{version:1,objects:[{entityId:"first",carryable:true},{entityId:"second",carryable:true},{entityId:"recipient",carryable:false}],
      actions:["first","second"].map(entityId=>({id:`place-${entityId}`,label:`Place ${entityId}`,kind:"place",toolId:entityId,targetId:"recipient",requires:[],
        effects:[{kind:"moveObject",entityId,destinationId:"recipient",durationMs:900}]}))}})!;
  let remoteCalls=0;
  try {
    await assert.rejects(compileCreativeAdaptation({source,inputKind:"picture",name:"Synthetic multi-outline review",description:"Regression fixture",theme:"grove",objects,plan,
      segmentation:{enabled:true,apiKey:"",provider:"local-sam2",local:{python:executable,checkpoint:"synthetic-protocol-only",worker:"synthetic-protocol-only",configured:true}},
      signal,transport:async()=>{remoteCalls++;throw Error("No remote requests permitted");}}), error=>{
        assert.ok(error instanceof RecognitionReviewError, error instanceof Error ? error.stack : String(error));
        assert.deepEqual(error.recovery.issues.map(issue=>issue.objectId),["first","second"]);
        assert.deepEqual(error.recovery.issues.map(issue=>issue.id),["source-outline","source-outline-2"]);
        assert.equal(error.recovery.draft.sourceImage,imageData(source));
        assert.deepEqual(error.recovery.draft.goalRules?.requiredInteractionIds,["place-first","place-second"]);
        for(const object of objects)assert.deepEqual(error.recovery.draft.entities.find(entity=>entity.id===object.id)!.artSource,{x:object.x,y:object.y,width:object.width,height:object.height});
        return true;
      });
    assert.equal(remoteCalls,0);
  } finally { closeLocalSegmentationWorkers(); await rm(directory,{recursive:true,force:true}); }
});

test("request recovery cache reuses source extraction without compounding geometry or caching cancellation", async () => {
  const directory=await mkdtemp(join(tmpdir(),"doodlume-request-recovery-cache-"));
  const executable=join(directory,"worker.cjs"),requests=join(directory,"requests");
  // Synthetic SAM protocol extracts the actual colored source pixels. Recording
  // requests demonstrates reuse independently of returned geometry assertions.
  await writeFile(executable,`#!/usr/bin/env node
const fs=require('node:fs'),sm=require(${JSON.stringify(fileURLToPath(import.meta.resolve('sharp')))}),sharp=sm.default??sm;
process.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line',async line=>{
 const r=JSON.parse(line);fs.appendFileSync(${JSON.stringify(requests)},'request\\n');const records=[];
 for(const o of r.objects){const width=o.right-o.left,height=o.bottom-o.top;
  const rgba=await sharp(Buffer.from(r.image,'base64')).extract({left:o.left,top:o.top,width,height}).ensureAlpha().raw().toBuffer();let visible=0;
  for(let i=0;i<width*height;i++){rgba[i*4+3]=rgba[i*4]<100?255:0;if(rgba[i*4+3])visible++;}
  if(visible){const png=(await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer()).toString('base64');records.push({id:o.id,png,score:.9,visible,pixels:width*height});}
 }process.stdout.write(JSON.stringify({id:r.id,records,ms:1,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');
});`);
  await chmod(executable,0o700);
  const source=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="31" y="41" width="18" height="18" fill="#45678a"/></svg>')).png().toBuffer();
  const cache:SourceRecoveryCache=new Map();
  const connection={enabled:true,apiKey:"",provider:"local-sam2" as const,local:{python:executable,checkpoint:"synthetic-checkpoint",worker:"synthetic-worker",configured:true},sourceRecoveryCache:cache};
  const make=(id:string,x=100,width=100)=>({id,kind:"decoration" as const,label:id,x,y:x,width,height:width,artSource:{x:300,y:400,width:200,height:200}});
  const count=async()=>{try{return (await readFile(requests,"utf8")).trim().split("\n").length;}catch{return 0;}};
  const transport:typeof fetch=async()=>{throw Error("No remote calls permitted");};
  try{
    const first=make("first");await prepareMovingSourceArt(source,[first],connection,signal,transport,"picture");
    assert.deepEqual(first.artSource,{x:310,y:410,width:180,height:180});
    assert.deepEqual({x:first.x,y:first.y,width:first.width,height:first.height},{x:105,y:105,width:90,height:90});
    const initialRequests=await count();assert.ok(initialRequests>0);assert.equal(cache.size,1);
    const second=make("renamed",200,200);await prepareMovingSourceArt(source,[second],connection,signal,transport,"picture");
    assert.equal(await count(),initialRequests,"IDs, labels and game placement do not trigger extraction again.");
    assert.deepEqual({x:second.x,y:second.y,width:second.width,height:second.height},{x:210,y:210,width:180,height:180});
    const third=make("smaller",300,50);await prepareMovingSourceArt(source,[third],connection,signal,transport,"picture");
    assert.deepEqual({x:third.x,y:third.y,width:third.width,height:third.height},{x:302.5,y:302.5,width:45,height:45},"Cache hits scale original recovered source bounds exactly once.");
    second.artSource.x=0;
    assert.equal([...cache.values()][0].x,310,"Game edits cannot mutate the cached source selection.");
    const changed=make("bounds-change");changed.artSource.width=201;
    await prepareMovingSourceArt(source,[changed],connection,signal,transport,"picture");
    assert.ok(await count()>initialRequests,"A changed original source box requires fresh extraction.");
    const blank=await sharp({create:{width:100,height:100,channels:3,background:"white"}}).png().toBuffer();
    await assert.rejects(prepareMovingSourceArt(blank,[make("no-mask")],connection,signal,transport,"picture"),MovableArtworkReviewError);
    const beforeNoMaskHit=await count();
    await assert.rejects(prepareMovingSourceArt(blank,[make("same-no-mask")],connection,signal,transport,"picture"),MovableArtworkReviewError);
    assert.equal(await count(),beforeNoMaskHit,"A genuine no-artwork result is reused for the same source, not another image.");
    const controller=new AbortController();controller.abort();const beforeAbort=cache.size;
    await assert.rejects(prepareMovingSourceArt(source,[make("cancelled")],connection,controller.signal,transport,"picture"));
    assert.equal(cache.size,beforeAbort);assert.equal(await count(),beforeNoMaskHit,"Cancellation precedes both cached and uncached work.");
    const broken=join(directory,"broken-worker.cjs");
    await writeFile(broken,`#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ready:true,model:'Meta SAM 2.1 tiny',device:'cpu'})+'\\n');require('node:readline').createInterface({input:process.stdin}).on('line',line=>process.stdout.write(JSON.stringify({id:JSON.parse(line).id,error:'failed'})+'\\n'));`);
    await chmod(broken,0o700);const beforeWorkerError=cache.size;
    await assert.rejects(prepareMovingSourceArt(source,[make("failed-worker")],{...connection,local:{...connection.local,python:broken}},signal,transport,"picture"));
    assert.equal(cache.size,beforeWorkerError,"Worker failures cannot become cached no-artwork evidence.");
    while(cache.size<24)cache.set(`synthetic-capacity-${cache.size}`,{id:"capacity",label:"capacity",kind:"decoration",x:0,y:0,width:1,height:1});
    const extra=make("beyond-cache");extra.artSource.width=202;
    await prepareMovingSourceArt(source,[extra],connection,signal,transport,"picture");assert.equal(cache.size,24,"The request cache never expands beyond 24 entries.");
  }finally{closeLocalSegmentationWorkers();await rm(directory,{recursive:true,force:true});}
});

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
