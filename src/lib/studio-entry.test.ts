import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {emptyPlayState, validateWorld} from "../../shared/world";
import {reduceInteraction} from "../../shared/interactions";
import {entryFromExample} from "./studio-entry";

test("a played example enters the studio as a separate personal world without losing earned quantities",()=>{
  const world=validateWorld(JSON.parse(readFileSync(new URL('../../public/art/showcase/rover.json',import.meta.url),'utf8')));
  const original=JSON.stringify(world);
  const selected=reduceInteraction(world,emptyPlayState(),{type:"pickup",entityId:"crystal-1"});
  assert.equal(selected.ok,true);
  const played=reduceInteraction(world,selected.state,{type:"perform",actionId:"act-beacon-1"});
  assert.equal(played.ok,true);
  const entry=entryFromExample(world,played.state);
  assert.notEqual(entry.world.id,world.id);
  assert.equal(entry.world.source,"manual");
  assert.deepEqual(entry.world.entities,world.entities);
  assert.deepEqual(entry.world.interactions,world.interactions);
  assert.deepEqual(entry.state.interactions,played.state.interactions);
  assert.equal(JSON.stringify(world),original);
  assert.equal(entry.state.interactions?.quantities['beacon-tower'],1);
});
