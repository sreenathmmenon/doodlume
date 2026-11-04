import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { applyConfirmedSourceOutlines, sourceOutlineFingerprint, validateConfirmedSourceOutline } from "./source-outline.js";
import { imageData } from "./images.js";
import { validateWorld, type WorldDefinition } from "../shared/world.js";
import { prepareSourceInteractionReview } from "./creative-adaptation.js";

async function fixture() {
  const source=await sharp({create:{width:100,height:60,channels:3,background:"#f3b729"}}).png().toBuffer();
  const world:WorldDefinition={id:"outline-test",name:"Source outline",description:"Synthetic test",theme:"grove",width:1440,height:864,source:"meta",sourceImage:imageData(source),revision:1,
    gameplay:{movement:"discover",objectiveTitle:"Fill receiver",instructions:"Use the source."},
    entities:[{id:"stock",kind:"decoration",label:"Stock",x:144,y:173,width:288,height:259,artSource:{x:100,y:200,width:200,height:300}},
      {id:"receiver",kind:"decoration",label:"Receiver",x:850,y:173,width:288,height:259,artSource:{x:600,y:200,width:200,height:300}}],
    interactions:{version:1,objects:[{entityId:"stock",carryable:true,resource:{type:"charge",capacity:1,initial:1}},{entityId:"receiver",resource:{type:"charge",capacity:1,initial:0}}],actions:[{id:"fill",kind:"transfer",toolId:"stock",targetId:"receiver",label:"Fill",amount:1}]},
    goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["fill"]}};
  const rgba=Buffer.alloc(20*18*4,0);
  for(let i=0;i<20*18;i++){rgba[i*4]=200;rgba[i*4+1]=5;rgba[i*4+2]=100;rgba[i*4+3]=i%4===0?0:i%4===1?128:255;}
  const mask=imageData(await sharp(rgba,{raw:{width:20,height:18,channels:4}}).png().toBuffer());
  return {source,world,correction:{entityId:"stock",sourceBox:{...world.entities[0].artSource!},sourceFingerprint:sourceOutlineFingerprint(world.sourceImage),mask},rgba};
}

test("confirmed outlines retain exact original RGB, alpha and source identity through saved-world validation and preparation",async()=>{
  const {source,world,correction,rgba}=await fixture();
  const corrected=await applyConfirmedSourceOutlines(source,world,[correction]);
  const entity=corrected.entities[0];
  assert.equal(entity.artMethod,"outline");
  const decoded=await sharp(Buffer.from(entity.art!.split(",")[1],"base64")).raw().toBuffer();
  for(let i=0;i<20*18;i++) {
    assert.deepEqual([...decoded.subarray(i*4,i*4+3)],[243,183,41],"No RGB supplied by the mask is accepted, including hidden pixels");
    assert.equal(decoded[i*4+3],rgba[i*4+3]);
  }
  const saved=validateWorld(JSON.parse(JSON.stringify(corrected)),{allowIncomplete:true});
  await validateConfirmedSourceOutline(source,saved.entities[0]);
  const rebuilt=await prepareSourceInteractionReview(saved,{enabled:false,apiKey:""},new AbortController().signal);
  assert.equal(rebuilt.sourceImage,world.sourceImage);
  assert.equal(rebuilt.entities.find(item=>item.id==="stock")!.art,entity.art);
  assert.deepEqual(rebuilt.goalRules!.requiredInteractionIds,["fill"]);
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilt.interactions)),world.interactions);
});

test("outline admission rejects stale identity/bounds, wrong dimensions, empty alpha, duplicate objects and altered persisted RGB",async()=>{
  const {source,world,correction}=await fixture();
  await assert.rejects(()=>applyConfirmedSourceOutlines(source,world,[{...correction,sourceFingerprint:"0".repeat(64)}]),/source image changed/i);
  await assert.rejects(()=>applyConfirmedSourceOutlines(source,world,[{...correction,sourceBox:{...correction.sourceBox,x:101}}]),/unique source selection/);
  await assert.rejects(()=>applyConfirmedSourceOutlines(source,world,[correction,correction]),/unique source selection/);
  const wrong=imageData(await sharp({create:{width:19,height:18,channels:4,background:"#ff0000"}}).png().toBuffer());
  await assert.rejects(()=>applyConfirmedSourceOutlines(source,world,[{...correction,mask:wrong}]),/dimensions/);
  const empty=imageData(await sharp({create:{width:20,height:18,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer());
  await assert.rejects(()=>applyConfirmedSourceOutlines(source,world,[{...correction,mask:empty}]),/Keep some/);
  const accepted=await applyConfirmedSourceOutlines(source,world,[correction]);
  const tampered=structuredClone(accepted);tampered.entities[0].art=correction.mask;
  await assert.rejects(()=>applyConfirmedSourceOutlines(source,tampered,[]),/original source colors/);
  const moved=structuredClone(accepted);moved.entities[0].artSource!.x++;
  assert.throws(()=>validateWorld(moved,{allowIncomplete:true}),/no longer matches/);
});

test("platform source review uses corrected actor and prop selections while preserving separate surface collision placement",async()=>{
  const source=await sharp({create:{width:1000,height:600,channels:3,background:"#fff8ee"}}).png().toBuffer();
  const world:WorldDefinition={id:"corrected-platform",name:"Corrected selections",description:"Synthetic geometry regression",theme:"grove",width:1440,height:820,source:"meta",sourceImage:imageData(source),revision:1,
    gameplay:{movement:"platform",objectiveTitle:"Use the control",instructions:"Use the control and reach the finish."},
    entities:[
      {id:"hero",kind:"player",x:100,y:400,width:25,height:100,artSource:{x:200,y:400,width:60,height:100}},
      {id:"ground",kind:"terrain",x:0,y:492,width:1440,height:24,sourcePlacement:{x:0,y:492,width:1440,height:24},artSource:{x:0,y:610,width:1000,height:150}},
      {id:"control",kind:"decoration",x:360,y:440,width:30,height:40,artSource:{x:500,y:500,width:40,height:50}},
      {id:"finish",kind:"goal",x:1152,y:410,width:50,height:60,artSource:{x:800,y:500,width:35,height:55}},
    ],
    interactions:{version:1,objects:[{entityId:"control"}],actions:[{id:"operate",kind:"operate",toolId:"control",targetId:"control",label:"Use control",effects:[{kind:"moveSpeedBoost",multiplier:1.1}]}]},
    goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["operate"]}};
  const rebuilt=await prepareSourceInteractionReview(world,{enabled:false,apiKey:""},new AbortController().signal);
  const hero=rebuilt.entities.find(entity=>entity.id==="hero")!,control=rebuilt.entities.find(entity=>entity.id==="control")!,ground=rebuilt.entities.find(entity=>entity.id==="ground")!;
  assert.deepEqual(hero.artSource,world.entities[0].artSource);
  assert.ok(Math.abs(hero.width/hero.height - (60*rebuilt.width)/(100*rebuilt.height))<1e-10,"The character uses its full corrected source proportions, not the old 25×100 game rectangle.");
  assert.equal(control.x,500/1000*rebuilt.width,"Correcting the source selection moves the prop to its actual pictured position.");
  assert.ok(Math.abs(control.width-40/1000*rebuilt.width)<1e-10);
  assert.ok(Math.abs(control.height-50/1000*rebuilt.height)<1e-10);
  assert.deepEqual(ground.artSource,world.entities[1].artSource,"The complete painted ground remains separate from its landing lip.");
  assert.equal(ground.y,600/1000*rebuilt.height,"The landing edge uses original collision placement, not the lower visual selection.");
  assert.equal(ground.height,24);
  assert.deepEqual(ground.sourcePlacement,{x:0,y:ground.y,width:rebuilt.width,height:24});
});

test("creator cleanup margin persists independently of exact foreground art and rejects unsupported values",async()=>{
  const {source,world,correction}=await fixture();
  const original=await applyConfirmedSourceOutlines(source,world,[correction]);
  assert.equal(original.entities[0].sourceOutline!.repairMargin,undefined,"Legacy outlines retain zero implicit cleanup.");
  const cleaned=await applyConfirmedSourceOutlines(source,world,[{...correction,repairMargin:4}]);
  assert.equal(cleaned.entities[0].art,original.entities[0].art,"A cleanup margin never grows or repaints the foreground image.");
  const saved=validateWorld(JSON.parse(JSON.stringify(cleaned)),{allowIncomplete:true});
  assert.equal(saved.entities[0].sourceOutline!.repairMargin,4);
  assert.deepEqual((await applyConfirmedSourceOutlines(source,saved,[])).entities[0].sourceOutline,saved.entities[0].sourceOutline);
  for(const repairMargin of [-1,.5,13,NaN,null,'4']){
    await assert.rejects(applyConfirmedSourceOutlines(source,world,[{...correction,repairMargin}]),/cleanup margin/);
    const invalid=structuredClone(saved);invalid.entities[0].sourceOutline!.repairMargin=repairMargin as number;
    assert.throws(()=>validateWorld(invalid,{allowIncomplete:true}),/confirmed outline/);
  }
});
