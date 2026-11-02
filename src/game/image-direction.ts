/** Rendering guidance sampled locally from source pixels, never a replacement
 * for the source image. A small quantized palette avoids per-frame image work. */
export interface ImageDirection {
  accent: number;
  ink: number;
  surface: number;
  background: number;
  lightSource: boolean;
}

export function imageDirection(pixels: ArrayLike<number>): ImageDirection {
  const bins = new Map<
    number,
    { r: number; g: number; b: number; weight: number }
  >();
  let luminance = 0,
    count = 0,
    red = 0,
    green = 0,
    blue = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    luminance += (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    red += r;
    green += g;
    blue += b;
    count++;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    if (saturation < 24 || Math.max(r, g, b) < 45) continue;
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
    const weight = saturation / 255;
    bin.r += r * weight;
    bin.g += g * weight;
    bin.b += b * weight;
    bin.weight += weight;
    bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
  const channel = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)));
  const rgb = (r: number, g: number, b: number) =>
    (channel(r) << 16) | (channel(g) << 8) | channel(b);
  // Lift the source accent toward a light edge. Every interactive mark also
  // carries a dark outer keyline, so it remains legible on mixed imagery.
  const accent = dominant
    ? rgb(
        (dominant.r / dominant.weight) * 0.58 + 255 * 0.42,
        (dominant.g / dominant.weight) * 0.58 + 255 * 0.42,
        (dominant.b / dominant.weight) * 0.58 + 255 * 0.42,
      )
    : 0xc5e4df;
  return {
    accent,
    ink: 0x10242c,
    surface: 0xf5f7f2,
    background: count
      ? rgb((red / count) * 0.13, (green / count) * 0.13, (blue / count) * 0.13)
      : 0x17242b,
    lightSource: count > 0 && luminance / count > 0.6,
  };
}

/** Preserve source proportions inside the authored gameplay footprint. */
export function containArtwork(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.min(
    width / Math.max(1, sourceWidth),
    height / Math.max(1, sourceHeight),
  );
  return {
    width: Math.max(1, sourceWidth * scale),
    height: Math.max(1, sourceHeight * scale),
  };
}
