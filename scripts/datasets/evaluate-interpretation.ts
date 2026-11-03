/** Exercise the production interpretation path on independent public inputs.
 * node --import tsx scripts/datasets/evaluate-interpretation.ts manifest.json output [--limit 2]
 * Explicit --execute is required for fresh paid provider requests. Saved responses
 * are evidence, never routed into the app as a replacement for inference.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {interpretDrawing,RecognitionReviewError} from '../../server/interpret.js';
import {loadLocalProviderKeys} from '../../server/credentials.js';
import {modelConnection} from '../../server/provider.js';
import {localSegmentationConfig,closeLocalSegmentationWorkers} from '../../server/local-segmentation.js';
const [manifestPath,outputPath,...flags]=process.argv.slice(2);
if(!manifestPath||!outputPath)throw Error('Provide manifest and output paths. Add --execute for model calls.');
const limitAt=flags.indexOf('--limit'),limit=Number(limitAt<0?'2':flags[limitAt+1]);
const kindAt=flags.indexOf('--input-kind'),inputKind=kindAt<0?'drawing':flags[kindAt+1];
if(!Number.isInteger(limit)||limit<1||limit>6||!['drawing','picture'].includes(inputKind))throw Error('Limit must be1–6 and input kind drawing or picture.');
for(let i=0;i<flags.length;i++){
  if(flags[i]==='--execute')continue;
  if(!['--limit','--input-kind'].includes(flags[i])||!flags[i+1])throw Error('Unknown or incomplete CLI option.');
  i++;
}
const base=path.dirname(path.resolve(manifestPath)),out=path.resolve(outputPath);
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(!Array.isArray(manifest.samples))throw Error('Manifest requires samples.');
const samples=manifest.samples.filter((sample:any)=>sample.split==='development').slice(0,limit);
if(!flags.includes('--execute')){console.log(JSON.stringify({images:samples.length,maxModelRequests:limit*2,inputKind,ids:samples.map((s:any)=>s.id),note:'Dry run. Dataset labels, boxes and masks never enter the request.'}));process.exit(0);}
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
const outputRelative=path.relative(repositoryRoot,out);
if(!outputRelative||outputRelative==='..'||outputRelative.startsWith('..'+path.sep)||path.isAbsolute(outputRelative)||['public','dist'].includes(outputRelative.split(path.sep)[0]))throw Error('Outputs must stay in a private ignored directory inside the repository.');
try { execFileSync('git',['check-ignore','-q',path.join(out,'report.json')],{cwd:repositoryRoot,stdio:'ignore'}); }
catch { throw Error('Evaluation outputs must be ignored by Git.'); }
await fs.mkdir(out,{recursive:true});
loadLocalProviderKeys();const connection=modelConnection({...process.env,MODEL_PROVIDER:'fireworks'});
if(!connection.apiKey)throw Error('Configured provider credential is unavailable.');
const maxRequests=limit*2;let requests=0;connection.reserveRequest=()=>{if(requests>=maxRequests)throw Error('Evaluation request budget exhausted.');requests++;};
const local=localSegmentationConfig(process.env);
const results=[];
try{
  for(const sample of samples){
    if(!/^[\w-]{1,120}$/.test(sample.id))throw Error('Invalid sample ID.');
    const imagePath=path.resolve(base,sample.image);
    if(!imagePath.startsWith(base+path.sep))throw Error('Sample path leaves dataset directory.');
    const bytes=await fs.readFile(imagePath);if(bytes.length>8000000)throw Error('Image exceeds evaluation bound.');
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const rawPath=path.join(out,`${sample.id}-result.json`);
    try{await fs.access(rawPath);throw Error('Existing model response: choose a new output directory; never overwrite evidence.');}catch(e:any){if(e.code!=='ENOENT')throw e;}
    const start=performance.now();
    const result:any={id:sample.id,sha256,inputKind,task:'production-image-to-world',labelsProvidedToModel:false,provider:connection.provider,model:connection.model};
    let sampleCalls=0;
    const transport:typeof fetch=async(input,init)=>{
      const response=await fetch(input,init);
      sampleCalls++;if(response.ok){const body=await response.clone().json();await fs.writeFile(path.join(out,`${sample.id}-call-${sampleCalls}-model.json`),JSON.stringify(body,null,2)+'\n',{flag:'wx'});}
      return response;
    };
    try{
      const world=await interpretDrawing(`data:image/${/\.png$/i.test(sample.image)?'png':'jpeg'};base64,${bytes.toString('base64')}`,
        'Make a playful world using what is actually visible. Preserve the original subject and its marks.',connection,AbortSignal.timeout(180000),
        {enabled:true,apiKey:'',provider:'local-sam2',local},transport,inputKind as 'drawing'|'picture');
      await fs.writeFile(path.join(out,`${sample.id}-world.json`),JSON.stringify(world)+'\n');
      result.status='compiled';result.objects=world.entities.length;result.movement=world.gameplay?.movement;result.actions=world.interactions?.actions.length??0;
    }catch(error){
      if(error instanceof RecognitionReviewError){result.status='review-required';result.issues=error.recovery.issues;await fs.writeFile(path.join(out,`${sample.id}-review.json`),JSON.stringify(error.recovery)+'\n');}
      else {result.status='failed';result.error=error instanceof Error?error.message:'Interpretation failed.';}
    }
    result.latencyMs=Math.round(performance.now()-start);result.modelRequests=sampleCalls;await fs.writeFile(rawPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});results.push(result);
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify({dataset:manifest.dataset,requests,scope:'Production compilation/review evidence. No playable-session success or recognition accuracy inferred.',results},null,2)+'\n');
    console.log(JSON.stringify({id:result.id,status:result.status,latencyMs:result.latencyMs}));
  }
}finally{closeLocalSegmentationWorkers();}
