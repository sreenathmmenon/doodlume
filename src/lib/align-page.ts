import type { PageCorners } from "../../shared/alignment";
export async function imageSize(image: string) {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
export async function alignPage(
  image: string,
  corners: PageCorners,
  aspect: number,
  signal: AbortSignal,
): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  if (signal.aborted) {
    bitmap.close();
    throw new DOMException("Stopped", "AbortError");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  const ratio = Math.min(2, Math.max(0.5, aspect));
  const outputWidth = Math.round(ratio >= 1 ? 1440 : 1440 * ratio),
    outputHeight = Math.round(ratio >= 1 ? 1440 / ratio : 1440);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./alignment.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Stopped", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(
        new Error("The page could not be aligned. Try resetting its corners."),
      );
    };
    worker.onmessage = (event) => {
      cleanup();
      const result = event.data;
      if (result.error) return reject(new Error(result.error));
      const output = document.createElement("canvas");
      output.width = result.width;
      output.height = result.height;
      output
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(result.pixels),
            result.width,
            result.height,
          ),
          0,
          0,
        );
      resolve(output.toDataURL("image/png"));
    };
    worker.postMessage(
      {
        pixels: pixels.data.buffer,
        width: canvas.width,
        height: canvas.height,
        corners,
        outputWidth,
        outputHeight,
      },
      [pixels.data.buffer],
    );
  });
}
export async function rotatePage(image: string): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/png");
}
