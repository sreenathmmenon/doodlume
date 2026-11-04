export interface BadgeRect { x: number; y: number; width: number; height: number }
export interface ResourceBadgeInput { id: string; bounds: BadgeRect; width: number; height: number }
export interface BadgeArtwork { id: string; bounds: BadgeRect }
export interface ResourceBadgePlacement extends BadgeRect {
  id: string;
  anchor: { x: number; y: number };
  leader: boolean;
  overlaps: boolean;
}
const area = (a: BadgeRect, b: BadgeRect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, Math.max(min, max)));
const padded = (r: BadgeRect, p: number): BadgeRect => ({x:r.x-p,y:r.y-p,width:r.width+p*2,height:r.height+p*2});

/** Screen-space, deterministic and bounded. Never infer a silhouette from an
 * unsegmented photo. Keep badges within their own visible region when possible;
 * a displaced badge retains a leader rather than pretending attribution is exact. */
export function layoutResourceBadges(inputs: ResourceBadgeInput[], viewport: BadgeRect, reserved: BadgeRect[] = [], artwork: BadgeArtwork[] = []): ResourceBadgePlacement[] {
  const placed: ResourceBadgePlacement[] = [];
  const objects = new Map([...inputs, ...artwork].map(object => [object.id, object.bounds]));
  for (const input of inputs) {
    const b = input.bounds;
    if (!area(b, viewport)) continue;
    const visible = {x:Math.max(b.x,viewport.x),y:Math.max(b.y,viewport.y),
      width:Math.min(b.x+b.width,viewport.x+viewport.width)-Math.max(b.x,viewport.x),
      height:Math.min(b.y+b.height,viewport.y+viewport.height)-Math.max(b.y,viewport.y)};
    const anchor = {x:clamp(b.x+b.width/2,visible.x,visible.x+visible.width),
      y:clamp(b.y+b.height*.35,visible.y,visible.y+visible.height)};
    const inside = (x: number, y: number) => ({x:clamp(x-input.width/2,visible.x+4,visible.x+visible.width-input.width-4),
      y:clamp(y-input.height/2,visible.y+4,visible.y+visible.height-input.height-4)});
    const candidates = [inside(anchor.x,anchor.y)];
    for (const y of [.2,.5,.8]) for (const x of [.25,.5,.75]) candidates.push(inside(visible.x+visible.width*x,visible.y+visible.height*y));
    candidates.push({x:visible.x-input.width-6,y:anchor.y-input.height/2},
      {x:visible.x+visible.width+6,y:anchor.y-input.height/2},
      {x:anchor.x-input.width/2,y:visible.y-input.height-6},
      {x:anchor.x-input.width/2,y:visible.y+visible.height+6});
    const scored = candidates.map(candidate => {
      const rect = {x:clamp(candidate.x,viewport.x+4,viewport.x+viewport.width-input.width-4),
        y:clamp(candidate.y,viewport.y+4,viewport.y+viewport.height-input.height-4),width:input.width,height:input.height};
      const collision = [...placed,...reserved].reduce((sum,other)=>sum+area(padded(rect,3),padded(other,3)),0);
      const outside = rect.width*rect.height-area(rect,visible);
      const otherObjects = [...objects].reduce((sum,[id,bounds])=>sum+(id===input.id?0:area(padded(rect,3),bounds)),0);
      const distance = Math.hypot(rect.x+rect.width/2-anchor.x,rect.y+rect.height/2-anchor.y);
      return {rect,collision,otherObjects,outside,distance,score:collision*1000+otherObjects*80+outside*20+distance};
    });
    const best = scored.reduce((best,candidate)=>candidate.score<best.score?candidate:best);
    const obscured = (point:{x:number;y:number}) => [...objects].some(([id,r]) => id!==input.id && point.x>=r.x && point.x<=r.x+r.width && point.y>=r.y && point.y<=r.y+r.height);
    // A loaded object can also cover the old attribution point. Keep the
    // connector on an exposed part of its own source rather than that cargo.
    const anchors = [anchor];
    for (const y of [.2,.5,.8]) for (const x of [.25,.5,.75]) anchors.push({x:visible.x+visible.width*x,y:visible.y+visible.height*y});
    const clearAnchor = !obscured(anchor) ? anchor : anchors.filter(point=>!obscured(point)).sort((a,b)=>
      Math.hypot(a.x-best.rect.x-best.rect.width/2,a.y-best.rect.y-best.rect.height/2)-Math.hypot(b.x-best.rect.x-best.rect.width/2,b.y-best.rect.y-best.rect.height/2))[0] ?? anchor;
    placed.push({...best.rect,id:input.id,anchor:clearAnchor,leader:best.outside>0 || best.distance>12,overlaps:best.collision>0 || best.otherObjects>0});
  }
  return placed;
}
