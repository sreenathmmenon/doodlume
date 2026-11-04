import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { validateWorld, emptyPlayState } from '../shared/world.js';
import { applyWorldPatch, type WorldPatch } from '../shared/revisions.js';
import { isSourceAlignedScenery, isSourceBackdrop, SOURCE_SCENERY_NOTE } from '../shared/source-scenery.js';
import { normalizeDrawing } from './images.js';
import { applyConfirmedSourceOutlines } from './source-outline.js';
import { sourceScenery } from './source-scenery.js';
import { interpretationErrorResponse } from './interpretation-response.js';

/** Same-crop alpha edits and local background repair form one atomic revision.
 * Original pixels, geometry, mechanics and earned play state are not rewritten. */
export function installSourceRefinement(app: FastifyInstance) {
  let preparing = false;
  app.post<{Body:{world?:unknown;outlines?:unknown}}>('/api/source-refinement', async (request, reply) => {
    if (preparing) return reply.code(429).send({error:'An outline is already being prepared. Try again in a moment.'});
    preparing = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 120_000);
    const onClose = () => { if (!reply.raw.writableFinished) controller.abort(); };
    reply.raw.on('close', onClose);
    try {
      const world = validateWorld(request.body?.world);
      const backdrops = world.entities.filter(isSourceAlignedScenery);
      const outlines = request.body?.outlines;
      if (backdrops.length !== 1 || !Array.isArray(outlines) || !outlines.length || outlines.length > 24 ||
          outlines.some(outline => { const entity = world.entities.find(item => item.id === outline?.entityId); return !entity?.art || !entity.artSource || isSourceBackdrop(entity); }))
        throw Error('Choose an existing source cutout to refine.');
      controller.signal.throwIfAborted();
      const source = await normalizeDrawing(world.sourceImage);
      const candidate = await applyConfirmedSourceOutlines(source, world, outlines);
      controller.signal.throwIfAborted();
      const ids = new Set(outlines.map(outline => outline.entityId));
      const sourceRefinements = candidate.entities.filter(entity => ids.has(entity.id)).map(entity => ({
        id:entity.id, art:entity.art!, artSource:entity.artSource!, artMethod:entity.artMethod,
        artNote:entity.artNote, sourceOutline:entity.sourceOutline!,
      }));
      let repairNote = "";
      const art = await sourceScenery(source, candidate.entities, candidate.interactions, undefined, details => {
        repairNote = details.method === "lama" ? " Background reconstructed with local LaMa." : " Background reconstructed with local classical inpainting.";
      }, controller.signal, candidate.inputKind);
      controller.signal.throwIfAborted();
      const patch: WorldPatch = {id:randomUUID(),worldId:world.id,baseRevision:world.revision,origin:'manual',additions:[],
        sourceRefinements,sourceScenery:{id:backdrops[0].id,art,artNote:SOURCE_SCENERY_NOTE+repairNote}};
      applyWorldPatch(world, emptyPlayState(), patch);
      return {patch};
    } catch (error) {
      const response = interpretationErrorResponse(error);
      if (response) return reply.code(response.status).send(response.body);
      return reply.code(controller.signal.aborted ? 504 : 422).send({error:'The outline and its background could not be prepared together. Your world is unchanged; keep your draft and try again.'});
    } finally {
      clearTimeout(timeout); reply.raw.off('close', onClose); preparing = false;
    }
  });
}
