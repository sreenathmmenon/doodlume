import type { WorldEntity, WorldDefinition, ArtworkBox } from "./world.js";

export const ORIGINAL_BACKDROP_NOTE = "Full original image used as the world backdrop; generated gameplay is separate.";
export const SOURCE_SCENERY_NOTE = "Original scenery at source coordinates; moving source artwork isolated and background reconstructed locally.";
const sceneryNotes = new Set([
  SOURCE_SCENERY_NOTE,
  "Original scenery at source coordinates; moving subjects use surrounding source background and stationary details keep game-state cues.",
  "Original scenery at source coordinates; moving subjects are removed and stationary details keep game-state cues. No replacement pixels are invented.",
  "Original scenery at source coordinates; moving and interactive source selections are removed. No replacement pixels are invented.",
]);
export function isSourceAlignedScenery(entity?: Pick<WorldEntity, "kind" | "artNote">): boolean {
  return entity?.kind === "decoration" && (sceneryNotes.has(entity.artNote ?? "") || Boolean(entity.artNote?.startsWith(`${SOURCE_SCENERY_NOTE} `)));
}
export function isSourceBackdrop(entity?: Pick<WorldEntity, "kind" | "artNote">): boolean {
  return entity?.kind === "decoration" && (entity.artNote === ORIGINAL_BACKDROP_NOTE || isSourceAlignedScenery(entity));
}

export function geometryChanged(a: ArtworkBox, b: ArtworkBox): boolean {
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
}

/** Stationary source pixels become an independent layer only on geometry edits.
 * The normalized source rectangle also recovers pre-metadata edited backups. */
export function sourceLayerForEdit(world: WorldDefinition, entity: WorldEntity, next: ArtworkBox): ArtworkBox | undefined {
  if (entity.sourceLayer) return entity.sourceLayer;
  const backdrop = world.entities.find(isSourceAlignedScenery);
  if (!backdrop || !entity.artSource || isSourceBackdrop(entity) || entity.kind === "player" ||
      entity.kind === "gate" && world.entities.some(other => other.kind === "lever" && other.targetId === entity.id) ||
      !geometryChanged(entity, next)) return undefined;
  const source = entity.artSource;
  if (entity.sourcePlacement) return { ...entity.sourcePlacement };
  return {
    x: backdrop.x + source.x / 1000 * backdrop.width,
    y: backdrop.y + source.y / 1000 * backdrop.height,
    width: Math.max(4, source.width / 1000 * backdrop.width),
    height: Math.max(4, Math.min(source.height / 1000 * backdrop.height,
      entity.kind === "terrain" || entity.kind === "bridge" ? 24 : Infinity)),
  };
}

export function sourceLayerArtworkBounds(entity: WorldEntity, backdrop: WorldEntity): ArtworkBox {
  const baseline = entity.sourceLayer!;
  const source = entity.artSource!;
  const sx = entity.width / baseline.width, sy = entity.height / baseline.height;
  return {
    x: entity.x + (backdrop.x + source.x / 1000 * backdrop.width - baseline.x) * sx,
    y: entity.y + (backdrop.y + source.y / 1000 * backdrop.height - baseline.y) * sy,
    width: source.width / 1000 * backdrop.width * sx,
    height: source.height / 1000 * backdrop.height * sy,
  };
}
