export interface Point {
  x: number;
  y: number;
}
export type PageCorners = [Point, Point, Point, Point];
export const fullPage = (): PageCorners => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
export function pageTransform(points: PageCorners) {
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    points.some(
      (p) =>
        !p ||
        ![p.x, p.y].every(Number.isFinite) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    throw new Error("Keep all four corners inside the photograph.");
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i],
      b = points[(i + 1) % 4],
      c = points[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0.002)
      throw new Error(
        "Keep the corners in order: top left, top right, bottom right, bottom left.",
      );
    area += a.x * b.y - b.x * a.y;
  }
  if (area / 2 < 0.04)
    throw new Error("Choose a larger, clearly visible page.");
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0,
    h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-10) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-10)
      throw new Error("These page corners cannot be aligned. Move them apart.");
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ] as const;
}
export function projectPoint(
  m: ReturnType<typeof pageTransform>,
  u: number,
  v: number,
): Point {
  const den = m[6] * u + m[7] * v + 1;
  return {
    x: (m[0] * u + m[1] * v + m[2]) / den,
    y: (m[3] * u + m[4] * v + m[5]) / den,
  };
}
export function rectifyPixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  corners: PageCorners,
  outputWidth: number,
  outputHeight: number,
) {
  if (
    input.length !== width * height * 4 ||
    ![width, height, outputWidth, outputHeight].every(
      (n) => Number.isInteger(n) && n > 0 && n <= 2000,
    )
  )
    throw new Error("This page is too large to align.");
  const m = pageTransform(corners),
    output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y++)
    for (let x = 0; x < outputWidth; x++) {
      const p = projectPoint(
        m,
        x / Math.max(1, outputWidth - 1),
        y / Math.max(1, outputHeight - 1),
      );
      const sx = Math.min(width - 1, Math.max(0, p.x * (width - 1))),
        sy = Math.min(height - 1, Math.max(0, p.y * (height - 1)));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1),
        fx = sx - x0,
        fy = sy - y0;
      const a = (y0 * width + x0) * 4,
        b = (y0 * width + x1) * 4,
        c = (y1 * width + x0) * 4,
        d = (y1 * width + x1) * 4,
        out = (y * outputWidth + x) * 4;
      for (let ch = 0; ch < 4; ch++)
        output[out + ch] =
          (input[a + ch] * (1 - fx) + input[b + ch] * fx) * (1 - fy) +
          (input[c + ch] * (1 - fx) + input[d + ch] * fx) * fy;
    }
  return output;
}
