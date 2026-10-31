import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { validatePngArtwork } from "./artwork-validation.ts";
import { validateWorld } from "./world.ts";
import { EXAMPLES } from "../src/lib/examples.ts";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const url = (bytes: Buffer) =>
  `data:image/png;base64,${bytes.toString("base64")}`;

test("PNG headers reject compressed giant, truncated and animated imports before decoding while accepting real supported artwork", async () => {
  const normal = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  assert.deepEqual(validatePngArtwork(url(normal)), {
    width: 1600,
    height: 1200,
  });
  const maximum = await sharp({
    create: { width: 2000, height: 1500, channels: 4, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  assert.deepEqual(validatePngArtwork(url(maximum)), {
    width: 2000,
    height: 1500,
  });
  const palette = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#a8aa8f" },
  })
    .png({ palette: true })
    .toBuffer();
  assert.deepEqual(validatePngArtwork(url(palette)), { width: 12, height: 12 });
  for (const [width, height] of [
    [100000, 100000],
    [8193, 1],
    [2000, 1501],
    [0, 10],
  ]) {
    const giant = Buffer.from(normal);
    giant.writeUInt32BE(width, 16);
    giant.writeUInt32BE(height, 20);
    giant.writeUInt32BE(crc32(giant.subarray(12, 29)), 29);
    assert.throws(
      () => validatePngArtwork(url(giant)),
      /8192 pixels.*3 million pixels/,
    );
  }
  const corruptPixels = Buffer.from(normal);
  for (
    let offset = 8;
    offset < corruptPixels.length;
    offset += corruptPixels.readUInt32BE(offset) + 12
  ) {
    if (corruptPixels.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      corruptPixels[offset + 8] ^= 0xff;
      break;
    }
  }
  assert.doesNotThrow(
    () => validatePngArtwork(url(corruptPixels)),
    "bounded header checks do not pretend to decode pixel streams",
  );
  await assert.rejects(
    sharp(corruptPixels).raw().toBuffer(),
    /png|inflate|zlib|header|corrupt/i,
  );
  const budgetWorld = structuredClone(EXAMPLES[0]);
  budgetWorld.sourceImage = url(normal);
  const highResolution = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `budget-${index}`,
      kind: "decoration" as const,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      art: url(maximum),
    }));
  assert.doesNotThrow(() =>
    validateWorld({
      ...budgetWorld,
      entities: [...budgetWorld.entities, ...highResolution(7)],
    }),
  );
  assert.throws(
    () =>
      validateWorld({
        ...budgetWorld,
        entities: [...budgetWorld.entities, ...highResolution(8)],
      }),
    /artwork is too large/,
  );
  const giantVectors = Array.from({ length: 13 }, (_, index) => ({
    id: `vector-budget-${index}`,
    kind: "decoration" as const,
    x: 0,
    y: 0,
    width: 12000,
    height: 5000,
    art: "/art/seed.svg",
  }));
  assert.throws(
    () =>
      validateWorld({
        ...budgetWorld,
        width: 12000,
        height: 5000,
        entities: [...budgetWorld.entities, ...giantVectors],
      }),
    /artwork is too large/,
  );
  const badHeader = Buffer.from(normal);
  badHeader[29] ^= 1;
  assert.throws(() => validatePngArtwork(url(badHeader)), /invalid PNG header/);
  assert.throws(
    () => validatePngArtwork(url(normal.subarray(0, 33))),
    /incomplete/i,
  );
  assert.throws(
    () => validatePngArtwork(url(normal.subarray(0, 20))),
    /Incomplete/,
  );
  const control = Buffer.alloc(20);
  control.writeUInt32BE(8, 0);
  control.write("acTL", 4);
  control.writeUInt32BE(2, 8);
  control.writeUInt32BE(crc32(control.subarray(4, 16)), 16);
  const animated = Buffer.concat([
    normal.subarray(0, 33),
    control,
    normal.subarray(33),
  ]);
  assert.throws(() => validatePngArtwork(url(animated)), /still PNG/);
});
