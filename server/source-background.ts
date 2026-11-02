import { spawn } from 'node:child_process';
import { localSegmentationConfig } from './local-segmentation.js';

/** Optional local classical inpainting. It uses neighboring source pixels;
 * no model, network request, generated artwork or credentials are involved. */
export async function repairSourceBackground(source: Buffer, mask: Buffer): Promise<Buffer | undefined> {
  const config = localSegmentationConfig(process.env);
  if (!config.configured) return;
  return new Promise(resolve => {
    const script = `import sys,json,base64,cv2,numpy as np\nr=json.load(sys.stdin)\ns=cv2.imdecode(np.frombuffer(base64.b64decode(r['source']),np.uint8),cv2.IMREAD_COLOR)\nm=cv2.imdecode(np.frombuffer(base64.b64decode(r['mask']),np.uint8),cv2.IMREAD_GRAYSCALE)\nm=cv2.dilate(m,np.ones((3,3),np.uint8))\nout=cv2.inpaint(s,m,3,cv2.INPAINT_TELEA)\nok,png=cv2.imencode('.png',out)\nsys.stdout.buffer.write(png.tobytes() if ok else b'')`;
    const child = spawn(config.python, ['-c', script], { stdio: ['pipe','pipe','ignore'], env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
    const chunks: Buffer[] = []; let bytes = 0, settled = false;
    const done = (value?: Buffer) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill(); done(); }, 8000);
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 12_000_000) { child.kill(); done(); } else chunks.push(chunk); });
    child.on('error', () => done()); child.on('close', code => done(code === 0 && bytes ? Buffer.concat(chunks) : undefined));
    child.stdin.on('error', () => done());
    child.stdin.end(JSON.stringify({ source: source.toString('base64'), mask: mask.toString('base64') }));
  });
}
