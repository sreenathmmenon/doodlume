import type { RevisionCheckpoint } from "../../shared/revisions";
import type { WorldDefinition } from "../../shared/world";

/** A personal example copy retains object identities and revision history. */
export function copyExample(world: WorldDefinition, history: RevisionCheckpoint[]) {
  if (world.source !== "example") return { world, history };
  const id = crypto.randomUUID();
  const copy = (value: WorldDefinition): WorldDefinition => ({
    ...value, id, source: "manual", name: `${value.name.slice(0, 67)} · my version`,
  });
  return { world: copy(world), history: history.map(entry => ({ ...entry, before: copy(entry.before) })) };
}
