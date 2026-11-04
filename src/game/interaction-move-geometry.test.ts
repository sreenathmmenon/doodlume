import test from "node:test";
import assert from "node:assert/strict";
import {interactionMoveDestination} from "./interaction-move-geometry";

test("destination uses rendered center for ordinary art", () => {
  assert.deepEqual(interactionMoveDestination({x:920,y:180}, {x:970,y:230,width:100,height:100}, {x:1150,y:400}),
    {x:1200,y:450,width:100,height:100});
});

test("destination retains source-layer padding and never drifts from a prior move", () => {
  const entity={x:100,y:200}, home={x:166,y:242,width:180,height:130};
  const first=interactionMoveDestination(entity,home,{x:500,y:300});
  assert.deepEqual(first,{x:566,y:342,width:180,height:130});
  assert.deepEqual(interactionMoveDestination(entity,home,{x:200,y:600}),{x:266,y:642,width:180,height:130});
  assert.deepEqual(home,{x:166,y:242,width:180,height:130});
});
