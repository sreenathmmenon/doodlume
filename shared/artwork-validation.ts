const MAX_RASTER_EDGE = 2048;
const MAX_RASTER_PIXELS = 2_000_000;
export const MAX_WORLD_ARTWORK_PIXELS = 24_000_000;

/** Bound SVG decoding, independently of an expanded object's display size. */
export function artworkRasterSize(width: number, height: number) {
  const desiredWidth = Math.ceil(width * 3);
  const desiredHeight = Math.ceil(height * 3);
  const factor = Math.min(
    1,
    MAX_RASTER_EDGE / Math.max(desiredWidth, desiredHeight),
    Math.sqrt(MAX_RASTER_PIXELS / (desiredWidth * desiredHeight)),
  );
  return {
    width: Math.max(1, Math.floor(desiredWidth * factor)),
    height: Math.max(1, Math.floor(desiredHeight * factor)),
  };
}

const PREFIX = "data:image/png;base64,";
const MAX_PIXELS = 3_000_000;
const MAX_EDGE = 8192;

function pngBytes(payload: string, offset: number, count: number): Uint8Array {
  const first = Math.floor(offset / 3) * 4;
  const skip = offset % 3;
  const encodedLength = Math.ceil((skip + count) / 3) * 4;
  const decoded = atob(payload.slice(first, first + encodedLength));
  if (decoded.length < skip + count) throw new Error("Incomplete PNG artwork.");
  return Uint8Array.from({ length: count }, (_, index) =>
    decoded.charCodeAt(skip + index),
  );
}
function uint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Inspect bounded headers without decoding image pixels or changing source art. */
export function validatePngArtwork(image: string) {
  if (!image.startsWith(PREFIX)) throw new Error("Unsupported artwork format.");
  const payload = image.slice(PREFIX.length);
  if (payload.length % 4 !== 0) throw new Error("Incomplete PNG artwork.");
  const byteLength =
    (payload.length / 4) * 3 -
    (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0);
  let header: Uint8Array;
  try {
    header = pngBytes(payload, 0, 33);
  } catch {
    throw new Error("Incomplete PNG artwork.");
  }
  if (
    ![137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => header[index] === byte,
    ) ||
    uint32(header, 8) !== 13 ||
    String.fromCharCode(...header.slice(12, 16)) !== "IHDR" ||
    crc32(header.slice(12, 29)) !== uint32(header, 29)
  )
    throw new Error("This artwork has an invalid PNG header.");
  const width = uint32(header, 16),
    height = uint32(header, 20);
  if (
    !width ||
    !height ||
    width > MAX_EDGE ||
    height > MAX_EDGE ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      "PNG artwork must fit within 8192 pixels per edge and 3 million pixels in total.",
    );
  const depth = header[24],
    color = header[25];
  const depths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (
    !depths[color]?.includes(depth) ||
    header[26] !== 0 ||
    header[27] !== 0 ||
    header[28] > 1
  )
    throw new Error("This artwork has an unsupported PNG header.");
  // Only chunk headers are decoded. Bounded scanning prevents a tiny-chunk file
  // from turning import validation into unbounded main-thread work.
  let offset = 33,
    hasPixels = false;
  for (let count = 0; count < 4096 && offset + 12 <= byteLength; count++) {
    const chunk = pngBytes(payload, offset, 8);
    const length = uint32(chunk, 0);
    const type = String.fromCharCode(...chunk.slice(4, 8));
    if (length > byteLength - offset - 12 || !/^[A-Za-z]{4}$/.test(type))
      throw new Error("Incomplete PNG artwork.");
    if (["acTL", "fcTL", "fdAT"].includes(type))
      throw new Error("Use a still PNG image rather than animated artwork.");
    if (type === "IDAT" && length > 0) hasPixels = true;
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0 || !hasPixels || offset !== byteLength)
        throw new Error("Incomplete PNG artwork.");
      return { width, height };
    }
    if (type === "IHDR")
      throw new Error("This artwork has repeated PNG headers.");
  }
  throw new Error("This PNG is incomplete or has too many image chunks.");
}
