/** Bounded Oxford-IIIT Pet evaluation subset. Downloads ZIP entries by HTTP
 * range; never fetches the full image archive or invokes a model/provider. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import sharp from 'sharp';
const ROOT = path.resolve('data/public-evaluation/photo');
await run('git',['check-ignore','-q',path.join(ROOT,'manifest.json')]).catch(()=>{throw Error('Dataset output must be ignored by Git.');});
const SOURCE = 'https://www.robots.ox.ac.uk/~vgg/data/pets/';
const MIRROR = 'https://zenodo.org/records/7116591';
const MAX_TOTAL = 32 * 1024 * 1024;
let downloaded = 0;
const digest = data => createHash('sha256').update(data).digest('hex');
async function range(url, start, end) {
  const spec = start === null ? `bytes=-${end}` : `bytes=${start}-${end}`;
  // urllib uses the host's configured certificate/proxy transport. It checks
  // HTTP 206 before reading, so an ignored Range never downloads an archive.
  const {stdout}=await run('python3',['-c',`
import urllib.request,sys,struct
url,spec=sys.argv[1:]
r=urllib.request.urlopen(urllib.request.Request(url,headers={'Range':spec}),timeout=30)
if r.status!=206: raise RuntimeError('Range unsupported; refusing full archive')
h=r.headers.get('Content-Range','').encode()
body=r.read(8*1024*1024+1)
if len(body)>8*1024*1024: raise RuntimeError('Range oversized')
sys.stdout.buffer.write(struct.pack('>I',len(h))+h+body)
`,url,spec],{encoding:'buffer',maxBuffer:8*1024*1024+1024,timeout:35_000});
  const headerLength=stdout.readUInt32BE(0);
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(stdout.subarray(4,4+headerLength).toString());
  if (!match) throw Error('Invalid range metadata');
  const first=Number(match[1]),last=Number(match[2]),size=Number(match[3]);
  const expected=last-first+1;
  if ((start !== null && (first!==start || last!==end)) || expected>8*1024*1024 || downloaded+expected>MAX_TOTAL) throw Error('Range exceeded requested bounds');
  const data=stdout.subarray(4+headerLength),received=data.length;
  if(received!==expected) throw Error('Truncated range body');
  downloaded+=received;
  return {data,size};
}
function crc32(data) {
  let crc=0xffffffff;
  for(const byte of data) {crc^=byte;for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
async function zip(name) {
  const url=`${MIRROR}/files/${name}?download=1`;
  const tail=await range(url,null,65558);
  let at=tail.data.length-22;
  while(at>=0 && tail.data.readUInt32LE(at)!==0x06054b50) at--;
  if(at<0) throw Error('ZIP directory missing');
  const e=tail.data.subarray(at);
  const count=e.readUInt16LE(10),length=e.readUInt32LE(12),offset=e.readUInt32LE(16);
  if(count===65535 || length>8*1024*1024 || offset+length>tail.size) throw Error('ZIP64/oversized archive directory not supported');
  const directory=(await range(url,offset,offset+length-1)).data;
  const entries=[];let cursor=0;
  for(let i=0;i<count;i++) {
    if(directory.readUInt32LE(cursor)!==0x02014b50) throw Error('Invalid ZIP entry');
    const c=directory.subarray(cursor),n=c.readUInt16LE(28),extra=c.readUInt16LE(30),comment=c.readUInt16LE(32);
    entries.push({name:c.subarray(46,46+n).toString('utf8'),flags:c.readUInt16LE(8),method:c.readUInt16LE(10),crc:c.readUInt32LE(16),compressed:c.readUInt32LE(20),size:c.readUInt32LE(24),offset:c.readUInt32LE(42)});
    cursor+=46+n+extra+comment;
  }
  async function read(entry) {
    if(!entry || entry.flags&1 || ![0,8].includes(entry.method) || entry.size>8*1024*1024 || entry.compressed>8*1024*1024) throw Error('Unsupported ZIP member');
    const header=(await range(url,entry.offset,entry.offset+29)).data;
    if(header.readUInt32LE(0)!==0x04034b50) throw Error('Invalid local ZIP header');
    const begin=entry.offset+30+header.readUInt16LE(26)+header.readUInt16LE(28);
    const compressed=(await range(url,begin,begin+entry.compressed-1)).data;
    const data=entry.method===8 ? inflateRawSync(compressed,{maxOutputLength:8*1024*1024}) : compressed;
    if(data.length!==entry.size || crc32(data)!==entry.crc) throw Error('ZIP entry integrity mismatch');
    return data;
  }
  return {entries,read,url};
}
const images=await zip('oxford_pets.zip');
const annotations=await zip('oxford_pets_labels.zip');
const breeds=['Abyssinian','beagle','Bengal','boxer','Persian','saint_bernard','Siamese','yorkshire_terrier'];
const selected=breeds.map(breed=>images.entries.filter(e=>new RegExp(`(^|/)${breed}_\\d+\\.jpg$`).test(e.name)).sort((a,b)=>digest(a.name).localeCompare(digest(b.name)))[0]);
if(selected.some(entry=>!entry)) throw Error('A requested breed is missing');
await fs.mkdir(ROOT,{recursive:true});
for(const name of ['images','trimaps','masks']) await fs.mkdir(path.join(ROOT,name),{recursive:true});
const samples=[];
for(const [index,entry] of selected.entries()) {
  const id=path.basename(entry.name,'.jpg');
  const maskEntry=annotations.entries.find(e=>/(^|\/)segmentations\//.test(e.name)&&path.basename(e.name)===`${id}.png`);
  if(!maskEntry) throw Error(`Missing trimap for ${id}`);
  const image=await images.read(entry),trimap=await annotations.read(maskEntry);
  const meta=await sharp(image,{limitInputPixels:2_000_000}).metadata();
  const {data,info}=await sharp(trimap,{limitInputPixels:2_000_000}).raw().toBuffer({resolveWithObject:true});
  if(meta.width!==info.width||meta.height!==info.height) throw Error(`Dimension mismatch: ${id}`);
  const foreground=Buffer.alloc(info.width*info.height),valid=Buffer.alloc(foreground.length);
  let left=info.width,top=info.height,right=0,bottom=0;
  const counts={foreground:0,background:0,boundary:0};
  for(let i=0;i<foreground.length;i++) {
    // Turing's mirror is a binary colorized derivative, not Oxford's 1/2/3
    // trimap. Exact palette admission prevents treating colors as numeric labels.
    const rgb=[...data.subarray(i*info.channels,i*info.channels+3)].join(',');
    const value=rgb==='253,231,36'?1:rgb==='68,1,84'?2:-1;
    if(![1,2,3].includes(value)) throw Error(`Unknown mirror mask palette: ${value}`);
    foreground[i]=value===1?255:0;valid[i]=value===3?0:255;
    counts[value===1?'foreground':value===2?'background':'boundary']++;
    if(value!==2){const x=i%info.width,y=Math.floor(i/info.width);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  }
  if(!counts.foreground||!counts.background) throw Error(`Degenerate trimap: ${id}`);
  await fs.writeFile(path.join(ROOT,`images/${id}.jpg`),image);
  await fs.writeFile(path.join(ROOT,`trimaps/${id}.png`),trimap);
  await sharp(foreground,{raw:{width:info.width,height:info.height,channels:1}}).png().toFile(path.join(ROOT,`masks/${id}-foreground.png`));
  await sharp(valid,{raw:{width:info.width,height:info.height,channels:1}}).png().toFile(path.join(ROOT,`masks/${id}-valid.png`));
  samples.push({id,image:`images/${id}.jpg`,mask:`masks/${id}-foreground.png`,maskValid:`masks/${id}-valid.png`,trimap:`trimaps/${id}.png`,split:index<4?'development':'holdout',datasetSplit:'not supplied by mirror',breed:breeds[index],expectedBox:{x:left/info.width*1000,y:top/info.height*1000,width:(right-left)/info.width*1000,height:(bottom-top)/info.height*1000},maskForeground:{channel:'luminance',threshold:128},dimensions:{width:info.width,height:info.height},counts,sha256:{image:digest(image),trimap:digest(trimap)},provenance:{dataset:'Oxford-IIIT Pet',source:SOURCE,mirror:MIRROR,license:'CC-BY-SA-4.0',imageEntry:entry.name,annotationEntry:maskEntry.name,derivedMasks:'Mirror binary palette: RGB253,231,36 is visible animal; RGB68,1,84 is background. Conversion visually checked. Original numeric trimap boundary labels unavailable in this mirror; maskValid is all valid. Oracle box comes from binary animal extent.'}});
  console.log(`Saved ${id}: ${info.width}×${info.height}, ${image.length+trimap.length} source bytes`);
}
const manifest={version:1,annotationFormat:'Turing mirror binary colorized segmentation; no 3-label trimap',rightsCaveat:'Publisher states CC BY-SA 4.0, original image owners retain copyright; at least one selected sample bears a stock watermark. Keep local evaluation assets out of product/showcase and review individual rights before redistribution.',dataset:'Oxford-IIIT Pet',source:SOURCE,mirror:MIRROR,license:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'O. M. Parkhi, A. Vedaldi, A. Zisserman and C. V. Jawahar, Cats and Dogs, CVPR 2012. Copyright remains with the original image owners. ZIP mirror curated by Pamela Wochner and Nick Barlow, The Alan Turing Institute.',selection:'Eight breed strata; one deterministic SHA256-sorted member per breed. The mirror does not provide the official train/test split. Fixed before model evaluation; four development/four held-out cases. Pretraining exposure unknown; not claimed novel to SAM.',downloadedBytes:downloaded,limits:{maxDownloadBytes:MAX_TOTAL,samples:8},metricScope:'Box-prompted extraction given an oracle full-animal box; foreground IoU/precision/recall against the mirror binary reference. No ambiguous-border exclusion is available; do not present this as original-trimap benchmark parity. Not recognition, intent, gameplay or universal-photo evidence.',samples};
await fs.writeFile(path.join(ROOT,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(ROOT,'ATTRIBUTION.md'),`# Oxford-IIIT Pet local evaluation subset\n\n${manifest.attribution}\n\nSource: ${SOURCE}\nMirror: ${MIRROR}\nLicense: ${manifest.license}\n\n${manifest.selection}\n\n${manifest.metricScope}\n\nOriginal downloaded image and colorized mirror-mask bytes preserved; these are not original numeric Oxford trimaps. Derived masks are exact palette conversions; see manifest for SHA256, ZIP member names and transformations. Redistribution must retain attribution and applicable share-alike terms. No full archives downloaded.\n`);
console.log(`Prepared ${samples.length} photo/mask pairs; ${(downloaded/1024/1024).toFixed(2)} MiB transferred. Manifest: ${path.relative(process.cwd(),ROOT)}/manifest.json`);
