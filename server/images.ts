import sharp from "sharp";
import { InterpretationError } from "./model.js";

export async function normalizeDrawing(image: unknown): Promise<Buffer> {
  if (
    typeof image !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ||
    image.length > 8_000_000
  )
    throw new InterpretationError(
      "Choose a clear PNG, JPG, or WebP drawing under 6 MB.",
      400,
    );
  try {
    return await sharp(
      Buffer.from(image.slice(image.indexOf(",") + 1), "base64"),
      { limitInputPixels: 32_000_000 },
    )
      .rotate()
      .resize({
        width: 1600,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
  } catch {
    throw new InterpretationError(
      "The image could not be read. Try a smaller, clear photo.",
      400,
    );
  }
}
export const imageData = (buffer: Buffer) =>
  `data:image/png;base64,${buffer.toString("base64")}`;
export function pixelBox(
  box: { x: number; y: number; width: number; height: number },
  iw: number,
  ih: number,
) {
  const left = Math.min(iw - 1, Math.max(0, Math.round((box.x / 1000) * iw)));
  const top = Math.min(ih - 1, Math.max(0, Math.round((box.y / 1000) * ih)));
  return {
    left,
    top,
    width: Math.min(
      iw - left,
      Math.max(1, Math.round((box.width / 1000) * iw)),
    ),
    height: Math.min(
      ih - top,
      Math.max(1, Math.round((box.height / 1000) * ih)),
    ),
  };
}
export async function cropArtwork(
  buffer: Buffer,
  box: { x: number; y: number; width: number; height: number },
) {
  const meta = await sharp(buffer).metadata();
  const iw = meta.width!,
    ih = meta.height!;
  const { left, top, width, height } = pixelBox(box, iw, ih);
  const crop = await sharp(buffer)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let i = 0; i < crop.data.length; i += 4) {
    const min = Math.min(crop.data[i], crop.data[i + 1], crop.data[i + 2]);
    crop.data[i + 3] = Math.round(
      255 * Math.min(1, Math.max(0, (248 - min) / 22)),
    );
    if (crop.data[i + 3] > 20) ink++;
  }
  if (ink < 3)
    throw new InterpretationError(
      "A proposed object contains no clear ink. Nothing has been applied.",
    );
  return imageData(
    await sharp(crop.data, {
      raw: { width: crop.info.width, height: crop.info.height, channels: 4 },
    })
      .png()
      .toBuffer(),
  );
}
