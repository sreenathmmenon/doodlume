/** Trim the sketch to its actual ink and remove the paper, preserving drawn colors. */
export async function extractSketchInk(image: string): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
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
        255 * Math.min(1, Math.max(0, (244 - ink) / 20)),
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
  context.putImageData(pixels, 0, 0);
  const result = document.createElement("canvas");
  result.width = right - left + 9;
  result.height = bottom - top + 9;
  result
    .getContext("2d")!
    .drawImage(
      canvas,
      left,
      top,
      right - left + 1,
      bottom - top + 1,
      4,
      4,
      right - left + 1,
      bottom - top + 1,
    );
  return result.toDataURL("image/png");
}
