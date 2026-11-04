/** Artwork homes use their rendered center, while effects use the entity's
 * source-coordinate origin. Preserve extracted-layer padding in both the
 * preview and the final animated placement. */
export function interactionMoveDestination(
  entity: {x: number; y: number},
  home: {x: number; y: number; width: number; height: number},
  move: {x: number; y: number},
) {
  return {x: home.x + move.x - entity.x, y: home.y + move.y - entity.y,
    width: home.width, height: home.height};
}
