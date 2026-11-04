import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareSourceInteractionReview, readGameplayPlan, gameplaySchema } from "./creative-adaptation.js";
import { readPlannedInteractions, interactionsSchema, interactionInstructions } from "./interaction-planning.js";
import { interpretDrawing, RecognitionReviewError } from "./interpret.js";
import { modelConnection } from "./provider.js";
import { imageData } from "./images.js";
import { interactionEffects, reduceInteraction } from "../shared/interactions.js";
import { emptyPlayState, goalProgress } from "../shared/world.js";

const connection = modelConnection({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "synthetic-test-only" });
async function compile(options: { prefix?: string; amount?: number; initial?: number; required?: string[]; targetId?: string; carryable?: boolean; move?:boolean; resourceGoal?:boolean; requiresResource?:"source"|"target"; placement?:"place"|"use"; alignment?:"center"|"left"|"right"|"above"|"below"; edgePlacement?:boolean; rewrite?: (value: unknown, call: number) => unknown; onRequest?: (body: unknown) => void; reserve?: () => void; transport?: typeof fetch; signal?: AbortSignal } = {}) {
  const prefix = options.prefix ?? "fixture";
  const source = `${prefix}-source`, target = `${prefix}-target`;
  const image = imageData(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="#eee"/><path d="M100 100h100v100H100z" fill="#54a"/><circle cx="700" cy="350" r="60" fill="#7a5"/></svg>')).png().toBuffer());
  const value = {
    name: "Synthetic source interaction", description: "Protocol fixture, not live model evidence.", theme: "grove", clarification: "",
    objects: [
      { id: source, kind: "decoration", label: "Supply", targetId: null, bounds: { left: 100, top: 160, right: 200, bottom: 340 } },
      ...(options.move ? [{id:"dock",kind:"decoration",label:"Dock",targetId:null,bounds:{left:800,top:100,right:950,bottom:400}}] : []),
      { id: target, kind: "decoration", label: "Recipient", targetId: null, bounds: options.edgePlacement ? { left: 980, top: 480, right: 1000, bottom: 690 } : { left: 640, top: 480, right: 760, bottom: 690 } },
    ],
    goalRules: { requiredCollectedIds: [], requiredActivatedIds: [] },
    gameplay: {
      mode: "creative", movement: "discover", reason: "Use source objects in place.", avatarId: null,
      objective: "explore", objectiveLabel: options.resourceGoal ? "" : "Restore the supply", destinationLabel: options.resourceGoal ? "" : "Task complete", objectiveTitle: "Help the recipient",
      instructions: "Pick up the supply, then select the recipient.", clues: [], obstacleIds: [],
      path: [{ x: 100, y: 160, label: "Supply" }, { x: 500, y: 400, label: "Workspace" }, { x: 700, y: 600, label: "Recipient" }],
      requiredInteractionIds: options.required ?? (options.resourceGoal ? [] : ["supply"]),
      requiredResourceIds: options.resourceGoal ? [target] : [],
      interactions: { version: 1,
        objects: [{ entityId: source, carryable: options.carryable ?? true, resource: { type: "water", initial: options.initial ?? 3, capacity: 3 } }, { entityId: target, carryable: false, resource: { type: "water", initial: 0, capacity: options.resourceGoal ? 2 : 5 } }],
        actions: [{ id: "supply", label: "Fill the recipient", toolId: source, targetId: options.targetId ?? target, kind: options.placement ?? "transfer", ...(options.placement ? {} : {amount: options.amount ?? 2}), requires: [], ...(options.requiresResource ? {requiresResourceIds:[options.requiresResource === "source" ? source : target]} : {}), effects: options.placement ? [{kind:"moveObject",entityId:source,destinationId:target,durationMs:900,...(options.alignment ? {destinationAlignment:options.alignment} : {})}] : options.move ? [{kind:"moveObject",entityId:target,destinationId:"dock",durationMs:900,...(options.alignment ? {destinationAlignment:options.alignment} : {})}] : [] }],
      },
    },
  };
  let calls = 0;
  return interpretDrawing(image, "Pick up the supply and fill the recipient.", options.reserve ? {...connection, reserveRequest: options.reserve} : connection, options.signal ?? new AbortController().signal,
    { enabled: false, apiKey: "" }, async (url, init) => {
      calls++; options.onRequest?.(JSON.parse(String(init?.body)));
      if (options.transport) return options.transport(url, init);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(options.rewrite ? options.rewrite(value, calls) : value) } }] }));
    }, "picture");
}

test("source interaction compilation preserves distinct input IDs and geometry without creating collection tokens", async () => {
  for (const prefix of ["garden", "workbench"]) {
    const world = await compile({ prefix });
    assert.equal(world.gameplay?.movement, "discover");
    assert.deepEqual(world.gameplay?.clues, []);
    assert.equal(world.entities.filter(e => e.kind !== "decoration").length, 0);
    assert.deepEqual(world.goalRules?.requiredInteractionIds, ["supply"]);
    const source = world.entities.find(e => e.id === `${prefix}-source`)!;
    assert.deepEqual(source.artSource, { x: 100, y: 160, width: 100, height: 180 });
    assert.match(source.art!, /^data:image\/png;base64,/);
    assert.deepEqual(source.sourceLayer, { x: source.x, y: source.y, width: source.width, height: source.height });
    assert.notEqual(world.entities[0].art, world.sourceImage, "movable source pixels must leave the playable backdrop");
    assert.equal(world.entities.find(e => e.id === `${prefix}-target`)?.art, undefined, "stationary receivers retain their original backdrop pixels");
    const picked = reduceInteraction(world, emptyPlayState(), { type: "pickup", entityId: `${prefix}-source` });
    assert.equal(picked.ok, true);
    const applied = reduceInteraction(world, picked.state, { type: "perform", actionId: "supply" });
    assert.equal(applied.ok, true);
    assert.equal(applied.state.interactions?.quantities[`${prefix}-source`], 1);
    assert.equal(applied.state.interactions?.quantities[`${prefix}-target`], 2);
    assert.equal(goalProgress(world, applied.state).ready, true);
    assert.deepEqual(goalProgress(world, applied.state).missingInteractionIds, []);
  }
});

test("source planning rejects absent target instead of generating a substitute", async () => {
  await assert.rejects(compile({ targetId: "invented-source" }), /lost its original source object/);
});

test("source planning rejects an impossible required transfer before exposing the world", async () => {
  await assert.rejects(compile({ amount: 4 }), /usable amount|cannot be completed/);
  await assert.rejects(compile({ initial: 1, amount: 2 }), /cannot be completed/);
});

test("source planning rejects unmatched requirements and unusable tools", async () => {
  await assert.rejects(compile({ required: ["invented-action"] }), /finishing action/);
  await assert.rejects(compile({ carryable: false }), /carried source/);
});


test("model destination moves compile from source geometry and prepare actual moving artwork", async () => {
  const world=await compile({move:true});
  const target=world.entities.find(e=>e.id==='fixture-target')!,dock=world.entities.find(e=>e.id==='dock')!;
  const effect=world.interactions!.actions[0].effects![0];
  assert.equal(effect.kind,'moveObject');
  if(effect.kind!=='moveObject') throw new Error('Expected movement');
  assert.equal(effect.x,dock.x+(dock.width-target.width)/2);
  assert.equal(effect.y,dock.y+(dock.height-target.height)/2);
  assert.equal('destinationId' in effect,false);
  assert.ok(target.art && target.sourceLayer);
  assert.equal(dock.art,undefined,'The destination remains original stationary scenery');
});


test("model resource goals survive compilation and depend on the actual receiver quantity",async()=>{
  const world=await compile({resourceGoal:true});
  assert.deepEqual(world.goalRules?.requiredResourceIds,['fixture-target']);
  assert.equal(goalProgress(world,emptyPlayState()).ready,false);
  const picked=reduceInteraction(world,emptyPlayState(),{type:'pickup',entityId:'fixture-source'});
  const filled=reduceInteraction(world,picked.state,{type:'perform',actionId:'supply'});
  assert.equal(filled.ok,true); assert.equal(goalProgress(world,filled.state).ready,true);
});


test("source review re-extracts edited bounds while preserving the existing resource game",async()=>{
  const draft=await compile({resourceGoal:true});
  const supply=draft.entities.find(entity=>entity.id==='fixture-source')!;
  supply.artSource={x:110,y:170,width:110,height:190};
  const rebuilt=await prepareSourceInteractionReview(draft,{enabled:false,apiKey:""},new AbortController().signal);
  assert.deepEqual(rebuilt.interactions,draft.interactions);
  assert.deepEqual(rebuilt.goalRules?.requiredResourceIds,draft.goalRules?.requiredResourceIds);
  assert.deepEqual(rebuilt.entities.find(e=>e.id===supply.id)?.artSource,supply.artSource);
  assert.ok(rebuilt.entities.find(e=>e.id===supply.id)?.sourceLayer);
  assert.equal(rebuilt.gameplay?.movement,'discover');
  assert.equal(rebuilt.id,draft.id); assert.equal(rebuilt.revision,draft.revision);
});


test("model resource prerequisites survive compilation and reject impossible filled-target dependencies",async()=>{
  const world=await compile({requiresResource:"source"});
  assert.deepEqual(world.interactions?.actions[0].requiresResourceIds,["fixture-source"]);
  const picked=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"fixture-source"});
  assert.equal(reduceInteraction(world,picked.state,{type:"perform",actionId:"supply"}).ok,true);
  await assert.rejects(compile({requiresResource:"target"}),/cannot be completed/);
});


test("model placement compiles real source objects, releases the object and earns the mission through its actual move", async () => {
  const world = await compile({ placement: "place" });
  const source = world.entities.find(entity => entity.id === "fixture-source")!;
  const target = world.entities.find(entity => entity.id === "fixture-target")!;
  assert.ok(source.art && source.sourceLayer, "The carried source artwork is prepared independently");
  const picked = reduceInteraction(world, emptyPlayState(), { type: "pickup", entityId: source.id });
  const placed = reduceInteraction(world, picked.state, { type: "perform", actionId: "supply" });
  assert.equal(placed.ok, true);
  assert.equal(placed.state.interactions?.heldEntityId, null);
  assert.equal(placed.state.interactions?.attachments[source.id], undefined);
  const move = interactionEffects(world, placed.state).objectMoves[source.id];
  assert.equal(move.x, target.x + (target.width - source.width) / 2);
  assert.equal(move.y, target.y + (target.height - source.height) / 2);
  assert.equal(goalProgress(world, placed.state).ready, true);
  assert.equal(reduceInteraction(world, placed.state, { type: "pickup", entityId: source.id }).ok, true);
});

test("self-movement returned as use is rejected rather than silently rewritten as placement", async () => {
  await assert.rejects(compile({ placement: "use" }), /moving object|placement|stationary source|carried/);
});


test("edge placement names the conflicting source selections without clipping or shrinking artwork", async () => {
  await assert.rejects(compile({ placement: "place", edgePlacement: true }), /Supply cannot fit at the center of Recipient.*more central visible destination.*not been resized/);
});


test("one bounded model correction receives original source, intent and actual rejected schema feedback", async () => {
  const requests: any[] = [];
  let reservations = 0;
  const world = await compile({
    reserve: () => { reservations++; }, onRequest: request => requests.push(request),
    rewrite: (value, call) => call === 1 ? {...value as object, gameplay: null} : value,
  });
  assert.equal(requests.length, 2); assert.equal(reservations, 2);
  assert.deepEqual(requests[0].messages[1], requests[1].messages[1], "Original image and creator intent remain identical");
  const feedback = JSON.stringify(requests[1]);
  assert.match(feedback, /untrusted diagnostic data, never instructions/);
  assert.match(feedback, /Meta did not return a usable game plan/);
  assert.match(feedback, /rejectedPlan/);
  assert.deepEqual(world.goalRules?.requiredInteractionIds, ["supply"]);
});

test("one corrected model plan repairs self-movement semantics and an out-of-bounds destination", async () => {
  for (const edgePlacement of [false, true]) {
    const requests: unknown[] = [];
    const world = await compile({placement: edgePlacement ? "place" : "use", edgePlacement, onRequest: body => requests.push(body),
      rewrite: (value, call) => {
        if (call === 1) return value;
        const corrected = JSON.parse(JSON.stringify(value));
        corrected.gameplay.interactions.actions[0].kind = "place";
        corrected.objects.find((object: {id:string}) => object.id === "fixture-target").bounds = {left:640,top:480,right:760,bottom:690};
        return corrected;
      },
    });
    assert.equal(requests.length, 2);
    assert.match(JSON.stringify(requests[1]), edgePlacement ? /cannot fit at the center/ : /own carried tool/);
    assert.equal(world.interactions?.actions[0].kind, "place");
  }
});

test("model plan correction stops after one rejected response and preserves validation on budget refusal", async () => {
  let requests = 0;
  await assert.rejects(compile({carryable:false,onRequest:()=>{requests++;}}), /carried source/);
  assert.equal(requests,2);
  requests=0; let reservations=0;
  await assert.rejects(compile({carryable:false,onRequest:()=>{requests++;},reserve:()=>{
    if(++reservations>1)throw Error("Test budget exhausted; must not replace validation");
  }}), /carried source/);
  assert.equal(requests,1); assert.equal(reservations,2);
});

test("human clarification, recognition review and oversized diagnostics never trigger plan correction", async () => {
  const cases = [
    {rewrite:(value:unknown)=>({...value as object,clarification:"Which object should move?"}),pattern:/Which object/},
    {rewrite:(value:unknown)=>({...value as object,gameplay:null,clarification:"Which object should move?"}),pattern:/usable game plan/},
    {rewrite:(value:unknown)=>({...value as object,theme:"invalid",padding:"x".repeat(60_001)}),pattern:/incomplete interpretation/},
  ];
  for(const item of cases){
    let requests=0;
    await assert.rejects(compile({rewrite:item.rewrite,onRequest:()=>{requests++;}}),item.pattern);
    assert.equal(requests,1);
  }
  let requests=0;
  await assert.rejects(compile({onRequest:()=>{requests++;},rewrite:value=>{
    const plan=JSON.parse(JSON.stringify(value)); delete plan.gameplay;
    plan.objects=[{...plan.objects[0],kind:"player"}]; return plan;
  }}),error=>error instanceof RecognitionReviewError);
  assert.equal(requests,1);
});

test("provider authorization, rate limit, network and abort failures never trigger plan correction", async () => {
  for(const transport of [
    async()=>new Response("",{status:401}), async()=>new Response("",{status:429}),
    async()=>{throw Error("synthetic connection failure");},
  ]){
    let requests=0;
    await assert.rejects(compile({transport,onRequest:()=>{requests++;}}));assert.equal(requests,1);
  }
  const controller=new AbortController();let requests=0;
  await assert.rejects(compile({signal:controller.signal,onRequest:()=>{requests++;controller.abort();},rewrite:value=>({...value as object,gameplay:null})}));
  assert.equal(requests,1);
});


test("one correction receives combined tool, self-movement and edge-fit diagnostics without changing the rejected plan", async () => {
  const requests: any[] = [];
  const world = await compile({placement:"use",carryable:false,edgePlacement:true,onRequest:request=>requests.push(request),
    rewrite:(value,call)=>{
      if(call===1)return value;
      const corrected=JSON.parse(JSON.stringify(value));
      corrected.gameplay.interactions.objects[0].carryable=true;
      corrected.gameplay.interactions.actions[0].kind="place";
      corrected.objects[1].bounds={left:640,top:480,right:760,bottom:690};
      return corrected;
    },
  });
  assert.equal(requests.length,2);
  const instructions=requests[1].messages[0].content as string;
  const diagnostic=JSON.parse(instructions.slice(instructions.lastIndexOf('\n')+1));
  assert.match(diagnostic.validationError,/Supply \(fixture-source\) must be a carried source/);
  assert.match(diagnostic.validationError,/own carried tool; moving it requires kind:"place"/);
  assert.match(diagnostic.validationError,/Supply cannot fit at the center of Recipient/);
  assert.ok(diagnostic.validationError.length<=1500);
  assert.equal(diagnostic.rejectedPlan.gameplay.interactions.objects[0].carryable,false);
  assert.equal(diagnostic.rejectedPlan.gameplay.interactions.actions[0].kind,"use");
  assert.equal(diagnostic.rejectedPlan.objects[1].bounds.left,980);
  assert.equal(world.interactions?.actions[0].kind,"place");
});

test("same-object placement retains a named distinct-target error and is never accepted",async()=>{
  let requests=0;
  await assert.rejects(compile({placement:"place",onRequest:()=>{requests++;},rewrite:value=>{
    const plan=JSON.parse(JSON.stringify(value));
    const action=plan.gameplay.interactions.actions[0];
    action.targetId=action.toolId;action.effects[0].destinationId=action.toolId;
    return plan;
  }}),/Supply needs a distinct target.*toolId and targetId/);
  assert.equal(requests,2);
});

test("source choices compile two actual destinations, preserve OR goals through review, and remain exclusive", async () => {
  const choiceProposal = (value: unknown) => {
    const proposal = structuredClone(value) as any;
    const interactions = proposal.gameplay.interactions;
    interactions.objects.push({ entityId: "dock", carryable: false });
    interactions.actions.push({ ...structuredClone(interactions.actions[0]), id: "dock-placement", targetId: "dock",
      effects: [{kind:"moveObject",entityId:"fixture-source",destinationId:"dock",durationMs:900}] });
    interactions.choiceGroups = [{ id:"destination", label:"Choose a destination", actionIds:["supply","dock-placement"] }];
    proposal.gameplay.requiredChoiceGroupIds = ["destination"];
    return proposal;
  };
  const world = await compile({move:true,placement:"place",required:[],rewrite:choiceProposal});
  assert.deepEqual(world.goalRules?.requiredInteractionIds, []);
  assert.deepEqual(world.goalRules?.requiredChoiceGroupIds, ["destination"]);
  assert.equal(goalProgress(world, emptyPlayState()).ready, false);
  const positions = [];
  for (const actionId of ["supply", "dock-placement"]) {
    const picked = reduceInteraction(world, emptyPlayState(), { type:"pickup", entityId:"fixture-source" });
    const placed = reduceInteraction(world, picked.state, { type:"perform", actionId });
    assert.equal(placed.ok, true, actionId);
    assert.equal(goalProgress(world, placed.state).ready, true);
    positions.push(interactionEffects(world, placed.state).objectMoves["fixture-source"]);
    const repicked = reduceInteraction(world, placed.state, { type:"pickup", entityId:"fixture-source" });
    assert.equal(reduceInteraction(world, repicked.state, { type:"perform", actionId:actionId === "supply" ? "dock-placement" : "supply" }).ok, false);
  }
  assert.notDeepEqual(positions[0], positions[1]);
  const rebuilt = await prepareSourceInteractionReview(world, {enabled:false,apiKey:""}, new AbortController().signal);
  assert.deepEqual(rebuilt.interactions?.choiceGroups, world.interactions?.choiceGroups);
  assert.deepEqual(rebuilt.goalRules?.requiredChoiceGroupIds, ["destination"]);
  await assert.rejects(compile({move:true,placement:"place",required:["supply"],rewrite:choiceProposal}), /choice|alternative|branch/i);
  const fixedByCreator = structuredClone(world);
  fixedByCreator.goalRules!.requiredInteractionIds = ["supply"];
  const fixedRebuilt = await prepareSourceInteractionReview(fixedByCreator, {enabled:false,apiKey:""}, new AbortController().signal);
  assert.deepEqual(fixedRebuilt.goalRules?.requiredInteractionIds, ["supply"], "Rebuilding artwork preserves the creator's explicit branch requirement");
  assert.deepEqual(fixedRebuilt.interactions?.choiceGroups, world.interactions?.choiceGroups);
});


test("choice model schema stays optional and parser rejects malformed or unmatched groups", () => {
  const schema = interactionsSchema.anyOf[1];
  assert.equal(schema.required?.includes("choiceGroups"), false);
  assert.equal(gameplaySchema.required.includes("requiredChoiceGroupIds"), false);
  const actions = ["first", "second"].map(id => ({id,kind:"transfer",label:id,toolId:"source",targetId:"target",amount:1}));
  const legacy = {version:1,objects:[{entityId:"source",carryable:true},{entityId:"target"}],actions};
  assert.equal(readPlannedInteractions(legacy)?.choiceGroups, undefined);
  const group = {id:"route",label:"Route",actionIds:["first","second"]};
  assert.deepEqual(readPlannedInteractions({...legacy,choiceGroups:[group]})?.choiceGroups, [group]);
  for (const groups of [null, [ {...group,actionIds:["first"]} ], [ {...group,actionIds:["first","missing"]} ],
    [ {...group,actionIds:["first","first"]} ], [group,{...group,id:"other"}], Array.from({length:9},()=>group)]) {
    assert.throws(()=>readPlannedInteractions({...legacy,choiceGroups:groups}), /incomplete/);
  }
  const plan = {mode:"creative",movement:"discover",reason:"Visible objects",avatarId:null,objective:"explore",
    objectiveLabel:"Choose",destinationLabel:"Chosen",objectiveTitle:"Choose",instructions:"Choose a destination",clues:[],obstacleIds:[],
    path:[{x:100,y:100,label:"Start"},{x:200,y:200,label:"Middle"},{x:300,y:300,label:"End"}],
    interactions:{...legacy,choiceGroups:[group]},requiredInteractionIds:[],requiredResourceIds:[],requiredChoiceGroupIds:["missing"]};
  assert.throws(()=>readGameplayPlan(plan), /incomplete/);
  assert.deepEqual(readGameplayPlan({...plan,requiredChoiceGroupIds:["route"]})?.requiredChoiceGroupIds,["route"]);
});


test("source-relative placements preserve object size and compile every alignment without transport fields", async () => {
  for (const alignment of ["center","left","right","above","below"] as const) {
    const world = await compile({placement:"place",alignment});
    const moved=world.entities.find(entity=>entity.id==="fixture-source")!,target=world.entities.find(entity=>entity.id==="fixture-target")!;
    const effect=world.interactions!.actions[0].effects![0];
    assert.equal(effect.kind,"moveObject"); if(effect.kind!=="moveObject") throw new Error("Expected placement");
    assert.equal(effect.x,alignment==="left" ? target.x-moved.width-8 : alignment==="right" ? target.x+target.width+8 : target.x+(target.width-moved.width)/2);
    assert.equal(effect.y,alignment==="above" ? target.y-moved.height-8 : alignment==="below" ? target.y+target.height+8 : target.y+(target.height-moved.height)/2);
    assert.equal(moved.width,144); assert.equal(moved.height,155.52);
    assert.equal("destinationAlignment" in effect,false); assert.equal("destinationId" in effect,false);
  }
  const triggered = await compile({move:true,alignment:"below"});
  const dock = triggered.entities.find(entity=>entity.id==="dock")!;
  const triggeredMove = triggered.interactions!.actions[0].effects![0];
  assert.equal(triggeredMove.kind,"moveObject");
  if (triggeredMove.kind!=="moveObject") throw new Error("Expected triggered movement");
  assert.equal(triggeredMove.y,dock.y+dock.height+8,"Triggered prop movement uses the same source-relative geometry");
  const edge = await compile({placement:"place",alignment:"left",edgePlacement:true});
  const effect=edge.interactions!.actions[0].effects![0];
  assert.equal(effect.kind,"moveObject");
  await assert.rejects(compile({placement:"place",alignment:"right",edgePlacement:true}), /to the right of.*without leaving the image/);
  await assert.rejects(compile({placement:"place",rewrite:value=>{
    const input=structuredClone(value) as any;
    input.gameplay.interactions.actions[0].effects[0].destinationAlignment="nearby";
    return input;
  }}),/incomplete/);
});

test("planning guidance ties spatial labels to alignment and requested follow-ups to terminal choice requirements", () => {
  assert.match(interactionInstructions,/Use left\/right for "beside" and below for "below\/under"/);
  assert.match(interactionInstructions,/do not promise beside or below while returning center/);
  assert.match(interactionInstructions,/separate terminal choice group/);
  assert.match(interactionInstructions,/Do not finish on the early choice alone/);
});

test("terminal choice requirements keep each branch unfinished until its dependent payoff", async () => {
  const world = await compile({move:true,placement:"place",required:[],rewrite:value=>{
    const proposal=structuredClone(value) as any, interactions=proposal.gameplay.interactions;
    interactions.objects.push({entityId:"dock",carryable:false});
    const placement=(id:string,targetId:string,requires:string[])=>({id,kind:"place",label:id,toolId:"fixture-source",targetId,requires,
      effects:[{kind:"moveObject",entityId:"fixture-source",destinationId:targetId,durationMs:900}]});
    interactions.actions=[placement("choose-recipient","fixture-target",[]),placement("choose-dock","dock",[]),
      placement("finish-dock","dock",["choose-recipient"]),placement("finish-recipient","fixture-target",["choose-dock"])];
    interactions.choiceGroups=[{id:"start",label:"Choose a route",actionIds:["choose-recipient","choose-dock"]},
      {id:"finish",label:"Finish the chosen route",actionIds:["finish-dock","finish-recipient"]}];
    proposal.gameplay.requiredChoiceGroupIds=["finish"];
    return proposal;
  }});
  for(const [first,last] of [["choose-recipient","finish-dock"],["choose-dock","finish-recipient"]]) {
    const picked=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"fixture-source"});
    const chosen=reduceInteraction(world,picked.state,{type:"perform",actionId:first});
    assert.equal(chosen.ok,true); assert.equal(goalProgress(world,chosen.state).ready,false);
    const repicked=reduceInteraction(world,chosen.state,{type:"pickup",entityId:"fixture-source"});
    const finished=reduceInteraction(world,repicked.state,{type:"perform",actionId:last});
    assert.equal(finished.ok,true); assert.equal(goalProgress(world,finished.state).ready,true);
  }
});


test("surface layer schema is optional, parsed explicitly and survives compilation and creator review",async()=>{
  assert.equal(interactionsSchema.anyOf[1].properties!.objects.items.required.includes("layer"),false);
  const plan={version:1,objects:[{entityId:"source",carryable:true,layer:"surface"},{entityId:"target"}],
    actions:[{id:"fill",kind:"transfer",label:"Fill",toolId:"source",targetId:"target",amount:1}]};
  assert.equal(readPlannedInteractions(plan)?.objects[0].layer,"surface");
  assert.throws(()=>readPlannedInteractions({...plan,objects:[{...plan.objects[0],layer:"back"},plan.objects[1]]}),/incomplete/);
  const world=await compile({rewrite:value=>{const proposal=structuredClone(value) as any; proposal.gameplay.interactions.objects[0].layer="surface";return proposal;}});
  assert.equal(world.interactions?.objects[0].layer,"surface");
  const rebuilt=await prepareSourceInteractionReview(world,{enabled:false,apiKey:""},new AbortController().signal);
  assert.equal(rebuilt.interactions?.objects[0].layer,"surface");
  assert.match(interactionInstructions,/source-grounded/);
  assert.match(interactionInstructions,/layer:"surface"/);
});
