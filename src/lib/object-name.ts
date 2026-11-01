import type { EntityKind, WorldDefinition } from "../../shared/world";

const roles: Record<EntityKind, string> = {
  player: "Character",
  terrain: "Ground",
  bridge: "Bridge",
  coin: "Collectible",
  lever: "Switch",
  gate: "Gate",
  goal: "Destination",
  decoration: "Artwork",
};

/** Stable, human-facing names never fall back to an internal object identifier. */
export function objectName(
  world: WorldDefinition,
  id: string | undefined,
  limit = 40,
): string {
  const entity = world.entities.find((item) => item.id === id);
  if (!entity) return "Connected object";
  const label = entity.label?.replace(/\s+/g, " ").trim();
  if (label)
    return label.length > limit
      ? `${label.slice(0, limit - 1).trimEnd()}…`
      : label;
  const index = world.entities
    .filter((item) => item.kind === entity.kind)
    .findIndex((item) => item.id === id);
  return `${roles[entity.kind]} ${index + 1}`;
}
