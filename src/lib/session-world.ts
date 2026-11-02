import type { SavedWorld } from "./library";
import type { WorldDefinition } from "../../shared/world";

const key = "doodlume.last-personal-world.v1";

export function isPersonalWorld(world: WorldDefinition) {
  return world.source !== "example" || world.revision > 1;
}

export function rememberedWorldId(): string | null {
  try {
    const value = localStorage.getItem(key);
    return value && /^[\w-]{1,80}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberWorld(world: WorldDefinition) {
  if (!isPersonalWorld(world)) return;
  try {
    localStorage.setItem(key, world.id);
  } catch {
    /* Saving remains available if session preferences are blocked. */
  }
}

/** Resolves only already validated saves. Never changes, imports or deletes library data. */
export function returningWorld(
  entries: SavedWorld[],
  id: string | null,
): SavedWorld | undefined {
  const personal = entries.filter((entry) => isPersonalWorld(entry.world));
  return (
    personal.find((entry) => entry.world.id === id) ??
    personal.reduce<SavedWorld | undefined>(
      (latest, entry) =>
        !latest || Date.parse(entry.savedAt) > Date.parse(latest.savedAt)
          ? entry
          : latest,
      undefined,
    )
  );
}
