import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ArtworkBox, WorldDefinition, WorldEntity } from "../shared/world.js";
import { validateWorld } from "../shared/world.js";
import { validatePngArtwork } from "../shared/artwork-validation.js";
import type { SourceOutlineCorrection } from "../shared/source-outline.js";
import { imageData, pixelBox } from "./images.js";
import { InterpretationError } from "./model.js";

const fields = ["x", "y", "width", "height"] as const;
const fail = (message: string): never => { throw new InterpretationError(message, 400); };
const sameBox = (a: unknown, b: ArtworkBox | undefined): a is ArtworkBox => Boolean(a && typeof a === "object" && !Array.isArray(a) && b &&
  Object.keys(a).every(key => fields.includes(key as typeof fields[number])) && fields.every(key => (a as ArtworkBox)[key] === b[key]));
export const sourceOutlineFingerprint = (sourceImage: string) => createHash("sha256").update(sourceImage, "utf8").digest("hex");

async function sourceCrop(source: Buffer, box: ArtworkBox) {
  const size = await sharp(source, {limitInputPixels: 32_000_000}).metadata();
  if (!size.width || !size.height) fail("The original source image could not be read.");
  return sharp(source).extract(pixelBox(box, size.width!, size.height!)).removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
}
async function alphaPixels(image: string, width: number, height: number) {
  try {
    const size = validatePngArtwork(image);
    if (size.width !== width || size.height !== height) fail("The outline dimensions no longer match this source selection.");
    const input = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    const meta = await sharp(input, {limitInputPixels:3_000_000}).metadata();
    if (!meta.hasAlpha || (meta.pages ?? 1) !== 1) fail("Use a single PNG alpha outline for this source selection.");
    const decoded = await sharp(input).ensureAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
    if (decoded.info.channels !== 4) fail("The outline could not be read.");
    let visible = 0;
    for(let i=3;i<decoded.data.length;i+=4) if(decoded.data[i]) visible++;
    if (!visible) fail("Keep some of the object inside the outline before confirming it.");
    return decoded.data;
  } catch(error) {
    if (error instanceof InterpretationError) throw error;
    return fail("The outline must be a bounded PNG alpha mask matching the original selection.");
  }
}

/** Validate persisted art before it can bypass automatic source extraction. */
export async function validateConfirmedSourceOutline(source: Buffer, entity: WorldEntity): Promise<void> {
  if (entity.artMethod !== "outline" || !entity.art || !entity.sourceOutline || !sameBox(entity.sourceOutline.sourceBox, entity.artSource) ||
      (entity.sourceOutline.repairMargin !== undefined && (!Number.isInteger(entity.sourceOutline.repairMargin) || entity.sourceOutline.repairMargin < 0 || entity.sourceOutline.repairMargin > 12)))
    fail("This confirmed outline no longer matches its source selection.");
  const crop = await sourceCrop(source, entity.artSource!);
  const rgba = await alphaPixels(entity.art!, crop.info.width, crop.info.height);
  for(let pixel=0;pixel<crop.info.width*crop.info.height;pixel++) for(let channel=0;channel<3;channel++)
    if(rgba[pixel*4+channel] !== crop.data[pixel*3+channel])
      fail("The confirmed outline must retain the original source colors. Confirm it again from the original image.");
}

/** Validates source identity and returns original RGB with only creator-supplied alpha. */
export async function applyConfirmedSourceOutlines(source: Buffer, world: WorldDefinition, value: unknown): Promise<WorldDefinition> {
  world = validateWorld(world,{allowIncomplete:true});
  if (!Array.isArray(value) || value.length > 24) fail("Confirm no more than 24 object outlines at a time.");
  const fingerprint = sourceOutlineFingerprint(world.sourceImage);
  const seen = new Set<string>();
  const replacements = new Map<string, WorldEntity>();
  for (const candidate of value as unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
        Object.keys(candidate).some(key => !["entityId", "sourceBox", "mask", "sourceFingerprint", "repairMargin"].includes(key))) fail("This outline correction could not be read.");
    const outline = candidate as SourceOutlineCorrection;
    if (outline.repairMargin !== undefined && (!Number.isInteger(outline.repairMargin) || outline.repairMargin < 0 || outline.repairMargin > 12)) fail("Choose a background cleanup margin from 0 to 12 source pixels.");
    const entity = world.entities.find(item => item.id === outline.entityId);
    if (!entity || seen.has(outline.entityId) || !sameBox(outline.sourceBox, entity.artSource)) fail("The outline no longer matches a unique source selection.");
    if (outline.sourceFingerprint !== fingerprint) fail("The source image changed. Confirm this outline again on the current image.");
    if (typeof outline.mask !== "string" || outline.mask.length > 4_500_000) fail("This outline is too large to read.");
    seen.add(outline.entityId);
    const crop = await sourceCrop(source, entity!.artSource!);
    const rgba = await alphaPixels(outline.mask, crop.info.width, crop.info.height);
    for(let pixel=0;pixel<crop.info.width*crop.info.height;pixel++) for(let channel=0;channel<3;channel++) rgba[pixel*4+channel] = crop.data[pixel*3+channel];
    const art = imageData(await sharp(rgba,{raw:{width:crop.info.width,height:crop.info.height,channels:4}}).png().toBuffer());
    replacements.set(entity!.id,{...entity!, art, artMethod:"outline", artNote:"Outline explicitly confirmed by the creator; original source colors retained.",
      sourceOutline:{sourceFingerprint:fingerprint,sourceBox:{...entity!.artSource!},...(outline.repairMargin !== undefined ? {repairMargin:outline.repairMargin} : {})}});
  }
  const result = {...world, entities:world.entities.map(entity => replacements.get(entity.id) ?? entity)};
  for (const entity of result.entities.filter(item => item.artMethod === "outline")) {
    if (entity.sourceOutline?.sourceFingerprint !== fingerprint) fail("A saved outline belongs to a different source image. Confirm it again.");
    await validateConfirmedSourceOutline(source,entity);
  }
  return validateWorld(result,{allowIncomplete:true});
}
