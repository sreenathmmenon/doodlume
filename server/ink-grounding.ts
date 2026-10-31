import sharp from "sharp";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ObjectBox extends Box {
  kind: string;
}
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
}

/** Align approximate vision boxes to actual source marks; never creates artwork. */
export async function groundDrawingBoxes<T extends ObjectBox>(
  source: Buffer,
  objects: T[],
): Promise<T[]> {
  const { data, info } = await sharp(source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    ink = new Uint8Array(w * h),
    horizontal: Region[] = [];
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
      const bottom = Math.min(
        h,
        floor.y +
          Math.max(
            floor.height,
            o.kind === "bridge"
              ? Math.max(original.height, h * 0.035)
              : Math.min(original.height, floor.height + 2),
          ),
      );
      return {
        ...o,
        y: (floor.y * 1000) / h,
        height: ((bottom - floor.y) * 1000) / h,
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
