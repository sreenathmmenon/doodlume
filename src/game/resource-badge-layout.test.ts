import test from "node:test";
import assert from "node:assert/strict";
import {layoutResourceBadges} from "./resource-badge-layout";
const view={x:0,y:0,width:824,height:618};
const overlap=(a:{x:number;y:number;width:number;height:number},b:typeof a)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test("photo badge stays on the mug's upper body instead of below it near the keys",()=>{
  const inputs=[{id:"mug",bounds:{x:68,y:178,width:215,height:221},width:56,height:32},
    {id:"plant",bounds:{x:438,y:0,width:373,height:264},width:56,height:32}];
  const badges=layoutResourceBadges(inputs,view);
  assert.ok(badges[0].y>=178&&badges[0].y+32<330);
  assert.equal(badges[0].leader,false);
  assert.equal(overlap(badges[0],badges[1]),false);
  assert.deepEqual(layoutResourceBadges(inputs,view),badges,"identical geometry stays stable");
});

test("clustered badges separate with explicit leaders when their small source boxes cannot fit them",()=>{
  const inputs=[0,1,2].map(i=>({id:String(i),bounds:{x:200+i*18,y:200,width:20,height:24},width:56,height:32}));
  const badges=layoutResourceBadges(inputs,view);
  assert.ok(badges.every(b=>b.leader));
  for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++)assert.equal(overlap(badges[i],badges[j]),false);
});

test("clipped objects retain an on-screen anchor, offscreen objects add no edge badge, and impossible density is reported",()=>{
  const badges=layoutResourceBadges([{id:"edge",bounds:{x:-50,y:20,width:90,height:100},width:56,height:32},
    {id:"gone",bounds:{x:-100,y:200,width:20,height:20},width:56,height:32}],view);
  assert.equal(badges.length,1);assert.ok(badges[0].x>=4);assert.ok(badges[0].anchor.x>=0);assert.equal(badges[0].leader,true);
  const dense=layoutResourceBadges([0,1].map(i=>({id:String(i),bounds:{x:0,y:0,width:60,height:36},width:56,height:32})),{x:0,y:0,width:64,height:40});
  assert.equal(dense[1].overlaps,true);
});


test("a nearby action prompt leaves a gap above the badge without detaching it from its object",()=>{
  const prompt={x:500,y:12,width:240,height:66};
  const [badge]=layoutResourceBadges([{id:"plant",bounds:{x:438,y:0,width:373,height:264},width:56,height:32}],view,[prompt]);
  assert.equal(overlap(badge,prompt),false);
  assert.ok(badge.x>=438&&badge.x+badge.width<=811&&badge.y>=0&&badge.y+badge.height<=264);
});

test("a moved non-resource object stays unobscured without detaching its receiver's badge",()=>{
  const source={id:"receiver",bounds:{x:556,y:708,width:432,height:167},width:56,height:32};
  const cargo={id:"cargo",bounds:{x:704,y:719,width:143,height:117}};
  const viewport={x:0,y:0,width:1440,height:960};
  const [unloaded]=layoutResourceBadges([source],viewport);
  assert.equal(overlap(unloaded,cargo.bounds),true,"Original placement reproduces the loaded-art overlap.");
  const [loaded]=layoutResourceBadges([source],viewport,[],[cargo]);
  assert.equal(overlap(loaded,cargo.bounds),false);
  assert.equal(loaded.overlaps,false);
  assert.equal(overlap({x:loaded.anchor.x,y:loaded.anchor.y,width:1,height:1},cargo.bounds),false,"The attribution point cannot imply the cargo owns this resource.");
  assert.ok(loaded.x>=source.bounds.x&&loaded.x+loaded.width<=source.bounds.x+source.bounds.width);
  assert.ok(loaded.y>=source.bounds.y&&loaded.y+loaded.height<=source.bounds.y+source.bounds.height);
  assert.equal(loaded.leader,true,"A shifted badge retains its source anchor.");
  assert.deepEqual(layoutResourceBadges([source],viewport,[],[{...cargo,bounds:{...cargo.bounds,x:100}}]),[unloaded],"Once the artwork moves away the old location is not reserved.");
});
