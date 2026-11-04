import { RecognitionReviewError } from './recognition-error.js';

type Selection={id:string;kind:string;label:string;targetId:string|null;bounds:{left:number;top:number;right:number;bottom:number}};
function inventory(value:unknown):Selection[]|undefined {
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const objects=(value as {objects?:unknown}).objects;
  if(!Array.isArray(objects)||!objects.length||objects.length>24)return;
  const seen=new Set<string>();
  const result:Selection[]=[];
  for(const o of objects){
    if(!o||typeof o!=='object'||typeof o.id!=='string'||!/^[\w-]{1,60}$/.test(o.id)||seen.has(o.id)||
       typeof o.label!=='string'||typeof o.kind!=='string'||!(o.targetId===null||typeof o.targetId==='string')||!o.bounds)return;
    const b=o.bounds;
    if(![b.left,b.top,b.right,b.bottom].every(n=>Number.isFinite(n)&&n>=0&&n<=1000)||b.right<=b.left||b.bottom<=b.top)return;
    seen.add(o.id);result.push({id:o.id,kind:o.kind,label:o.label,targetId:o.targetId,bounds:{left:b.left,top:b.top,right:b.right,bottom:b.bottom}});
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}

/** A design correction may use real extraction feedback, never human rule
 * confirmation, another image, or a fabricated list of unavailable objects. */
export function sourceOutlineReplanningFeedback(error:unknown,candidate:unknown,sourceImage:string) {
  if(!(error instanceof RecognitionReviewError))return;
  const selections=inventory(candidate);if(!selections)return;
  const ids=new Set(selections.map(o=>o.id)),review=error.recovery;
  if(review.kind!=='recognition-review'||review.version!==1||review.draft.sourceImage!==sourceImage||review.rulesNeedConfirmation||
     !Array.isArray(review.issues)||!review.issues.length||review.issues.length>24)return;
  const issues=[];
  for(const issue of review.issues){
    if(!(issue.id==='source-outline'||/^source-outline-(?:[2-9]|1[0-9]|2[0-4])$/.test(issue.id))||
       !issue.objectId||!ids.has(issue.objectId)||typeof issue.message!=='string'||!issue.message.trim())return;
    issues.push({objectId:issue.objectId,message:issue.message.slice(0,320)});
  }
  return {sourceInventory:selections,sourceReviewIssues:issues};
}
export function retainsSourceInventory(a:unknown,b:unknown):boolean {
  const first=inventory(a),second=inventory(b);
  return Boolean(first&&second&&JSON.stringify(first)===JSON.stringify(second));
}
