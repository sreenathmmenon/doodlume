import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {compileCreativeAdaptation,readGameplayPlan,gameplaySchema,type GameplayPlan,type SourceSelection} from './creative-adaptation.js';
import {ModelPlanError,InterpretationError} from './model.js';
import {sourcePlatformScene} from './source-platform-scene.js';

const basePlan:GameplayPlan={mode:'creative',movement:'roam',avatarId:null,reason:'Synthetic compiler-contract fixture, not inference evidence.',
 objective:'explore',objectiveLabel:'Explore',objectiveTitle:'Reach the selected detail',instructions:'Move the guide to the selected detail.',destinationLabel:'Chosen finish',
 path:[{x:100,y:100,label:'Start'},{x:500,y:500,label:'Selected detail'},{x:800,y:800,label:'Unrelated final landmark'}],clues:[],obstacleIds:[]};
const source=()=>sharp({create:{width:1000,height:600,channels:3,background:'#f4f0e6'}}).png().toBuffer();
async function compile(plan:GameplayPlan,objects:SourceSelection[]=[],rules={requiredCollectedIds:[] as string[],requiredActivatedIds:[] as string[]}){
 return compileCreativeAdaptation({source:await source(),inputKind:'drawing',name:'Compiler fixture',description:'Synthetic contract verification.',theme:'grove',objects,plan,
 sourceGoalRules:rules,segmentation:{enabled:false,apiKey:''},signal:new AbortController().signal,transport:fetch});
}
const object=(id:string,kind:SourceSelection['kind'],x:number,y:number,width=60,height=60):SourceSelection=>({id,kind,label:id,x,y,width,height});

test('new transport makes finish explicit while legacy plans stay readable',()=>{
 assert.ok(gameplaySchema.required.includes('finishDestination'));
 assert.equal(readGameplayPlan(basePlan)!.finishDestination,undefined);
 for(const invalid of [null,{kind:{toString:null}},{kind:'landmark',pathIndex:3},{kind:'landmark',pathIndex:.5},{kind:'landmark',pathIndex:1,entityId:'extra'},{kind:'source',entityId:'bad id'},{kind:'requirements',pathIndex:0}])
  assert.throws(()=>readGameplayPlan({...basePlan,finishDestination:invalid}),ModelPlanError);
 assert.equal(readGameplayPlan({...basePlan,destinationLabel:'',finishDestination:{kind:'requirements'}})!.destinationLabel,'');
});

test('explicit landmark selects that exact source point instead of the last unordered waypoint',async()=>{
 const world=await compile({...basePlan,finishDestination:{kind:'landmark',pathIndex:1}});
 const goal=world.entities.find(e=>e.kind==='goal')!;
 assert.equal(goal.x+goal.width/2,world.width*.5);assert.equal(goal.y+goal.height/2,world.height*.5);
 assert.equal(goal.label,'Chosen finish');assert.equal(world.entities.filter(e=>e.kind==='coin').length,0,'A reach-the-detail mission gains no arbitrary generated collecting errands.');
 const legacy=await compile({...basePlan});const oldGoal=legacy.entities.find(e=>e.kind==='goal')!;
 assert.equal(oldGoal.x+oldGoal.width/2,legacy.width*.8);assert.equal(oldGoal.y+oldGoal.height/2,legacy.height*.8);
 const edge=structuredClone(basePlan);edge.path[1].x=0;
 await assert.rejects(()=>compile({...edge,finishDestination:{kind:'landmark',pathIndex:1}}),/has not been moved elsewhere/);
});

test('explicit source destination preserves that source identity and rejects conflicting goal roles',async()=>{
 const goal=object('actual-detail','goal',650,300);
 const world=await compile({...basePlan,finishDestination:{kind:'source',entityId:goal.id}},[goal]);
 assert.equal(world.entities.find(e=>e.kind==='goal')!.id,goal.id);assert.equal(world.entities.filter(e=>e.kind==='goal').length,1);
 await assert.rejects(()=>compile({...basePlan,finishDestination:{kind:'source',entityId:'absent'}},[goal]),ModelPlanError);
 await assert.rejects(()=>compile({...basePlan,finishDestination:{kind:'landmark',pathIndex:1}},[goal]),ModelPlanError);
});

test('requirements-only completion retains source collectibles and adds no hidden return destination',async()=>{
 const stars=[object('one','coin',300,250),object('two','coin',700,600)];
 const plan={...basePlan,objective:'collect' as const,destinationLabel:'',finishDestination:{kind:'requirements' as const}};
 const world=await compile(plan,stars,{requiredCollectedIds:['one','two'],requiredActivatedIds:[]});
 assert.deepEqual(world.goalRules!.requiredCollectedIds,['one','two']);assert.equal(world.entities.some(e=>e.kind==='goal'),false);assert.equal(world.gameplay!.completion,'requirements');
 await assert.rejects(()=>compile({...basePlan,finishDestination:{kind:'requirements'}}),/at least one explicit earned requirement/);
 const open=await compile({...basePlan,destinationLabel:'',finishDestination:{kind:'none'}});
 assert.equal(open.entities.some(e=>['coin','goal'].includes(e.kind)),false);
 await assert.rejects(()=>compile({...plan,finishDestination:{kind:'none'}},stars,{requiredCollectedIds:['one'],requiredActivatedIds:[]}),/cannot silently discard/);
});

test('unsupported source-avatar roam returns a focused limitation instead of substituting a guide',async()=>{
 await assert.rejects(()=>compile({...basePlan,avatarId:'pictured-subject',finishDestination:{kind:'landmark',pathIndex:1}},[object('pictured-subject','player',400,300)]),
  error=>error instanceof InterpretationError&&/cannot freely move pictured-subject/.test(error.message)&&/separate guide/.test(error.message));
});

test('source-platform explicit landmarks retain coordinates and existing physical target proof',async()=>{
 const objects=[object('hero','player',150,480,60,100),object('ground','terrain',50,600,900,120)];
 const plan:GameplayPlan={...basePlan,mode:'source-layout',movement:'platform',avatarId:'hero',finishDestination:{kind:'landmark',pathIndex:1},
  path:[{x:180,y:550,label:'Start'},{x:700,y:540,label:'Chosen point'},{x:900,y:540,label:'Other point'}]};
 const png=await source();let reason='';
 const run=(p:GameplayPlan,sceneObjects=objects)=>sourcePlatformScene({source:png,inputKind:'drawing',name:'Fixture',description:'Synthetic fixture.',theme:'grove',objects:sceneObjects,plan:p,segmentation:{enabled:false,apiKey:''},signal:new AbortController().signal,transport:fetch,
 requested:{requiredCollectedIds:[],requiredActivatedIds:[]},finishRules:(_entities,defaults)=>defaults,onReject:message=>{reason=message;}});
 const world=await run(plan);assert.ok(world,reason);const goal=world.entities.find(e=>e.kind==='goal')!;
 assert.ok(Math.abs(goal.x+goal.width/2-world.width*.7)<1e-6);assert.ok(Math.abs(goal.y+goal.height/2-world.height*.54)<1e-6);assert.equal(goal.artSource,undefined);
 const open=await run({...plan,finishDestination:{kind:'none'}});assert.ok(open,reason);assert.equal(open.entities.some(e=>e.kind==='goal'),false);
 const requirements=await run({...plan,objective:'collect',finishDestination:{kind:'requirements'}},[...objects,object('star','coin',700,470,50,50)]);
 assert.ok(requirements,reason);assert.deepEqual(requirements.goalRules!.requiredCollectedIds,['star']);assert.equal(requirements.entities.some(e=>e.kind==='goal'),false);assert.equal(requirements.gameplay!.completion,'requirements');
});
