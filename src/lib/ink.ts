export interface InkMark {
  art: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Isolate real ink, retaining alpha; bounds use a normalized 0..1000 page. */
export function extractInkLayer(canvas: HTMLCanvasElement): InkMark {
  const pixels = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width,
    top = canvas.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const ink = Math.min(
        pixels.data[i],
        pixels.data[i + 1],
        pixels.data[i + 2],
      );
      pixels.data[i + 3] = Math.round(
        pixels.data[i + 3] * Math.min(1, Math.max(0, (244 - ink) / 20)),
      );
      if (pixels.data[i + 3] > 12) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left || bottom < top)
    throw new Error("Draw a little ink on the page first.");
  left = Math.max(0, left - 4);
  top = Math.max(0, top - 4);
  right = Math.min(canvas.width - 1, right + 4);
  bottom = Math.min(canvas.height - 1, bottom + 4);
  const cleaned = document.createElement("canvas");
  cleaned.width = canvas.width;
  cleaned.height = canvas.height;
  cleaned.getContext("2d")!.putImageData(pixels, 0, 0);
  const result = document.createElement("canvas");
  result.width = right - left + 1;
  result.height = bottom - top + 1;
  result
    .getContext("2d")!
    .drawImage(
      cleaned,
      left,
      top,
      result.width,
      result.height,
      0,
      0,
      result.width,
      result.height,
    );
  return {
    art: result.toDataURL("image/png"),
    x: (left / canvas.width) * 1000,
    y: (top / canvas.height) * 1000,
    width: (result.width / canvas.width) * 1000,
    height: (result.height / canvas.height) * 1000,
  };
}
export async function extractSketchInk(image: string): Promise<{art: string; aspectRatio: number}> {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const ink = extractInkLayer(canvas);
  return {art: ink.art, aspectRatio: ink.width * canvas.width / (ink.height * canvas.height)};
}
