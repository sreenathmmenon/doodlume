import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelBox} from './images.js';
import {uniqueActorContexts} from './actor-contexts.js';

test('pixel-rounded duplicate contexts cannot become independent recovery evidence',()=>{
  const seed={x:500,y:500,width:10,height:10};
  const contexts=[.02,.04,.08].map(padding=>pixelBox({
    x:seed.x-seed.width*padding,y:seed.y-seed.height*padding,
    width:seed.width*(1+2*padding),height:seed.height*(1+2*padding),
  },100,100));
  assert.equal(contexts.length,3);
  assert.deepEqual(contexts[0],contexts[1]);
  const unique=uniqueActorContexts(contexts);
  assert.equal(unique.length,1);
  assert.equal(unique[0],contexts[0],'Stable first occurrence preserves candidate tie ordering.');
  assert.equal(contexts.length,3,'The caller still owns the original observations.');
});

test('equal output crops retain genuinely distinct prompt bounds and clipped output contexts',()=>{
  const output={left:0,top:0,width:100,height:90};
  const first={...output,prompt:{left:2,top:3,width:20,height:30}};
  const second={...output,prompt:{left:3,top:3,width:20,height:30}};
  const wider={...output,width:101,prompt:{...first.prompt}};
  const duplicate={...first,prompt:{...first.prompt}};
  const contexts=[first,second,wider,duplicate,output,{...output}];
  assert.deepEqual(uniqueActorContexts(contexts),[first,second,wider,output]);
  assert.equal(uniqueActorContexts(contexts).length,4,'No distinct context or prompt is discarded.');
});
