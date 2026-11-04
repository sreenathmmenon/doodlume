import type { ArtworkBox } from "./world.js";

/** Alpha only: the server always supplies the unchanged original RGB pixels. */
export interface SourceOutlineCorrection {
  entityId: string;
  sourceBox: ArtworkBox;
  mask: string;
  /** Explicit background-only cleanup radius in decoded source pixels; absent means zero. */
  repairMargin?: number;
  /** SHA-256 of the exact sourceImage data URL, encoded as UTF-8. */
  sourceFingerprint: string;
}

/** Union positive coverage and a rounded elliptical cleanup margin. Shared by
 * the creator preview and compositor; foreground alpha is never changed.
 * Row-prefix sums bound work to O(pixels × radius), not radius squared. */
export function includeSourceRepairMargin(writable:Uint8Array, mask:Uint8Array, width:number, height:number, radius:number):void {
  if(!Number.isInteger(radius)||radius<0||radius>20||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||mask.length!==width*height||writable.length!==mask.length)
    throw new Error("The cleanup margin does not match this source mask.");
  const prefix=new Uint32Array(width+1);
  for(let y=0;y<height;y++){
    let first=width,last=-1;
    for(let x=0;x<width;x++){
      const covered=mask[y*width+x]>0;
      prefix[x+1]=prefix[x]+Number(covered);
      if(covered){first=Math.min(first,x);last=x;}
    }
    if(last<0)continue;
    for(let dy=-radius;dy<=radius;dy++){
      const row=y+dy;
      if(row<0||row>=height)continue;
      const reach=Math.round(Math.sqrt(radius*radius-dy*dy));
      for(let x=Math.max(0,first-reach);x<=Math.min(width-1,last+reach);x++)
        if(prefix[Math.min(width,x+reach+1)]>prefix[Math.max(0,x-reach)])writable[row*width+x]=255;
    }
  }
}
