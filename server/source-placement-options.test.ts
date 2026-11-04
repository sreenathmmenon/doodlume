import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcePlacementOptions, placementFeedbackForPlan } from './source-placement-options.js';

const selection=(id:string,left:number,top:number,right:number,bottom:number)=>({id,bounds:{left,top,right,bottom}});

test('source placement facts expose edge failures without shrinking or choosing an alternative',()=>{
  const objects=[selection('small',400,400,500,500),selection('whole-surface',0,0,1000,1000),selection('edge',900,400,1000,500),selection('wide',300,400,700,500)];
  const original=structuredClone(objects),facts=sourcePlacementOptions(objects,1000,1000);
  assert.deepEqual(facts.imageEdgeContacts,[[],['left','top','right','bottom'],['right'],[]]);
  assert.equal(facts.fitBySource[0][1],'C','Outside a full-frame surface cannot fit; center is the only fitting alignment.');
  assert.equal(facts.fitBySource[3][2],'L','A wide object fits left of this edge target; its centered, above and below positions all overflow.');
  assert.equal(facts.fitBySource[1][2],'','An unchanged full-size object has no fitting placement at this target.');
  assert.equal(facts.fitBySource[0][0],'-','Self-destinations are not offered.');
  assert.equal(facts.interiorFitBySource[0][1],true,'The unchanged small object fits within the full source target.');
  assert.equal(facts.interiorFitBySource[3][2],false,'A valid exterior fit never implies an interior fit.');
  assert.equal(facts.interiorFitBySource[0][3],true);
  assert.equal(facts.interiorFitBySource[0][0],false,'An anchor cannot introduce a self-destination.');
  assert.deepEqual(objects,original,'Facts do not alter source bounds or resize objects.');
});

test('facts use the exact capped source frame and distinguish world fit from image coverage',()=>{
  const facts=sourcePlacementOptions([selection('small',500,450,600,460),selection('edge',0,450,100,460)],16,1000);
  assert.deepEqual(facts.world,{width:1440,height:5000});
  assert.deepEqual(facts.sourceFrame,{width:80,height:5000,x:680,y:0});
  assert.ok(facts.fitBySource[0][1].includes('L'),'Left fits the compiled world padding; facts explicitly do not promise source-image coverage.');
  const tiny=sourcePlacementOptions([selection('tiny',0,0,0.001,0.001),selection('target',0,0,0.001,0.001)],1000,1000);
  assert.equal(tiny.fitBySource[0][1],'CRB','The compiler minimum four-pixel object size is retained.');
  assert.equal(tiny.interiorFitBySource[0][1],true,'Equal compiled dimensions fit exactly; no resize is implied.');
  const unequal=sourcePlacementOptions([selection('tall',100,100,200,400),selection('wide',100,100,400,200)],1000,1000);
  assert.deepEqual(unequal.interiorFitBySource,[[false,false],[false,false]],'Both dimensions must fit; neither shape is rotated or shrunk.');
});

test('placement table has a bounded cell per ordered pair and rejects invalid inputs',()=>{
  const objects=Array.from({length:24},(_,i)=>selection(`object-${i}`,300,300,350,350));
  const table=sourcePlacementOptions(objects,1600,1200);
  assert.equal(table.fitBySource.length,24);
  assert.ok(table.fitBySource.every(row=>row.length===24&&row.every(cell=>cell.length<=5)));
  assert.ok(table.interiorFitBySource.every(row=>row.length===24&&row.every(cell=>typeof cell==='boolean')));
  assert.ok(JSON.stringify(table).length<9500);
  assert.throws(()=>sourcePlacementOptions([...objects,selection('extra',0,0,10,10)],1600,1200),/at most 24/);
  assert.throws(()=>sourcePlacementOptions([selection('bad',800,0,700,20)],1600,1200),/four-edge/);
  assert.throws(()=>sourcePlacementOptions(objects,0,1200),/positive/);
});

test('single-pass repair receives exact fit facts only for a complete valid source-native inventory',()=>{
  const plan={gameplay:{movement:'discover'},objects:[selection('leaf',300,300,500,500),selection('board',0,0,1000,1000)]};
  const before=JSON.stringify(plan), facts=placementFeedbackForPlan(plan,1200,800)!;
  assert.equal(facts.fitBySource[0][1],'C');
  assert.equal(facts.interiorFitBySource[0][1],true);
  assert.equal(JSON.stringify(plan),before);
  for(const invalid of [null,[],{...plan,gameplay:{movement:'platform'}},{...plan,objects:[]},
    {...plan,objects:[...plan.objects,{id:'bad',bounds:{left:10,top:10,right:0,bottom:20}}]},
    {...plan,objects:[...plan.objects,plan.objects[0]]},
    {...plan,objects:[{id:'legacy',x:0,y:0,width:10,height:10}]}])
    assert.equal(placementFeedbackForPlan(invalid,1200,800),undefined,'Do not present partial or incompatible measurements as compiler facts.');
});
