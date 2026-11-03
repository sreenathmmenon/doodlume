#!/usr/bin/env node
/** Official Meta Amateur Drawings evaluation import; never used by product inference. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync,constants} from 'node:zlib';
import sharp from 'sharp';

const root=resolve(import.meta.dirname,'../..');
const output=join(root,'data/public-evaluation/meta-amateur');
const args=process.argv.slice(2);
const countIndex=args.indexOf('--count');
const count=Number(countIndex<0 ? 12 : args[countIndex+1]);
if(!Number.isInteger(count)||count<1||count>24) throw Error('--count must be between 1 and 24');
execFileSync('git',['check-ignore','--quiet','data/public-evaluation/meta-amateur/manifest.json'],{cwd:root});
const revision='b859684857519c7424da51a0b0862fbd1fd258f4';
const repository='https://github.com/facebookresearch/AnimatedDrawings';
const archive='https://dl.fbaipublicfiles.com/amateur_drawings/amateur_drawings.tar';
const annotations='https://dl.fbaipublicfiles.com/amateur_drawings/amateur_drawings_annotations.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function boundedBox(box,width,height){
 const x=Math.max(0,Math.min(width,box[0])),y=Math.max(0,Math.min(height,box[1]));
 const right=Math.max(x,Math.min(width,box[0]+box[2])),bottom=Math.max(y,Math.min(height,box[1]+box[3]));
 return {x:x/width*1000,y:y/height*1000,width:(right-x)/width*1000,height:(bottom-y)/height*1000};
}

const bound=8*1024*1024;
if(args.includes('--verify')){
 const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));
 for(const sample of manifest.samples){
  for(const [field,hash] of [['image','imageSha256'],['mask','maskSha256']]){
   const file=resolve(output,sample[field]);
   if(!file.startsWith(output+'/'))throw Error('Manifest path leaves dataset directory');
   if(sha(await readFile(file))!==sample.provenance[hash])throw Error(`Changed dataset file: ${sample[field]}`);
  }
 }
 console.log(JSON.stringify({verified:manifest.samples.length,manifest:join(output,'manifest.json'),networkRequests:0},null,2));process.exit(0);
}

async function bytesOnce(url,limit,headers={}){
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);
 if(headers.Range&&response.status!==206)throw Error('Archive server did not honor bounded Range request');
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error(`Download exceeded ${limit} bytes`);chunks.push(chunk);}
 return {data:Buffer.concat(chunks),etag:response.headers.get('etag'),contentRange:response.headers.get('content-range')};
}
async function bytes(url,limit,headers={}){
 let last;
 for(let attempt=0;attempt<3;attempt++)try{return await bytesOnce(url,limit,headers);}catch(error){last=error;if(attempt<2)await new Promise(done=>setTimeout(done,500*(attempt+1)));}
 throw last;
}
// Consume records incrementally; the 288MB metadata index is never retained on disk.
async function* records(chunks){
 let buffer='',section=null,total=0;const decoder=new TextDecoder();
 for await(const chunk of chunks){
  total+=chunk.length;if(total>300*1024*1024)throw Error('Annotation index exceeded 300MiB bound');
  buffer+=decoder.decode(chunk,{stream:true});
  while(true){
   if(!section){const found=/"(images|annotations)"\s*:\s*\[/.exec(buffer);if(!found){buffer=buffer.slice(-40);break;}section=found[1];buffer=buffer.slice(found.index+found[0].length);}
   buffer=buffer.trimStart();if(buffer[0]===',')buffer=buffer.slice(1).trimStart();
   if(buffer[0]===']'){section=null;buffer=buffer.slice(1);continue;}
   if(!buffer.length)break;if(buffer[0]!=='{')throw Error('Unexpected annotation array record');
   let depth=0,quoted=false,escaped=false,end=-1;
   for(let i=0;i<buffer.length;i++){const c=buffer[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end=i+1;break;}}
   if(end<0)break;const record=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end);yield {section,record,total};
  }
 }
}
await mkdir(output,{recursive:true});
console.error('Downloading bounded 8 MiB official image archive prefix…');
const compressed=await bytes(archive,bound,{Range:`bytes=0-${bound-1}`});
const tar=gunzipSync(compressed.data,{finishFlush:constants.Z_SYNC_FLUSH,maxOutputLength:64*1024*1024});
const selected=new Map();
for(let offset=0;offset+512<=tar.length&&selected.size<count;){
 const header=tar.subarray(offset,offset+512);if(header.every(x=>x===0))break;
 const name=header.subarray(0,100).toString().replace(/\0.*$/s,'');
 const size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim(),8)||0;
 const start=offset+512,end=start+size;if(end>tar.length)break;
 if(/^amateur_drawings\/[a-f0-9]\/[a-f0-9]{32}\.png$/.test(name)&&size){
  const image=Buffer.from(tar.subarray(start,end)),metadata=await sharp(image).metadata();
  if(!metadata.width||!metadata.height)throw Error('Invalid source PNG');
  selected.set(name,{name,image,width:metadata.width,height:metadata.height});
 }
 offset=end+(512-size%512)%512;
}
if(selected.size!==count)throw Error(`Bounded prefix contained ${selected.size}/${count} complete PNGs. Reduce --count; no full archive fallback.`);
const annotationSize=288409774;
const annotationETag='"cbf34ebca8abf7c6bca568d6e2d2297c-35"';
const archiveETag='"55866d8848de3718a24191fa6ccfd477-5747"';
if(compressed.etag!==archiveETag)throw Error('Official archive changed; review and pin its new version before importing');
async function* annotationChunks(){
 const chunkSize=4*1024*1024;
 for(let offset=0;offset<annotationSize;offset+=chunkSize){
  const end=Math.min(annotationSize,offset+chunkSize)-1;
  const result=await bytes(annotations,end-offset+1,{Range:`bytes=${offset}-${end}`});
  if(result.etag!==annotationETag||result.contentRange!==`bytes ${offset}-${end}/${annotationSize}`)throw Error('Official annotation version/range changed');
  if(offset%(64*1024*1024)===0)console.error(`Reading annotation index: ${Math.round(offset/1024/1024)} / ${Math.ceil(annotationSize/1024/1024)} MiB`);
  yield result.data;
 }
}
const byId=new Map();let annotationBytesRead=0;
for await(const {section,record,total} of records(annotationChunks())){
 annotationBytesRead=total;
 if(section==='images'&&selected.has(record.file_name)){const entry=selected.get(record.file_name);entry.metadata=record;byId.set(record.id,entry);}
 if(section==='annotations'&&byId.has(record.image_id)){const entry=byId.get(record.image_id);(entry.annotations??=[]).push(record);}
}
const samples=[];
for(const entry of selected.values()){
 if(!entry.metadata||!entry.annotations?.length)throw Error(`Missing official annotation for ${entry.name}`);
 const id=entry.name.split('/').at(-1).replace('.png','');
 await mkdir(join(output,id),{recursive:true});
 await writeFile(join(output,id,'image.png'),entry.image);
 await writeFile(join(output,id,'annotation.json'),JSON.stringify({image:entry.metadata,annotations:entry.annotations},null,2));
 if(entry.annotations.length!==1)throw Error('Expected one annotated figure per imported image');
 const annotation=entry.annotations[0],box=annotation.bbox;
 if(!Array.isArray(box)||box.length!==4||box.some(x=>!Number.isFinite(x))||box[2]<=0||box[3]<=0)throw Error('Invalid official box');
 if(!Array.isArray(annotation.segmentation)||annotation.segmentation.some(p=>!Array.isArray(p)||p.length<6||p.length%2||p.some(x=>!Number.isFinite(x))))throw Error('Unsupported official mask representation');
 const points=annotation.segmentation;
 if(points.some(p=>p.some((v,i)=>v<0||v>(i%2?entry.height:entry.width)+1)))throw Error('Annotation coordinates do not match downloaded PNG dimensions');
 const polygon=points.map(p=>`<polygon points="${p.reduce((s,v,i)=>s+(i%2?',':' ')+v,'').trim()}" fill="white"/>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${entry.width}" height="${entry.height}"><rect width="100%" height="100%" fill="black"/>${polygon}</svg>`;
 const mask=await sharp(Buffer.from(svg)).png().toBuffer();await writeFile(join(output,id,'mask.png'),mask);
 samples.push({id:`meta-amateur-${id}`,image:`${id}/image.png`,mask:`${id}/mask.png`,expectedBox:boundedBox(box,entry.width,entry.height),maskForeground:{channel:'luminance',threshold:127,invert:false},split:parseInt(sha(id).slice(0,8),16)%3===0?'holdout':'development',provenance:{dataset:'Meta Amateur Drawings',archive,archiveMember:entry.name,annotationId:annotation.id,sourceImageId:entry.metadata.id,license:'MIT',annotationQuality:'User-accepted annotations; not independently adjudicated; artist age unknown',bboxNormalization:'Original resized-pixel bbox intersected with actual PNG bounds; original preserved in annotation.json',pixelFrame:{width:entry.width,height:entry.height},originalMetadataDimensions:{width:entry.metadata.width,height:entry.metadata.height},imageSha256:sha(entry.image),maskSha256:sha(mask)}});
}
const license=await bytes(`https://raw.githubusercontent.com/facebookresearch/AnimatedDrawings/${revision}/LICENSE`,16384);
await writeFile(join(output,'LICENSE-MIT.txt'),license.data);
const manifest={version:1,dataset:'Meta Amateur Drawings',importedAt:new Date().toISOString(),upstreamRepository:repository,upstreamRevision:revision,license:'MIT',selection:{method:'First complete PNG members of bounded compressed archive prefix, not randomized representative sample',count,compressedBytes:compressed.data.length,archiveETag:compressed.etag,archiveRange:compressed.contentRange,annotationBytesRead,annotationETag,split:'sha256(archive member basename) modulo3; zero is holdout'},evaluationScope:'Oracle-box foreground extraction only. Does not establish detection, interpretation, game generation, or age/country generalization.',samples};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({manifest:join(output,'manifest.json'),samples:samples.length,development:samples.filter(x=>x.split==='development').length,holdout:samples.filter(x=>x.split==='holdout').length,compressedArchiveBytes:compressed.data.length,annotationBytesRead},null,2));
