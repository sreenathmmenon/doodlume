import type { SceneRect } from "./scene-visibility";

const GUTTER = 2;
const CORE_EDGE = 1024 - GUTTER * 2;
export interface TerrainTile extends SceneRect {
  textureWidth: number;
  textureHeight: number;
  gutter: number;
}

/** Plan the complete object before allocating any canvas or GPU texture. */
export function terrainTiles(
  bounds: SceneRect,
  remainingPixels: number,
  remainingPieces: number,
) {
  const x = Math.floor(bounds.x),
    y = Math.floor(bounds.y);
  const width = Math.ceil(bounds.x + bounds.width) - x;
  const height = Math.ceil(bounds.y + bounds.height) - y;
  const columns = Math.ceil(width / CORE_EDGE),
    rows = Math.ceil(height / CORE_EDGE);
  const pixels = (width + columns * GUTTER * 2) * (height + rows * GUTTER * 2);
  if (
    width <= 0 ||
    height <= 0 ||
    columns * rows > remainingPieces ||
    pixels > remainingPixels
  )
    return null;
  const tiles: TerrainTile[] = [];
  for (let top = 0; top < height; top += CORE_EDGE) {
    for (let left = 0; left < width; left += CORE_EDGE) {
      const tileWidth = Math.min(CORE_EDGE, width - left),
        tileHeight = Math.min(CORE_EDGE, height - top);
      tiles.push({
        x: x + left,
        y: y + top,
        width: tileWidth,
        height: tileHeight,
        textureWidth: tileWidth + GUTTER * 2,
        textureHeight: tileHeight + GUTTER * 2,
        gutter: GUTTER,
      });
    }
  }
  return { tiles, pixels };
}
