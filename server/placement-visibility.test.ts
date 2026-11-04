import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateInteractions } from "../shared/interactions.js";
import type { WorldDefinition } from "../shared/world.js";
import { validateGeneratedPlacementVisibility } from "./placement-visibility.js";

async function fixture():Promise<WorldDefinition>{
  const art=`data:image/png;base64,${(await sharp({create:{width:40,height:40,channels:4,background:"#986052"}}).png().toBuffer()).toString("base64")}`;
  return {id:"placement",name:"Placement",description:"Synthetic geometry fixture",theme:"grove",width:400,height:300,source:"manual",sourceImage:"",revision:1,
    gameplay:{movement:"discover",objectiveTitle:"Arrange",instructions:"Arrange the two objects"},
    entities:[{id:"piece",kind:"decoration",label:"Piece",x:10,y:10,width:40,height:40,art},
      {id:"mat",kind:"decoration",label:"Surface",x:230,y:180,width:100,height:100,art},
      {id:"anchor",kind:"decoration",label:"Anchor",x:340,y:100,width:40,height:40}],
    interactions:{version:1,objects:[{entityId:"piece",carryable:true},{entityId:"mat",carryable:true},{entityId:"anchor"}],actions:[
      {id:"place-piece",kind:"place",label:"Place piece",toolId:"piece",targetId:"anchor",effects:[{kind:"moveObject",entityId:"piece",x:100,y:100}]},
      {id:"place-mat",kind:"place",label:"Place surface",toolId:"mat",targetId:"anchor",requires:["place-piece"],effects:[{kind:"moveObject",entityId:"mat",x:80,y:80}]},
    ]},goalRules:{requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["place-mat"]}};
}

test("generated placements reject hiding an earlier object but admit explicit underlays",async()=>{
  const world=await fixture();validateInteractions(world);
  await assert.rejects(validateGeneratedPlacementVisibility(world),/place-mat would hide 100% of Piece.*behind Surface/);
  world.interactions!.objects.find(object=>object.entityId==="mat")!.layer="surface";
  validateInteractions(world);await validateGeneratedPlacementVisibility(world);
  assert.equal(world.entities.find(entity=>entity.id==="mat")!.width,100);
});

test("mutually exclusive placements do not invent collisions between separate outcomes",async()=>{
  const world=await fixture();
  delete world.interactions!.actions[1].requires;
  world.interactions!.choiceGroups=[{id:"arrangement",label:"Arrangement",actionIds:["place-piece","place-mat"]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredChoiceGroupIds:["arrangement"]};
  validateInteractions(world);await validateGeneratedPlacementVisibility(world);
});

test("visibility uses alpha footprints, allowing a transparent frame around a smaller object",async()=>{
  const world=await fixture();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0H100V100H0Z M10 10V90H90V10Z" fill-rule="evenodd" fill="#458"/></svg>';
  world.entities.find(entity=>entity.id==="mat")!.art=`data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
  validateInteractions(world);await validateGeneratedPlacementVisibility(world);
});

test("existing source overlap is retained",async()=>{
  const world=await fixture();
  world.entities.find(entity=>entity.id==="piece")!.x=100;
  world.entities.find(entity=>entity.id==="piece")!.y=100;
  world.entities.find(entity=>entity.id==="mat")!.x=80;
  world.entities.find(entity=>entity.id==="mat")!.y=80;
  world.interactions!.actions=[{id:"shift",kind:"place",label:"Shift surface",toolId:"mat",targetId:"anchor",effects:[{kind:"moveObject",entityId:"mat",x:85,y:85}]}];
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredInteractionIds:["shift"]};
  validateInteractions(world);await validateGeneratedPlacementVisibility(world);
});

test("required resource receivers remain protected without required action IDs",async()=>{
  const world=await fixture();
  Object.assign(world.entities[0],{x:100,y:100});
  Object.assign(world.interactions!.objects[0],{carryable:false,resource:{type:"charge",initial:1,capacity:1}});
  world.interactions!.actions=world.interactions!.actions.slice(1);
  delete world.interactions!.actions[0].requires;
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:["piece"]};
  validateInteractions(world);
  await assert.rejects(validateGeneratedPlacementVisibility(world),/hide 100% of Piece/);
});

test("recovered source artwork extent is checked independently of collider size",async()=>{
  const world=await fixture(),mat=world.entities[1];
  mat.width=20;mat.height=20;
  mat.sourceLayer={x:mat.x,y:mat.y,width:20,height:20};
  mat.artSource={x:mat.x/.4,y:mat.y/.3,width:250,height:1000/3};
  world.entities.unshift({id:"backdrop",kind:"decoration",x:0,y:0,width:400,height:300,
    artNote:"Original scenery at source coordinates; moving source artwork isolated and background reconstructed locally."});
  validateInteractions(world);
  await assert.rejects(validateGeneratedPlacementVisibility(world),/hide 100% of Piece/);
});

test("an explicitly declared surface may intentionally sit fully behind a foreground object",async()=>{
  const world=await fixture();
  world.interactions!.objects[0].layer="surface";
  validateInteractions(world);await validateGeneratedPlacementVisibility(world);
});

test("retryable visibility admission still checks moves reached after a losing allocation",async()=>{
  const world=await fixture();
  world.interactions!.completionPolicy="retryable";
  world.interactions!.objects[0].resource={type:"water",initial:2,capacity:2};
  world.interactions!.objects[1].resource={type:"water",initial:0,capacity:2};
  world.interactions!.objects[2].resource={type:"water",initial:0,capacity:2};
  world.interactions!.actions[1].requires=["place-piece","allocate"];
  world.interactions!.actions.push(
    {id:"allocate",kind:"transfer",label:"Allocate water",toolId:"piece",targetId:"mat",amount:1},
    {id:"finish",kind:"transfer",label:"Fill receiver",toolId:"piece",targetId:"anchor",amount:2});
  world.goalRules={requiredCollectedIds:[],requiredActivatedIds:[],requiredResourceIds:["anchor"]};
  validateInteractions(world);
  await assert.rejects(validateGeneratedPlacementVisibility(world),/place-mat would hide 100% of Piece/);
});
