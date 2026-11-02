/** A direct steering target, not pathfinding or a position/progress mutation. */
export function roamSteering(
  from: { x: number; y: number },
  target: { x: number; y: number },
  speed = 260,
) {
  const dx = target.x - from.x,
    dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 5)
    return { x: 0, y: 0, arrived: true };
  const approach = Math.min(speed, distance * 5);
  return {
    x: (dx / distance) * approach,
    y: (dy / distance) * approach,
    arrived: false,
  };
}
