import sharp from "sharp";
import {
  buildObjectPrompt,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import { cropArtwork, imageData, pixelBox } from "./images.js";
import type { ModelConnection } from "./provider.js";
import type { WorldEntity } from "../shared/world.js";

export interface SegmentationConnection {
  enabled: boolean;
  apiKey: string;
  reserveRequest?: () => void;
}
export interface ArtworkObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Artwork = Pick<WorldEntity, "art" | "artMethod" | "artNote">;

// Baseten does not expose this direct-Meta endpoint. Using both providers is opt-in.
export function segmentationConnection(
  env: Record<string, string | undefined>,
  provider: ModelConnection,
): SegmentationConnection {
  return {
    enabled:
      env.SAM_ENABLED === "true" ||
      (env.SAM_ENABLED !== "false" && provider.provider === "meta"),
    apiKey: env.MODEL_API_KEY?.trim() || "",
  };
}

// Bound the wire stream before handing it to the official parser. No provider
// text, source images or credentials are logged or returned in errors.
async function* events(response: Response): AsyncGenerator<ResponsesEvent> {
  if (!response.body) throw new Error("empty_stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "",
    data: string[] = [],
    bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8_000_000) throw new Error("large_stream");
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end).replace(/\r$/, "");
        pending = pending.slice(end + 1);
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        else if (!line && data.length) {
          const payload = data.join("\n");
          data = [];
          if (payload === "[DONE]") return;
          const event = JSON.parse(payload) as ResponsesEvent;
          if (!event || typeof event.type !== "string")
            throw new Error("invalid_event");
          yield event;
          if (event.type === "response.completed") return;
        }
      }
    }
    // An unterminated event is intentionally not accepted as a complete response.
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function* checkedEvents(
  response: Response,
  iw: number,
  ih: number,
): AsyncGenerator<ResponsesEvent> {
  const buffered: ResponsesEvent[] = [];
  let text = "";
  for await (const event of events(response)) {
    if (buffered.length >= 10_000) throw new Error("many_events");
    buffered.push(event);
    if (event.type === "response.output_text.delta") text += event.delta;
    if (event.type === "response.output_text.done") validateText(event.text);
    if (text.length > 4_000_000) throw new Error("large_output");
  }
  validateText(text);
  // The official parser decodes while parsing. Check raster allocation bounds
  // before it sees any complete payload, including payloads split across deltas.
  function validateText(value: string) {
    if (value.length > 4_000_000) throw new Error("large_output");
    if (
      (value.match(/<\|mask;/g) || []).length > 16 ||
      [...value.matchAll(/<(\d+)f>/g)].some((m) => m[1] !== "0")
    )
      throw new Error("unexpected_records");
    for (const m of value.matchAll(/;data=(\d+),(\d+),/g)) {
      const h = Number(m[1]),
        w = Number(m[2]);
      if (
        !Number.isSafeInteger(h * w) ||
        h < 1 ||
        w < 1 ||
        h > ih ||
        w > iw ||
        h * w > 2_000_000
      )
        throw new Error("large_mask");
    }
    for (const m of value.matchAll(/;w=(\d+);h=(\d+)/g))
      if (Number(m[1]) !== iw || Number(m[2]) !== ih)
        throw new Error("wrong_source_dimensions");
  }
  yield* buffered;
}

async function maskedArtwork(
  source: Buffer,
  box: ReturnType<typeof pixelBox>,
  record: SegmentationMaskRecord,
  iw: number,
  ih: number,
): Promise<string> {
  const b = record.bounds,
    m = record.mask;
  if (
    (record.frame !== undefined && record.frame.frameIndex !== 0) ||
    ![b.left, b.top, b.right, b.bottom, m.width, m.height].every(
      Number.isSafeInteger,
    ) ||
    b.left < 0 ||
    b.top < 0 ||
    b.right > iw ||
    b.bottom > ih ||
    b.right <= b.left ||
    b.bottom <= b.top ||
    m.width < 1 ||
    m.height < 1 ||
    m.width > iw ||
    m.height > ih ||
    m.width * m.height > 2_000_000 ||
    (record.confidence !== undefined && record.confidence < 0.5)
  )
    throw new Error("uncertain_mask");
  // Masks may refine the detected box, but must stay associated with its mark.
  const overlap =
    Math.max(
      0,
      Math.min(box.left + box.width, b.right) - Math.max(box.left, b.left),
    ) *
    Math.max(
      0,
      Math.min(box.top + box.height, b.bottom) - Math.max(box.top, b.top),
    );
  const union =
    box.width * box.height + (b.right - b.left) * (b.bottom - b.top) - overlap;
  if (overlap / union < 0.3) throw new Error("displaced_mask");
  const raster = decodeMaskToRaster(m);
  const { data, info } = await sharp(source)
    .extract(box)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visible = 0,
    ink = 0;
  // Keep the original box/collision placement. Sample the returned mask in source
  // coordinates into that box; never stretch a tighter mask across the sprite.
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const sx = box.left + x + 0.5,
        sy = box.top + y + 0.5;
      const mx = Math.floor(((sx - b.left) * m.width) / (b.right - b.left));
      const my = Math.floor(((sy - b.top) * m.height) / (b.bottom - b.top));
      const inside =
        mx >= 0 &&
        my >= 0 &&
        mx < m.width &&
        my < m.height &&
        raster[my * m.width + mx];
      const i = (y * info.width + x) * 4;
      data[i + 3] = inside ? data[i + 3] : 0;
      if (data[i + 3] > 20) visible++;
      if (data[i + 3] > 20 && Math.min(data[i], data[i + 1], data[i + 2]) < 248)
        ink++;
    }
  if (visible < 3 || ink < 3) throw new Error("empty_mask");
  return imageData(
    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer(),
  );
}

export async function extractArtwork(
  source: Buffer,
  objects: ArtworkObject[],
  connection: SegmentationConnection,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<Map<string, Artwork>> {
  signal.throwIfAborted();
  const meta = await sharp(source).metadata();
  const iw = meta.width!,
    ih = meta.height!;
  const result = new Map<string, Artwork>();
  let fallback = !connection.enabled
    ? "Paper-background removal; precise cutouts are off."
    : !connection.apiKey
      ? "Paper-background removal; precise cutouts need direct Meta access."
      : "Precise cutout unavailable; paper-background removal used. Check the edges.";
  if (connection.enabled && connection.apiKey) {
    // SAM accepts at most sixteen prompted objects per request.
    for (let offset = 0; offset < objects.length; offset += 16) {
      const batch = objects.slice(offset, offset + 16);
      const local = new AbortController();
      const abort = () => local.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => local.abort(), 18_000);
      try {
        signal.throwIfAborted();
        connection.reserveRequest?.();
        const prompt = buildObjectPrompt({
          size: { width: iw, height: ih },
          objects: batch.map((o, i) => {
            const b = pixelBox(o, iw, ih);
            return {
              id: i + 1,
              prompts: [
                {
                  box: {
                    left: b.left,
                    top: b.top,
                    right: b.left + b.width,
                    bottom: b.top + b.height,
                  },
                },
              ],
            };
          }),
        });
        const response = await transport("https://api.meta.ai/v1/responses", {
          method: "POST",
          signal: local.signal,
          headers: {
            Authorization: `Bearer ${connection.apiKey}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            model: "sam-3.1",
            stream: true,
            metadata: { mask_encoding: "one_bit", include_confidence: "true" },
            input: [
              {
                type: "message",
                role: "user",
                content: [
                  { type: "input_text", text: prompt },
                  { type: "input_image", image_url: imageData(source) },
                ],
              },
            ],
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          fallback = [401, 402, 403].includes(response.status)
            ? "Precise cutout access unavailable; paper-background removal used. Check the edges."
            : "Precise cutout request failed; paper-background removal used. Check the edges.";
          throw new Error("sam_unavailable");
        }
        const parsed = await parseImageStream(checkedEvents(response, iw, ih))
          .finalResult;
        if (parsed.outcome.status !== "completed" || parsed.diagnostics.length)
          throw new Error("incomplete_masks");
        const masks = recordsOfKind(parsed.records, "mask");
        const boxes = recordsOfKind(parsed.records, "box");
        for (let i = 0; i < batch.length; i++) {
          signal.throwIfAborted();
          const records = masks.filter((m) => m.objectId === String(i + 1));
          const matches = boxes.filter((b) => b.objectId === String(i + 1));
          if (
            records.length !== 1 ||
            matches.length !== 1 ||
            (matches[0].confidence !== undefined && matches[0].confidence < 0.5)
          )
            continue;
          const o = batch[i];
          try {
            result.set(o.id, {
              art: await maskedArtwork(
                source,
                pixelBox(o, iw, ih),
                records[0],
                iw,
                ih,
              ),
              artMethod: "sam",
              artNote:
                "Precise cutout from your original artwork. Check its outline.",
            });
          } catch {
            /* Only this object falls back; untrusted masks cannot move geometry. */
          }
        }
      } catch {
        signal.throwIfAborted();
        // No automatic retry, and no repeated batch calls after an access failure.
        break;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    }
  }
  for (const o of objects) {
    signal.throwIfAborted();
    if (!result.has(o.id))
      result.set(o.id, {
        art: await cropArtwork(source, o),
        artMethod: "paper",
        artNote: fallback,
      });
  }
  signal.throwIfAborted();
  return result;
}
