/** Shared source-aligned world geometry. Keeps image aspect ratio and the
 * established world bounds; planning constraints use the same frame as play. */
export function sourceFrameForImage(imageWidth: number, imageHeight: number) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0)
    throw new Error("Source image dimensions must be positive and finite.");
  const scale = Math.max(1440 / imageWidth, 820 / imageHeight);
  const width = Math.min(12000, Math.max(1440, Math.round(imageWidth * scale)));
  const height = Math.min(5000, Math.max(820, Math.round(imageHeight * scale)));
  const frameScale = Math.min(width / imageWidth, height / imageHeight);
  const frame = {width: imageWidth * frameScale, height: imageHeight * frameScale,
    x: (width - imageWidth * frameScale) / 2, y: (height - imageHeight * frameScale) / 2};
  return {width, height, frame};
}
