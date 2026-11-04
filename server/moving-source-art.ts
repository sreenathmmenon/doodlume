import { InterpretationError } from './model.js';
import { groundWholeActor } from './actor-grounding.js';
import { validateConfirmedSourceOutline } from './source-outline.js';
import { cropArtwork } from './images.js';
import { extractArtwork, segmentationConfigured, type SegmentationConnection } from './segmentation.js';
import type { WorldEntity, InputKind } from '../shared/world.js';

export class MovableArtworkReviewError extends InterpretationError {
  constructor(public objectId:string) { super("The complete object outline could not be verified. Select the whole object, then use Correct object outline to keep its pixels and remove the background."); }
}

/** Recover a bounded whole source prop before removing its old silhouette.
 * Geometry follows the recovered source pixels, so expanding a crop cannot
 * stretch it back into a clipped detection box. */
export async function prepareMovingSourceArt(source:Buffer, entities:WorldEntity[], segmentation:SegmentationConnection,
  signal:AbortSignal, transport:typeof fetch, inputKind:InputKind):Promise<void> {
  const remaining:WorldEntity[]=[];
  for (const entity of entities) {
    if (!entity.artSource) continue;
    const original={...entity.artSource};
    if (entity.artMethod === 'outline') {
      await validateConfirmedSourceOutline(source, entity);
      entity.sourceLayer={x:entity.x,y:entity.y,width:entity.width,height:entity.height};
      continue;
    }
    if (entity.kind === 'decoration' && segmentation.enabled && segmentation.provider === 'local-sam2' && segmentation.local?.configured) {
      const recovered=await groundWholeActor(source,{id:entity.id,kind:entity.kind,label:entity.label ?? 'Source object',...original},segmentation.local,signal,[],undefined,true);
      if (recovered.artwork) {
        const sx=entity.width/original.width,sy=entity.height/original.height;
        entity.x+=(recovered.x-original.x)*sx;entity.y+=(recovered.y-original.y)*sy;
        entity.width=recovered.width*sx;entity.height=recovered.height*sy;
        entity.artSource={x:recovered.x,y:recovered.y,width:recovered.width,height:recovered.height};
        Object.assign(entity,recovered.artwork);
      } else throw new MovableArtworkReviewError(entity.id);
    } else remaining.push(entity);
    entity.sourceLayer={x:entity.x,y:entity.y,width:entity.width,height:entity.height};
  }
  for (const entity of remaining) {
    entity.art=await cropArtwork(source,entity.artSource!,inputKind !== 'picture');
    entity.artMethod=inputKind==='picture'?'crop':'paper';
  }
  if (remaining.length && segmentation.enabled && segmentationConfigured(segmentation)) {
    const artwork=await extractArtwork(source,remaining.map(entity=>({id:entity.id,...entity.artSource!})),segmentation,signal,transport,inputKind);
    for (const entity of remaining) Object.assign(entity,artwork.get(entity.id));
  }
}
