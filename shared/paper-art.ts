const MAX_PAPER_PIXELS = 2_000_000;

/** Remove boundary-connected paper; retain original RGB and enclosed interiors. */
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
  // A photo of white paper is often grey. Estimate a tone only when a clear
  // majority of this crop's edge is consistently light and neutral. Coloured
  // edges and varied photographic backgrounds do not qualify. The estimate
  // changes alpha only, never whitening or repainting the source artwork.
  const edge = new Uint32Array(256);
  let edgeSamples = 0,
    neutralSamples = 0;
  function sample(at: number) {
    edgeSamples++;
    const i = at * 4,
      lo = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]),
      hi = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (rgba[i + 3] > 0 && lo >= 185 && hi - lo <= 14) {
      edge[lo]++;
      neutralSamples++;
    }
  }
  for (let x = 0; x < width; x++) {
    sample(x);
    if (height > 1) sample((height - 1) * width + x);
  }
  for (let y = 1; y + 1 < height; y++) {
    sample(y * width);
    if (width > 1) sample(y * width + width - 1);
  }
  let tone = 255,
    cumulative = 0;
  for (let value = 0; value < 256; value++) {
    cumulative += edge[value];
    if (cumulative > Math.floor(neutralSamples / 2)) {
      tone = value;
      break;
    }
  }
  let consistent = 0;
  for (
    let value = Math.max(0, tone - 12);
    value <= Math.min(255, tone + 12);
    value++
  )
    consistent += edge[value];
  const photographedPaper =
    tone < 248 &&
    neutralSamples / edgeSamples >= 0.55 &&
    consistent / Math.max(1, neutralSamples) >= 0.75;
  const paper = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0,
    tail = 0;
  function visit(at: number) {
    if (paper[at]) return;
    const offset = at * 4;
    const lo = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    const hi = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    // Four-neighbour connectivity cannot leak diagonally through an outline.
    if (rgba[offset + 3] !== 0) {
      if (photographedPaper ? lo < tone - 14 || hi - lo > 18 : lo <= 226)
        return;
    }
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
        rgba[offset + 3] *
          Math.min(
            1,
            Math.max(
              0,
              photographedPaper ? (tone - 4 - min) / 10 : (248 - min) / 22,
            ),
          ),
      );
    if (rgba[offset + 3] > 20 && min < 248) inkPixels++;
  }
  return { inkPixels, paperPixels: tail, photographedPaper };
}
