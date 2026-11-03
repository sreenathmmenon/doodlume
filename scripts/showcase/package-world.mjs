import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [input,name]=process.argv.slice(2);
if(!input || !/^[a-z0-9-]+$/.test(name || '')) throw Error('Provide a saved world JSON path and a lowercase showcase name.');
const raw=JSON.parse(await fs.readFile(input,'utf8'));
const world=structuredClone(raw.world ?? raw);
const folder=path.resolve('public/art/showcase');
await fs.mkdir(folder,{recursive:true});
async function artwork(value,label) {
  if(!value?.startsWith('data:image/')) return value;
  const match=/^data:image\/(?:png|webp|jpeg);base64,(.+)$/.exec(value);
  if(!match) throw Error('Unsupported image data.');
  const filename=`${name}-${label}.webp`;
  await sharp(Buffer.from(match[1],'base64')).webp({lossless:true}).toFile(path.join(folder,filename));
  return `/art/showcase/${filename}`;
}
world.sourceImage=await artwork(world.sourceImage,'source');
for(let i=0;i<world.entities.length;i++) world.entities[i].art=await artwork(world.entities[i].art,`object-${i}`);
await fs.writeFile(path.join(folder,`${name}.json`),JSON.stringify(world,null,2)+'\n');
console.log(`Packaged ${name}: ${world.entities.length} objects, ${world.interactions?.actions.length ?? 0} object actions.`);
