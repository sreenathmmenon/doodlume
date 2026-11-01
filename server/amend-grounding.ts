import sharp from "sharp";
import { InterpretationError } from "./model.js";

interface ProposedBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: "high" | "review";
  reason: string;
}
interface Mark {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Ground a model-proposed addition, never discover or assign roles to additions.
 * Only near-identical registered pages qualify. Pixels always come from `after`.
 */
export async function groundAmendmentBoxes<T extends ProposedBox>(
  before: Buffer,
  after: Buffer,
  proposals: T[],
  signal: AbortSignal,
): Promise<T[]> {
  signal.throwIfAborted();
  const [previous, next] = await Promise.all(
    [before, after].map((source) =>
      sharp(source)
        .removeAlpha()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ),
  );
  const w = next.info.width,
    h = next.info.height;
  if (previous.info.width !== w || previous.info.height !== h)
    throw new InterpretationError(
      "The pages do not have identical framing. Keep the original crop, or place the additions manually. Nothing was applied.",
    );
  const fresh = new Uint8Array(w * h);
  let originalInk = 0,
    changedInk = 0;
  for (let index = 0; index < fresh.length; index++) {
    const at = index * 3;
    const oldInk = Math.min(
      previous.data[at],
      previous.data[at + 1],
      previous.data[at + 2],
    );
    const newInk = Math.min(
      next.data[at],
      next.data[at + 1],
      next.data[at + 2],
    );
    if (oldInk < 235) {
      originalInk++;
      if (
        newInk >= 245 ||
        [0, 1, 2].some(
          (channel) =>
            Math.abs(previous.data[at + channel] - next.data[at + channel]) >
            36,
        )
      )
        changedInk++;
    }
    // Old marks and their gray edges are excluded from the matching evidence.
    fresh[index] = oldInk >= 245 && newInk < 235 ? 1 : 0;
  }
  signal.throwIfAborted();
  if (originalInk < 12 || changedInk > Math.max(2, originalInk * 0.002))
    throw new InterpretationError(
      "The original marks changed or moved. Use the same framing and keep existing marks, or place additions manually. Nothing was applied.",
    );

  const marks: Mark[] = [],
    queue = new Int32Array(w * h);
  for (let index = 0; index < fresh.length; index++) {
    if (!fresh[index]) continue;
    fresh[index] = 0;
    queue[0] = index;
    let head = 0,
      tail = 1,
      left = index % w,
      right = left,
      top = Math.floor(index / w),
      bottom = top;
    while (head < tail) {
      const at = queue[head++],
        x = at % w,
        y = Math.floor(at / w);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const other = yy * w + xx;
          if (fresh[other]) {
            fresh[other] = 0;
            queue[tail++] = other;
          }
        }
    }
    if (tail >= 6 && tail < w * h * 0.5)
      marks.push({
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
      });
    if (marks.length > 10000)
      throw new InterpretationError(
        "The new marks are too fragmented to match safely. Place the additions manually. Nothing was applied.",
      );
  }
  signal.throwIfAborted();
  const used = new Set<Mark>();
  return proposals.map((proposal) => {
    const box = {
      x: (proposal.x * w) / 1000,
      y: (proposal.y * h) / 1000,
      width: (proposal.width * w) / 1000,
      height: (proposal.height * h) / 1000,
    };
    const nearby = marks.filter((mark) => {
      const dx = Math.abs(mark.x + mark.width / 2 - box.x - box.width / 2);
      const dy = Math.abs(mark.y + mark.height / 2 - box.y - box.height / 2);
      const ratioX = mark.width / box.width,
        ratioY = mark.height / box.height;
      return (
        dx <= Math.min(w * 0.075, Math.max(w * 0.035, box.width * 0.35)) &&
        dy <= Math.min(h * 0.1, Math.max(h * 0.05, box.height * 0.75)) &&
        ratioX >= 0.5 &&
        ratioX <= 2 &&
        ratioY >= 0.5 &&
        ratioY <= 2
      );
    });
    if (!nearby.length)
      throw new InterpretationError(
        "A proposed addition contains no clear ink from a verified new mark. Place it manually around its complete outline. Nothing was applied.",
      );
    if (nearby.length !== 1 || used.has(nearby[0]))
      throw new InterpretationError(
        "A proposed addition could match more than one mark, or shares a mark with another proposal. Choose the additions manually. Nothing was applied.",
      );
    const mark = nearby[0];
    used.add(mark);
    const left = Math.max(0, mark.x - 2),
      top = Math.max(0, mark.y - 2);
    const right = Math.min(w, mark.x + mark.width + 2),
      bottom = Math.min(h, mark.y + mark.height + 2);
    const fitted = {
      x: (left * 1000) / w,
      y: (top * 1000) / h,
      width: ((right - left) * 1000) / w,
      height: ((bottom - top) * 1000) / h,
    };
    const adjusted =
      Math.abs(left - box.x) > 1 ||
      Math.abs(top - box.y) > 1 ||
      Math.abs(right - box.x - box.width) > 1 ||
      Math.abs(bottom - box.y - box.height) > 1;
    return {
      ...proposal,
      ...fitted,
      ...(adjusted
        ? {
            confidence: "review" as const,
            reason: `${proposal.reason.slice(0, 210)} Selection fitted to a registered new mark; check its complete crop.`,
          }
        : {}),
    };
  });
}
