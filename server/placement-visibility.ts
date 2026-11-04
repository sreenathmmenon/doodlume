import sharp from "sharp";
import { MAX_WORLD_ARTWORK_PIXELS } from "../shared/artwork-validation.js";
import { emptyPlayState, type PlayState, type WorldDefinition, type WorldEntity } from "../shared/world.js";
import { interactionEffects, reduceInteraction } from "../shared/interactions.js";
import { isSourceAlignedScenery, isSourceBackdrop, sourceLayerArtworkBounds } from "../shared/source-scenery.js";
import { ModelPlanError } from "./model.js";

type Mask = { width:number; height:number; alpha:Uint8Array; visible:number };
type Placed = {entity:WorldEntity; x:number; y:number; width:number; height:number; depth:number; order:number};

/** Generated-plan admission only: keep a usable source object visible after
 * authored moves. Existing worlds and explicit creator edits remain unchanged.
 * Small alpha masks bound the work; no colors, crops or coordinates are edited. */
export async function validateGeneratedPlacementVisibility(world: WorldDefinition): Promise<void> {
  const plan=world.interactions;
  if (!plan?.actions.some(action=>action.effects?.some(effect=>effect.kind==="moveObject"))) return;
  const protectedIds=new Set([...plan.objects.filter(object=>object.carryable).map(object=>object.entityId), ...(world.goalRules?.requiredResourceIds??[])]);
  const required=new Set([...(world.goalRules?.requiredInteractionIds??[]),
    ...(world.goalRules?.requiredChoiceGroupIds??[]).flatMap(id=>plan.choiceGroups?.find(group=>group.id===id)?.actionIds??[])]);
  const include=(id:string)=>{
    const action=plan.actions.find(candidate=>candidate.id===id); if(!action)return;
    protectedIds.add(action.toolId); protectedIds.add(action.targetId);
    for(const id of action.requiresResourceIds??[])protectedIds.add(id);
    for(const prior of action.requires??[])if(!required.has(prior)){required.add(prior);include(prior);}
  };
  for(const id of [...required])include(id);
  const entities=new Map(world.entities.map(entity=>[entity.id,entity]));
  const masks=new Map<string,Mask>();
  for(const object of plan.objects){
    const entity=entities.get(object.entityId)!;
    if(!entity.art?.startsWith("data:image/"))continue;
    const {data,info}=await sharp(Buffer.from(entity.art.split(",")[1],"base64"),{limitInputPixels:MAX_WORLD_ARTWORK_PIXELS})
      .resize({width:128,height:128,fit:"inside",withoutEnlargement:true}).toColourspace("srgb").ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=new Uint8Array(info.width*info.height);let visible=0;
    for(let index=0;index<alpha.length;index++){alpha[index]=data[index*4+3];if(alpha[index]>20)visible++;}
    masks.set(entity.id,{width:info.width,height:info.height,alpha,visible});
  }
  const coverageCache=new Map<string,number>();
  let comparedPixels=0;
  const coverage=(front:Placed,back:Placed)=>{
    const key=JSON.stringify([front.entity.id,front.x,front.y,front.width,front.height,back.entity.id,back.x,back.y,back.width,back.height]);
    const cached=coverageCache.get(key);if(cached!==undefined)return cached;
    const overlapWidth=Math.max(0,Math.min(front.x+front.width,back.x+back.width)-Math.max(front.x,back.x));
    const overlapHeight=Math.max(0,Math.min(front.y+front.height,back.y+back.height)-Math.max(front.y,back.y));
    if(!overlapWidth||!overlapHeight){coverageCache.set(key,0);return 0;}
    const mask=masks.get(back.entity.id),frontMask=masks.get(front.entity.id);
    const width=mask?.width??48,height=mask?.height??48,total=mask?.visible??width*height;
    if(!total){coverageCache.set(key,0);return 0;}
    comparedPixels+=width*height;
    if(comparedPixels>16_000_000)throw new ModelPlanError("The placement overlaps are too complex to verify. Reduce overlapping placements or simplify their dependencies before playing.");
    let hidden=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(mask&&mask.alpha[y*width+x]<=20)continue;
      const xx=(back.x+(x+.5)*back.width/width-front.x)/front.width;
      const yy=(back.y+(y+.5)*back.height/height-front.y)/front.height;
      if(xx<0||yy<0||xx>=1||yy>=1)continue;
      if(!frontMask||frontMask.alpha[Math.floor(yy*frontMask.height)*frontMask.width+Math.floor(xx*frontMask.width)]>20)hidden++;
    }
    const result=hidden/total;coverageCache.set(key,result);return result;
  };
  const backdrop=world.entities.find(entity=>entity.kind==="decoration"&&isSourceBackdrop(entity));
  const placement=(state:PlayState)=>{
    const moves=interactionEffects(world,state).objectMoves;
    const positioned=new Map<string,Placed>();
    const locate=(id:string):Placed=>{
      const cached=positioned.get(id);if(cached)return cached;
      const entity=entities.get(id)!;
      const order=plan.objects.findIndex(object=>object.entityId===id);
      const object=plan.objects[order],move=moves[id],parentId=state.interactions?.attachments[id];
      // Stationary source objects remain in the backdrop, below extracted art.
      const extracted=Boolean(entity.art&&entity.kind==="decoration"&&!(entity.artSource&&!entity.sourceLayer&&isSourceAlignedScenery(backdrop)));
      const home=entity.sourceLayer&&backdrop?sourceLayerArtworkBounds(entity,backdrop):entity;
      let result:Placed={entity,x:home.x+(move?move.x-entity.x:0),y:home.y+(move?move.y-entity.y:0),width:home.width,height:home.height,
        depth:extracted?(object?.layer==="surface"?15:16):0,order};
      if(parentId){
        const parent=locate(parentId),originalParent=entities.get(parentId)!;
        const scale=Math.min(1,Math.max(originalParent.width,originalParent.height)*.5/Math.max(home.width,home.height));
        const width=home.width*scale,height=home.height*scale;
        result={...result,width,height,x:parent.x+parent.width*.65-width/2,
          y:parent.y+parent.height/2+(parent.entity.kind==="player"?originalParent.height*.2-height/2:-height),depth:23};
      }
      positioned.set(id,result);return result;
    };
    return plan.objects.map(object=>locate(object.entityId));
  };
  const frontier=[emptyPlayState()],seen=new Set([""]);
  for(let head=0;head<frontier.length;head++)for(const action of plan.actions){
    const state=frontier[head];if(state.interactions?.completed.includes(action.id))continue;
    const dropped=reduceInteraction(world,state,{type:"drop"});
    const picked=reduceInteraction(world,dropped.ok?dropped.state:state,{type:"pickup",entityId:action.toolId});
    if(!picked.ok)continue;
    const performed=reduceInteraction(world,picked.state,{type:"perform",actionId:action.id});
    if(!performed.ok)continue;
    const key=[...(performed.state.interactions?.completed??[])].sort().join("|");
    if(seen.has(key))continue;
    if(seen.size>=2048)throw new ModelPlanError("The placement branches are too complex to verify. Simplify the dependencies before playing.");
    seen.add(key);frontier.push(performed.state);
    const moved=new Set(action.effects?.flatMap(effect=>effect.kind==="moveObject"?[effect.entityId]:[])??[]);
    if(moved.size){
      const before=placement(state),after=placement(performed.state);
      // Mounted artwork follows its moved parent and can occlude another object too.
      for(const item of after){
        const prior=before.find(candidate=>candidate.entity.id===item.entity.id)!;
        if(item.x!==prior.x||item.y!==prior.y||item.width!==prior.width||item.height!==prior.height)moved.add(item.entity.id);
      }
      for(const front of after)for(const back of after){
        if(front.entity.id===back.entity.id||!protectedIds.has(back.entity.id)||(!moved.has(front.entity.id)&&!moved.has(back.entity.id)))continue;
        if(front.depth<back.depth||(front.depth===back.depth&&front.order<back.order))continue;
        // An explicit surface is intentionally behind foreground objects.
        if(plan.objects.find(object=>object.entityId===back.entity.id)?.layer==="surface"&&front.depth>back.depth)continue;
        const covered=coverage(front,back);
        if(covered<.9)continue;
        const priorFront=before.find(item=>item.entity.id===front.entity.id)!,priorBack=before.find(item=>item.entity.id===back.entity.id)!;
        if((priorFront.depth>priorBack.depth||(priorFront.depth===priorBack.depth&&priorFront.order>priorBack.order))&&coverage(priorFront,priorBack)>=.9)continue; // Preserve occlusion already present in the source.
        throw new ModelPlanError(`Action ${action.id} would hide ${Math.round(covered*100)}% of ${back.entity.label||back.entity.id} (${back.entity.id}) behind ${front.entity.label||front.entity.id} (${front.entity.id}). Choose a clear source-relative position. If the overlapping object is intentionally a surface beneath the other object, declare its interaction object layer:"surface"; do not change object sizes or hide the required arrangement.`);
      }
    }
  }
}
