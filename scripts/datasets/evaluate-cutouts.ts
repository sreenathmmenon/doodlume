/** Local, annotation-box segmentation evaluation. This does NOT evaluate recognition.
 * Usage: npx tsx scripts/datasets/evaluate-cutouts.ts manifest.json output-directory
 *        [--split development|holdout|all] [--limit 6] [--timeout-ms 60000]
 *        [--mode sam|whole-subject] [--canonical-png]
 * Image/mask paths are relative to the manifest. Holdout runs must follow a frozen
 * implementation; do not use their results to tune that same reported evaluation.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { groundWholeActor } from '../../server/actor-grounding.js';
import { localSegmentationArtwork, localSegmentationConfig, closeLocalSegmentationWorkers } from '../../server/local-segmentation.js';

type Box = { x: number; y: number; width: number; height: number };
type Threshold = { channel: 'alpha' | 'luminance'; threshold: number; invert?: boolean };
type Sample = { id: string; image: string; expectedBox: Box; mask?: string; maskValid?: string;
  maskForeground?: Threshold; maskValidForeground?: Threshold; split: 'development' | 'holdout'; provenance: unknown };
const PREDICTED_ALPHA_THRESHOLD = 20;
const [manifestArg, outputArg, ...flags] = process.argv.slice(2);
function option(name: string, fallback: string) { const at = flags.indexOf(name); return at < 0 ? fallback : flags[at + 1]; }
if (!manifestArg || !outputArg) throw new Error('Usage: evaluate-cutouts.ts manifest.json output-directory [--split development|holdout|all] [--limit 6]');
const split = option('--split', 'development');
const mode = option('--mode', 'sam');
const canonicalPng = flags.includes('--canonical-png');
if (!['sam','whole-subject'].includes(mode)) throw new Error('Mode must be sam or whole-subject.');
const limit = Number(option('--limit', '6')), timeoutMs = Number(option('--timeout-ms', '60000'));
if (!['development','holdout','all'].includes(split) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000)
  throw new Error('Invalid split, limit (1–100), or timeout (1000–180000ms).');
for (let i=0;i<flags.length;i++) { if(flags[i]==='--canonical-png')continue; if (!['--split','--limit','--timeout-ms','--mode'].includes(flags[i]) || flags[++i] === undefined) throw new Error('Unknown or incomplete CLI option.'); }
const manifestPath = resolve(manifestArg), output = resolve(outputArg), base = dirname(manifestPath);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const outputRelative = relative(repositoryRoot, output);
if (!outputRelative || outputRelative === '..' || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative) || ['public', 'dist'].includes(outputRelative.split(sep)[0]))
  throw new Error('Evaluation output must stay in a private Git-ignored directory inside the repository, outside public/ and dist/.');
try { execFileSync('git', ['check-ignore', '--quiet', join(output, 'report.json')], { cwd: repositoryRoot, stdio: 'ignore' }); }
catch { throw new Error('Evaluation output/report.json must be ignored by Git before evaluation starts.'); }
const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString());
if (!Array.isArray(manifest.samples)) throw new Error('Manifest requires a samples array.');
const samples: Sample[] = manifest.samples;
const ids = new Set<string>();
function samplePath(path: string) {
  if (typeof path !== 'string' || isAbsolute(path) || !resolve(base,path).startsWith(base+sep))
    throw new Error('Sample paths must stay inside the manifest directory.');
  return resolve(base,path);
}
for (const sample of samples) {
  const b = sample?.expectedBox;
  if (!sample || typeof sample.id !== 'string' || !/^[\w-]{1,120}$/.test(sample.id) || ids.has(sample.id) ||
    typeof sample.image !== 'string' || !['development','holdout'].includes(sample.split) || sample.provenance === undefined ||
    !b || ![b.x,b.y,b.width,b.height].every(Number.isFinite) || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x+b.width > 1000.001 || b.y+b.height > 1000.001)
    throw new Error('Invalid or duplicate sample metadata.');
  ids.add(sample.id); samplePath(sample.image); if(sample.mask)samplePath(sample.mask); if(sample.maskValid)samplePath(sample.maskValid);
  if (sample.mask && !sample.maskForeground) throw new Error(`Sample ${sample.id} must state its ground-truth foreground threshold.`);
}
const selected = samples.filter(sample => split === 'all' || sample.split === split).slice(0,limit);
if (!selected.length) throw new Error('No samples in the selected split.');
const config = localSegmentationConfig(process.env);
if (!config.configured) throw new Error('Local SAM is not configured; evaluator does not download models or call remote providers.');
await mkdir(output,{recursive:true});
await mkdir(join(output,'cutouts'),{recursive:true});
function sha(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function thresholdConfig(value: Threshold) {
  if (!value || !['alpha','luminance'].includes(value.channel) || !Number.isFinite(value.threshold) || value.threshold < 0 || value.threshold > 255 || (value.invert !== undefined && typeof value.invert !== 'boolean'))
    throw new Error('Invalid mask foreground threshold.');
}
async function binaryMask(path: string, width: number, height: number, rule: Threshold) {
  thresholdConfig(rule);
  const bytes = await readFile(samplePath(path)), meta = await sharp(bytes).metadata();
  if (meta.width !== width || meta.height !== height) throw new Error('Ground-truth mask dimensions do not match source; evaluator does not resize annotations.');
  if (rule.channel === 'alpha' && !meta.hasAlpha) throw new Error('Alpha mask threshold requires an alpha channel.');
  const data = await (rule.channel === 'alpha' ? sharp(bytes).ensureAlpha().extractChannel('alpha') : sharp(bytes).removeAlpha().greyscale()).raw().toBuffer();
  return { values: Uint8Array.from(data,value=>Number(rule.invert ? value <= rule.threshold : value > rule.threshold)), sha256:sha(bytes) };
}
const results: Record<string,any>[] = [];
const implementationSha256 = Object.fromEntries(await Promise.all([
  '../../server/local-segmentation.ts','../../server/actor-grounding.ts','../local-sam-worker.py','./evaluate-cutouts.ts'
].map(async file=>[file,sha(await readFile(fileURLToPath(new URL(file,import.meta.url))))])));
const evaluate = async (sample: Sample, index: number) => {
  const result: Record<string,any> = { id:sample.id, split:sample.split, provenance:sample.provenance,
    task:'oracle-annotation-box-segmentation', recognitionEvaluated:false, expectedBox:sample.expectedBox,
    accepted:false, status:'error', firstRequestMayIncludeModelLoad:index===0 };
  let start = 0;
  try {
    const originalBytes = await readFile(samplePath(sample.image));
    const source = canonicalPng ? await sharp(originalBytes).removeAlpha().toColourspace('srgb').png().toBuffer() : originalBytes;
    const meta = await sharp(source).metadata();
    const width=meta.width!, height=meta.height!;
    if (!width || !height || width*height>2_000_000) throw new Error('Source dimensions exceed local SAM bounds (2 million pixels); importer must normalize image and mask together.');
    result.source={image:sample.image,width,height,sha256:sha(originalBytes),evaluatedSha256:sha(source),transformation:canonicalPng?'Sharp decode to sRGB PNG once; no resize or orientation change. Original references unchanged.':'Original bytes passed directly to local SAM.'};
    const b=sample.expectedBox;
    const left=Math.floor(b.x*width/1000), top=Math.floor(b.y*height/1000);
    const right=Math.min(width,Math.ceil((b.x+b.width)*width/1000)), bottom=Math.min(height,Math.ceil((b.y+b.height)*height/1000));
    let crop={left,top,width:right-left,height:bottom-top}; result.annotationPixelBox={...crop};
    if(mode==='sam')result.promptPixelBox={...crop};
    else result.promptStrategy='Production compact-context expansion around the normalized annotation seed; exact candidate boxes are owned by groundWholeActor.';
    const truth=sample.mask ? await binaryMask(sample.mask,width,height,sample.maskForeground!) : undefined;
    const valid=sample.maskValid ? await binaryMask(sample.maskValid,width,height,sample.maskValidForeground ?? {channel:'luminance',threshold:128}) : undefined;
    if (truth && !truth.values.some((value,index)=>value && (!valid || valid.values[index]))) throw new Error('Ground-truth annotation has no foreground inside its valid region.');
    if (truth) result.groundTruth={mask:sample.mask,sha256:truth.sha256,foreground:sample.maskForeground,
      ...(valid?{validMask:sample.maskValid,validMaskSha256:valid.sha256,validForeground:sample.maskValidForeground ?? {channel:'luminance',threshold:128}}:{})};
    start=performance.now();
    let art: string | undefined;
    if (mode === 'whole-subject') {
      const recovered = await groundWholeActor(source,{id:'oracle-target',kind:'decoration',label:'Annotated subject',...sample.expectedBox},config,AbortSignal.timeout(timeoutMs),[],undefined,true);
      art = recovered.artwork?.art;
      result.recoveredBox = {x:recovered.x,y:recovered.y,width:recovered.width,height:recovered.height};
      if (art) {
        const size=await sharp(Buffer.from(art.split(',')[1],'base64')).metadata();
        crop={left:Math.round(recovered.x*width/1000),top:Math.round(recovered.y*height/1000),width:size.width!,height:size.height!};
      }
    } else {
      const masks=await localSegmentationArtwork(source,[{id:'oracle-target',left,top,right,bottom}],config,AbortSignal.timeout(timeoutMs));
      art=masks.get('oracle-target');
    }
    result.latencyMs=Math.round(performance.now()-start);
    result.returnedPixelBox=art?crop:null;
    const prediction=new Uint8Array(width*height);
    if (art) {
      const png=Buffer.from(art.split(',')[1],'base64'), rgba=await sharp(png).raw().toBuffer();
      const original=await sharp(source).extract(crop).removeAlpha().toColourspace('srgb').raw().toBuffer();
      let visible=0, mismatch=0, visibleMismatch=0, x0=width,y0=height,x1=-1,y1=-1;
      for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++) {
        const i=y*crop.width+x, foreground=rgba[i*4+3]>PREDICTED_ALPHA_THRESHOLD;
        const changed=rgba[i*4]!==original[i*3] || rgba[i*4+1]!==original[i*3+1] || rgba[i*4+2]!==original[i*3+2];
        mismatch+=Number(changed);visibleMismatch+=Number(changed&&foreground);
        if(foreground){prediction[(y+crop.top)*width+x+crop.left]=1;visible++;x0=Math.min(x0,x+crop.left);y0=Math.min(y0,y+crop.top);x1=Math.max(x1,x+crop.left);y1=Math.max(y1,y+crop.top);}
      }
      result.accepted=true;result.status='accepted';result.foregroundPixels=visible;
      result.returnedCropForegroundFraction=visible/(crop.width*crop.height);
      result.alphaTouchesPromptEdge=visible>0 && (x0<=left || y0<=top || x1>=right-1 || y1>=bottom-1);
      result.alphaBounds=visible?{pixels:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},normalized:{x:x0/width*1000,y:y0/height*1000,width:(x1-x0+1)/width*1000,height:(y1-y0+1)/height*1000}}:null;
      result.sourceRGBPreservation={exact:mismatch===0,comparedPixels:crop.width*crop.height,mismatchedPixels:mismatch,visibleMismatchedPixels:visibleMismatch};
      const file=join(output,'cutouts',`${sample.id}.png`);await writeFile(file,png);result.cutout=relative(output,file);
    }else{result.status='rejected';result.reason=mode==='whole-subject'?'Production whole-subject recovery returned the original annotation box without accepted extracted artwork.':'Local segmentation returned no accepted mask (model confidence/size/coherence rejection is not exposed individually).';result.foregroundPixels=0;result.alphaBounds=null;result.sourceRGBPreservation=null;}
    if(truth){
      let tp=0,fp=0,fn=0,tn=0,ignored=0;
      for(let i=0;i<prediction.length;i++){if(valid&&!valid.values[i]){ignored++;continue;}const p=prediction[i],t=truth.values[i];if(p&&t)tp++;else if(p)fp++;else if(t)fn++;else tn++;}
      result.metrics={truePositive:tp,falsePositive:fp,falseNegative:fn,trueNegative:tn,ignoredPixels:ignored,
        iou:tp+fp+fn?tp/(tp+fp+fn):1,precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0};
    }else result.metrics=null;
  }catch(error){if(start)result.latencyMs=Math.round(performance.now()-start);result.error=error instanceof Error?error.message:'Evaluation failed.';}
  return result;
};
try {
  for (const [index,sample] of selected.entries()) {
    const result=await evaluate(sample,index);results.push(result);
    await writeFile(join(output,'results.jsonl'),results.map(row=>JSON.stringify(row)).join('\n')+'\n');
    console.log(JSON.stringify({id:sample.id,split:sample.split,status:result.status,latencyMs:result.latencyMs,iou:result.metrics?.iou ?? null}));
  }
  const groups=['development','holdout'].map(split=>{
    const rows=results.filter(r=>r.split===split), scored=rows.filter(r=>r.metrics), accepted=rows.filter(r=>r.accepted);
    const avg=(field:string,list:Record<string,any>[])=>list.length?list.reduce((s,r)=>s+r.metrics[field],0)/list.length:null;
    return {split,samples:rows.length,accepted:accepted.length,rejected:rows.filter(r=>r.status==='rejected').length,errors:rows.filter(r=>r.status==='error').length,
      scored:scored.length,meanIoUIncludingRejected:avg('iou',scored),meanPrecisionIncludingRejected:avg('precision',scored),meanRecallIncludingRejected:avg('recall',scored)};
  });
  await writeFile(join(output,'report.json'),JSON.stringify({task:'ORACLE annotation-box segmentation, NOT recognition or gameplay',
    manifest:manifestPath,manifestSha256:sha(manifestBytes),implementationSha256,createdAt:new Date().toISOString(),model:'local Meta SAM 2.1 tiny',
    settings:{mode,split,limit,timeoutMs,canonicalPng,boxRounding:mode==='sam'?'floor top-left, ceil bottom-right':'production groundWholeActor pixelBox rounding for expanded contexts; returned PNG dimensions and rounded source placement are authoritative',predictedAlphaForeground:`alpha > ${PREDICTED_ALPHA_THRESHOLD}`,principalComponentOverride:mode==='whole-subject',
      metrics:'Full source-image frame; rejected masks count as empty prediction. Error rows excluded from quality means and counted separately. Precision/recall zero denominator -> 0; empty IoU union -> 1.',holdoutPolicy:'Do not tune on holdout results. Pretraining exposure is unknown. No population-level claims from this small sample.'},groups,results},null,2)+'\n');
} finally { closeLocalSegmentationWorkers(); }
