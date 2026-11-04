import sharp from 'sharp';
import {readSourceInventory} from './staged-planning.js';
import {sourceRecoveryEvidence} from './moving-source-art.js';
import {sourcePlacementOptions} from './source-placement-options.js';
import type {SegmentationConnection} from './segmentation.js';

/** Factual correction context only. It selects neither game roles nor actions,
 * and never sends cutout pixel data back as purported model detections. */
export async function photoSourceFacts(source:Buffer,candidate:unknown,segmentation:SegmentationConnection) {
  if(!candidate||typeof candidate!=='object'||!Array.isArray((candidate as {objects?:unknown}).objects))return;
  try{
    const objects=(candidate as {objects:unknown[]}).objects;
    const inventory=readSourceInventory({kind:'inventory',objects:objects.map(value=>{const o=value && typeof value==='object' ? value as Record<string,unknown> : {};return {id:o.id,label:o.label,bounds:o.bounds};})});
    const recovery=sourceRecoveryEvidence(source,inventory,segmentation);
    const known=new Map(recovery.map(item=>[item.id,item]));
    const measurements=inventory.map(object=>({id:object.id,bounds:known.get(object.id)?.recoveredBounds??object.bounds}));
    const size=await sharp(source).metadata();if(!size.width||!size.height)return;
    return {scope:'Actual extraction status from this same request. mask-available means accepted source pixels are available; it does not certify semantic identity or a whole hidden object. requires-outline means the actual whole-object verifier rejected it. untested means no result exists, never that the mask succeeded. Inventory source boxes remain frozen. Fit uses recovered mask extents where available and original boxes otherwise; it proves only initial world bounds, not semantic surface suitability, placement visibility or completion. Do not move an unavailable object or call an untested one verified. Final source, geometry and gameplay validation still apply.',
      sourceRecovery:recovery,initialGeometry:sourcePlacementOptions(measurements,size.width,size.height)};
  }catch{return;}
}
