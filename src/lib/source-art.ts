import { validateWorld, type WorldDefinition } from "../../shared/world";

// Manual mapping is local image processing, not a simulated recognition result.
export async function prepareSourceArtwork(
  world: WorldDefinition,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      image.src = "";
      reject(new DOMException("Stopped", "AbortError"));
    };
    image.onload = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    image.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error("This picture could not be read."));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.src = world.sourceImage;
  });
  signal.throwIfAborted();
  const page = document.createElement("canvas");
  page.width = image.naturalWidth;
  page.height = image.naturalHeight;
  if (page.width * page.height > 3_000_000)
    throw new Error("Choose a smaller source picture.");
  const context = page.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const entities = [];
  for (const entity of world.entities) {
    signal.throwIfAborted();
    if (!entity.artSource || entity.art) {
      entities.push({ ...entity });
      continue;
    }
    const b = entity.artSource;
    const x = Math.min(
      page.width - 1,
      Math.max(0, Math.round((b.x / 1000) * page.width)),
    );
    const y = Math.min(
      page.height - 1,
      Math.max(0, Math.round((b.y / 1000) * page.height)),
    );
    const w = Math.min(
      page.width - x,
      Math.max(1, Math.round((b.width / 1000) * page.width)),
    );
    const h = Math.min(
      page.height - y,
      Math.max(1, Math.round((b.height / 1000) * page.height)),
    );
    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    const ctx = crop.getContext("2d")!;
    if (entity.artShape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(page, x, y, w, h, 0, 0, w, h);
    if (world.inputKind !== "picture") {
      const pixels = ctx.getImageData(0, 0, w, h);
      let ink = 0;
      for (let i = 0; i < pixels.data.length; i += 4) {
        const min = Math.min(
          pixels.data[i],
          pixels.data[i + 1],
          pixels.data[i + 2],
        );
        pixels.data[i + 3] = Math.round(
          pixels.data[i + 3] * Math.min(1, Math.max(0, (248 - min) / 22)),
        );
        if (pixels.data[i + 3] > 20) ink++;
      }
      if (ink < 3)
        throw new Error(
          `“${entity.label || entity.kind}” has no clear ink. Adjust its selection.`,
        );
      ctx.putImageData(pixels, 0, 0);
    }
    entities.push({
      ...entity,
      art: crop.toDataURL("image/png"),
      artMethod:
        world.inputKind === "picture" ? ("crop" as const) : ("paper" as const),
      artNote:
        world.inputKind === "picture"
          ? entity.artShape === "ellipse"
            ? "Oval crop chosen by you. Background inside the oval is still included."
            : "Selected by you. Picture background is included in this crop."
          : "Selected by you with paper-background removal. Check its outline.",
    });
    // Give cancellation and the review UI a turn between image operations.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }
  signal.throwIfAborted();
  return validateWorld({
    ...world,
    sourceImage: page.toDataURL("image/png"),
    entities,
  });
}
