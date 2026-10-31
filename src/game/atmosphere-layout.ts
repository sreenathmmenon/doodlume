export function atmosphereLayout(width: number, height: number, zoom: number) {
  const canvasWidth = Math.max(1, Math.ceil(width));
  const canvasHeight = Math.max(1, Math.ceil(height));
  const inverseZoom = 1 / zoom;
  return {
    canvasWidth,
    canvasHeight,
    inverseZoom,
    textureScale: Math.max(canvasWidth / 1440, canvasHeight / 820),
    displayWidth: canvasWidth * inverseZoom,
    displayHeight: canvasHeight * inverseZoom,
  };
}
