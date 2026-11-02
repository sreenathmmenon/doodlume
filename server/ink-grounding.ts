import sharp from "sharp";
import { removeBoundaryPaper } from "../shared/paper-art.js";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ObjectBox extends Box {
  kind: string;
  groundingIssue?: string;
}
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
}

function groundPhotographedMarks<T extends ObjectBox>(
  data: Buffer,
  w: number,
  h: number,
  objects: T[],
): T[] {
  return objects.map((object) => {
    // Connected islands/cliffs do not have a reliable rectangular silhouette.
    // Their complete model selection stays available for the creator's review.
    if (!["player", "coin", "goal", "lever", "gate"].includes(object.kind))
      return { ...object };
    const original = {
      x: (object.x * w) / 1000,
      y: (object.y * h) / 1000,
      width: (object.width * w) / 1000,
      height: (object.height * h) / 1000,
    };
    const px = Math.max(w * 0.05, original.width * 0.9);
    const py = Math.max(h * 0.08, original.height * 0.9);
    const left = Math.max(0, Math.floor(original.x - px));
    const top = Math.max(0, Math.floor(original.y - py));
    const cw = Math.min(w, Math.ceil(original.x + original.width + px)) - left;
    const ch = Math.min(h, Math.ceil(original.y + original.height + py)) - top;
    const rgba = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const from = ((top + y) * w + left + x) * 3,
          to = (y * cw + x) * 4;
        rgba[to] = data[from];
        rgba[to + 1] = data[from + 1];
        rgba[to + 2] = data[from + 2];
        rgba[to + 3] = 255;
      }
    const paper = removeBoundaryPaper(rgba, cw, ch);
    const uncertain = () => ({
      ...object,
      groundingIssue:
        "The complete mark could not be isolated confidently from this photograph. Check the selection around the full original object before preparing it.",
    });
    if (paper.paperPixels < cw * ch * 0.12) return uncertain();
    const ink = new Uint8Array(cw * ch),
      connected = new Uint8Array(cw * ch);
    for (let at = 0; at < ink.length; at++)
      if (
        rgba[at * 4 + 3] > 160 &&
        Math.min(rgba[at * 4], rgba[at * 4 + 1], rgba[at * 4 + 2]) < 248
      ) {
        ink[at] = 1;
        const x = at % cw,
          y = Math.floor(at / cw);
        // Join one-pixel pen gaps for locating only; source pixels never change.
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (x + dx >= 0 && x + dx < cw && y + dy >= 0 && y + dy < ch)
              connected[(y + dy) * cw + x + dx] = 1;
      }
    const queue = new Int32Array(cw * ch),
      candidates: (Region & { score: number })[] = [];
    for (let at = 0; at < connected.length; at++) {
      if (!connected[at]) continue;
      connected[at] = 0;
      queue[0] = at;
      let head = 0,
        tail = 1,
        minX = cw,
        minY = ch,
        maxX = -1,
        maxY = -1,
        count = 0;
      while (head < tail) {
        const p = queue[head++],
          x = p % cw,
          y = Math.floor(p / cw);
        if (ink[p]) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          count++;
        }
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || xx >= cw || yy < 0 || yy >= ch) continue;
            const next = yy * cw + xx;
            if (connected[next]) {
              connected[next] = 0;
              queue[tail++] = next;
            }
          }
      }
      if (
        count < 6 ||
        minX <= 1 ||
        minY <= 1 ||
        maxX >= cw - 2 ||
        maxY >= ch - 2
      )
        continue;
      const r = {
        x: left + minX,
        y: top + minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixels: count,
      };
      const rx = r.width / original.width,
        ry = r.height / original.height;
      const dx = (r.x + r.width / 2 - original.x - original.width / 2) / w;
      const dy = (r.y + r.height / 2 - original.y - original.height / 2) / h;
      const overlap =
        Math.max(
          0,
          Math.min(r.x + r.width, original.x + original.width) -
            Math.max(r.x, original.x),
        ) *
        Math.max(
          0,
          Math.min(r.y + r.height, original.y + original.height) -
            Math.max(r.y, original.y),
        );
      if (
        rx < 0.35 ||
        rx > 3 ||
        ry < 0.35 ||
        ry > 3 ||
        Math.abs(dx) > 0.08 ||
        Math.abs(dy) > 0.1 ||
        overlap <
          Math.min(r.width * r.height, original.width * original.height) * 0.12
      )
        continue;
      candidates.push({
        ...r,
        score:
          Math.hypot(dx, dy) +
          0.03 * (Math.abs(Math.log(rx)) + Math.abs(Math.log(ry))),
      });
    }
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (
      !best ||
      best.score > 0.14 ||
      (candidates[1] && candidates[1].score - best.score < 0.012)
    )
      return uncertain();
    const x = Math.max(0, best.x - 2),
      y = Math.max(0, best.y - 2);
    return {
      ...object,
      x: (x * 1000) / w,
      y: (y * 1000) / h,
      width: ((Math.min(w, best.x + best.width + 2) - x) * 1000) / w,
      height: ((Math.min(h, best.y + best.height + 2) - y) * 1000) / h,
    };
  });
}

/** Align approximate vision boxes to actual source marks; never creates artwork. */
export async function groundDrawingBoxes<T extends ObjectBox>(
  source: Buffer,
  objects: T[],
): Promise<T[]> {
  const { data, info } = await sharp(source)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    ink = new Uint8Array(w * h),
    horizontal: Region[] = [];
  // This refinement assumes clean white paper. A photographed desk, shaded
  // sheet or painted scene turns the fixed ink threshold into false connected
  // components. On those sources, only locally isolated proposed marks may be
  // refined; connected surfaces retain the complete model selection for review.
  let boundarySamples = 0,
    whiteBoundary = 0,
    whitePixels = 0;
  const white = (at: number) =>
    Math.min(data[at * 3], data[at * 3 + 1], data[at * 3 + 2]) >= 248;
  for (let at = 0; at < w * h; at++) if (white(at)) whitePixels++;
  for (let x = 0; x < w; x++)
    for (const at of [x, (h - 1) * w + x]) {
      boundarySamples++;
      if (white(at)) whiteBoundary++;
    }
  for (let y = 1; y + 1 < h; y++)
    for (const at of [y * w, y * w + w - 1]) {
      boundarySamples++;
      if (white(at)) whiteBoundary++;
    }
  if (whiteBoundary / boundarySamples < 0.9 || whitePixels / (w * h) < 0.4)
    return groundPhotographedMarks(data, w, h, objects);
  for (let i = 0; i < w * h; i++)
    ink[i] =
      Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) < 235 ? 1 : 0;
  // Separate long support strokes from the characters that touch them.
  let last: Region | undefined;
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      if (x < w && ink[y * w + x]) {
        if (start < 0) start = x;
        continue;
      }
      if (start >= 0 && x - start > w * 0.2) {
        if (
          last &&
          Math.abs(last.x - start) < 5 &&
          Math.abs(last.x + last.width - x) < 5 &&
          last.y + last.height === y
        ) {
          last.height++;
          last.pixels += x - start;
        } else {
          last = {
            x: start,
            y,
            width: x - start,
            height: 1,
            pixels: x - start,
          };
          horizontal.push(last);
        }
        for (let xx = start; xx < x; xx++) ink[y * w + xx] = 0;
      }
      start = -1;
    }
  }
  const regions: Region[] = [],
    queue = new Int32Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    ink[i] = 0;
    queue[0] = i;
    let head = 0,
      tail = 1,
      minX = i % w,
      maxX = minX,
      minY = Math.floor(i / w),
      maxY = minY;
    while (head < tail) {
      const at = queue[head++],
        x = at % w,
        y = Math.floor(at / w);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const next = yy * w + xx;
          if (ink[next]) {
            ink[next] = 0;
            queue[tail++] = next;
          }
        }
    }
    if (
      tail >= 6 &&
      maxX - minX >= 2 &&
      maxY - minY >= 2 &&
      tail < w * h * 0.65
    )
      regions.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixels: tail,
      });
  }
  return objects.map((o) => {
    const original = {
      x: (o.x * w) / 1000,
      y: (o.y * h) / 1000,
      width: (o.width * w) / 1000,
      height: (o.height * h) / 1000,
    };
    const cx = original.x + original.width / 2,
      cy = original.y + original.height / 2;
    if (o.kind === "terrain" || o.kind === "bridge") {
      const floor = horizontal
        .filter(
          (r) =>
            cx >= r.x - 10 &&
            cx <= r.x + r.width + 10 &&
            Math.abs(r.y - original.y) < h * 0.1,
        )
        .sort(
          (a, b) => Math.abs(a.y - original.y) - Math.abs(b.y - original.y),
        )[0];
      if (!floor) return o;
      // A support's top stroke is not its complete artwork. Refinement may
      // include a nearby missed edge, but must never collapse a drawn platform
      // into a thin strip or discard its original lower contour.
      const top = Math.max(0, Math.min(original.y, floor.y));
      const bottom = Math.min(
        h,
        Math.max(original.y + original.height, floor.y + floor.height),
      );
      return {
        ...o,
        y: (top * 1000) / h,
        height: ((bottom - top) * 1000) / h,
      };
    }
    if (!["player", "coin", "gate", "lever", "goal"].includes(o.kind)) return o;
    let best: Region | undefined,
      score = Infinity;
    for (const r of regions) {
      const dx = (r.x + r.width / 2 - cx) / w,
        dy = (r.y + r.height / 2 - cy) / h;
      if (
        Math.abs(dx) > Math.max(0.035, (original.width / w) * 0.6) ||
        Math.abs(dy) > 0.14
      )
        continue;
      const ratioX = r.width / Math.max(original.width, 1),
        ratioY = r.height / Math.max(original.height, 1);
      if (ratioX < 0.3 || ratioX > 3.2 || ratioY < 0.3 || ratioY > 3.2)
        continue;
      const candidate =
        Math.hypot(dx, dy) +
        0.035 * (Math.abs(Math.log(ratioX)) + Math.abs(Math.log(ratioY)));
      if (candidate < score) {
        best = r;
        score = candidate;
      }
    }
    if (!best || score > 0.18) return o;
    if (o.kind === "player" || o.kind === "goal") {
      for (const part of regions) {
        if (
          part === best ||
          part.x > best.x + best.width + 3 ||
          part.x + part.width < best.x - 3 ||
          part.y > best.y + best.height + 3 ||
          part.y + part.height < best.y - 3
        )
          continue;
        const x = Math.min(best.x, part.x),
          y = Math.min(best.y, part.y),
          right = Math.max(best.x + best.width, part.x + part.width),
          bottom = Math.max(best.y + best.height, part.y + part.height);
        if (
          right - x <= original.width * 2.5 &&
          bottom - y <= original.height * 2.5
        )
          best = {
            x,
            y,
            width: right - x,
            height: bottom - y,
            pixels: best.pixels + part.pixels,
          };
      }
    }
    const x = Math.max(0, best.x - 2),
      y = Math.max(0, best.y - 2);
    return {
      ...o,
      x: (x * 1000) / w,
      y: (y * 1000) / h,
      width: ((Math.min(w, best.x + best.width + 2) - x) * 1000) / w,
      height: ((Math.min(h, best.y + best.height + 2) - y) * 1000) / h,
    };
  });
}
