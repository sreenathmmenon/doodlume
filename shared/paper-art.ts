const MAX_PAPER_PIXELS = 2_000_000;

/** Remove only near-white paper connected to a crop edge; never paint source pixels. */
export function removeBoundaryPaper(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
) {
  const pixels = width * height;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isSafeInteger(pixels) ||
    pixels > MAX_PAPER_PIXELS ||
    rgba.length !== pixels * 4
  )
    throw new Error(
      "This selection is too large to prepare safely. Use a smaller source image.",
    );
  const paper = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0,
    tail = 0;
  function visit(at: number) {
    if (paper[at]) return;
    const offset = at * 4;
    // Match the existing soft paper-removal range, but only outside a closed
    // outline. Four-neighbour connectivity cannot leak diagonally through ink.
    if (
      rgba[offset + 3] !== 0 &&
      Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]) <= 226
    )
      return;
    paper[at] = 1;
    queue[tail++] = at;
  }
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const at = queue[head++],
      x = at % width;
    if (x > 0) visit(at - 1);
    if (x + 1 < width) visit(at + 1);
    if (at >= width) visit(at - width);
    if (at + width < pixels) visit(at + width);
  }
  let inkPixels = 0;
  for (let at = 0; at < pixels; at++) {
    const offset = at * 4;
    const min = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    if (paper[at])
      rgba[offset + 3] = Math.round(
        rgba[offset + 3] * Math.min(1, Math.max(0, (248 - min) / 22)),
      );
    if (rgba[offset + 3] > 20 && min < 248) inkPixels++;
  }
  return { inkPixels, paperPixels: tail };
}
