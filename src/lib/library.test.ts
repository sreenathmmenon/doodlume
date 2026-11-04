import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, freshExample } from "./examples.js";
import { emptyPlayState, continueExploration, getRetryCheckpoint, pinRetryCheckpoint, retainPlayState, validateWorld } from "../../shared/world.js";
import { interactionCompletionStatus, reduceInteraction } from "../../shared/interactions.js";
import { applyWorldPatch } from "../../shared/revisions.js";
import {
  mergeLibraryRecords,
  parseBackup,
  serializeBackup,
  validSavedWorlds,
  type SavedWorld,
} from "./library.js";
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

function retryableSave() {
  const world=validateWorld({id:"retry-save",name:"Allocation",description:"Test",theme:"grove",source:"manual",sourceImage:pixel,revision:1,width:1440,height:820,
    gameplay:{movement:"discover",objectiveTitle:"Fill receiver",instructions:"Choose a receiver."},
    entities:["supply","receiver","other"].map((id,index)=>({id,kind:"decoration",x:100+index*200,y:100,width:60,height:60})),
    interactions:{version:1,completionPolicy:"retryable",objects:[
      {entityId:"supply",carryable:true,resource:{type:"water",capacity:2,initial:2}},
      {entityId:"receiver",resource:{type:"water",capacity:2,initial:0}},
      {entityId:"other",resource:{type:"water",capacity:2,initial:0}},
    ],actions:[
      {id:"fill",kind:"transfer",label:"Fill receiver",toolId:"supply",targetId:"receiver",amount:2},
      {id:"other-one",kind:"transfer",label:"Supply other",toolId:"supply",targetId:"other",amount:1},
      {id:"other-two",kind:"transfer",label:"More for other",toolId:"supply",targetId:"other",amount:1},
    ]},goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:["receiver"]}});
  const before=reduceInteraction(world,{...emptyPlayState(),player:{x:250,y:220},velocity:{x:12,y:-3},facingLeft:true},{type:"pickup",entityId:"supply"}).state;
  const attempt=reduceInteraction(world,before,{type:"perform",actionId:"other-one"});
  assert.equal(attempt.ok,true,attempt.reason);
  return {world,before,state:pinRetryCheckpoint(world,before,attempt.state),savedAt:"2026-11-04T10:00:00Z",history:[]};
}

test("retryable allocation pins one exact solvable state across later mistakes, backup, reload and copy",()=>{
  const sample=retryableSave();
  assert.equal(interactionCompletionStatus(sample.world,sample.state),"impossible");
  assert.deepEqual(getRetryCheckpoint(sample.world,sample.state),sample.before);
  const second=reduceInteraction(sample.world,sample.state,{type:"perform",actionId:"other-two"});
  assert.equal(second.ok,true,second.reason);
  sample.state=pinRetryCheckpoint(sample.world,sample.state,second.state);
  assert.deepEqual(getRetryCheckpoint(sample.world,sample.state),sample.before,"Do not overwrite the recovery point after another losing allocation.");
  assert.equal(Object.hasOwn(sample.state.retryCheckpoint!.state,"retryCheckpoint"),false);
  const reopened=parseBackup(serializeBackup([sample]))[0];
  assert.equal(interactionCompletionStatus(reopened.world,reopened.state),"impossible");
  assert.deepEqual(getRetryCheckpoint(reopened.world,reopened.state),sample.before);
  const restored=getRetryCheckpoint(reopened.world,reopened.state)!;
  restored.player!.x=999;
  assert.equal(sample.state.retryCheckpoint!.state.player!.x,250,"Recovery returns an independent copy.");
  const copies=mergeLibraryRecords([], [sample], [sample], "copies").entries;
  const copied=copies.find(entry=>entry.world.id!==sample.world.id)!;
  assert.deepEqual(getRetryCheckpoint(copied.world,copied.state),sample.before);
  assert.equal(getRetryCheckpoint(sample.world,emptyPlayState()),undefined,"Restart has no checkpoint.");
});

test("the recovery checkpoint advances after a successful intermediate allocation",()=>{
  const sample=retryableSave(), world=sample.world;
  world.interactions!.actions.push(
    {id:"partial",kind:"transfer",label:"Start filling",toolId:"supply",targetId:"receiver",amount:1},
    {id:"finish",kind:"transfer",label:"Finish filling",toolId:"supply",targetId:"receiver",amount:1},
  );
  const partial=reduceInteraction(world,sample.before,{type:"perform",actionId:"partial"});
  assert.equal(partial.ok,true,partial.reason);
  const safe=pinRetryCheckpoint(world,sample.before,partial.state);
  assert.equal(interactionCompletionStatus(world,safe),"possible");
  const mistake=reduceInteraction(world,safe,{type:"perform",actionId:"other-one"});
  assert.equal(mistake.ok,true,mistake.reason);
  const pinned=pinRetryCheckpoint(world,safe,mistake.state);
  const {retryCheckpoint,...expected}=safe;
  assert.deepEqual(getRetryCheckpoint(world,pinned),expected);
  assert.deepEqual(getRetryCheckpoint(world,pinned)!.interactions!.completed,["partial"]);
});

test("invalid, nested, forged or stale retry checkpoints are discarded without discarding valid saved progress",()=>{
  const sample=retryableSave();
  for(const mutate of [
    (s:any)=>s.retryCheckpoint.worldId="elsewhere",
    (s:any)=>s.retryCheckpoint.revision++,
    (s:any)=>s.retryCheckpoint.state.retryCheckpoint={},
    (s:any)=>s.retryCheckpoint.state.player={x:Infinity,y:0},
    (s:any)=>s.retryCheckpoint.state.interactions.quantities.supply=999,
    (s:any)=>s.retryCheckpoint.state.interactions.extraHistory={state:{}},
    (s:any)=>{const {retryCheckpoint,...failed}=s;s.retryCheckpoint.state=failed;},
  ]) {
    const invalid=structuredClone(sample);mutate(invalid.state);
    const [saved]=validSavedWorlds([invalid]);
    assert.ok(saved,"A broken checkpoint need not erase the actual run.");
    assert.equal(saved.state.retryCheckpoint,undefined);
  }
  assert.equal(retainPlayState({...sample.world,revision:2},sample.state).retryCheckpoint,undefined);
  const protectedWorld=structuredClone(sample.world);protectedWorld.interactions!.completionPolicy="protected";
  assert.equal(retainPlayState(protectedWorld,sample.state).retryCheckpoint,undefined);
});

test("a growing library keeps every world; imports preserve existing versions and copies keep valid history", () => {
  const items: SavedWorld[] = Array.from({ length: 12 }, (_, index) => ({
    world: { ...freshExample(EXAMPLES[0].id), id: `creation-${index}` },
    state: emptyPlayState(),
    savedAt: new Date(2026, 9, 31, 0, index).toISOString(),
    history: [],
  }));
  const initial = mergeLibraryRecords([], items.slice(0, 9));
  const grown = mergeLibraryRecords([], initial.entries, items.slice(9));
  assert.equal(grown.entries.length, 12);
  const futureLegacy = {
    ...items[0],
    savedAt: "2099-01-01T00:00:00Z",
    world: { ...items[0].world, name: "Stale migration" },
  };
  assert.equal(
    mergeLibraryRecords([futureLegacy], [items[0]]).entries[0].world.name,
    items[0].world.name,
  );

  assert.deepEqual(
    new Set(grown.entries.map((i) => i.world.id)),
    new Set(items.map((i) => i.world.id)),
  );
  const incoming = {
    ...items[0],
    world: { ...items[0].world, name: "An older backup" },
  };
  const imported = mergeLibraryRecords([], grown.entries, [incoming], "import");
  assert.equal(imported.skipped, 1);
  assert.equal(
    imported.entries.find((i) => i.world.id === incoming.world.id)!.world.name,
    items[0].world.name,
  );
  const patch = applyWorldPatch(items[0].world, emptyPlayState(), {
    id: "extra-space",
    worldId: items[0].world.id,
    baseRevision: 1,
    origin: "manual",
    additions: [],
    bounds: { width: 2880, height: 820 },
  });
  const earned = continueExploration({
    ...patch.state,
    completed: true,
    collected: [items[0].world.entities.find((e) => e.kind === "coin")!.id],
  });
  const revised = {
    world: patch.world,
    state: earned,
    history: [patch.checkpoint],
    savedAt: items[0].savedAt,
  };
  const copy = mergeLibraryRecords([], [revised], [revised], "copies");
  assert.equal(copy.entries.length, 2);
  const duplicate = copy.entries.find((i) => i.world.id !== revised.world.id)!;
  assert.equal(duplicate.history![0].before.id, duplicate.world.id);
  assert.deepEqual(duplicate.state, earned);
  assert.deepEqual(parseBackup(serializeBackup(copy.entries)), copy.entries);
  const withPixels = (world: typeof revised.world) => ({
    ...world,
    sourceImage: pixel,
    entities: world.entities.map((entity) =>
      entity.kind === "player" ? { ...entity, art: pixel } : entity,
    ),
  });
  const imageEntries = copy.entries.map((entry) => ({
    ...entry,
    world: withPixels(entry.world),
    history: entry.history?.map((checkpoint) => ({
      ...checkpoint,
      before: withPixels(checkpoint.before),
    })),
  }));
  const packedText = serializeBackup(imageEntries);
  const packed = JSON.parse(packedText);
  assert.equal(packed.version, 2);
  assert.deepEqual(packed.assets, [pixel]);
  assert.equal(packedText.split(pixel).length, 2);
  assert.deepEqual(packed.worlds[0].world.sourceImage, { $asset: 0 });
  assert.deepEqual(parseBackup(packedText), imageEntries);
  assert.deepEqual(
    parseBackup(
      JSON.stringify({
        format: "doodlume-library",
        version: 1,
        worlds: imageEntries,
      }),
    ),
    imageEntries,
  );
  const currentOnly = serializeBackup([imageEntries[0]], {
    currentVersionOnly: true,
  });
  assert.equal(JSON.parse(currentOnly).historyMode, "current-version-only");
  assert.deepEqual(parseBackup(currentOnly)[0], {
    ...imageEntries[0],
    history: [],
  });
  assert.equal(imageEntries[0].history!.length, 1);
});

test("malformed backups fail as a whole without changing existing work; continuation keeps earned state", () => {
  const item: SavedWorld = {
    world: freshExample(EXAMPLES[0].id),
    state: emptyPlayState(),
    savedAt: new Date().toISOString(),
    history: [],
  };
  const original = structuredClone(item);
  const backup = JSON.parse(serializeBackup([item]));
  backup.worlds.push({
    ...item,
    world: { ...item.world, id: "invalid" },
    state: { ...item.state, player: { x: Infinity, y: 1 } },
  });
  assert.throws(
    () => parseBackup(JSON.stringify(backup)),
    /invalid world data/,
  );
  assert.throws(
    () => parseBackup('{"format":"other","worlds":[]}'),
    /supported/,
  );
  assert.deepEqual(item, original);
  const state = {
    ...emptyPlayState(),
    completed: true,
    player: { x: 900, y: 640 },
    collected: ["sunseed-one"],
    activated: ["willow-lever"],
    velocity: { x: 80, y: 0 },
    facingLeft: true,
  };
  const before = structuredClone(state);
  const continued = continueExploration(state);
  assert.deepEqual(continued, { ...before, exploring: true });
  assert.deepEqual(state, before);
  const saved = { ...item, state: continued };
  assert.deepEqual(parseBackup(serializeBackup([saved]))[0].state, continued);
  const imageItem = { ...item, world: { ...item.world, sourceImage: pixel } };
  assert.throws(
    () => serializeBackup([item, item]),
    /repeated world identities/,
  );
  assert.throws(() => serializeBackup(Array(1001).fill(item)), /1,000/);
  const packed = JSON.parse(serializeBackup([imageItem]));
  for (const reference of [
    { $asset: -1 },
    { $asset: 1 },
    { $asset: 0.5 },
    { $asset: "0" },
    { $asset: 0, extra: true },
  ]) {
    const broken = structuredClone(packed);
    broken.worlds[0].world.sourceImage = reference;
    assert.throws(
      () => parseBackup(JSON.stringify(broken)),
      /invalid world data/,
    );
  }
  for (const mutate of [
    (bad: typeof packed) => {
      bad.assets[0] = "data:text/html;base64,AAAA";
    },
    (bad: typeof packed) => {
      bad.assets.push(pixel);
    },
    (bad: typeof packed) => {
      bad.worlds[0].world.sourceImage = "javascript:alert(1)";
    },
    (bad: typeof packed) => {
      bad.worlds[0].world.sourceImage = "/art/../secret.png";
    },
    (bad: typeof packed) => {
      bad.worlds[0].world.metadata = { $asset: 99 };
    },
    (bad: typeof packed) => {
      Object.defineProperty(bad.worlds[0].world, "__proto__", {
        value: {},
        enumerable: true,
      });
    },
  ]) {
    const broken = structuredClone(packed);
    mutate(broken);
    assert.throws(
      () => parseBackup(JSON.stringify(broken)),
      /invalid world data/,
    );
  }
  const unused = JSON.parse(serializeBackup([item]));
  unused.assets = [pixel];
  assert.throws(
    () => parseBackup(JSON.stringify(unused)),
    /invalid world data/,
  );
  assert.deepEqual(item, original);
});
