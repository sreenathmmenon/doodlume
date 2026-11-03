import type {FastifyInstance} from 'fastify';
import sharp from 'sharp';
import {validateWorld, emptyPlayState} from '../shared/world.js';
import {applyWorldPatch, type WorldPatch} from '../shared/revisions.js';
import {isSourceAlignedScenery} from '../shared/source-scenery.js';
import {normalizeDrawing} from './images.js';
import {sourceScenery} from './source-scenery.js';
import {recoverSourceObjectLayer} from './source-object-layer.js';

/** Local preparation: source-mask removal and background reconstruction, with
 * local Meta SAM recovery when an older selection contains only a landing lip.
 * This endpoint never sends images to a remote model provider. */
export function installSourceScenery(app: FastifyInstance) {
  let preparing=false;
  app.post<{Body:{world?:unknown;image?:unknown;additions?:unknown;updates?:unknown;bounds?:WorldPatch['bounds']}}>('/api/source-scenery',async(request,reply)=>{
    if(preparing)return reply.code(429).send({error:'An image update is already being prepared. Try applying again in a moment.'});
    preparing=true;
    try{
      const world=validateWorld(request.body?.world);
      const backdrop=world.entities.find(isSourceAlignedScenery);
      if(!backdrop)throw Error('No source scene');
      const additions=request.body?.additions;
      if(!Array.isArray(additions)||additions.some(entity=>!entity||entity.kind==='player'))throw Error('Invalid additions');
      const updates=request.body?.updates;
      if(updates!==undefined&&!Array.isArray(updates))throw Error('Invalid updates');
      const bounds=request.body?.bounds;
      if(bounds && (!Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<world.width||bounds.height<world.height))throw Error('Invalid bounds');
      const candidate=updates && updates.length ? applyWorldPatch(world,emptyPlayState(),{
        id:'prepare-source-layers',worldId:world.id,baseRevision:world.revision,origin:'manual',
        additions,updates:updates as WorldPatch['updates'], ...(bounds ? {bounds} : {}),
        sourceScenery:{id:backdrop.id,art:backdrop.art??world.sourceImage},
      }).world : validateWorld({...world,...bounds,entities:[...world.entities,...additions]});
      const moving=candidate.entities.filter(entity=>entity.artSource&&(entity.sourceLayer||entity.kind==='player'||
        (entity.kind==='gate'&&candidate.entities.some(other=>other.kind==='lever'&&other.targetId===entity.id))));
      if(moving.some(entity=>!entity.art))throw Error('Missing moving artwork');
      const source=await normalizeDrawing(request.body?.image);
      const [before,after]=await Promise.all([sharp(Buffer.from(world.sourceImage!.split(',')[1],'base64')).metadata(),sharp(source).metadata()]);
      if(!before.width||!before.height||!after.width||!after.height||Math.abs(before.width/before.height/(after.width/after.height)-1)>.08)throw Error('Changed page shape');
      const sourceLayers: NonNullable<WorldPatch['sourceLayers']> = [];
      for (const entity of candidate.entities) {
        const original = world.entities.find(item => item.id === entity.id);
        if (!entity.sourceLayer || original?.sourceLayer || !original?.artSource || !['terrain','bridge'].includes(entity.kind)) continue;
        const thinLegacySelection = !original.sourcePlacement && original.artSource.height / 1000 * backdrop.height <= entity.sourceLayer.height * 2;
        if (thinLegacySelection || original.sourcePlacement && original.artMethod !== 'sam') {
          const recovered = await recoverSourceObjectLayer(source, original, AbortSignal.timeout(45_000));
          if (!recovered.art || !recovered.artSource) throw Error('Incomplete source cutout');
          Object.assign(entity, recovered);
          // Older ledge-only boxes can include paper and miss the real edge.
          // Once SAM verifies the whole object, anchor that legacy surface to
          // its actual source top/width so no resized collider extends in air.
          if (thinLegacySelection) entity.sourceLayer = {
            x: backdrop.x + recovered.artSource.x / 1000 * backdrop.width,
            y: backdrop.y + recovered.artSource.y / 1000 * backdrop.height,
            width: recovered.artSource.width / 1000 * backdrop.width,
            height: Math.min(entity.sourceLayer.height, recovered.artSource.height / 1000 * backdrop.height),
          };
          sourceLayers.push({ id: entity.id, art: recovered.art, artSource: recovered.artSource, artMethod: recovered.artMethod, artNote: recovered.artNote, sourceLayer: entity.sourceLayer });
        }
      }
      const art=await sourceScenery(source,candidate.entities);
      return {sourceScenery:{id:backdrop.id,art}, ...(sourceLayers.length ? {sourceLayers} : {})};
    }catch{
      return reply.code(422).send({error:'The edited source artwork could not be prepared. Keep the same page framing and try again. Your draft is still here.'});
    }finally{preparing=false;}
  });
}
