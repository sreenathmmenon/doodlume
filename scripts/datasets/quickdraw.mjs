import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';

// Evaluation input only. Nothing under this directory is imported by the app.
const output=path.resolve(process.argv[2] || 'data/public-evaluation/quickdraw');
const categories=['cat','fish','bicycle','airplane','flower','chair','key','coffee cup'];
const samples=[];
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
const outputRelative=path.relative(repositoryRoot,output);
if(!outputRelative||outputRelative==='..'||outputRelative.startsWith('..'+path.sep)||path.isAbsolute(outputRelative)||['public','dist'].includes(outputRelative.split(path.sep)[0]))throw Error('Outputs must stay in a private ignored directory inside the repository.');
try { execFileSync('git',['check-ignore','-q',path.join(output,'manifest.json')],{cwd:repositoryRoot,stdio:'ignore'}); }
catch { throw Error('Dataset output must be ignored by Git.'); }
await fs.mkdir(output,{recursive:true});
for(const category of categories){
  const url=`https://storage.googleapis.com/quickdraw_dataset/full/simplified/${encodeURIComponent(category)}.ndjson`;
  const response=await fetch(url,{headers:{Range:'bytes=0-1048575'},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Error(`Dataset request failed: ${response.status}`);
  const reader=response.body.getReader(); let bytes=0, text='';
  try { while(bytes<1048576){const {value,done}=await reader.read();if(done)break;const remaining=1048576-bytes;text+=Buffer.from(value.subarray(0,remaining)).toString('utf8');bytes+=Math.min(value.length,remaining);} }
  finally {await reader.cancel();}
  // Preserve hard examples. Historical recognition is a sampling stratum,
  // not a ground-truth label or an assessment of this product.
  const chosen=[];const count={true:0,false:0};
  for(const line of text.split('\n').slice(0,-1)){
    let row;try{row=JSON.parse(line);}catch{continue;}
    if(row.word!==category || typeof row.recognized!=='boolean' || count[row.recognized]>=2 || !/^\d+$/.test(row.key_id))continue;
    if(!Array.isArray(row.drawing)||!row.drawing.length||row.drawing.length>500)continue;
    if(row.drawing.reduce((sum,stroke)=>sum+(Array.isArray(stroke?.[0])?stroke[0].length:0),0)>20000)continue;
    if(row.drawing.some(stroke=>!Array.isArray(stroke)||!Array.isArray(stroke[0])||!Array.isArray(stroke[1])||!stroke[0].length||stroke[0].length!==stroke[1].length||stroke[0].length>10000||[...stroke[0],...stroke[1]].some(n=>!Number.isFinite(n)||n<0||n>255)))continue;
    chosen.push(row);count[row.recognized]++;
    if(chosen.length===4)break;
  }
  if(chosen.length!==4)throw Error(`Bounded sample lacks both recognition strata: ${category}`);
  const strata={true:0,false:0};
  for(const row of chosen){
    const id=`qd-${row.key_id}`;
    // Same recorded strokes, uniformly scaled with a paper margin. No
    // generated/cleaned contours, inferred fill, compositing or beautification.
    const strokes=row.drawing.map(([xs,ys])=>xs.length===1
      ? `<circle cx="${xs[0]}" cy="${ys[0]}" r="1.5" fill="#202020"/>`
      : `<polyline points="${xs.map((x,i)=>`${x},${ys[i]}`).join(' ')}" fill="none" stroke="#202020" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-16 -16 288 288"><rect x="-16" y="-16" width="288" height="288" fill="white"/>${strokes}</svg>`;
    const image=await sharp(Buffer.from(svg)).png().toBuffer();await fs.writeFile(path.join(output,`${id}.png`),image);
    const xs=row.drawing.flatMap(s=>s[0]),ys=row.drawing.flatMap(s=>s[1]);
    const x=Math.max(0,(Math.min(...xs)+14.5)/288*1000),y=Math.max(0,(Math.min(...ys)+14.5)/288*1000);
    const right=Math.min(1000,(Math.max(...xs)+17.5)/288*1000),bottom=Math.min(1000,(Math.max(...ys)+17.5)/288*1000);
    samples.push({id,image:`${id}.png`,sha256:createHash('sha256').update(image).digest('hex'),split:strata[row.recognized]++===0?'development':'holdout',expectedBox:{x,y,width:right-x,height:bottom-y},promptedCategory:category,historicallyRecognized:row.recognized,annotationKind:'recorded-stroke-bounds; category-is-drawing-prompt-not-verified-object',provenance:{dataset:'Quick, Draw!',recordId:row.key_id,url,license:'CC-BY-4.0',attribution:'Google, Inc. and Quick, Draw! contributors',modification:'Simplified recorded vectors uniformly rendered on white at512px; timing/country omitted.'}});
  }
  console.log(`${category}: ${chosen.length} recorded human drawings`);
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({version:1,dataset:'Quick, Draw!',source:'https://github.com/googlecreativelab/quickdraw-dataset',license:'https://creativecommons.org/licenses/by/4.0/',sampling:'First two valid recognized and unrecognized records per category from bounded1MiB prefixes; one each development/holdout. Convenience stress set, not random population evaluation.',use:'Recognition and ink extent evaluation. No semantic foreground mask provided. Labels must not enter model prompts. No training performed.',samples},null,2)+'\n');
console.log(`Saved ${samples.length} inputs to ${output}`);
