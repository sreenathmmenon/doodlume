import sharp from 'sharp';
import { pixelBox } from './images.js';
import { localSegmentationArtwork, type LocalSegmentationConfig, type LocalMaskBox } from './local-segmentation.js';
import type { SourceSelection } from './creative-adaptation.js';

/** A box prompt needs context to recover a limb that the language model's box
 * clipped. Use real local SAM pixels to bound the principal connected subject,
 * retaining nearby appendages while excluding distant neighboring objects. */
export async function groundWholeActor(source: Buffer, actor: SourceSelection, config: LocalSegmentationConfig, signal: AbortSignal, surfaces: SourceSelection[] = [], contextActor: SourceSelection = actor, compactContext = false): Promise<SourceSelection> {
  const recovered=await groundWholeActorPass(source,actor,config,signal,surfaces,contextActor,compactContext);
  if (!compactContext || (recovered.artwork && recovered.width*recovered.height<=actor.width*actor.height*1.5)) return recovered;
  // Expanding the SAM prompt can invite a neighboring object into the mask.
  // Retry bounded tight prompts with a separate output context; only agreement
  // across distinct prompts can admit this fallback. No RGB is synthesized.
  const tight=await groundWholeActorPass(source,actor,config,signal,surfaces,contextActor,true,true);
  if (!recovered.artwork) return tight;
  if (!tight.artwork) return recovered;
  // A greatly expanded mask can fuse a prop with nearby scenery. Prefer an
  // independently agreed tight subject only if it still covers the recognized
  // body and preserves its ink, rather than merely producing a smaller mask.
  const overlap=Math.max(0,Math.min(tight.x+tight.width,actor.x+actor.width)-Math.max(tight.x,actor.x))*
    Math.max(0,Math.min(tight.y+tight.height,actor.y+actor.height)-Math.max(tight.y,actor.y));
  if (overlap<actor.width*actor.height*.75 || tight.width*tight.height>=recovered.width*recovered.height) return recovered;
  const size=await sharp(source).metadata(),seed=pixelBox(actor,size.width!,size.height!);
  const earlierBox=pixelBox(recovered,size.width!,size.height!),tightBox=pixelBox(tight,size.width!,size.height!);
  const earlier=await sharp(Buffer.from(recovered.artwork.art!.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
  const replacement=await sharp(Buffer.from(tight.artwork.art!.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
  let ink=0,retained=0,outsideInk=0,outsideRetained=0;
  for(let y=0;y<earlierBox.height;y++)for(let x=0;x<earlierBox.width;x++){
    const sx=earlierBox.left+x,sy=earlierBox.top+y,at=(y*earlierBox.width+x)*4;
    if(earlier[at+3]<=20)continue;
    const rgb=[earlier[at],earlier[at+1],earlier[at+2]];
    if(Math.min(...rgb)>=180&&Math.max(...rgb)-Math.min(...rgb)<=35)continue;
    const xx=sx-tightBox.left,yy=sy-tightBox.top;
    const kept=xx>=0&&yy>=0&&xx<tightBox.width&&yy<tightBox.height&&replacement[(yy*tightBox.width+xx)*4+3]>20;
    if(sx<seed.left||sx>=seed.left+seed.width||sy<seed.top||sy>=seed.top+seed.height){outsideInk++;if(kept)outsideRetained++;}
    else{ink++;if(kept)retained++;}
  }
  if(ink<3||retained/ink<.9)return recovered;
  // An appendage outside the model's clipped seed is just as real as the body.
  // Without another source-supported identity signal, a lost outside stroke
  // might be a tail rather than a neighbor. Preserve the source for review.
  if(outsideInk>=3&&outsideRetained/outsideInk<.95)return actor;
  return tight;
}

async function groundWholeActorPass(source: Buffer, actor: SourceSelection, config: LocalSegmentationConfig, signal: AbortSignal, surfaces: SourceSelection[], contextActor: SourceSelection, compactContext: boolean, separatePrompt=false): Promise<SourceSelection> {
  const meta = await sharp(source).metadata();
  const iw = meta.width!, ih = meta.height!;
  const support = surfaces.filter(surface => ['terrain','bridge'].includes(surface.kind) &&
    surface.x < actor.x + actor.width && surface.x + surface.width > actor.x &&
    surface.y > actor.y + actor.height * .6 && Math.abs(surface.y - actor.y - actor.height) < 80)
    .sort((a,b) => Math.abs(a.y - actor.y - actor.height) - Math.abs(b.y - actor.y - actor.height))[0];
  const bottomLimit = support ? Math.min(1000, support.y + 6) : 1000;
  const expandedBox=(padding:number)=>{
    const x=Math.max(0,actor.x-actor.width*padding),y=Math.max(0,actor.y-actor.height*padding);
    return pixelBox({x,y,width:Math.min(1000,actor.x+actor.width*(1+padding))-x,height:Math.min(1000,actor.y+actor.height*(1+padding))-y},iw,ih);
  };
  const regions: (ReturnType<typeof pixelBox>&{prompt?:ReturnType<typeof pixelBox>})[] = separatePrompt
    ? [.02,.04,.08].map(padding=>({...expandedBox(.3),prompt:expandedBox(padding)}))
    : compactContext ? (actor.width*actor.height < 40000
    ? [...[.02,.04].map(padding=>({padding,bottom:0})), ...[.08,.18,.3].flatMap(padding=>[0,.3,.6].map(bottom=>({padding,bottom}))), ...[.6,1].map(padding=>({padding,bottom:0}))]
    : [.02,.04,.08,.18,.3].map(padding=>({padding,bottom:0}))).map(({padding,bottom}) => {
    const x = Math.max(0,actor.x-actor.width*padding), y = Math.max(0,actor.y-actor.height*padding);
    return pixelBox({x,y,width:Math.min(1000,actor.x+actor.width*(1+padding))-x,height:Math.min(1000,actor.y+actor.height*(1+padding+bottom))-y},iw,ih);
  }) : [actor,contextActor].flatMap((observation, pass) => {
    const top = Math.max(0, observation.y - Math.max(pass ? 48 : 16, observation.height * (pass ? .5 : .16)));
    return [[1.2, .4], [.4, 1.2], [.8, .8]].flatMap(([before, after]) => [0, .25, .5].map(extension => {
      const left = Math.max(0, observation.x - Math.max(before * 84, observation.width * before));
      const region = { x: left, y: top, width: Math.min(1000, observation.x + observation.width + Math.max(after * 84, observation.width * after)) - left,
        height: Math.min(bottomLimit, observation.y + observation.height * (1 + extension)) - top };
      return pixelBox(region, iw, ih);
    }));
  });
  if (!separatePrompt && compactContext && actor.width*actor.height < 40000) for (const shift of [-.6,.6]) {
    const x=Math.max(0,actor.x+actor.width*shift-actor.width*.12), y=Math.max(0,actor.y-actor.height*.12);
    regions.push(pixelBox({x,y,width:Math.min(1000,actor.x+actor.width*(1+shift+.12))-x,height:Math.min(1000,actor.y+actor.height*1.5)-y},iw,ih));
  }
  // Keep the worker's per-request pixel bound when extra tight contexts are
  // needed for a large photograph; its image embedding stays cached across batches.
  const masks=new Map<string,string>();
  let batch:LocalMaskBox[]=[],pixels=0;
  const flush=async()=>{if(!batch.length)return;for(const [id,art] of await localSegmentationArtwork(source,batch,config,signal,{selectPrincipalComponent:true}))masks.set(id,art);batch=[];pixels=0;};
  for(const [index,box] of regions.entries()){
    if(batch.length && (pixels+box.width*box.height>8_000_000 || batch.length>=24))await flush();
    batch.push({id:`actor-context-${index}`,left:box.left,top:box.top,right:box.left+box.width,bottom:box.top+box.height,
      ...(box.prompt?{prompt:{left:box.prompt.left,top:box.prompt.top,right:box.prompt.left+box.prompt.width,bottom:box.prompt.top+box.prompt.height}}:{})});pixels+=box.width*box.height;
  }
  await flush();
  const candidates: {subject: SourceSelection; score:number; sparse:boolean; pixels:Uint32Array; context:string}[]=[];
  for (const [index, box] of regions.entries()) {
  const art = masks.get(`actor-context-${index}`); if (!art) continue;
  const { data, info } = await sharp(Buffer.from(art.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height), queue = new Int32Array(seen.length);
  const components: number[][] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || data[i * 4 + 3] <= 20) continue;
    let head = 0, tail = 1; queue[0] = i; seen[i] = 1;
    while (head < tail) {
      const at = queue[head++], x = at % info.width;
      for (const next of [x ? at - 1 : -1, x + 1 < info.width ? at + 1 : -1, at - info.width, at + info.width,
        x ? at - info.width - 1 : -1, x + 1 < info.width ? at - info.width + 1 : -1, x ? at + info.width - 1 : -1, x + 1 < info.width ? at + info.width + 1 : -1])
        if (next >= 0 && next < seen.length && !seen[next] && data[next * 4 + 3] > 20) { seen[next] = 1; queue[tail++] = next; }
    }
    components.push([...queue.subarray(0, tail)]);
  }
  const originalBox = pixelBox(actor, iw, ih);
  const seed = { left: originalBox.left - box.left, top: originalBox.top - box.top, width: originalBox.width, height: originalBox.height };
  const largest = selectActorComponents(components, info.width, seed);
  if (!largest.length) continue;
  let x1 = info.width, y1 = info.height, x2 = 0, y2 = 0;
  const keep = new Uint8Array(seen.length);
  for (const at of largest) { const x = at % info.width, y = Math.floor(at / info.width); keep[at] = 1; x1 = Math.min(x1,x); y1 = Math.min(y1,y); x2 = Math.max(x2,x); y2 = Math.max(y2,y); }
  const overlap = Math.max(0, Math.min(box.left + x2 + 1, originalBox.left + originalBox.width) - Math.max(box.left + x1, originalBox.left)) *
    Math.max(0, Math.min(box.top + y2 + 1, originalBox.top + originalBox.height) - Math.max(box.top + y1, originalBox.top));
  // Expanded context may contain another larger subject. A candidate must
  // retain substantial overlap with the recognized actor before size matters.
  if (overlap < Math.min(originalBox.width * originalBox.height, (x2 - x1 + 1) * (y2 - y1 + 1)) * (compactContext ? .05 : .15)) continue;
  const sparse=compactContext && largest.length < (x2-x1+1)*(y2-y1+1)*(actor.width/actor.height>.35 && actor.width/actor.height<2.8 ? .3 : .15);
  if (compactContext && ((x2-x1+1)*(y2-y1+1) < originalBox.width*originalBox.height*.25 || x2-x1+1 < originalBox.width*.35 || y2-y1+1 < originalBox.height*.35)) continue;
  if (compactContext && (x2-x1+1)*(y2-y1+1)>originalBox.width*originalBox.height*2.5) continue;
  // A subject cut by the expanded context is not verified as whole. Keep the
  // source box for review rather than claiming the mask repaired its outline.
  let paperPixels=0;
  for(const at of largest){
    const r=data[at*4],g=data[at*4+1],b=data[at*4+2];
    if(Math.min(r,g,b)>=180&&Math.max(r,g,b)-Math.min(r,g,b)<=35)paperPixels++;
  }
  // SAM sometimes attaches a pale wash of paper to a dark outlined subject.
  // Extra background pixels cannot improve a candidate merely by making it
  // larger; all retained RGB values still come directly from the source.
  const subjectScore=largest.length-paperPixels*1.25;
  if (x1 === 0 || y1 === 0 || x2 === info.width - 1 || y2 === info.height - 1) continue;
  for (let at = 0; at < keep.length; at++) if (!keep[at]) data[at * 4 + 3] = 0;
  const trim = { left: x1, top: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract(trim).png().toBuffer();
  const subject:SourceSelection = { ...actor, x: (box.left + x1) / iw * 1000, y: (box.top + y1) / ih * 1000,
    width: trim.width / iw * 1000, height: trim.height / ih * 1000,
    artwork: { art: `data:image/png;base64,${png.toString('base64')}`, artMethod: 'sam', artNote: 'Source mask extracted by local Meta SAM 2.1 with surrounding context; original pixels retained. Nearby crossing strokes may need review.' } };
  candidates.push({subject,score:subjectScore,sparse,context:JSON.stringify(box.prompt ?? box),
    pixels:compactContext ? Uint32Array.from(largest,at=>(box.top+Math.floor(at/info.width))*iw+box.left+at%info.width).sort() : new Uint32Array()});
  }
  // Thin lines are a legitimate subject, not evidence of a broken mask. Admit
  // sparse figures only when independent context prompts agree on their actual
  // source pixels. Existing whole-box, neighbor-growth and edge guards still apply.
  const accepted=candidates.filter(candidate=>(!candidate.sparse && !separatePrompt) || candidates.some(other=>
    other.context!==candidate.context && sourceMaskAgreement(candidate.pixels,other.pixels)>=.9));
  accepted.sort((a,b)=>b.score-a.score);
  if(accepted[0]?.sparse)accepted[0].subject.artwork!.artNote+=' Sparse source strokes agreed across distinct context prompts.';
  if(accepted[0] && separatePrompt)accepted[0].subject.artwork!.artNote+=' Tight object prompts agreed within a separate output context.';
  return accepted[0]?.subject ?? actor;
}

/** IoU of sorted unique source-pixel indices, independent of crop coordinates. */
export function sourceMaskAgreement(a:Uint32Array,b:Uint32Array):number {
  let i=0,j=0,intersection=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){intersection++;i++;j++;}else if(a[i]<b[j])i++;else j++;}
  const union=a.length+b.length-intersection;
  return union ? intersection/union : 0;
}

/** Keep the component anchored in the recognized actor, plus small detached
 * details within a short pixel gap. A broken mask must not discard antennae,
 * fingers or feet solely because a narrow connecting stroke was missed. */
export function selectActorComponents(components: number[][], width: number, seed: {left:number;top:number;width:number;height:number}): number[] {
  const bounds = (pixels: number[]) => {
    let left=Infinity, top=Infinity, right=-1, bottom=-1, overlap=0;
    for (const at of pixels) {
      const x=at%width,y=Math.floor(at/width);
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
      if(x>=seed.left&&x<seed.left+seed.width&&y>=seed.top&&y<seed.top+seed.height)overlap++;
    }
    return {pixels,left,top,right,bottom,overlap};
  };
  const candidates=components.filter(pixels=>pixels.length>=2).map(bounds).sort((a,b)=>b.overlap-a.overlap||b.pixels.length-a.pixels.length);
  const principal=candidates[0];if(!principal?.overlap)return [];
  const selected=[principal], remaining=candidates.slice(1);
  const gap=Math.min(8,Math.max(3,Math.min(principal.right-principal.left+1,principal.bottom-principal.top+1)*.05));
  const height=candidates.reduce((maximum,part)=>Math.max(maximum,part.bottom),0)+1;
  const distances=new Uint8Array(width*height);distances.fill(255);
  const queue=new Int32Array(distances.length);let head=0,tail=0;
  for(const at of principal.pixels){distances[at]=0;queue[tail++]=at;}
  while(head<tail){
    const at=queue[head++],distance=distances[at];if(distance>=gap)continue;
    const x=at%width,y=Math.floor(at/width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
      const next=yy*width+xx;if(distances[next]<=distance+1)continue;
      distances[next]=distance+1;queue[tail++]=next;
    }
  }
  for(const part of remaining){
    if(part.pixels.length>principal.pixels.length*.12)continue;
    // Do not chain through a trail of disconnected motion lines or nearby
    // scenery: every appendage must be close to the actor itself.
    const near=part.pixels.some(at=>distances[at]<=gap);
    if(near)selected.push(part);
  }
  return selected.flatMap(part=>part.pixels);
}
