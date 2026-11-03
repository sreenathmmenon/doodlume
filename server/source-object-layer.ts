import sharp from 'sharp';
import { pixelBox, imageData } from './images.js';
import { localSegmentationArtwork, localSegmentationConfig, type LocalSegmentationConfig } from './local-segmentation.js';
import { selectActorComponents } from './actor-grounding.js';
import type { WorldEntity } from '../shared/world.js';

/** Recover an entire source object from a legacy walkable-surface selection.
 * SAM sees expanded source context; accepted pixels must remain anchored in the
 * selected surface and bounded within that context. No generated RGB is used. */
export async function recoverSourceObjectLayer(source: Buffer, entity: WorldEntity, signal: AbortSignal,
  config: LocalSegmentationConfig = localSegmentationConfig(process.env)): Promise<Pick<WorldEntity,'art'|'artSource'|'artMethod'|'artNote'>> {
  if (!entity.artSource || !config.configured) throw new Error('Precise source cutout is unavailable.');
  const size=await sharp(source).metadata(), iw=size.width!, ih=size.height!;
  const seed=pixelBox(entity.artSource,iw,ih);
  const regions=[.65,1.2,2].map(depth=>{
    const left=Math.max(0,Math.floor(seed.left-seed.width*.28));
    const top=Math.max(0,Math.floor(seed.top-Math.max(12,seed.height*.5)));
    return {left,top,width:Math.min(iw-left,Math.ceil(seed.width*1.56)),height:Math.min(ih-top,Math.ceil(seed.top-top+Math.max(seed.height*2,seed.width*depth)))};
  });
  const masks=await localSegmentationArtwork(source,regions.map((box,index)=>({id:`source-layer-${index}`,left:box.left,top:box.top,right:box.left+box.width,bottom:box.top+box.height})),config,signal,{selectPrincipalComponent:true});
  let best:Pick<WorldEntity,'art'|'artSource'|'artMethod'|'artNote'>|undefined, bestScore=0;
  for(const [index,box] of regions.entries()){
    const art=masks.get(`source-layer-${index}`); if(!art)continue;
    const {data,info}=await sharp(Buffer.from(art.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const seen=new Uint8Array(info.width*info.height),queue=new Int32Array(seen.length),components:number[][]=[];
    for(let i=0;i<seen.length;i++){
      if(seen[i]||data[i*4+3]<=20)continue;
      let head=0,tail=1;queue[0]=i;seen[i]=1;
      while(head<tail){const at=queue[head++],x=at%info.width,y=Math.floor(at/info.width);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const xx=x+dx,yy=y+dy;if(xx<0||xx>=info.width||yy<0||yy>=info.height)continue;
          const next=yy*info.width+xx;if(!seen[next]&&data[next*4+3]>20){seen[next]=1;queue[tail++]=next;}
        }
      }
      components.push([...queue.subarray(0,tail)]);
    }
    const selected=selectActorComponents(components,info.width,{left:seed.left-box.left,top:seed.top-box.top,width:seed.width,height:seed.height});
    if(!selected.length)continue;
    let x1=info.width,y1=info.height,x2=-1,y2=-1,overlap=0,paper=0;
    const keep=new Uint8Array(seen.length);
    for(const at of selected){const x=at%info.width,y=Math.floor(at/info.width);keep[at]=1;x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);
      if(x+box.left>=seed.left&&x+box.left<seed.left+seed.width&&y+box.top>=seed.top&&y+box.top<seed.top+seed.height)overlap++;
      const rgb=[data[at*4],data[at*4+1],data[at*4+2]];if(Math.min(...rgb)>=180&&Math.max(...rgb)-Math.min(...rgb)<=35)paper++;
    }
    const score=selected.length-paper*1.3;
    if(x1===0||y1===0||x2===info.width-1||y2===info.height-1||overlap<seed.width*seed.height*.15||score<=bestScore||paper/selected.length>.3)continue;
    for(let at=0;at<keep.length;at++)if(!keep[at])data[at*4+3]=0;
    const trim={left:x1,top:y1,width:x2-x1+1,height:y2-y1+1};
    const png=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(trim).png().toBuffer();
    bestScore=score;
    best={art:imageData(png),artSource:{x:(box.left+x1)/iw*1000,y:(box.top+y1)/ih*1000,width:trim.width/iw*1000,height:trim.height/ih*1000},artMethod:'sam',artNote:'Complete source object recovered with local Meta SAM 2.1; original source colors retained.'};
  }
  if(!best)throw new Error('The complete source object could not be separated. Keep the draft and use a clearer image.');
  return best;
}
