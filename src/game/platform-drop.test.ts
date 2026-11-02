import test from 'node:test';import assert from 'node:assert/strict';
import {supportingDropPlatforms} from './platform-drop';
import type {WorldEntity} from '../../shared/world';
test('drop-through ignores only supporting thin ledges, retaining lower and solid surfaces',()=>{
  const ledge=(id:string,x:number,y:number,height=24):WorldEntity=>({id,kind:'terrain',x,y,width:100,height});
  assert.deepEqual(supportingDropPlatforms([ledge('left',0,100),ledge('right',100,100),ledge('lower',50,170),ledge('solid',50,100,90),ledge('distant',500,100)],{left:85,right:125,bottom:102}),['left','right']);
});
