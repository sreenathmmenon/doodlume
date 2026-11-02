import type { WorldEntity } from "./world.js";

export const ORIGINAL_BACKDROP_NOTE = "Full original image used as the world backdrop; generated gameplay is separate.";
export const SOURCE_SCENERY_NOTE = "Original scenery at source coordinates; moving subjects use surrounding source background and stationary details keep game-state cues.";
const sceneryNotes = new Set([
  SOURCE_SCENERY_NOTE,
  "Original scenery at source coordinates; moving subjects are removed and stationary details keep game-state cues. No replacement pixels are invented.",
  "Original scenery at source coordinates; moving and interactive source selections are removed. No replacement pixels are invented.",
]);
export function isSourceAlignedScenery(entity?: Pick<WorldEntity, "kind" | "artNote">): boolean {
  return entity?.kind === "decoration" && sceneryNotes.has(entity.artNote ?? "");
}
export function isSourceBackdrop(entity?: Pick<WorldEntity, "kind" | "artNote">): boolean {
  return entity?.kind === "decoration" && (entity.artNote === ORIGINAL_BACKDROP_NOTE || isSourceAlignedScenery(entity));
}
