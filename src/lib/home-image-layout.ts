/** The actual centered object-fit:cover image plane, shared by image overlays. */
export function coverImagePlane(width: number, height: number, sourceWidth: number, sourceHeight: number) {
  if (![width, height, sourceWidth, sourceHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  return { width: w, height: h, left: (width - w) / 2, top: (height - h) / 2 };
}
