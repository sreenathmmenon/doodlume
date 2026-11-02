import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sourceScenery } from './source-scenery.js';
import { modelJSON, InterpretationError } from './model.js';
import { modelConnection } from './provider.js';
import type { WorldEntity } from '../shared/world.js';

test('source scenery reconstructs removed actor background without erasing the surrounding source pixels or stationary destination', async () => {
  const actorPixel = await sharp({create:{width:1,height:1,channels:3,background:{r:210,g:20,b:20}}}).png().toBuffer();
  const source = await sharp({create:{width:10,height:10,channels:3,background:{r:31,g:85,b:127}}}).composite([{input:actorPixel,left:3,top:3}]).png().toBuffer();
  const mask = Buffer.alloc(4 * 4 * 4);
  for(let i=0;i<16;i++){mask[i*4]=31;mask[i*4+1]=85;mask[i*4+2]=127;mask[i*4+3]=i===5?255:0;}
  const art = 'data:image/png;base64,'+(await sharp(mask,{raw:{width:4,height:4,channels:4}}).png().toBuffer()).toString('base64');
  const actor:WorldEntity={id:'actor',kind:'player',x:0,y:0,width:4,height:4,art,artMethod:'sam',artSource:{x:200,y:200,width:400,height:400}};
  const goal:WorldEntity={...actor,id:'goal',kind:'goal',artSource:{x:700,y:700,width:200,height:200}};
  const scene = await sourceScenery(source,[actor,goal]);
  const {data}=await sharp(Buffer.from(scene.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
  assert.equal(data[(3*10+3)*4+3],255);
  const reconstructed = [...data.subarray((3*10+3)*4,(3*10+3)*4+3)];
  assert.ok(reconstructed.every((value, index) => Math.abs(value - [31,85,127][index]) <= 2));
  assert.equal(data[(2*10+2)*4+3],255);
  assert.equal(data[(7*10+7)*4+3],255);
  assert.deepEqual([...data.subarray(0,3)],[31,85,127]);
  assert.deepEqual([...data.subarray((7*10+7)*4,(7*10+7)*4+3)],[31,85,127]);
});

test('provider failures distinguish connection loss, cancellation and truncated output without exposing provider text', async () => {
  const connection=modelConnection({MODEL_PROVIDER:'fireworks',FIREWORKS_API_KEY:'test-only'});
  await assert.rejects(modelJSON(connection,{},new AbortController().signal,async()=>{throw new Error('secret raw provider message');}), (error:unknown)=>error instanceof InterpretationError && /could not be reached/.test(error.message) && !error.message.includes('secret'));
  const controller=new AbortController();controller.abort();let called=false;
  await assert.rejects(modelJSON(connection,{},controller.signal,async()=>{called=true;return new Response();}));assert.equal(called,false);
  await assert.rejects(modelJSON(connection,{},new AbortController().signal,async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"incomplete"'}}]}))),/stopped before completing/);
});

test('actor mask retains nearby detached appendages while excluding a distant larger neighbor', async () => {
  const {selectActorComponents}=await import('./actor-grounding.js');
  const rectangle=(x:number,y:number,w:number,h:number)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*100+x+i%w);
  const body=rectangle(30,30,20,30), antenna=rectangle(39,24,3,4), neighbor=rectangle(65,5,30,70), foot=rectangle(32,61,5,3);
  const selected=new Set(selectActorComponents([neighbor,antenna,body,foot],100,{left:28,top:25,width:25,height:40}));
  assert.ok(body.every(pixel=>selected.has(pixel)));
  assert.ok(antenna.every(pixel=>selected.has(pixel)));
  assert.ok(foot.every(pixel=>selected.has(pixel)));
  assert.ok(neighbor.every(pixel=>!selected.has(pixel)));
});
