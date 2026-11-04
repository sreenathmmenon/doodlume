import { sourceFrameForImage } from './source-frame.js';

interface SourcePlacementSelection {
  id: string;
  bounds: {left:number;top:number;right:number;bottom:number};
}

/** Factual initial-frame fit only: no role, mission, resize or destination is
 * chosen here. Alignment cells use at most five letters; interior fit is a
 * separate boolean per bounded ordered pair and never assigns a surface layer. */
export function sourcePlacementOptions(selections:readonly SourcePlacementSelection[], imageWidth:number, imageHeight:number) {
  if (selections.length > 24 || new Set(selections.map(item=>item.id)).size !== selections.length)
    throw new Error('Placement facts require at most 24 distinct source objects.');
  const {width,height,frame}=sourceFrameForImage(imageWidth,imageHeight);
  const objects=selections.map(item=>{
    const b=item.bounds;
    if(typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(item.id)||!b||
      ![b.left,b.top,b.right,b.bottom].every(n=>Number.isFinite(n)&&n>=0&&n<=1000)||b.right<=b.left||b.bottom<=b.top)
      throw new Error('Placement facts need bounded four-edge source selections.');
    return {x:frame.x+b.left*frame.width/1000,y:frame.y+b.top*frame.height/1000,
      width:Math.max(4,(b.right-b.left)*frame.width/1000),height:Math.max(4,(b.bottom-b.top)*frame.height/1000)};
  });
  const fitBySource=objects.map((moved,i)=>objects.map((target,j)=>{
    if(i===j)return '-';
    const x=target.x+(target.width-moved.width)/2,y=target.y+(target.height-moved.height)/2;
    const positions=[['C',x,y],['L',target.x-moved.width-8,y],['R',target.x+target.width+8,y],
      ['A',x,target.y-moved.height-8],['B',x,target.y+target.height+8]] as const;
    return positions.filter(([,left,top])=>left>=0&&top>=0&&left+moved.width<=width&&top+moved.height<=height).map(([code])=>code).join('');
  }));
  const interiorFitBySource=objects.map((moved,i)=>objects.map((target,j)=>
    i!==j&&moved.width<=target.width&&moved.height<=target.height));
  return {ids:selections.map(item=>item.id),imageEdgeContacts:selections.map(({bounds:b})=>[
    ...(b.left===0?['left']:[]),...(b.top===0?['top']:[]),...(b.right===1000?['right']:[]),...(b.bottom===1000?['bottom']:[])]),
    world:{width,height},sourceFrame:frame,
    codes:{C:'center',L:'left',R:'right',A:'above',B:'below'},fitBySource,interiorFitBySource};
}

/** A failed single-pass design still has useful source measurements. Only use
 * complete, valid image-native inventories; never silently omit a bad object or
 * supply these coordinates to a platform compiler with different geometry. */
export function placementFeedbackForPlan(value: unknown, imageWidth:number, imageHeight:number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const plan=value as Record<string,unknown>;
  const gameplay=plan.gameplay as Record<string,unknown>|undefined;
  if (!gameplay || gameplay.movement !== 'discover' || !Array.isArray(plan.objects) ||
      !plan.objects.length || plan.objects.length > 24) return undefined;
  const selections:SourcePlacementSelection[]=[];
  for (const item of plan.objects) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.bounds || typeof item.bounds !== 'object') return undefined;
    selections.push({id:item.id,bounds:item.bounds});
  }
  try {
    return {
      scope:'Initial source boxes for this rejected discover plan only. Recompute if boxes change. Rows and columns follow ids. Empty cell means no fitting alignment; - forbids self-placement. Interior true permits an explicitly chosen destinationAnchor within a target, without resizing. Fit proves world bounds only, not object visibility, source-image coverage, surface suitability, later moved-target positions, or a meaningful game. Preserve source identities and the requested mission; do not use an option merely because it fits.',
      ...sourcePlacementOptions(selections,imageWidth,imageHeight),
    };
  } catch {
    // Invalid measurements are not evidence. Preserve the original diagnostic.
    return undefined;
  }
}
