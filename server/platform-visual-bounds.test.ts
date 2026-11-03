import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { refinePlatformSelections } from './platform-grounding.js';
import { sourcePlatformScene } from './source-platform-scene.js';
import { modelConnection } from './provider.js';
import { validateWorld } from '../shared/world.js';
import { sourceLayerForEdit, sourceLayerArtworkBounds } from '../shared/source-scenery.js';
import type { SourceSelection, GameplayPlan } from './creative-adaptation.js';

const objects: SourceSelection[] = [
  { id:'hero', kind:'player', x:180, y:480, width:60, height:100, label:'Character' },
  { id:'first', kind:'terrain', x:100, y:600, width:300, height:150, label:'First rock' },
  { id:'second', kind:'bridge', x:450, y:550, width:400, height:200, label:'Second rock' },
];
const connection = modelConnection({ MODEL_PROVIDER:'meta', MODEL_API_KEY:'synthetic-test-only' });
const segmentation = { enabled:false, apiKey:'' };
const source = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="white"/><rect x="180" y="288" width="60" height="60" fill="#9249bc"/><rect x="100" y="360" width="300" height="90" fill="#8057bc"/><rect x="100" y="360" width="300" height="18" fill="#418b56"/><rect x="450" y="330" width="400" height="120" fill="#8057bc"/><rect x="450" y="330" width="400" height="18" fill="#418b56"/></svg>')).png().toBuffer();
const reply = (values: unknown[]) => new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify({ objects:values }) } }] }));

test('platform grounding tolerates visual box noise and leaves uncertain artwork eligible for later recovery', async () => {
  const input = await source();
  const responses = objects.map(o => ({ id:o.id, kind:o.kind, left:o.x, top:o.y, right:o.x+o.width,
    bottom:o.y+(o.kind==='player'?o.height:30), visualBounds:o.kind==='player'?null:{ left:o.x, top:o.y, right:o.x+o.width, bottom:o.y+o.height } }));
  const run = (values: unknown[]) => refinePlatformSelections(input, objects, connection, new AbortController().signal, async () => reply(values), segmentation);
  const result = await run(responses);
  assert.equal(result[1].height,30);
  assert.deepEqual(result[1].visualBounds,{x:100,y:600,width:300,height:150});
  const legacy = await run(responses.map(({visualBounds,...o})=>o));
  assert.equal(legacy[1].visualBounds,undefined);
  const noisy = await run(responses.map(o=>o.id==='first'?{...o,visualBounds:{left:110,top:602,right:400,bottom:750}}:o));
  assert.deepEqual(noisy[1].visualBounds,result[1].visualBounds);
  assert.equal(noisy[1].height,30,'Visual disagreement does not change the verified ledge');
  for (const visualBounds of [{left:800,top:20,right:900,bottom:80},{left:110,top:600,right:1050,bottom:750},{left:200,top:600,right:400,bottom:750},{}]) {
    const uncertain = await run(responses.map(o=>o.id==='first'?{...o,visualBounds}:o));
    assert.equal(uncertain[1].visualBounds,undefined);
    assert.deepEqual([uncertain[1].x,uncertain[1].y,uncertain[1].width,uncertain[1].height],[100,600,300,30]);
  }
});

test('source assembly retains complete platform pixels and an independent thin collision baseline', async () => {
  const input = await source();
  const selections = objects.map(o => o.kind==='player'?o:o.id==='first'?{...o,height:30}:{...o,height:30,visualBounds:{x:o.x,y:o.y,width:o.width,height:o.height}});
  const plan: GameplayPlan = { mode:'source-layout', reason:'Synthetic verification fixture', avatarId:'hero', objective:'explore',
    objectiveLabel:'Explore', destinationLabel:'Finish', path:[], movement:'platform', objectiveTitle:'Cross the rocks', instructions:'Reach the finish.', clues:[], obstacleIds:[] };
  const world = await sourcePlatformScene({ source:input,inputKind:'drawing',name:'Full artwork test',description:'Synthetic compiler fixture',theme:'grove',
    objects:selections,plan,segmentation,signal:new AbortController().signal,transport:fetch,
    requested:{requiredCollectedIds:[],requiredActivatedIds:[]},finishRules:()=>({requiredCollectedIds:[],requiredActivatedIds:[]}) });
  assert.ok(world,'The original source route must remain playable');
  validateWorld(world);
  assert.equal(world.entities.find(e=>e.id==='first')!.sourcePlacement,undefined,'Uncertain full artwork must remain eligible for on-demand recovery');
  const platform = world.entities.find(e=>e.id==='second')!;
  assert.equal(platform.y,550*world.height/1000);
  assert.equal(platform.height,24);
  assert.deepEqual(platform.sourcePlacement,{x:platform.x,y:platform.y,width:platform.width,height:24});
  assert.deepEqual(platform.artSource,{x:450,y:550,width:400,height:200});
  const crop = await sharp(Buffer.from(platform.art!.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(crop.info.height,120,'The crop includes the underside, not just the 18px green lip');
  const lower = ((crop.info.height-10)*crop.info.width+20)*4;
  assert.deepEqual([...crop.data.subarray(lower,lower+4)],[128,87,188,255]);
  assert.equal(platform.sourceLayer,undefined,'Stationary source art stays in its original backdrop until edited');
  const restored = validateWorld(JSON.parse(JSON.stringify(world)));
  const saved = restored.entities.find(e=>e.id==='second')!;
  const moved = {...saved,y:saved.y-45,width:saved.width*1.5};
  const baseline = sourceLayerForEdit(restored,saved,moved);
  assert.deepEqual(baseline,saved.sourcePlacement,'Edits use the collision baseline, not the taller visual box');
  const backdrop = restored.entities.find(e=>e.artSource?.width===1000&&e.artSource?.height===1000)!;
  const bounds = sourceLayerArtworkBounds({...moved,sourceLayer:baseline},backdrop);
  assert.ok(Math.abs(bounds.y-moved.y)<1e-8);
  assert.ok(Math.abs(bounds.width-moved.width)<1e-8);
  assert.ok(Math.abs(bounds.height-200*world.height/1000)<1e-8,'Changing the collider width preserves the full painted height');
});
