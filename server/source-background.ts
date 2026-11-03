import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { localSegmentationConfig } from './local-segmentation.js';

export interface BackgroundRepair { image: Buffer; method: 'lama' | 'classical'; dilationPixels: number }
let activeRepair = false;

/** SAM creates masks elsewhere. Local LaMa is a separate, non-Meta repair model.
 * Preinstalled weights only; no credentials, downloads or API calls at runtime.
 * See docs/SOURCE-BACKGROUND-REPAIR.md for setup and provenance. */
export async function repairSourceBackgroundDetailed(source: Buffer, mask: Buffer): Promise<BackgroundRepair | undefined> {
  const config = localSegmentationConfig(process.env);
  if (!config.configured) return;
  if (source.length > 12_000_000 || mask.length > 4_000_000) throw new Error('The background repair image exceeds its size limit.');
  const metadata = await sharp(source, {limitInputPixels:4_000_000}).metadata();
  if (!metadata.width || !metadata.height) throw new Error('The background dimensions could not be read.');
  const checkpoint = process.env.LOCAL_LAMA_CHECKPOINT?.trim() || join(homedir(), '.cache', 'doodlume-sam-runtime', 'models', 'big-lama.pt');
  const learned = process.env.LOCAL_BACKGROUND_REPAIR !== 'classical' && existsSync(checkpoint);
  const dilationPixels = learned ? Math.min(20, Math.max(8, Math.round(Math.max(metadata.width, metadata.height) * .01))) : 0;
  if (activeRepair) throw new Error('Another background is being prepared. Try again when it finishes.');
  activeRepair = true;
  return new Promise((resolve, reject) => {
    const script = `import sys,json,base64,cv2,numpy as np\nr=json.load(sys.stdin)\ns=cv2.imdecode(np.frombuffer(base64.b64decode(r['source']),np.uint8),cv2.IMREAD_UNCHANGED)\nm=cv2.imdecode(np.frombuffer(base64.b64decode(r['mask']),np.uint8),cv2.IMREAD_GRAYSCALE)\nassert s is not None and m is not None and s.shape[:2]==m.shape and s.ndim==3 and s.shape[2] in (3,4) and m.size<=4000000\noriginal_mask=m.copy()\nm=cv2.dilate(m,np.ones((3,3),np.uint8))\nprediction=cv2.inpaint(s[:,:,:3],m,3,cv2.INPAINT_TELEA)\nout=s.copy()\nout[original_mask>0,:3]=prediction[original_mask>0]\nok,png=cv2.imencode('.png',out)\nsys.stdout.buffer.write(png.tobytes() if ok else b'')`;
    const args = learned ? [fileURLToPath(new URL('./source-background-worker.py',import.meta.url)), checkpoint] : ['-c',script];
    const child = spawn(config.python,args,{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH ?? '',HOME:process.env.HOME ?? ''}});
    const chunks: Buffer[] = []; let bytes=0, settled=false;
    const done = (image?:Buffer) => {
      if(settled) return;
      settled=true; activeRepair=false; clearTimeout(timer);
      if(image) resolve({image,method:learned?'lama':'classical',dilationPixels});
      else reject(new Error('The background could not be reconstructed. Original artwork is unchanged. Try again or review the selected regions.'));
    };
    const timer=setTimeout(()=>{child.kill('SIGKILL');done();},learned?60_000:8000);
    child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>12_000_000){child.kill('SIGKILL');done();}else chunks.push(chunk);});
    child.on('error',()=>done());child.on('close',code=>done(code===0&&bytes?Buffer.concat(chunks):undefined));
    child.stdin.on('error',()=>done());
    child.stdin.end(JSON.stringify({source:source.toString('base64'),mask:mask.toString('base64'),dilationPixels}));
  });
}

/** Compatibility for callers that do not expose diagnostic metadata. */
export async function repairSourceBackground(source:Buffer,mask:Buffer):Promise<Buffer|undefined> {
  return (await repairSourceBackgroundDetailed(source,mask))?.image;
}
