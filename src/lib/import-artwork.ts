import type { SavedWorld } from "./library";
import type { WorldDefinition } from "../../shared/world";

/** Decode one bounded original at a time; a valid PNG header alone cannot prove valid pixels. */
export async function validateImportArtwork(
  entries: SavedWorld[],
  signal?: AbortSignal,
) {
  const seen = new Set<string>();
  const worlds: WorldDefinition[] = entries.flatMap((entry) => [
    entry.world,
    ...(entry.history ?? []).map((h) => h.before),
  ]);
  for (const world of worlds) {
    for (const image of [
      world.sourceImage,
      ...world.entities.map((entity) => entity.art),
    ]) {
      if (!image?.startsWith("data:image/png;base64,") || seen.has(image))
        continue;
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      seen.add(image);
      let bitmap: ImageBitmap | undefined;
      try {
        const response = await fetch(image, { signal });
        bitmap = await createImageBitmap(await response.blob());
        if (!bitmap.width || !bitmap.height) throw new Error();
      } catch (error) {
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        throw new Error(
          "A backup image could not be decoded. Nothing was imported. Restore an intact backup or use its original source image.",
        );
      } finally {
        bitmap?.close();
      }
    }
  }
  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
}
