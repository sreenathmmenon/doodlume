import { createHash } from 'node:crypto';
import { InterpretationError } from './model.js';
import { groundWholeActor } from './actor-grounding.js';
import { validateConfirmedSourceOutline } from './source-outline.js';
import { cropArtwork } from './images.js';
import { extractArtwork, segmentationConfigured, type SegmentationConnection } from './segmentation.js';
import type { ArtworkBox, WorldEntity, InputKind } from '../shared/world.js';

export class MovableArtworkReviewError extends InterpretationError {
  readonly objectIds:string[];
  readonly objectId:string;
  constructor(objects:string|string[]) {
    super("The complete object outline could not be verified. Select the whole object, then use Correct object outline to keep its pixels and remove the background.");
    this.objectIds=typeof objects === 'string' ? [objects] : [...new Set(objects)];
    this.objectId=this.objectIds[0];
  }
}

/** Shared exact key for cached source-space facts, never semantic names. */
function recoveryKey(hash:string,box:ArtworkBox,config:NonNullable<SegmentationConnection['local']>):string {
  return JSON.stringify([hash,box.x,box.y,box.width,box.height,config.python,config.checkpoint,config.worker,'compact-self-empty-surfaces-v1']);
}

/** Report only facts actually produced in this request. A stationary or omitted
 * source has not necessarily been extracted, and is never called verified. */
export function sourceRecoveryEvidence(source:Buffer,objects:readonly {id:string;bounds:{left:number;top:number;right:number;bottom:number}}[],segmentation:SegmentationConnection) {
  const hash=createHash('sha256').update(source).digest('hex');
  return objects.map(object=>{
    const b=object.bounds,box={x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top};
    const known=segmentation.enabled && segmentation.provider === 'local-sam2' && segmentation.local?.configured ? segmentation.sourceRecoveryCache?.get(recoveryKey(hash,box,segmentation.local)) : undefined;
    return {id:object.id,status:!known?'untested':known.artwork?'mask-available':'requires-outline',
      ...(known?.artwork?{recoveredBounds:{left:known.x,top:known.y,right:known.x+known.width,bottom:known.y+known.height}}:{})};
  });
}

/** Recover a bounded whole source prop before removing its old silhouette.
 * Geometry follows the recovered source pixels, so expanding a crop cannot
 * stretch it back into a clipped detection box. */
export async function prepareMovingSourceArt(source:Buffer, entities:WorldEntity[], segmentation:SegmentationConnection,
  signal:AbortSignal, transport:typeof fetch, inputKind:InputKind):Promise<void> {
  signal.throwIfAborted();
  const remaining:WorldEntity[]=[],unverified:string[]=[];
  // Source bytes are hashed once per preparation, and geometry remains in its
  // original normalized frame. Cached extraction never includes game placement.
  const sourceHash=segmentation.sourceRecoveryCache ? createHash('sha256').update(source).digest('hex') : undefined;
  for (const entity of entities) {
    if (!entity.artSource) continue;
    const original={...entity.artSource};
    if (entity.artMethod === 'outline') {
      await validateConfirmedSourceOutline(source, entity);
      entity.sourceLayer={x:entity.x,y:entity.y,width:entity.width,height:entity.height};
      continue;
    }
    if (entity.kind === 'decoration' && segmentation.enabled && segmentation.provider === 'local-sam2' && segmentation.local?.configured) {
      const cache=segmentation.sourceRecoveryCache;
      const key=sourceHash ? recoveryKey(sourceHash,original,segmentation.local) : undefined;
      signal.throwIfAborted();
      const cached=key ? cache?.get(key) : undefined;
      const recovered=cached ? {...structuredClone(cached),id:entity.id,label:entity.label ?? 'Source object'} :
        await groundWholeActor(source,{id:entity.id,kind:entity.kind,label:entity.label ?? 'Source object',...original},segmentation.local,signal,[],undefined,true);
      signal.throwIfAborted();
      // A genuine no-artwork result is useful extraction evidence too. Errors
      // and cancellation bypass this write, leaving the next attempt retryable.
      if(!cached && key && cache && cache.size<24)cache.set(key,structuredClone(recovered));
      if (recovered.artwork) {
        const sx=entity.width/original.width,sy=entity.height/original.height;
        entity.x+=(recovered.x-original.x)*sx;entity.y+=(recovered.y-original.y)*sy;
        entity.width=recovered.width*sx;entity.height=recovered.height*sy;
        entity.artSource={x:recovered.x,y:recovered.y,width:recovered.width,height:recovered.height};
        Object.assign(entity,recovered.artwork);
      } else unverified.push(entity.id);
    } else remaining.push(entity);
    entity.sourceLayer={x:entity.x,y:entity.y,width:entity.width,height:entity.height};
  }
  // Report every failed moving selection together. A bounded model correction
  // or creator review can then address the complete failure set in one pass.
  if (unverified.length) throw new MovableArtworkReviewError(unverified);
  for (const entity of remaining) {
    entity.art=await cropArtwork(source,entity.artSource!,inputKind !== 'picture');
    entity.artMethod=inputKind==='picture'?'crop':'paper';
  }
  if (remaining.length && segmentation.enabled && segmentationConfigured(segmentation)) {
    const artwork=await extractArtwork(source,remaining.map(entity=>({id:entity.id,...entity.artSource!})),segmentation,signal,transport,inputKind);
    for (const entity of remaining) Object.assign(entity,artwork.get(entity.id));
  }
}
