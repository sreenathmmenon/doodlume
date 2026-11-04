import sharp from 'sharp';
import { includeSourceRepairMargin } from '../shared/source-outline.js';
import { repairSourceBackgroundDetailed } from './source-background.js';
import { imageData, pixelBox } from './images.js';
import type { InteractionPlan } from '../shared/interactions.js';
import type { WorldEntity, InputKind } from '../shared/world.js';

export { SOURCE_SCENERY_NOTE } from "../shared/source-scenery.js";

/** Preserve stationary source pixels and reconstruct the permitted moving
 * silhouette coverage. Repair may inspect a broader context without gaining
 * permission to erase unrelated photograph pixels. */
export async function sourceScenery(source: Buffer, entities: WorldEntity[], interactions?: InteractionPlan, inspectRepair?: (source:Buffer,mask:Buffer)=>Promise<void>, reportRepair?: (details:{method:"lama"|"classical";dilationPixels:number})=>void, signal?:AbortSignal, inputKind:InputKind = "drawing"): Promise<string> {
  signal?.throwIfAborted();
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const original = Buffer.from(data);
  const repairMask = Buffer.alloc(info.width * info.height);
  const hasConfirmedOutline = entities.some(entity => entity.artMethod === 'outline');
  const exactPhotoCoverage = inputKind === 'picture';
  // A model may expand its inference mask without gaining permission to erase
  // stationary photograph pixels. Photo writeback follows only actual foreground
  // coverage (plus an explicitly chosen creator margin). Drawing masks retain
  // their existing automatic ink/halo cleanup region.
  const writable = hasConfirmedOutline || exactPhotoCoverage ? Buffer.alloc(info.width * info.height) : undefined;
  const automaticRepair = hasConfirmedOutline && !exactPhotoCoverage ? Buffer.alloc(info.width * info.height) : undefined;
  const interactionGates = new Set((interactions?.actions ?? []).flatMap(action => (action.effects ?? []).flatMap(effect => effect.kind === 'openGate' || effect.kind === 'moveObject' ? [effect.entityId] : [])));
  const carried = new Set((interactions?.objects ?? []).filter(object => object.carryable).map(object => object.entityId));
  for (const entity of entities) {
    signal?.throwIfAborted();
    if (!entity.artSource || (!entity.sourceLayer && !carried.has(entity.id) && !interactionGates.has(entity.id) && !['player','gate'].includes(entity.kind))) continue;
    if (entity.kind === 'gate' && !entity.sourceLayer && !interactionGates.has(entity.id) && !entities.some(other => other.kind === 'lever' && other.targetId === entity.id)) continue;
    let box = pixelBox(entity.artSource, info.width, info.height);
    let mask: Buffer | undefined;
    if (entity.art && entity.artMethod !== 'crop' && entity.art.startsWith('data:image/png;base64,'))
      mask = await sharp(Buffer.from(entity.art.split(',')[1], 'base64')).ensureAlpha().resize(box.width, box.height, { fit: 'fill' }).raw().toBuffer();
    const creatorMargin=entity.artMethod === 'outline' ? entity.sourceOutline?.repairMargin ?? 0 : 0;
    if(!Number.isInteger(creatorMargin)||creatorMargin<0||creatorMargin>12)throw new Error('Choose a background cleanup margin from 0 to 12 source pixels.');
    if(mask && creatorMargin>0){
      // Expand only the independent cleanup mask. The entity's artwork, source
      // selection and alpha stay byte-for-byte unchanged for rendering/saves.
      const padding={left:Math.min(creatorMargin,box.left),top:Math.min(creatorMargin,box.top),
        right:Math.min(creatorMargin,info.width-box.left-box.width),bottom:Math.min(creatorMargin,info.height-box.top-box.height)};
      mask=await sharp(mask,{raw:{width:box.width,height:box.height,channels:4}})
        .extend({...padding,background:{r:0,g:0,b:0,alpha:0}}).raw().toBuffer();
      box={left:box.left-padding.left,top:box.top-padding.top,width:box.width+padding.left+padding.right,height:box.height+padding.top+padding.bottom};
      const coverage=Buffer.alloc(box.width*box.height),expanded=Buffer.alloc(coverage.length);
      for(let pixel=0;pixel<coverage.length;pixel++)coverage[pixel]=mask[pixel*4+3];
      includeSourceRepairMargin(expanded,coverage,box.width,box.height,creatorMargin);
      for(let pixel=0;pixel<coverage.length;pixel++)mask[pixel*4+3]=expanded[pixel];
    }
    if (entity.sourceLayer && mask && entity.artMethod !== 'outline') {
      // Include the antialiased edge just outside a tight SAM crop when the
      // paper-mask dilation below removes an edited object from its old place.
      const padding = { left: Math.min(3, box.left), top: Math.min(3, box.top),
        right: Math.min(3, info.width - box.left - box.width), bottom: Math.min(3, info.height - box.top - box.height) };
      mask = await sharp(mask, { raw: { width: box.width, height: box.height, channels: 4 } })
        .extend({ ...padding, background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
      box = { left: box.left - padding.left, top: box.top - padding.top,
        width: box.width + padding.left + padding.right, height: box.height + padding.top + padding.bottom };
    }
    const paperSamples: number[][] = [];
    const edges = Array.from({length:4}, () => ({total:0,paper:0}));
    const samplePaper = (x: number, y: number, edge: number) => {
      x = Math.max(0, Math.min(info.width - 1, x)); y = Math.max(0, Math.min(info.height - 1, y));
      const at = (y * info.width + x) * 4, rgb = [original[at], original[at + 1], original[at + 2]];
      edges[edge].total++;
      if (Math.min(...rgb) >= 180 && Math.max(...rgb) - Math.min(...rgb) <= 35) { paperSamples.push(rgb); edges[edge].paper++; }
    };
    for (let x = -6; x < box.width + 6; x += 3) { samplePaper(box.left + x, box.top - 6, 0); samplePaper(box.left + x, box.top + box.height + 6, 1); }
    for (let y = 0; y < box.height; y += 3) { samplePaper(box.left - 6, box.top + y, 2); samplePaper(box.left + box.width + 6, box.top + y, 3); }
    // A mostly white perimeter can still straddle a painted shelf or dock.
    // Use direct paper fill only when every side supports blank paper; otherwise
    // preserve that structural context for the background reconstruction model.
    const paper = edges.every(edge => edge.total > 0 && edge.paper / edge.total >= .85)
      ? [0,1,2].map(channel => paperSamples.map(rgb => rgb[channel]).sort((a,b)=>a-b)[Math.floor(paperSamples.length / 2)]) : undefined;
    const originalMask = mask;
    if (mask && paper && entity.artMethod !== 'outline' && !exactPhotoCoverage) {
      mask = Buffer.from(mask);
      for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
        let alpha = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < box.width && yy < box.height) alpha = Math.max(alpha, originalMask![(yy * box.width + xx) * 4 + 3]);
        }
        mask[(y * box.width + x) * 4 + 3] = alpha;
      }
    }
    for (let y = 0; y < box.height; y++) {
      // Sample clean paper on each side of the complete actor, retaining the
      // source lighting gradient instead of leaving a flat silhouette-shaped patch.
      const paperAt = (side: number) => {
        if (!paper) return undefined;
        const samples: number[][] = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = 0; dx < 9; dx++) {
          const xx = Math.max(0, Math.min(info.width - 1, side < 0 ? box.left - 4 - dx : box.left + box.width + 4 + dx));
          const yy = Math.max(0, Math.min(info.height - 1, box.top + y + dy));
          const at = (yy * info.width + xx) * 4, rgb = [original[at], original[at+1], original[at+2]];
          if (Math.min(...rgb) >= 180 && Math.max(...rgb) - Math.min(...rgb) <= 35) samples.push(rgb);
        }
        return samples.length ? [0,1,2].map(c => samples.reduce((sum, rgb) => sum + rgb[c], 0) / samples.length) : paper;
      };
      const leftPaper = paperAt(-1), rightPaper = paperAt(1);
      let x = 0;
      while (x < box.width) {
        if (mask && mask[(y * box.width + x) * 4 + 3] < (entity.artMethod === 'outline' ? 1 : 8)) { x++; continue; }
        const start = x;
        while (x < box.width && (!mask || mask[(y * box.width + x) * 4 + 3] >= (entity.artMethod === 'outline' ? 1 : 8))) x++;
        const end = x;
        const left = ((box.top + y) * info.width + Math.max(0, box.left + start - 2)) * 4;
        const right = ((box.top + y) * info.width + Math.min(info.width - 1, box.left + end + 2)) * 4;
        for (let px = start; px < end; px++) {
          const at = ((box.top + y) * info.width + box.left + px) * 4;
          if (!paper) {
            const pixel=(box.top + y) * info.width + box.left + px;
            repairMask[pixel] = 255;
            if(automaticRepair && entity.artMethod !== 'outline')automaticRepair[pixel]=255;
          }
          // Even a partially covered edge belongs to the moving object. Its
          // foreground alpha stays unchanged; leaving partial source ink here
          // would render that edge twice and leave a ghost after movement.
          const amount = entity.artMethod === 'outline' ? 1 : mask ? mask[(y * box.width + px) * 4 + 3] / 255 : 1;
          if (writable) writable[(box.top + y) * info.width + box.left + px] = 255;
          const t = (px - start + 1) / (end - start + 1);
          for (let c = 0; c < 3; c++) {
            const sourceT = (px + 1) / (box.width + 1);
            const background = paper ? leftPaper![c] * (1 - sourceT) + rightPaper![c] * sourceT : original[left + c] * (1 - t) + original[right + c] * t;
            let texturedBackground = background;
            if (paper) {
              const sampleX = Math.max(0, Math.min(info.width - 1, sourceT < .5 ? box.left - 4 - (px % 24) : box.left + box.width + 4 + (px % 24)));
              const sampleAt = ((box.top + y) * info.width + sampleX) * 4;
              const rgb = [original[sampleAt], original[sampleAt+1], original[sampleAt+2]];
              if (Math.min(...rgb) >= 180 && Math.max(...rgb) - Math.min(...rgb) <= 35) {
                const localMean = sourceT < .5 ? leftPaper![c] : rightPaper![c];
                texturedBackground += Math.max(-7, Math.min(7, rgb[c] - localMean));
              }
            }
            data[at + c] = Math.round(original[at + c] * (1 - amount) + texturedBackground * amount);
          }
          data[at + 3] = 255;
        }
      }
    }
  }
  if (repairMask.some(value => value > 0)) {
    const pngMask = await sharp(repairMask, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
    const preparedSource = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    await inspectRepair?.(preparedSource,pngMask);
    signal?.throwIfAborted();
    const repaired = await repairSourceBackgroundDetailed(preparedSource, pngMask, signal);
    if (repaired) {
      reportRepair?.({method:repaired.method,dilationPixels:repaired.dilationPixels});
      if (!writable) return imageData(await sharp(repaired.image).ensureAlpha().png().toBuffer());
      if (automaticRepair) includeSourceRepairMargin(writable,automaticRepair,info.width,info.height,repaired.dilationPixels);
      const result = await sharp(repaired.image).ensureAlpha().raw().toBuffer();
      for (let at = 0; at < writable.length; at++) {
        if (writable[at] === 0) original.copy(result, at * 4, at * 4, at * 4 + 4);
      }
      return imageData(await sharp(result, {raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer());
    }
  }
  signal?.throwIfAborted();
  return imageData(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
}
