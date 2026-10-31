import { rectifyPixels, type PageCorners } from "../../shared/alignment";
self.onmessage = (
  event: MessageEvent<{
    pixels: ArrayBuffer;
    width: number;
    height: number;
    corners: PageCorners;
    outputWidth: number;
    outputHeight: number;
  }>,
) => {
  try {
    const d = event.data;
    const pixels = rectifyPixels(
      new Uint8ClampedArray(d.pixels),
      d.width,
      d.height,
      d.corners,
      d.outputWidth,
      d.outputHeight,
    );
    self.postMessage(
      { pixels: pixels.buffer, width: d.outputWidth, height: d.outputHeight },
      { transfer: [pixels.buffer] },
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "The page could not be aligned.",
    });
  }
};
