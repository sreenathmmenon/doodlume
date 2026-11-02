import type {FastifyInstance} from 'fastify';
import sharp from 'sharp';
import {validateWorld} from '../shared/world.js';
import {isSourceAlignedScenery} from '../shared/source-scenery.js';
import {normalizeDrawing} from './images.js';
import {sourceScenery} from './source-scenery.js';

/** Local image processing only: manual drawing updates must refresh derived
 * scenery without paying for, or pretending to perform, model inference. */
export function installSourceScenery(app: FastifyInstance) {
  let preparing=false;
  app.post<{Body:{world?:unknown;image?:unknown;additions?:unknown}}>('/api/source-scenery',async(request,reply)=>{
    if(preparing)return reply.code(429).send({error:'An image update is already being prepared. Try applying again in a moment.'});
    preparing=true;
    try{
      const world=validateWorld(request.body?.world);
      const backdrop=world.entities.find(isSourceAlignedScenery);
      if(!backdrop)throw Error('No source scene');
      const additions=request.body?.additions;
      if(!Array.isArray(additions)||additions.some(entity=>!entity||entity.kind==='player'))throw Error('Invalid additions');
      const candidate=validateWorld({...world,entities:[...world.entities,...additions]});
      const moving=candidate.entities.filter(entity=>entity.artSource&&(entity.kind==='player'||
        (entity.kind==='gate'&&candidate.entities.some(other=>other.kind==='lever'&&other.targetId===entity.id))));
      if(moving.some(entity=>!entity.art))throw Error('Missing moving artwork');
      const source=await normalizeDrawing(request.body?.image);
      const [before,after]=await Promise.all([sharp(Buffer.from(world.sourceImage!.split(',')[1],'base64')).metadata(),sharp(source).metadata()]);
      if(!before.width||!before.height||!after.width||!after.height||Math.abs(before.width/before.height/(after.width/after.height)-1)>.08)throw Error('Changed page shape');
      const art=await sourceScenery(source,candidate.entities);
      return {sourceScenery:{id:backdrop.id,art}};
    }catch{
      return reply.code(422).send({error:'The revised image background could not be prepared. Keep the same page framing and try again. Your draft is still here.'});
    }finally{preparing=false;}
  });
}
